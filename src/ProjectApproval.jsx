import React,{useState,useEffect,useRef} from 'react';
import {Github,Check,ArrowRight,X,ExternalLink,Search} from 'lucide-react';
import './project-review.css';

export default function ProjectApproval({api,jd,connectedUsername,onConnected,onApprove,onCancel,keepTemplate}){
 const [username,setUsername]=useState(connectedUsername||''),[phase,setPhase]=useState(connectedUsername?'loading':'connect'),[data,setData]=useState(null),[selected,setSelected]=useState([]),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[builtIn,setBuiltIn]=useState(false);
 const mounted=useRef(true),request=useRef(0),first=useRef(false),closeRef=useRef(null),dialogRef=useRef(null);
 useEffect(()=>{mounted.current=true;const focus=document.activeElement;closeRef.current?.focus();return()=>{mounted.current=false;focus?.focus()}},[]);
 useEffect(()=>{if(!first.current&&connectedUsername){first.current=true;scan(connectedUsername)}},[]);
 async function scan(handle){
  const id=++request.current;setPhase('loading');setError('');setSelected([]);setConfirmed(false);
  try{const found=await api('/api/github/match',{method:'POST',body:JSON.stringify({username:handle.trim(),jd})});if(!mounted.current||request.current!==id)return;await onConnected(found.username);if(!mounted.current||request.current!==id)return;setUsername(found.username);setData(found);setPhase('review');}
  catch(e){if(mounted.current&&request.current===id){setError(e.message);setPhase('connect')}}
 }
 function changeAccount(){request.current++;setPhase('connect');setSelected([]);setData(null);setError('');setConfirmed(false)}
 function keys(e){if(e.key==='Escape'){onCancel();return}if(e.key==='Tab'){const all=[...dialogRef.current.querySelectorAll('button,input,a[href]')].filter(x=>!x.disabled&&x.offsetParent!==null);const first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}
 const chosen=data?.matches.filter(r=>selected.includes(r.url))||[];
 return <div className="modal-backdrop project-review-backdrop"><section ref={dialogRef} className="project-review-modal" role="dialog" aria-modal="true" aria-labelledby="project-review-title" onKeyDown={keys}>
  <header className="project-review-header"><span className="project-review-icon"><Github size={23}/></span><button ref={closeRef} className="icon-button" aria-label="Cancel project review" onClick={onCancel}><X size={20}/></button></header>
  <div className="eyebrow">YOUR WORK. THE RIGHT OPPORTUNITY.</div><h2 id="project-review-title">{phase==='connect'?'Connect your GitHub projects':phase==='loading'?'Finding relevant projects…':'Choose what belongs in this resume'}</h2>
  <p className="project-review-intro">{phase==='connect'?'Add your GitHub username to check public projects against this job description.':phase==='loading'?'Checking public descriptions, languages, topics and candidate READMEs. Your resume has not been rewritten.':'Review the evidence, then approve the projects you want to import. Nothing is included automatically.'}</p>
  {error&&<p className="project-review-error" role="alert">{error}</p>}
  {phase==='connect'&&<form onSubmit={e=>{e.preventDefault();scan(username)}}><label className="field">GitHub username<input autoComplete="off" placeholder="Your GitHub username" value={username} onChange={e=>setUsername(e.target.value)} required maxLength={39}/></label><button className="button full" type="submit"><Search size={16}/> Connect & check projects</button><p className="fine-print">Public repositories only. No password or private-repository permission required.</p></form>}
  {phase==='loading'&&<div className="project-loading"><span className="spinner"/><span>Checking @{username}</span></div>}
  {phase==='review'&&<>
   <div className="project-review-summary"><span>@{data.username} · {data.checked} repositories checked</span><button className="text-button" onClick={changeAccount}>Change account</button></div>
   <p className="project-review-coverage">Up to 100 recent public, non-fork repositories. {data.readmesChecked} READMEs checked from {data.readmeCandidates} candidates. Matches are evidence hints, not a code audit.</p>
   {data.warning&&<div className="callout">{data.warning}</div>}
   <div className="project-matches">{data.matches.length?data.matches.map(r=><article key={r.url} className={'project-match '+(selected.includes(r.url)?'selected':'')}><label className="project-match-select"><input type="checkbox" checked={selected.includes(r.url)} onChange={e=>{setSelected(prev=>e.target.checked?[...prev,r.url]:prev.filter(x=>x!==r.url));setConfirmed(false)}}/><span><b>{r.name}</b><small>{r.language||'Public project'} · {r.readme?'README + repository details':'Repository details'}</small></span></label><p>{r.description||'No repository description. Review the linked project before selecting it.'}</p><div className="chips">{[...r.matched,...r.domainMatches].map(s=><span className="chip" key={s}><Check size={11}/>{s}</span>)}</div><a href={r.url} target="_blank" rel="noreferrer">Review on GitHub <ExternalLink size={12}/></a></article>):<div className="project-no-matches"><Search size={26}/><h3>No clear matches found</h3><p>Continue with your resume. Missing skills and project ideas will appear in Gaps after generation.</p></div>}</div>
   {chosen.length>0&&<><label className="project-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I worked on these projects and can explain my contribution.</span></label>{keepTemplate&&<div className="project-layout-note"><p>Your original PDF has fixed space. New project sections may not fit.</p><label><input type="checkbox" checked={builtIn} onChange={e=>setBuiltIn(e.target.checked)}/> Switch to a built-in template to add these projects</label><small>{builtIn?'Your selected built-in template will be used.':'Keep the original PDF layout; only supported edits that fit will be applied.'}</small></div>}</>}
  </>}
  <div className="project-review-actions">{phase==='review'&&chosen.length>0&&<button className="button" disabled={!confirmed} onClick={()=>onApprove(chosen,builtIn)}><Check size={16}/> Import {chosen.length} & rewrite <ArrowRight size={15}/></button>}<button className="button secondary" onClick={()=>onApprove([],false)}>Continue without GitHub projects</button><button className="text-button" onClick={onCancel}>Cancel</button></div>
  <p className="fine-print">Only approved projects are sent with the resume to the AI provider. Cancel leaves your current draft unchanged.</p>
 </section></div>
}
