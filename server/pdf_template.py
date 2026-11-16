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
                    return {'font':fitz.Font(fontbuffer=data),'buffer':data,'alias':'RG'+str(entry[0])}
            except Exception:
                pass
    return None

def collect(doc):
    result=[]; internals={}
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
            font=font_for(doc,page,first)
            if signed: reason='Signed PDFs cannot be edited in template mode.'
            elif pending_redactions: reason='PDFs with pending redactions are protected.'
            elif any(j!=bi and other.get('type')==0 and bbox.intersects(fitz.Rect(other['bbox'])) for j,other in enumerate(page_blocks)): reason='Overlapping text blocks are protected.'
            elif page.rotation: reason='Rotated text/page is protected.'
            elif any(tuple(line.get('dir',(1,0)))!=(1.0,0.0) for line in lines): reason='Rotated text is protected.'
            elif len(styles)>1: reason='Mixed formatting is protected to keep the template intact.'
            elif len(text)<35 or first['size']>=15: reason='Heading or short label is kept unchanged.'
            elif re.search(r'@|https?://|www\.',text): reason='Contact details and links are kept unchanged.'
            elif any(bbox.intersects(r) for r in links+widgets): reason='Linked text or form fields are protected.'
            elif not font: reason='This font cannot be safely reused.'
            elif max(s['origin'][0] for s in [line['spans'][0] for line in lines])-min(s['origin'][0] for s in [line['spans'][0] for line in lines])>3: reason='Mixed indentation is protected.'
            record={'id':ident,'page':pi+1,'text':text,'editable':not bool(reason),'reason':reason,'font':first['font'],'fontSize':round(first['size'],2),'maxChars':len(text)}
            result.append(record)
            internals[ident]={'page':pi,'bbox':bbox,'lines':lines,'span':first,'font':font,'record':record}
    return result,internals

def plan_text(text, item):
    font=item['font']['font']; size=item['span']['size']; width=item['bbox'].width
    if any(not font.has_glyph(ord(c)) for c in text if not c.isspace()):
        return None,'The original font lacks characters needed by the replacement.'
    rows=[]
    for paragraph in text.split('\n'):
        current=''
        for word in paragraph.split():
            if font.text_length(word,fontsize=size)>width+0.2: return None,'A word is too wide for the original text block.'
            proposed=(current+' '+word).strip()
            if current and font.text_length(proposed,fontsize=size)>width+0.2:
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
        print(json.dumps({'blocks':blocks,'pages':len(doc),'supported':any(x['editable'] for x in blocks),'text':'\n\n'.join(x['text'] for x in blocks)},ensure_ascii=False));return
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
            if font['buffer']: page.insert_font(fontname=alias,fontbuffer=font['buffer'])
            color=fitz.sRGB_to_pdf(item['span']['color'])
            for line,old in zip(rows,item['lines']):
                page.insert_text(old['spans'][0]['origin'],line,fontname=alias,fontsize=item['span']['size'],color=color,overlay=True)
    output=doc.tobytes(garbage=4,deflate=True)
    result={'pdfBase64':base64.b64encode(output).decode(),'applied':[x[0] for x in planned],'rejected':rejected,'pages':len(doc)}
    if req.get('preview'):
        result['previews']=[base64.b64encode(p.get_pixmap(matrix=fitz.Matrix(min(1.5,1000/p.rect.width,1600/p.rect.height),min(1.5,1000/p.rect.width,1600/p.rect.height)),alpha=False).tobytes('png')).decode() for p in doc]
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(json.dumps({'error':str(exc)}));sys.exit(1)
