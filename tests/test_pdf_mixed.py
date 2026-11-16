import sys,pathlib,subprocess,json,base64,io,importlib.util
root=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.python-packages'))
import pymupdf as fitz
import numpy as np
from reportlab.pdfgen import canvas
spec=importlib.util.spec_from_file_location('engine',root/'server/pdf_template.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)

# Fictional mixed-font resume. Separate drawString calls mimic TeX's word spans.
buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(612,792))
c.setFont('Helvetica-Bold',20);c.drawString(40,750,'ALEX EXAMPLE')
c.setFont('Helvetica-Bold',12);c.drawString(40,710,'EXPERIENCE')
x,y=55,680;c.setFont('Helvetica',8);c.drawString(40,y,'-')
for text,font in [('Built reliable backend services using ','Helvetica'),('Python','Helvetica-Bold'),(' for customer reporting workflows.','Helvetica')]:
 c.setFont(font,10)
 for word in text.split(' '):
  if word:c.drawString(x,y,word)
  x+=c.stringWidth(word,font,10)+c.stringWidth(' ',font,10)
c.setFont('Helvetica',10);c.drawString(55,660,'Worked with designers to improve accessible customer dashboards.')
c.setFont('Helvetica',10);c.drawString(55,630,'Read project documentation and source code on our public repository.')
c.linkURL('https://example.com/project',(55,625,420,642),relative=0)
c.showPage();c.setFont('Helvetica',10);c.drawString(40,740,'Education: Example University. Fictional test fixture.');c.save()
source=buf.getvalue()
def run(mode='inspect',edits=None):
 p=subprocess.run([sys.executable,'-I',str(root/'server/pdf_runner.py')],input=json.dumps({'mode':mode,'edits':edits or [],'pdfBase64':base64.b64encode(source).decode()}),capture_output=True,text=True,encoding='utf-8',timeout=30)
 assert p.returncode==0,p.stdout or p.stderr
 return json.loads(p.stdout)
info=run();assert info['supported']
a=fitz.open(stream=source,filetype='pdf');records,items=engine.collect(a)
expected='\n\n'.join('\n'.join(''.join(s.get('text','') for s in line['spans']).rstrip() for line in block['lines'] if any(s.get('text','').strip() for s in line['spans'])).strip() for page in a for block in page.get_text('dict')['blocks'] if block.get('type')==0)
assert info['text']==expected,'Segmentation changed source text'
block=next(b for b in records if b['editable'] and b['segmented'])
assert 'Python' not in block['text'];assert any(b['text']=='Python' and not b['editable'] for b in records)
replacement='Built backend services using'
result=run('export',[{'id':block['id'],'original':block['text'],'replacement':replacement}]);assert result['applied']==[block['id']],result['rejected']
b=fitz.open(stream=base64.b64decode(result['pdfBase64']),filetype='pdf');assert len(a)==len(b)==2
assert replacement in b[0].get_text();assert 'Python' in b[0].get_text();assert len(b[0].get_links())==1
assert a[1].get_pixmap().samples==b[1].get_pixmap().samples
pa=a[0].get_pixmap(matrix=fitz.Matrix(2,2));pb=b[0].get_pixmap(matrix=fitz.Matrix(2,2))
x0,y0,x1,y1=items[block['id']]['bbox'];mask=np.ones((pa.height,pa.width),dtype=bool);mask[max(0,int(y0*2)-3):int(y1*2)+4,max(0,int(x0*2)-3):int(x1*2)+4]=False
arrA=np.frombuffer(pa.samples,dtype=np.uint8).reshape(pa.height,pa.width,pa.n);arrB=np.frombuffer(pb.samples,dtype=np.uint8).reshape(pb.height,pb.width,pb.n)
assert np.array_equal(arrA[mask],arrB[mask]),'Protected text or layout pixels changed'
for replacement in ['too long '*100,'Unsupported glyph '+chr(0x1f680)]:
 denied=run('export',[{'id':block['id'],'original':block['text'],'replacement':replacement}]);assert denied['rejected'] and not denied['applied']
linked=next(b for b in records if 'Read project documentation' in b['text']);assert not linked['editable']
# Signed / redacted protection applies to the entire mixed-format document.
redacted=fitz.open(stream=source,filetype='pdf');redacted[0].add_redact_annot(fitz.Rect(1,1,3,3));assert not any(b['editable'] for b in engine.collect(redacted)[0])
class NoSpaceFont:
 def has_glyph(self,code):return code!=32
 def text_length(self,text,fontsize):return len(text)*5
assert engine.text_width('one two',NoSpaceFont(),12)==34
print('PASS: mixed-font run grouping, source text continuity, bold/bullet/link preservation, outside pixels, unchanged page, overflow/glyph rejection and pending-redaction protection.')
