import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRepo,findProjectMatches} from '../server/github.js';
test('JavaScript projects are not matched to Java; generic Git alone is insufficient',()=>{
 const result=matchRepo({name:'UI',description:'JavaScript app tracked with Git',language:'JavaScript'},'Java backend engineer using Git');
 assert.equal(result.score,0);assert.deepEqual(result.matched,['Git']);
});
test('README evidence and domain requirements contribute to a relevant match',()=>{
 const repo={name:'ledger',language:'Python',readme:'Invoice reconciliation with FastAPI and PostgreSQL.'};
 const result=matchRepo(repo,'Build invoice reconciliation services with FastAPI and PostgreSQL');
 assert.ok(result.matched.includes('FastAPI'));assert.ok(result.matched.includes('PostgreSQL'));assert.ok(result.domainMatches.includes('reconciliation'));assert.ok(result.score>0);
});
test('candidate scan is bounded, handles absent READMEs, and excludes forks/private/archived repos',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(url);if(url.includes('/users/'))return {ok:true,json:async()=>[
  ...Array.from({length:12},(_,i)=>({name:'repo'+i,description:i===0?'React dashboard':'Python service',language:i===0?'JavaScript':'Python',owner:{login:'fixtureuser'},topics:[],fork:false,archived:false})),
  {name:'fork',fork:true},{name:'archive',archived:true},{name:'private',private:true}]};
  if(url.includes('/repo0/'))return {ok:true,json:async()=>({encoding:'base64',content:Buffer.from('React TypeScript dashboard').toString('base64')})};
  return {ok:false,status:404};};
 try{const found=await findProjectMatches('fixtureuser','Frontend engineer using React and TypeScript for a dashboard.');assert.equal(found.checked,12);assert.equal(found.readmeCandidates,8);assert.equal(calls.length,9);assert.equal(found.matches.length,1);assert.ok(found.matches[0].matched.includes('TypeScript'));assert.equal(found.readmesChecked,1);}
 finally{globalThis.fetch=original}
});

test('core JD requirements rank above optional technologies',()=>{const jd='Build React and TypeScript dashboards. Next.js and Docker are a plus.';const core=matchRepo({name:'ui',description:'React TypeScript'},jd);const bonus=matchRepo({name:'api',description:'Next.js Docker'},jd);assert.ok(core.score>bonus.score)});


test('role title changes relevance and recommendations explain actual evidence',()=>{
 const ui={name:'ui',description:'Accessible React and CSS dashboard',language:'JavaScript'};
 const api={name:'service',description:'Python FastAPI REST service',language:'Python'};
 const jd='Build reliable products and work with a software team.';
 assert.ok(matchRepo(ui,jd,'Frontend Engineer').score>matchRepo(api,jd,'Frontend Engineer').score);
 assert.ok(matchRepo(api,jd,'Backend Engineer').score>matchRepo(ui,jd,'Backend Engineer').score);
 assert.ok(matchRepo(ui,jd,'Frontend Engineer').reasons.some(reason=>reason.includes('React')));
 assert.equal(matchRepo({name:'notes',description:'Meeting notes'},jd,'Frontend Engineer').score,0);
});

test('recommendations return four ranked matches after reading candidate READMEs, with no unrelated padding',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes('/users/'))return Response.json(Array.from({length:6},(_,i)=>({name:'project'+i,description:i<5?'React dashboard':'Unrelated poetry',language:i<5?'JavaScript':'',owner:{login:'topfourfixture'},topics:[]})));
  if(url.includes('/project4/'))return Response.json({encoding:'base64',content:Buffer.from('React TypeScript CSS accessibility').toString('base64')});
  return Response.json({message:'Not found'},{status:404});
 };
 try{
  const found=await findProjectMatches('topfourfixture','Build React and TypeScript web applications with CSS.','Frontend Engineer');
  assert.equal(found.matches.length,4);assert.equal(found.matches[0].name,'project4');assert.ok(found.matches.every(r=>r.name!=='project5'&&r.reasons.length));
  const unrelated=await findProjectMatches('topfourfixture','Build banking services using Java and Spring Boot.','Java Engineer');assert.equal(unrelated.matches.length,0);
 }finally{globalThis.fetch=original;}
});
