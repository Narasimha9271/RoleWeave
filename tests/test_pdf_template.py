import sys,pathlib,subprocess,json,base64,io
root=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.python-packages'))
import pymupdf as fitz
import numpy as np
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
out=root/'data'/'pdf-test';out.mkdir(parents=True,exist_ok=True)
buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(612,792));c.setFillColor(HexColor('#214f3b'));c.rect(0,685,612,107,fill=1,stroke=0);c.setFillColorRGB(1,1,1);c.setFont('Helvetica-Bold',24);c.drawString(38,746,'ALEX MORGAN');c.setFont('Helvetica',10);c.drawString(38,722,'alex@example.com | Software Engineer');c.setFillColor(HexColor('#edf3ed'));c.rect(0,0,200,685,fill=1,stroke=0)
def heading(x,y,title):
 c.setFillColor(HexColor('#214f3b'));c.setFont('Helvetica-Bold',12);c.drawString(x,y,title)
def para(x,y,lines):
 c.setFillColor(HexColor('#333333'));t=c.beginText(x,y);t.setFont('Helvetica',10);t.setLeading(14)
 for line in lines:t.textLine(line)
 c.drawText(t)
heading(24,650,'SKILLS');para(24,625,['React, TypeScript, Node.js','PostgreSQL, REST, Git']);heading(224,650,'PROFILE');para(224,625,['Software engineer building web dashboards with','React and TypeScript. Collaborates with designers','and writes unit tests for frontend components.']);heading(224,550,'EXPERIENCE');para(224,525,['Software Engineer | Example Studio | 2023 - Now']);para(224,495,['Built customer dashboards with React and TypeScript.','Integrated REST APIs and wrote unit tests.','Worked with designers on accessible page layouts.']);c.setStrokeColor(HexColor('#d2e0d0'));c.line(224,565,570,565);c.showPage();heading(38,745,'EDUCATION');para(38,715,['Bachelor of Computer Science | Example University','2023 | Fictional fixture for software testing only.']);c.save();source=buf.getvalue();(out/'original.pdf').write_bytes(source)
def run(mode='inspect',edits=[]):
 p=subprocess.run([sys.executable,'-I',str(root/'server/pdf_runner.py')],input=json.dumps({'pdfBase64':base64.b64encode(source).decode(),'mode':mode,'edits':edits}),text=True,encoding='utf-8',capture_output=True,timeout=30)
 if p.returncode:raise RuntimeError(p.stdout or p.stderr)
 return json.loads(p.stdout)
info=run();assert info['pages']==2 and info['supported'];block=next(b for b in info['blocks'] if b['text'].startswith('Software engineer building'))
replacement='Frontend engineer building React dashboards.\nUses TypeScript and unit tests.\nCollaborates with designers.'
result=run('export',[{'id':block['id'],'original':block['text'],'replacement':replacement}]);assert result['applied']==[block['id']],result
edited=base64.b64decode(result['pdfBase64']);(out/'edited.pdf').write_bytes(edited)
a=fitz.open(stream=source,filetype='pdf');b=fitz.open(stream=edited,filetype='pdf');assert len(a)==len(b)==2;assert a[0].rect==b[0].rect
text=b[0].get_text();assert 'Frontend engineer building React dashboards.' in text;assert 'Software engineer building web dashboards' not in text;assert 'alex@example.com' in text
assert len(a[0].get_drawings())==len(b[0].get_drawings())
assert a[1].get_pixmap().samples==b[1].get_pixmap().samples,'Unchanged page differs'
pa=a[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5));pb=b[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5));pa.save(out/'original.png');pb.save(out/'edited.png')
# No pixels outside the edited text rectangle may change.
originalBlock=next(x for x in a[0].get_text('dict')['blocks'] if x.get('type')==0 and any('Software engineer building' in s['text'] for l in x['lines'] for s in l['spans']))
x0,y0,x1,y1=originalBlock['bbox'];mask=np.ones((pa.height,pa.width),dtype=bool);mask[max(0,int(y0*1.5)-3):int(y1*1.5)+4,max(0,int(x0*1.5)-3):int(x1*1.5)+4]=False
arrA=np.frombuffer(pa.samples,dtype=np.uint8).reshape(pa.height,pa.width,pa.n);arrB=np.frombuffer(pb.samples,dtype=np.uint8).reshape(pb.height,pb.width,pb.n);assert np.array_equal(arrA[mask],arrB[mask]),'Pixels outside edited block changed'
long=run('export',[{'id':block['id'],'original':block['text'],'replacement':'Too much content '*150}]);assert not long['applied'] and long['rejected'];assert fitz.open(stream=base64.b64decode(long['pdfBase64']),filetype='pdf')[0].get_pixmap().samples==a[0].get_pixmap().samples
protected=next(x for x in info['blocks'] if not x['editable']);denied=run('export',[{'id':protected['id'],'original':protected['text'],'replacement':'Changed'}]);assert denied['rejected'] and not denied['applied']
(out/'inspection.json').write_text(json.dumps(info,indent=2))
print('PASS: original layout, fonts, page count, selectable replacement text, removed old text, unchanged graphics/pages/pixels, overflow rejection, protected-block rejection.')
