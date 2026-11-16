export const skills = ['JavaScript','TypeScript','React','Next.js','Node.js','Python','Java','SQL','PostgreSQL','MongoDB','Docker','Kubernetes','AWS','Azure','GraphQL','REST','Redis','Go','Rust','C++','CI/CD','Git','HTML','CSS','testing','accessibility','Spring Boot','Kafka','FastAPI','Django','Flask','Express','MySQL','C#','.NET','Terraform','Jest','Playwright','React Native','Flutter','Machine Learning'];
export function hasSkill(text, skill) { return new RegExp('(?<![a-z0-9])'+skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![a-z0-9])','i').test(text); }
export function analyze(resume,jd,repos=[]) {
 const required=skills.filter(s=>hasSkill(jd,s));
 const evidence=resume+'\n'+repos.map(r=>r.name+' '+r.description+' '+r.language+' '+(r.topics||[]).join(' ')+' '+(r.readme||'')).join('\n');
 const matched=required.filter(s=>hasSkill(evidence,s));
 const gaps=required.filter(s=>!matched.includes(s));
 return {required,matched,gaps};
}
export function extractiveTailor(resume,jd,repos=[]) {
 const analysis=analyze(resume,jd,repos);
 const selected=repos.filter(r=>analysis.required.some(s=>hasSkill([r.name,r.description,r.language,r.readme].join(' '),s))).slice(0,3);
 return {mode:'extractive',text:resume+(selected.length?'\n\nSELECTED PROJECTS\n'+selected.map(r=>`${r.name} | ${r.url}\n${r.description||'See repository for project details.'}`).join('\n\n'):''),changes:selected.map(r=>({reason:'Relevant project selected from your confirmed repository list.',source:r.url,original:r.description||r.name,replacement:r.description||r.name})),suggestions:analysis.gaps.map(s=>`Build or extend a project using ${s}. Include tests, a working demo, and a README explaining your decisions before adding it to your resume.`),...analysis};
}
