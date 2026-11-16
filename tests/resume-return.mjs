import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

// Isolated test account and intercepted APIs: never reads or writes real cloud data.
const user={id:'00000000-0000-4000-8000-000000000001',email:'flow-test@example.com',aud:'authenticated',role:'authenticated',user_metadata:{}};
const expires=Math.floor(Date.now()/1000)+3600;
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:expires,role:'authenticated'})).toString('base64url'),'test-signature'].join('.');
const session={access_token:token,refresh_token:'test-refresh',expires_in:3600,expires_at:expires,token_type:'bearer',user};
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://roleweave-test.supabase.co'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-public-key')}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(value=>localStorage.setItem('sb-roleweave-test-auth-token',JSON.stringify(value)),session);
 let failSave=true,savedProfile=null;
 await page.route('https://roleweave-test.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/rest/v1/profiles'&&request.method()==='POST'){
   if(failSave)return route.fulfill({status:400,json:{message:'Profile save failed. Please retry.'}});
   savedProfile=request.postDataJSON();return route.fulfill({status:201,body:''});
  }
  if(url.pathname==='/rest/v1/profiles')return route.fulfill({json:null});
  if(url.pathname==='/rest/v1/applications')return route.fulfill({json:[]});
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  throw Error('Unexpected test auth request: '+url.pathname);
 });
 await page.route('**/api/config',route=>route.fulfill({json:{cloud:true,ai:false,providers:{github:true,google:true}}}));
 const resume='Alex Test — Software Engineer. Built accessible React applications and Node.js APIs with PostgreSQL.';
 await page.route('**/api/parse',route=>route.fulfill({json:{text:resume,filename:'resume.txt',originalFile:null}}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'New application',exact:true}).click();
 const details={company:'Example Labs',role:'Frontend Engineer',jd:'Build accessible React applications with TypeScript and test reliable user onboarding flows.'};
 await page.getByLabel('Company name').fill(details.company);
 await page.getByLabel('Role title').fill(details.role);
 await page.getByRole('textbox',{name:'Job description',exact:true}).fill(details.jd);
 await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from(resume)});
 await expect(page.getByLabel('Resume content')).toHaveValue(resume);
 await page.getByRole('button',{name:'Save & continue to application'}).click();
 await expect(page.getByRole('status').filter({hasText:'Profile save failed'})).toBeVisible();
 await expect(page.getByLabel('Resume content')).toHaveValue(resume);
 failSave=false;
 await page.getByRole('button',{name:'Save & continue to application'}).click();
 await expect(page.getByLabel('Company name')).toHaveValue(details.company);
 await expect(page.getByLabel('Role title')).toHaveValue(details.role);
 await expect(page.getByRole('textbox',{name:'Job description',exact:true})).toHaveValue(details.jd);
 await expect(page.getByRole('button',{name:'Generate tailored draft'})).toBeEnabled();
 assert.equal(savedProfile.resume,resume);
 // Standalone editing stays on My resume; it must not reuse an old return path.
 await page.getByRole('button',{name:'My resume',exact:true}).click();
 await page.getByRole('button',{name:'Save master resume',exact:true}).click();
 await expect(page.getByLabel('Resume content')).toBeVisible();
 await expect(page.getByRole('button',{name:'Save & continue to application'})).toHaveCount(0);
 // Explicit back navigation also preserves the application fields.
 await page.getByRole('button',{name:'Resume studio',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('button',{name:'Back to application',exact:true}).click();
 await expect(page.getByLabel('Company name')).toHaveValue(details.company);
 await expect(page.getByRole('textbox',{name:'Job description',exact:true})).toHaveValue(details.jd);
 // A GitHub quota error stays visible and offers a return to the current application.
 await page.route('**/api/github/fixture',route=>route.fulfill({status:429,json:{error:'GitHub request limit reached. Try again in 2 minutes, or continue without projects.',code:'GITHUB_RATE_LIMIT'}}));
 await page.getByRole('button',{name:'GitHub projects',exact:true}).click();
 await page.getByLabel('GitHub username').fill('fixture');
 await page.getByRole('button',{name:'Connect & browse repositories'}).click();
 await expect(page.getByRole('alert')).toContainText('Try again in 2 minutes');
 await page.getByRole('button',{name:'Continue application without projects'}).click();
 await expect(page.getByLabel('Company name')).toHaveValue(details.company);
 await expect(page.getByRole('textbox',{name:'Job description',exact:true})).toHaveValue(details.jd);
 assert.deepEqual(errors,[]);
 console.log('PASS: upload, failed-save retention, successful-save return, application fields preserved, standalone save, back navigation and GitHub quota recovery.');
}finally{await browser?.close();await server.close();}
