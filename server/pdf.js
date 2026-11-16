import {spawn} from 'node:child_process';
import path from 'node:path';
export function processPdf(buffer,mode='inspect',edits=[],preview=false){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.PYTHON_BIN||'python',['-I',path.resolve('server/pdf_runner.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  let output='',error='';let done=false;
  const finish=(e,v)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(v)};
  const timer=setTimeout(()=>{child.kill();finish(new Error('PDF processing timed out. Try a smaller document.'))},30000);
  child.on('error',()=>finish(new Error('PDF template engine is unavailable. Check PYTHON_BIN and requirements.txt.')));
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>25*1024*1024){child.kill();finish(new Error('PDF result is too large.'))}});
  child.stderr.on('data',chunk=>{error+=chunk;if(error.length>4096)error=error.slice(-4096)});
  child.on('close',code=>{try{const data=JSON.parse(output);if(code||data.error)finish(new Error(data.error||'PDF processing failed.'));else finish(null,data)}catch{finish(new Error('PDF processing failed. Check the Python dependencies.'))}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({mode,preview,pdfBase64:buffer.toString('base64'),edits}));
 });
}
