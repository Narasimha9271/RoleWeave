import sys, json, base64, re
import pymupdf as fitz

def normalize_font(name):
    return re.sub(r'[^a-z0-9]', '', name.split('+')[-1].lower())

def font_for(doc, page, span):
    name = span['font']; n = normalize_font(name)
    aliases = {'helvetica':'helv','helveticabold':'hebo','helveticaoblique':'heit','helveticaboldoblique':'hebi','timesroman':'tiro','timesbold':'tibo','timesitalic':'tiit','timesbolditalic':'tibi','courier':'cour','courierbold':'cobo','courieroblique':'coit','courierboldoblique':'cobi'}
    if n in aliases:
        alias=aliases[n]
        return {'font':fitz.Font(alias),'alias':alias,'buffer':None}
    for entry in page.get_fonts(full=True):
        if normalize_font(entry[3]) == n and entry[0]>0:
            try:
                data=doc.extract_font(entry[0])[3]
                if data:
                    return {'font':fitz.Font(fontbuffer=data),'buffer':data,'alias':'RG'+str(entry[0]),'simple':entry[2]=='Type1'}
            except Exception:
                pass
    return None

def text_runs(lines):
    # LaTeX can emit each word / space as a separate span. Join only adjacent
    # spans of the same style on the same baseline before protecting emphasis.
    runs=[]
    for line in lines:
        groups=[]
        for span in line['spans']:
            previous=groups[-1][-1] if groups else None
            same=previous and (span['font'],round(span['size'],2),span['color'])==(previous['font'],round(previous['size'],2),previous['color'])
            adjacent=previous and abs(span['origin'][1]-previous['origin'][1])<0.1 and -0.1<=span['bbox'][0]-previous['bbox'][2]<=max(2,span['size'])
            if same and adjacent: groups[-1].append(span)
            else: groups.append([span])
        for group in groups:
            visible=[s for s in group if s.get('text','').strip()]
            if not visible: continue
            first=visible[0]; rect=fitz.Rect(first['bbox'])
            for span in visible[1:]: rect|=fitz.Rect(span['bbox'])
            runs.append({**first,'text':''.join(s.get('text','') for s in group).strip(),'bbox':tuple(rect),'members':visible})
    return runs

def collect(doc):
    result=[]; internals={}; fonts={}
    signed=doc.get_sigflags()>0
    pending_redactions=any(a.type[0]==fitz.PDF_ANNOT_REDACT for p in doc for a in p.annots())
    for pi,page in enumerate(doc):
        links=[fitz.Rect(x['from']) for x in page.get_links() if x.get('from')]
        widgets=[fitz.Rect(x.rect) for x in page.widgets()]
        page_blocks=page.get_text('dict')['blocks']
        for bi,block in enumerate(page_blocks):
            if block.get('type')!=0: continue
            lines=[line for line in block['lines'] if any(s.get('text','').strip() for s in line['spans'])]
            spans=[s for line in lines for s in line['spans'] if s.get('text','').strip()]
            if not spans: continue
            text='\n'.join(''.join(s.get('text','') for s in line['spans']).rstrip() for line in lines).strip()
            ident=f'p{pi+1}-b{bi}'; bbox=fitz.Rect(block['bbox']); reason=''; first=spans[0]
            styles={(s['font'],round(s['size'],1),s['color']) for s in spans}
            if signed: reason='Signed PDFs cannot be edited in template mode.'
            elif pending_redactions: reason='PDFs with pending redactions are protected.'
            elif any(j!=bi and other.get('type')==0 and bbox.intersects(fitz.Rect(other['bbox'])) for j,other in enumerate(page_blocks)): reason='Overlapping text blocks are protected.'
            elif page.rotation: reason='Rotated text/page is protected.'
            elif any(tuple(line.get('dir',(1,0)))!=(1.0,0.0) for line in lines): reason='Rotated text is protected.'
            elif len(text)<35 or max(s['size'] for s in spans)>=15: reason='Heading or short label is kept unchanged.'
            elif re.search(r'@|https?://|www\.',text): reason='Contact details and links are kept unchanged.'
            elif any(bbox.intersects(r) for r in links+widgets): reason='Linked text or form fields are protected.'
            # Split only prose bullets and labelled skills, not employer/date/header rows.
            segmented=len(styles)>1 and not reason and bool(re.match(r'^[•‣▪–-]\s|^[^:\n]{2,40}:',text))
            candidates=[]
            if segmented:
                cursor=0
                for si,span in enumerate(text_runs(lines)):
                    part=span['text'].strip(); offset=text.find(part,cursor)
                    if offset<0: raise ValueError('PDF text segmentation failed.')
                    separator=('\n\n' if si==0 else '')+text[cursor:offset]
                    cursor=offset+len(part)
                    candidates.append((ident+f'-s{si}',part,fitz.Rect(span['bbox']),[{'spans':[span]}],span,separator))
            else:
                if not reason and len(styles)>1: reason='Mixed headings, dates and labels are kept unchanged.'
                candidates=[(ident,text,bbox,lines,first,'\n\n')]
            for key,part,rect,part_lines,span,separator in candidates:
                protected=reason
                font_key=(pi,span['font'])
                if font_key not in fonts: fonts[font_key]=font_for(doc,page,span)
                font=fonts[font_key]
                if not protected:
                    if len(part)<35: protected='Short labels, bullet markers and emphasis are kept unchanged.'
                    elif not font: protected='This font cannot be safely reused.'
                    elif segmented and any(all(other is not member for member in span['members']) and rect.intersects(fitz.Rect(other['bbox'])) for other in spans): protected='Overlapping text segments are protected.'
                    elif max(line['spans'][0]['origin'][0] for line in part_lines)-min(line['spans'][0]['origin'][0] for line in part_lines)>3: protected='Mixed indentation is protected.'
                record={'id':key,'page':pi+1,'text':part,'editable':not bool(protected),'reason':protected,'font':span['font'],'fontSize':round(span['size'],2),'maxChars':len(part),'separator':separator,'segmented':segmented,'asciiOnly':bool(font and font.get('simple'))}
                result.append(record)
                internals[key]={'page':pi,'bbox':rect,'lines':part_lines,'span':span,'font':font,'record':record}
    return result,internals

def joined_text(blocks):
    return ''.join(('' if i==0 else b.get('separator','\n\n'))+b['text'] for i,b in enumerate(blocks))

def text_width(text, font, size):
    if font.has_glyph(32): return font.text_length(text,fontsize=size)
    # Some embedded TeX subsets omit a space glyph and position words with TJ.
    # A literal space would be written as .notdef / NUL by a new font resource.
    return sum(font.text_length(word,fontsize=size) for word in text.split(' '))+text.count(' ')*size/3

def insert_line(page, origin, text, font, size, color):
    if font['font'].has_glyph(32):
        page.insert_text(origin,text,fontname=font['alias'],fontsize=size,color=color,overlay=True)
        return
    x,y=origin
    for word in text.split(' '):
        if word: page.insert_text((x,y),word,fontname=font['alias'],fontsize=size,color=color,overlay=True)
        x+=font['font'].text_length(word,fontsize=size)+size/3

def plan_text(text, item):
    font=item['font']['font']; size=item['span']['size']; width=item['bbox'].width
    if item['font'].get('simple') and any(ord(c)>127 for c in text if not c.isspace()):
        return None,'Use plain ASCII punctuation and letters for this embedded Type 1 font.'
    if any(not font.has_glyph(ord(c)) for c in text if not c.isspace()):
        return None,'The original font lacks characters needed by the replacement.'
    rows=[]
    for paragraph in text.split('\n'):
        current=''
        for word in paragraph.split():
            if text_width(word,font,size)>width+0.2: return None,'A word is too wide for the original text block.'
            proposed=(current+' '+word).strip()
            if current and text_width(proposed,font,size)>width+0.2:
                rows.append(current);current=word
            else: current=proposed
        if current: rows.append(current)
    if not rows: return None,'Empty replacements are not allowed.'
    if len(rows)>len(item['lines']): return None,'Replacement is too long. Shorten it to fit the existing block.'
    return rows,None

def main():
    req=json.load(sys.stdin); raw=base64.b64decode(req['pdfBase64'],validate=True)
    if len(raw)>5*1024*1024: raise ValueError('Maximum PDF size is 5 MB.')
    doc=fitz.open(stream=raw,filetype='pdf')
    if doc.needs_pass: raise ValueError('Password-protected PDFs are not supported.')
    if len(doc)>10: raise ValueError('Template mode supports up to 10 pages.')
    blocks,items=collect(doc)
    if req.get('mode','inspect')=='inspect':
        print(json.dumps({'blocks':blocks,'pages':len(doc),'supported':any(x['editable'] for x in blocks),'text':joined_text(blocks)},ensure_ascii=False));return
    edits=req.get('edits',[])
    if len(edits)>250: raise ValueError('Too many edits.')
    seen=set(); planned=[]; rejected=[]
    for edit in edits:
        ident=edit.get('id');item=items.get(ident)
        if ident in seen: raise ValueError('Duplicate PDF block edit.')
        seen.add(ident)
        if not item: raise ValueError('Unknown PDF block.')
        if edit.get('original')!=item['record']['text']: raise ValueError('PDF source changed. Upload it again before exporting.')
        replacement=edit.get('replacement','').strip()
        if replacement==item['record']['text'].strip(): continue
        if not item['record']['editable']:
            rejected.append({'id':ident,'reason':item['record']['reason']});continue
        rows,error=plan_text(replacement,item)
        if error: rejected.append({'id':ident,'reason':error});continue
        planned.append((ident,item,rows,replacement))
    # Redact only old text. Images, line art, page sizes and all unrelated text stay intact.
    for pi in sorted({i['page'] for _,i,_,_ in planned}):
        page=doc[pi]
        for _,item,_,_ in planned:
            if item['page']==pi: page.add_redact_annot(item['bbox'],fill=False,cross_out=False)
        page.apply_redactions(images=0,graphics=0,text=0)
        for _,item,rows,_ in planned:
            if item['page']!=pi:continue
            font=item['font']; alias=font['alias']
            if font['buffer']: page.insert_font(fontname=alias,fontbuffer=font['buffer'],set_simple=font.get('simple',False))
            color=fitz.sRGB_to_pdf(item['span']['color'])
            for line,old in zip(rows,item['lines']):
                insert_line(page,old['spans'][0]['origin'],line,font,item['span']['size'],color)
    output=doc.tobytes(garbage=4,deflate=True)
    result={'pdfBase64':base64.b64encode(output).decode(),'applied':[x[0] for x in planned],'rejected':rejected,'pages':len(doc)}
    if req.get('preview'):
        result['previews']=[base64.b64encode(p.get_pixmap(matrix=fitz.Matrix(min(1.5,1000/p.rect.width,1600/p.rect.height),min(1.5,1000/p.rect.width,1600/p.rect.height)),alpha=False).tobytes('png')).decode() for p in doc]
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(json.dumps({'error':str(exc)}));sys.exit(1)
