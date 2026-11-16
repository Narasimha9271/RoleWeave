import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001';
const data=new FormData();data.append('file',new Blob([await readFile('test-results/test-resume.pdf')],{type:'application/pdf'}),'resume.pdf');
const r=await fetch(base+'/api/parse',{method:'POST',body:data});const parsed=await r.json();assert.equal(r.status,200);assert.ok(parsed.text.includes('Alex Morgan'));
const invalid=await fetch(base+'/api/tailor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resume:'too short',jd:'short'})});assert.equal(invalid.status,400);
const user=await fetch(base+'/api/github/octocat');const repos=await user.json();assert.equal(user.status,200);assert.ok(Array.isArray(repos)&&repos.length>0);
console.log('PASS: PDF round trip, invalid input rejection, live public GitHub import.');

