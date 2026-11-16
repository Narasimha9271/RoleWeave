import {skills,hasSkill} from './tailor.js';
const tech=skills;
const domains=['banking','payments','ecommerce','dashboard','authentication','microservices','invoice','reconciliation','booking','data pipeline','chat','search'];
const aliases=text=>String(text||'').replace(/e-commerce/gi,'ecommerce').replace(/spring-boot/gi,'Spring Boot').replace(/nextjs/gi,'Next.js').replace(/nodejs/gi,'Node.js').replace(/restful/gi,'REST').replace(/continuous integration/gi,'CI/CD').replace(/machine-learning/gi,'Machine Learning');
const roleFamilies=[
 {name:'Frontend',pattern:/front[ -]?end|ui\b|web developer/i,signals:['React','TypeScript','JavaScript','HTML','CSS','Next.js','Vue','Angular','accessibility']},
 {name:'Backend',pattern:/back[ -]?end|api developer/i,signals:['Node.js','Python','Java','Spring Boot','FastAPI','Django','REST','PostgreSQL','MongoDB']},
 {name:'Full stack',pattern:/full[ -]?stack/i,signals:['React','Node.js','Next.js','REST','PostgreSQL','MongoDB']},
 {name:'DevOps',pattern:/devops|platform|site reliability|sre\b/i,signals:['Docker','Kubernetes','Terraform','AWS','CI/CD','Linux']},
 {name:'Data / ML',pattern:/data|machine learning|\bml\b|\bai\b/i,signals:['Python','SQL','Machine Learning','TensorFlow','PyTorch','Pandas','data pipeline']},
 {name:'Mobile',pattern:/mobile|android|ios/i,signals:['React Native','Flutter','Kotlin','Swift','Android','iOS']}
];
export function matchRepo(repo,jd,role=''){

 const evidence=aliases([repo.name,repo.description,repo.language,...(repo.topics||[]),repo.readme].join(' '));
 const target=aliases(jd);
 const matched=tech.filter(s=>hasSkill(target,s)&&hasSkill(evidence,s));
 const domainMatches=domains.filter(s=>hasSkill(target,s)&&hasSkill(evidence,s));
 const statements=target.split(/[.!?](?:\s|$)|[\n;]/);
 const optional=s=>statements.filter(t=>hasSkill(t,s)).every(t=>/\b(plus|bonus|preferred|optional|nice.to.have)\b/i.test(t));
 const roleSkills=tech.filter(s=>hasSkill(aliases(role),s)&&hasSkill(evidence,s));
 const roleMatches=roleFamilies.filter(f=>f.pattern.test(role)).map(f=>({name:f.name,evidence:f.signals.filter(s=>hasSkill(evidence,s)).slice(0,3)})).filter(f=>f.evidence.length);
 const relevant=matched.some(s=>s!=='Git')||domainMatches.length>0||roleSkills.some(s=>s!=='Git')||roleMatches.length>0;
 const reasons=[];
 if(roleSkills.length)reasons.push('Role technologies: '+roleSkills.join(', '));
 for(const family of roleMatches)reasons.push(family.name+' evidence: '+family.evidence.join(', '));
 const jdEvidence=matched.filter(s=>s!=='Git');
 if(jdEvidence.length)reasons.push('Job description: '+jdEvidence.slice(0,5).join(', '));
 if(domainMatches.length)reasons.push('Relevant domain: '+domainMatches.join(', '));
 return {...repo,matched,domainMatches,roleSkills,roleMatches,reasons,score:relevant?matched.reduce((n,s)=>n+(s==='Git'||optional(s)?1:3),0)+domainMatches.length*2+roleSkills.filter(s=>s!=='Git').length*3+roleMatches.length*3:0};
}
const cache=new Map(),inFlight=new Map();
let blockedUntil=0;
function githubError(message,githubStatus,httpStatus=502,code='GITHUB_UNAVAILABLE',retryAt=null){
 const error=new Error(message);Object.assign(error,{githubStatus,httpStatus,code,retryAt});return error;
}
function limitError(){
 const minutes=Math.max(1,Math.ceil((blockedUntil-Date.now())/60000));
 return githubError('GitHub request limit reached. Try again in '+minutes+' minute'+(minutes===1?'':'s')+', or continue without projects.',429,429,'GITHUB_RATE_LIMIT',blockedUntil);
}
function remember(endpoint,value,ttl){
 if(cache.size>=150)cache.delete(cache.keys().next().value);
 cache.set(endpoint,{...value,until:Date.now()+ttl});
}
async function githubJson(endpoint){
 const cached=cache.get(endpoint);
 if(cached&&cached.until>Date.now()){if(cached.error)throw cached.error;return cached.data;}
 if(Date.now()<blockedUntil)throw limitError();
 if(inFlight.has(endpoint))return inFlight.get(endpoint);
 const pending=(async()=>{
  const headers={Accept:'application/vnd.github+json','User-Agent':'RoleWeave','X-GitHub-Api-Version':'2022-11-28'};
  const token=process.env.GITHUB_TOKEN?.trim();
  if(token)headers.Authorization='Bearer '+token;
  let response;
  try{response=await fetch('https://api.github.com'+endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});}
  catch{throw githubError('GitHub is unavailable. Retry or continue without projects.',503);}
  if(!response.ok){
   const header=name=>response.headers?.get(name);
   let detail={};try{detail=await response.json();}catch{}
   const limited=response.status===429||(response.status===403&&(header('x-ratelimit-remaining')==='0'||header('retry-after')||/rate limit|abuse/i.test(detail.message||'')));
   if(limited){
    const retry=Number(header('retry-after'))*1000;
    const reset=header('x-ratelimit-remaining')==='0'?Number(header('x-ratelimit-reset'))*1000:0;
    blockedUntil=Math.max(Date.now()+60000,Date.now()+(Number.isFinite(retry)?retry:0),Number.isFinite(reset)?reset:0);
    throw limitError();
   }
   if(response.status===404){const error=githubError('GitHub account or repository not found.',404,404,'GITHUB_NOT_FOUND');remember(endpoint,{error},300000);throw error;}
   if(response.status===401)throw githubError('GitHub imports need an administrator to update the server connection. You can continue without projects.',401,503,'GITHUB_AUTH_CONFIGURATION');
   if(response.status===403)throw githubError('GitHub denied access to this public resource. Try another account or continue without projects.',403,403,'GITHUB_ACCESS_DENIED');
   throw githubError('GitHub is unavailable. Retry or continue without projects.',response.status);
  }
  const data=await response.json();remember(endpoint,{data},900000);return data;
 })();
 inFlight.set(endpoint,pending);
 try{return await pending;}finally{inFlight.delete(endpoint);}
}
export async function listRepositories(username){
 if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username))throw new Error('Enter a valid GitHub username.');
 const data=await githubJson('/users/'+encodeURIComponent(username)+'/repos?per_page=100&sort=updated');
 return data.filter(r=>!r.fork&&!r.archived&&!r.private).map(r=>({name:r.name,description:(r.description||'').slice(0,2000),language:r.language||'',url:'https://github.com/'+encodeURIComponent(r.owner.login)+'/'+encodeURIComponent(r.name),stars:r.stargazers_count,owner:r.owner.login,topics:r.topics||[]}));
}
export async function findProjectMatches(username,jd,role=''){
 const repos=await listRepositories(username);
 const ranked=repos.map(r=>matchRepo(r,jd,role)).sort((a,b)=>b.score-a.score);
 const shortlist=ranked.slice(0,8);let unavailable=0,readmesChecked=0;
 // Bound external calls and only inspect paths returned by GitHub's repository API.
 for(let i=0;i<shortlist.length;i+=4){await Promise.all(shortlist.slice(i,i+4).map(async r=>{
  try{const file=await githubJson('/repos/'+encodeURIComponent(r.owner)+'/'+encodeURIComponent(r.name)+'/readme');if(file.encoding==='base64'&&file.content){r.readme=Buffer.from(file.content,'base64').toString('utf8').slice(0,12000);readmesChecked++;}}
  catch(e){if(e.githubStatus!==404)unavailable++;}
 }));}
 const matches=ranked.map(r=>matchRepo(r,jd,role)).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
 return {username:repos[0]?.owner||username,matches,checked:repos.length,readmesChecked,readmeCandidates:shortlist.length,warning:unavailable?'Some READMEs could not be checked. Matches use the available public evidence.':null};
}
