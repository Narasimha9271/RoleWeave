import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {listRepositories,findProjectMatches} from './github.js';
import { extractiveTailor, analyze } from './tailor.js';
import path from 'node:path';
import {aiSettings,rewriteResume} from './ai.js';
import {processPdf} from './pdf.js';
import {saveOriginal,loadOriginal} from './originals.js';
const app=express();
const cloud=process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY):null;
if(process.env.NODE_ENV==='production'&&!cloud) throw new Error('Production requires Supabase authentication configuration.');
app.disable('x-powered-by');
const proxyHops=Number(process.env.TRUST_PROXY_HOPS||0);
if(!Number.isInteger(proxyHops)||proxyHops<0||proxyHops>5)throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.');
app.set('trust proxy',proxyHops);
app.get('/healthz',(req,res)=>res.status(200).json({status:'ok'}));
app.use(express.json({limit:'1mb'}));
app.use('/api',rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}));
app.get('/api/config',async(req,res)=>{
 let providers=null;
 if(cloud){
  try{
   const response=await fetch(process.env.SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:process.env.SUPABASE_ANON_KEY},signal:AbortSignal.timeout(5000)});
   if(response.ok){const data=await response.json();providers={google:!!data.external?.google,github:!!data.external?.github};}
  }catch{}
 }
 res.json({ai:!!aiSettings().apiKey,aiProvider:aiSettings().provider,cloud:!!cloud,providers,pdfTemplate:true});
});
app.use('/api',async(req,res,next)=>{
 if(!cloud) return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'');
 if(!token)return res.status(401).json({error:'Please sign in to continue.'});
 const {data,error}=await cloud.auth.getUser(token);
 if(error||!data.user)return res.status(401).json({error:'Your session expired. Please sign in again.'});
 req.user=data.user;req.accessToken=token;next();
});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
app.post('/api/parse',upload.single('file'),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'Choose a resume file.'});
 const ext=path.extname(req.file.originalname).toLowerCase();let text='';
 if(ext==='.pdf'){const parser=new PDFParse({data:new Uint8Array(req.file.buffer)});try{text=(await parser.getText()).text;}finally{await parser.destroy();}}
 else if(ext==='.docx')text=(await mammoth.extractRawText({buffer:req.file.buffer})).value;
 else if(ext==='.txt')text=req.file.buffer.toString('utf8');
 else return res.status(400).json({error:'Use PDF, DOCX, or TXT.'});
 if(text.trim().length<30)return res.status(422).json({error:'No readable text found. Try a text-based PDF, Word file, or paste your resume.'});
 let originalFile=null,templateWarning=null;
 if(ext==='.pdf'&&req.body.kind!=='jd'){
  try{const info=await processPdf(req.file.buffer);if(info.text.length>40000)throw new Error('PDF text is too long for template mode.');originalFile=await saveOriginal(req,req.file.buffer,req.file.originalname,info);text=info.text;}
  catch(error){templateWarning=error.message;}
 }
 res.json({text:text.slice(0,40000),filename:req.file.originalname,originalFile,templateWarning});
});
const repoSchema=z.object({name:z.string().max(200),description:z.string().max(2000),language:z.string().max(100),url:z.string().url().max(500),readme:z.string().max(12000).optional(),topics:z.array(z.string().max(100)).max(30).optional()});
app.get('/api/github/:username',async(req,res)=>res.json(await listRepositories(req.params.username)));
app.post('/api/github/match',async(req,res)=>{
 const input=z.object({username:z.string().trim().min(1).max(39),jd:z.string().min(30).max(20000)}).safeParse(req.body);
 if(!input.success)return res.status(400).json({error:'Enter a GitHub username and a job description of at least 30 characters.'});
 res.json(await findProjectMatches(input.data.username,input.data.jd));
});
app.post('/api/tailor',async(req,res)=>{
 const input=z.object({resume:z.string().min(30).max(40000),jd:z.string().min(30).max(20000),repos:z.array(repoSchema).max(10).default([]),projectsApproved:z.boolean().default(false),originalPath:z.string().max(200).optional()}).safeParse(req.body);
 if(!input.success)return res.status(400).json({error:'Add a resume and job description (at least 30 characters each), and select up to 10 projects.'});
 if(input.data.repos.length&&!input.data.projectsApproved)return res.status(400).json({error:'Review and approve the GitHub projects before rewriting.'});
 let {resume,jd,repos,originalPath}=input.data;
 let info=null,pdfBuffer=null;
 if(originalPath){pdfBuffer=await loadOriginal(req,originalPath);info=await processPdf(pdfBuffer);if(!info.supported)return res.status(422).json({error:'This PDF has no safely editable text blocks. Choose a built-in template.'});if(resume.trim()!==info.text.trim())return res.status(409).json({error:'Your text differs from the uploaded PDF. Re-upload the revised PDF or use a built-in template.'});}
 if(!aiSettings().apiKey&&!originalPath)return res.json({...extractiveTailor(resume,jd,repos),approvedProjects:repos});
 const draft=await rewriteResume({resume,jd,repos,blocks:info?.blocks});
 if(info){
  const fitted=await processPdf(pdfBuffer,'export',draft.edits);
  const accepted=new Set(fitted.applied);draft.templateWarnings=fitted.rejected;
  draft.edits=draft.edits.filter(e=>accepted.has(e.id));
  draft.text=info.blocks.map(b=>draft.edits.find(e=>e.id===b.id)?.replacement||b.text).join('\n\n');
  draft.changes=draft.edits.map(e=>({original:e.original,replacement:e.replacement,source:'Original PDF · '+e.id,reason:e.reason}));
  draft.originalTemplate={path:originalPath,blocks:info.blocks,pages:info.pages};
 }
 res.json({...draft,...analyze(resume,jd,repos),mode:'ai',approvedProjects:repos});
});
app.post('/api/pdf/export',async(req,res)=>{
 const input=z.object({path:z.string().max(200),preview:z.boolean().default(false),edits:z.array(z.object({id:z.string().max(50),original:z.string().max(10000),replacement:z.string().min(1).max(10000)})).max(250)}).safeParse(req.body);
 if(!input.success)return res.status(400).json({error:'Invalid PDF export request.'});
 const raw=await loadOriginal(req,input.data.path);
 const output=await processPdf(raw,'export',input.data.edits,input.data.preview);
 if(output.rejected.length)return res.status(422).json({error:'Some edits do not fit the original template. Shorten these blocks: '+output.rejected.map(x=>x.id).join(', '),rejected:output.rejected});
 res.json(output);
});
app.use(express.static(path.resolve('dist')));
app.get('/{*splat}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));
app.use((err,req,res,next)=>{
 console.error(err.name,err.status||'',err.code||'');
 let status=500,message='Could not complete this request. Please try again.';
 if(err instanceof multer.MulterError){status=400;message='File too large. Maximum size is 5 MB.';}
 else if(err.status===429){status=429;message=err.code==='insufficient_quota'||err.code==='credit_balance_exhausted'?'The AI provider has no credits available. Check its billing settings.':'The AI provider free-tier limit was reached. Wait a minute or use a shorter resume/job description.';}
 else if(err.status===401){status=503;message='The AI provider rejected the API key. Check server configuration.';}
 else if(err.status===413){status=413;message='This request exceeds the AI provider token limit. Shorten the job description or select fewer projects.';}
 else if(err.status===400){status=422;message='The AI provider could not complete this draft. Try a shorter job description.';}
 else if(!err.status&&err.message&&!/key|token|secret/i.test(err.message)){status=422;message=err.message;}
 res.status(status).json({error:message});
});
app.listen(process.env.PORT||3001,process.env.HOST||'127.0.0.1',()=>console.log('RoleWeave API ready'));

