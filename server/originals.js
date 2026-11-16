import {createClient} from '@supabase/supabase-js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
const bucket='resume-originals';
function client(req){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+req.accessToken}},auth:{persistSession:false,autoRefreshToken:false}})}
export async function saveOriginal(req,buffer,filename,info){
 const storagePath=(req.user?.id||'local')+'/'+randomUUID()+'.pdf';
 if(req.user){const {error}=await client(req).storage.from(bucket).upload(storagePath,buffer,{contentType:'application/pdf',upsert:false});if(error)throw new Error('Could not store the original PDF. Check the resume-originals bucket and its access policies.');}
 else{const folder=path.resolve('data/uploads/local');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,path.basename(storagePath)),buffer);}
 return {path:storagePath,filename,sha256:createHash('sha256').update(buffer).digest('hex'),pages:info.pages,blocks:info.blocks,supported:info.supported,sourceText:info.text};
}
export async function loadOriginal(req,storagePath){
 const owner=req.user?.id||'local';
 if(typeof storagePath!=='string'||!new RegExp('^'+owner+'/[0-9a-f-]{36}\\.pdf$').test(storagePath))throw new Error('This original PDF does not belong to your account.');
 if(req.user){const {data,error}=await client(req).storage.from(bucket).download(storagePath);if(error)throw new Error('Original PDF is unavailable. Upload your resume again.');return Buffer.from(await data.arrayBuffer());}
 return readFile(path.resolve('data/uploads',storagePath));
}
