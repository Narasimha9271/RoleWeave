import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
const fresh=()=>import('../server/github.js?reliability='+serial++);
const repo={name:'dashboard',description:'React dashboard',language:'JavaScript',owner:{login:'fixture'},topics:[],fork:false,archived:false,private:false};

test('authenticated public reads coalesce concurrent calls and cache successful results',async t=>{
 const fetchBefore=globalThis.fetch,tokenBefore=process.env.GITHUB_TOKEN;
 t.after(()=>{globalThis.fetch=fetchBefore;if(tokenBefore===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=tokenBefore;});
 process.env.GITHUB_TOKEN='synthetic-test-credential';let calls=0,release;
 globalThis.fetch=async(url,options)=>{calls++;assert.ok(url.startsWith('https://api.github.com/users/'));assert.equal(options.headers.Authorization,'Bearer synthetic-test-credential');assert.equal(options.redirect,'error');await new Promise(resolve=>release=resolve);return Response.json([repo,{...repo,name:'private',private:true}]);};
 const {listRepositories}=await fresh();
 const first=listRepositories('fixture'),second=listRepositories('fixture');release();
 const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.length,1);
 await listRepositories('fixture');assert.equal(calls,1);assert.ok(!JSON.stringify(a).includes('synthetic-test-credential'));
});

test('rate limits honor reset time, stop all upstream calls during cooldown, then recover',async t=>{
 const fetchBefore=globalThis.fetch,nowBefore=Date.now;let now=1800000000000,calls=0;
 t.after(()=>{globalThis.fetch=fetchBefore;Date.now=nowBefore;});Date.now=()=>now;
 globalThis.fetch=async()=>{calls++;return calls===1?Response.json({message:'API rate limit exceeded'},{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(now/1000+120)}}):Response.json([repo]);};
 const {listRepositories}=await fresh();
 await assert.rejects(listRepositories('fixture'),error=>error.code==='GITHUB_RATE_LIMIT'&&error.httpStatus===429&&error.retryAt===now+120000);
 now+=61000;await assert.rejects(listRepositories('another-user'),{code:'GITHUB_RATE_LIMIT'});assert.equal(calls,1);
 now+=60000;assert.equal((await listRepositories('fixture')).length,1);assert.equal(calls,2);
});

test('missing READMEs are cached while permission failures are not mislabeled as rate limits',async t=>{
 const before=globalThis.fetch;let calls=0;t.after(()=>globalThis.fetch=before);
 globalThis.fetch=async url=>{calls++;return url.includes('/users/')?Response.json([repo]):Response.json({message:'Not Found'},{status:404});};
 const {findProjectMatches}=await fresh();
 const a=await findProjectMatches('fixture','Build React dashboard applications');
 await findProjectMatches('fixture','Develop React user interfaces');assert.equal(calls,2);assert.equal(a.matches.length,1);
 globalThis.fetch=async()=>Response.json({message:'Resource not accessible'},{status:403});
 const denied=await fresh();await assert.rejects(denied.listRepositories('fixture'),{code:'GITHUB_ACCESS_DENIED',httpStatus:403});
});

test('rejected credentials produce a safe setup error without anonymous fallback',async t=>{
 const before=globalThis.fetch;let calls=0;t.after(()=>globalThis.fetch=before);
 globalThis.fetch=async()=>{calls++;return Response.json({message:'Bad credentials'},{status:401});};
 const {listRepositories}=await fresh();await assert.rejects(listRepositories('fixture'),{code:'GITHUB_AUTH_CONFIGURATION',httpStatus:503});assert.equal(calls,1);
});
