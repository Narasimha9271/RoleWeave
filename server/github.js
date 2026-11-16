import {skills,hasSkill} from './tailor.js';
const tech=skills;
const domains=['banking','payments','ecommerce','dashboard','authentication','microservices','invoice','reconciliation','booking','data pipeline','chat','search'];
const aliases=text=>String(text||'').replace(/e-commerce/gi,'ecommerce').replace(/spring-boot/gi,'Spring Boot').replace(/nextjs/gi,'Next.js').replace(/nodejs/gi,'Node.js').replace(/restful/gi,'REST').replace(/continuous integration/gi,'CI/CD').replace(/machine-learning/gi,'Machine Learning');
export function matchRepo(repo,jd){
 const evidence=aliases([repo.name,repo.description,repo.language,...(repo.topics||[]),repo.readme].join(' '));
 const target=aliases(jd);
 const matched=tech.filter(s=>hasSkill(target,s)&&hasSkill(evidence,s));
 const domainMatches=domains.filter(s=>hasSkill(target,s)&&hasSkill(evidence,s));
 const statements=target.split(/[.!?](?:\s|$)|[\n;]/);
 const optional=s=>statements.filter(t=>hasSkill(t,s)).every(t=>/\b(plus|bonus|preferred|optional|nice.to.have)\b/i.test(t));
 const relevant=matched.some(s=>s!=='Git')||domainMatches.length>0;
 return {...repo,matched,domainMatches,score:relevant?matched.reduce((n,s)=>n+(s==='Git'||optional(s)?1:3),0)+domainMatches.length*2:0};
}
const cache=new Map();
async function githubJson(endpoint){
 const cached=cache.get(endpoint);if(cached&&cached.until>Date.now())return cached.data;
 const response=await fetch('https://api.github.com'+endpoint,{headers:{Accept:'application/vnd.github+json','User-Agent':'RoleWeave'},signal:AbortSignal.timeout(12000)});
 if(!response.ok){const error=new Error(response.status===404?'GitHub account or repository not found.':response.status===403||response.status===429?'GitHub rate limit reached. Try again later or continue without projects.':'GitHub is unavailable. Retry or continue without projects.');error.githubStatus=response.status;throw error;}
 const data=await response.json();if(cache.size>=150)cache.delete(cache.keys().next().value);cache.set(endpoint,{data,until:Date.now()+300000});return data;
}
export async function listRepositories(username){
 if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username))throw new Error('Enter a valid GitHub username.');
 const data=await githubJson('/users/'+encodeURIComponent(username)+'/repos?per_page=100&sort=updated');
 return data.filter(r=>!r.fork&&!r.archived&&!r.private).map(r=>({name:r.name,description:(r.description||'').slice(0,2000),language:r.language||'',url:'https://github.com/'+encodeURIComponent(r.owner.login)+'/'+encodeURIComponent(r.name),stars:r.stargazers_count,owner:r.owner.login,topics:r.topics||[]}));
}
export async function findProjectMatches(username,jd){
 const repos=await listRepositories(username);
 const ranked=repos.map(r=>matchRepo(r,jd)).sort((a,b)=>b.score-a.score);
 const shortlist=ranked.slice(0,8);let unavailable=0,readmesChecked=0;
 // Bound external calls and only inspect paths returned by GitHub's repository API.
 for(let i=0;i<shortlist.length;i+=4){await Promise.all(shortlist.slice(i,i+4).map(async r=>{
  try{const file=await githubJson('/repos/'+encodeURIComponent(r.owner)+'/'+encodeURIComponent(r.name)+'/readme');if(file.encoding==='base64'&&file.content){r.readme=Buffer.from(file.content,'base64').toString('utf8').slice(0,12000);readmesChecked++;}}
  catch(e){if(e.githubStatus!==404)unavailable++;}
 }));}
 const matches=ranked.map(r=>matchRepo(r,jd)).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,10);
 return {username:repos[0]?.owner||username,matches,checked:repos.length,readmesChecked,readmeCandidates:shortlist.length,warning:unavailable?'Some READMEs could not be checked. Matches use the available public evidence.':null};
}
