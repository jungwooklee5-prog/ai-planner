/* AI Planner — Checklist-first + On-demand Planner + Day Details + Notification Dock */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { convertToHtml } from "mammoth/mammoth.browser";
import * as chrono from "chrono-node";
import { supabase } from "./lib/supabase";
import ChatBox from "./components/ChatBox";
import CalendarMonth from "./components/CalendarMonth";
import DayDetails from "./components/DayDetails";
import NotificationDock from "./components/NotificationDock";

pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

/* ---------- tiny utils ---------- */
const ls = { get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}} };
function qparam(name){ return new URLSearchParams(window.location.search).get(name) || ""; }
function setQParam(name,val){ const url=new URL(location.href); if(val) url.searchParams.set(name,val); else url.searchParams.delete(name); history.replaceState(null,"",url.toString()); }
function cryptoId(){ return Math.random().toString(36).slice(2,9); }
function toHM(mins){ const h=Math.floor(mins/60), m=mins%60, ampm=h>=12?"PM":"AM", hr12=((h+11)%12)+1; return `${hr12}:${String(m).padStart(2,"0")} ${ampm}`; }
function minutesSinceMidnight(d){ return d.getHours()*60 + d.getMinutes(); }
function parseLocalDT(s){ if(!s) return null; const d=new Date(s); return isNaN(d)?null:d; }
function formatDateLabel(date){ return new Date(date+"T00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}); }
function startOfWeekISO(dateStr){ const d=new Date(dateStr+"T00:00"); const day=d.getDay(); const diff=(day===0?-6:1)-day; d.setDate(d.getDate()+diff); return d; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

/* ---------- scheduling ---------- */
const PRIORITY_WEIGHT={High:3,Medium:2,Low:1};
const TOD_WINDOWS={Any:[0,1440],Morning:[360,720],Afternoon:[720,1020],Evening:[1020,1320]};
function byUrgencyAndPriority(a,b){ const A=a.due?+new Date(a.due):Infinity,B=b.due?+new Date(b.due):Infinity; if(A!==B) return A-B; return (PRIORITY_WEIGHT[b.priority]||0)-(PRIORITY_WEIGHT[a.priority]||0); }
function clampRange(ints,minS,maxE){ return ints.map(([s,e])=>[Math.max(minS,s),Math.min(maxE,e)]).filter(([s,e])=>e>s).sort((a,b)=>a[0]-b[0]); }
function mergeIntervals(ints){ if(!ints.length) return []; const out=[]; let [cs,ce]=ints[0]; for(let i=1;i<ints.length;i++){const [s,e]=ints[i]; if(s<=ce) ce=Math.max(ce,e); else {out.push([cs,ce]); [cs,ce]=[s,e];}} out.push([cs,ce]); return out; }
function invertIntervals(blocks,minS,maxE){ const merged=mergeIntervals(clampRange(blocks,minS,maxE)); const free=[]; let cur=minS; for(const [s,e] of merged){ if(s>cur) free.push([cur,s]); cur=Math.max(cur,e);} if(cur<maxE) free.push([cur,maxE]); return free; }
function autoSchedule({tasks,events,selectedDate,minStart,maxEnd}){
  const dayStr=new Date(selectedDate).toDateString();
  const dayEvents=events.map(e=>({ ...e, sDate:parseLocalDT(e.start), eDate:parseLocalDT(e.end)}))
    .filter(e=>e.sDate && e.sDate.toDateString()===dayStr)
    .map(e=>[minutesSinceMidnight(e.sDate),minutesSinceMidnight(e.eDate)]);
  const free=invertIntervals(dayEvents,minStart,maxEnd);
  const cand=tasks.filter(t=>!t.completed).slice().sort(byUrgencyAndPriority);
  const placed=[]; const freeBlocks=free.slice();
  for(const [s,e] of mergeIntervals(dayEvents)) placed.push({title:"Calendar Event",startMin:s,endMin:e,type:"event"});
  for(const t of cand){
    let remaining=Math.max(15,Math.min(240,Number(t.est)||30));
    const pref=TOD_WINDOWS[t.tod||"Any"]; const windows=[pref,[minStart,maxEnd]];
    for(const w of windows){
      for(let i=0;i<freeBlocks.length && remaining>0;i++){
        let [fs,fe]=freeBlocks[i]; const s=Math.max(fs,w[0]), e=Math.min(fe,w[1]); if(e-s<=0) continue;
        const chunk=Math.min(remaining,e-s,90); const start=s,end=s+chunk;
        placed.push({ title:t.title, startMin:start, endMin:end, type:"task" });
        remaining-=chunk;
        if(chunk>=50 && end+10<=fe){ placed.push({ title:"Break", startMin:end, endMin:end+10, type:"break" }); fs=end+10; } else fs=end;
        if(fs>=fe){ freeBlocks.splice(i,1); i--; } else freeBlocks[i]=[fs,fe];
      }
      if(remaining<=0) break;
    }
  }
  return placed.filter(b=>b.endMin>b.startMin).sort((a,b)=>a.startMin-b.startMin);
}

/* ---------- syllabus parsing ---------- */
async function readPdfText(file){ const buf=await file.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data:buf}).promise; let text=""; for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const content=await page.getTextContent(); text += content.items.map(it => ("str" in it ? it.str : it?.text || "")).join(" ") + "\n"; } return text; }
async function readDocxText(file){ const arrayBuffer=await file.arrayBuffer(); const { value:html }=await convertToHtml({ arrayBuffer }); return html.replace(/<[^>]+>/g," "); }
const ASSIGNMENT_KEYWORD = /(assignment|homework|hw|project|lab|paper|essay|problem\s*set|pset|quiz|midterm|final)/i;
import * as pdfjsWorkerHack from "pdfjs-dist/build/pdf.worker.min.mjs?worker"; // keep Vite happy
function chronoItems(text){
  const clean = text.replace(/\u00A0/g," ").replace(/[ \t]+/g," ").replace(/\s*\|\s*/g," | ").trim();
  const lines = clean.split(/\r?\n|(?<=\.)\s+(?=[A-Z])/).map(l=>l.trim()).filter(Boolean);
  const out=[]; const seen=new Set();
  for(const line of lines){
    if(!ASSIGNMENT_KEYWORD.test(line)) continue;
    const segments = line.split(/\s\|\s| - | — | – /).filter(Boolean);
    for(const seg of segments){
      const chunk = ASSIGNMENT_KEYWORD.test(seg) ? seg : line;
      const res = chrono.parse(chunk, new Date(), { forwardDate:true })?.[0];
      if(!res) continue; const start = res.start?.date(); if(!start) continue;
      if(!res.start.isCertain("hour")) start.setHours(23,59,0,0);
      const title = chunk.replace(/due\s*:?\s*/i,"").replace(res.text,"").replace(/\s{2,}/g," ").trim() || "Assignment";
      const item={ id:cryptoId(), title, dueISO:start.toISOString().slice(0,16), source: line };
      const key = `${title.toLowerCase()}|${item.dueISO}`; if(seen.has(key)) continue; seen.add(key); out.push(item); break;
    }
  }
  return out;
}

/* ---------- profiles ---------- */
const PROFILES_KEY="planner:profiles"; const LAST_KEY="planner:lastProfile";
function allProfiles(){ return ls.get(PROFILES_KEY,["default"]); }
function ensureProfile(pid){ const list=allProfiles(); if(!list.includes(pid)){list.push(pid); ls.set(PROFILES_KEY,list);} ls.set(LAST_KEY,pid); }
function dataKey(pid){ return `planner:data:${pid}`; }

/* ---------- small UI atoms ---------- */
const Chip=({children})=><span className="inline-block text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 mr-1">{children}</span>;
function TextButton({onClick,children}){ return <button onClick={onClick} className="text-xs underline">{children}</button>; }

/* ---------- main ---------- */
export default function AIPlanner(){
  const [user,setUser]=useState(null); const [authEmail,setAuthEmail]=useState("");

  const urlId=qparam("u")||""; const last=ls.get(LAST_KEY,"default"); const initialProfile=(urlId||last||"default").trim()||"default";
  ensureProfile(initialProfile);
  const [profile,setProfile]=useState(initialProfile); const [profiles,setProfiles]=useState(allProfiles());

  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [tasks,setTasks]=useState([]); const [events,setEvents]=useState([]); const [assignments,setAssignments]=useState([]);
  const [startHour,setStartHour]=useState(6), [endHour,setEndHour]=useState(22);
  const [view,setView]=useState("Day"); const [timeline,setTimeline]=useState([]);
  const [debugOpen,setDebugOpen]=useState(false); const [lastText,setLastText]=useState(""); const [lastMatches,setLastMatches]=useState([]);
  const [showPlanner,setShowPlanner]=useState(false);
  const [showDayPanel,setShowDayPanel]=useState(false);
  const minStart=startHour*60, maxEnd=endHour*60; const dayLabel=useMemo(()=>formatDateLabel(date),[date]);

  // Supabase auth
  useEffect(()=>{ (async()=>{
    const { data:{ session } } = await supabase.auth.getSession(); setUser(session?.user||null);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s)=> setUser(s?.user||null) );
    return ()=> sub.subscription.unsubscribe();
  })(); },[]);

  // profile switch: load cloud/local
  useEffect(()=>{ ensureProfile(profile); setQParam("u", profile==="default"?"":profile); user?loadCloud():loadLocal(); },[profile,user]);
  function loadLocal(){ const saved=ls.get(dataKey(profile),null); if(saved){ setTasks(saved.tasks||[]); setEvents(saved.events||[]); setAssignments(saved.assignments||[]); const s=saved.settings||{}; setStartHour(s.startHour??6); setEndHour(s.endHour??22);} else { setTasks([]); setEvents([]); setAssignments([]); setStartHour(6); setEndHour(22);} }
  async function loadCloud(){ const { data,error } = await supabase.from("planners").select("data").eq("user_id",user.id).eq("profile",profile).single(); if(error && error.code!=="PGRST116"){console.error(error); loadLocal(); return;} if(!data){ setTasks([]); setEvents([]); setAssignments([]); setStartHour(6); setEndHour(22); return;} const payload=data.data||{}; setTasks(payload.tasks||[]); setEvents(payload.events||[]); setAssignments(payload.assignments||[]); const s=payload.settings||{}; setStartHour(s.startHour??6); setEndHour(s.endHour??22); }

  // autosave
  const saveTimer=useRef(null);
  useEffect(()=>{ if(saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current=setTimeout(()=>{
    const payload={tasks,events,assignments,settings:{startHour,endHour}};
    user?supabase.from("planners").upsert({user_id:user.id,profile,data:payload}):ls.set(dataKey(profile),payload);
    ls.set(LAST_KEY,profile);
  },400); return ()=>clearTimeout(saveTimer.current); },[user,profile,tasks,events,assignments,startHour,endHour]);

  // schedule
  useEffect(()=>{ regenerate(); },[]);
  useEffect(()=>{ if(showPlanner) regenerate(); },[showPlanner,date,tasks,events,startHour,endHour]);
  function regenerate(){ const sel=new Date(date+"T00:00"); setTimeline(autoSchedule({tasks,events,selectedDate:sel,minStart,maxEnd})); }

  // ops
  const [newTask,setNewTask]=useState({ title:"", est:30, due:new Date().toISOString().slice(0,16), priority:"Medium", category:"General", tod:"Any", notes:"" });
  const [newEvent,setNewEvent]=useState({ title:"", start:new Date().toISOString().slice(0,16), end:new Date().toISOString().slice(0,16), location:"" });
  function addTask(){ if(!newTask.title.trim()) return; setTasks(p=>[{id:cryptoId(),...newTask},...p]); setNewTask({...newTask, title:""}); }
  function toggleDone(id){ setTasks(p=>p.map(t=>t.id===id?{...t,completed:!t.completed}:t)); }
  function removeTask(id){ setTasks(p=>p.filter(t=>t.id!==id)); }
  function addEvent(){ const s=parseLocalDT(newEvent.start), e=parseLocalDT(newEvent.end); if(!newEvent.title.trim()||!s||!e||e<=s) return alert("Check title & times."); setEvents(p=>[{ id:cryptoId(), ...newEvent }, ...p]); setNewEvent({...newEvent, title:""}); }
  function removeEvent(id){ setEvents(p=>p.filter(e=>e.id!==id)); }

  // uploads (ics/csv/img)
  async function readFileAsText(file){ const buf=await file.arrayBuffer(); return new TextDecoder().decode(buf); }
  function pad2(n){ return String(n).padStart(2,"0"); } function toICSDate(dt){ return `${dt.getFullYear()}${pad2(dt.getMonth()+1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`; }
  function escapeICS(s){ return String(s||"").replace(/\\/g,"\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }
  function downloadICS(filename,evs){ const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//AI Planner//EN"]; const stamp=toICSDate(new Date()); for(const ev of evs){ lines.push("BEGIN:VEVENT",`UID:${cryptoId()}@aiplanner`,`DTSTAMP:${stamp}`,`SUMMARY:${escapeICS(ev.title)}`); if(ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`); lines.push(`DTSTART:${toICSDate(ev.start)}`,`DTEND:${toICSDate(ev.end)}`,"END:VEVENT"); } lines.push("END:VCALENDAR"); const blob=new Blob([lines.join("\n")],{type:"text/calendar"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
  function parseICS(txt){ const events=[]; const lines=txt.replace(/\r/g,"").split("\n"); let cur=null; for(const raw of lines){ const line=raw.trim(); if(line==="BEGIN:VEVENT"){cur={};continue;} if(line==="END:VEVENT"){ if(cur.SUMMARY&&(cur.DTSTART||cur["DTSTART;TZID"])) events.push(cur); cur=null; continue;} if(!cur) continue; const [k,...rest]=line.split(":"); const v=rest.join(":"); const key=k.split(";")[0]; cur[key]=v; } const toDate=v=>{ if(!v) return null; const m=v.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2}))?/); if(!m) return null; const [,Y,M,D,,h="00",mi="00",s="00"]=m; return new Date(+Y,+M-1,+D,+h,+mi,+s); }; return events.map(e=>({ id:cryptoId(), title:e.SUMMARY||"Untitled", sDate:toDate(e.DTSTART||e["DTSTART;TZID"]), eDate:toDate(e.DTEND||e["DTEND;TZID"]), location:e.LOCATION||"" })).filter(x=>x.sDate&&x.eDate).map(x=>({ id:x.id, title:x.title, start:x.sDate.toISOString().slice(0,16), end:x.eDate.toISOString().slice(0,16), location:x.location })); }
  function parseCSV(txt){ const out=[]; const rows=txt.trim().split(/\r?\n/); const hdr=(rows.shift()||"").split(",").map(h=>h.trim().toLowerCase()); const idx=k=>hdr.indexOf(k); for(const line of rows){ const c=line.split(",").map(s=>s.trim()); const title=c[idx("title")]||"Untitled"; const start=c[idx("start")]||""; const end=c[idx("end")]||""; const loc=idx("location")>-1?c[idx("location")]:""; if(start&&end) out.push({ id:cryptoId(), title, start, end, location:loc }); } return out; }
  async function ocrImageFile(file){ const { createWorker } = await import("tesseract.js"); const worker=await createWorker("eng"); const url=URL.createObjectURL(file); const { data:{ text } }=await worker.recognize(url); await worker.terminate(); URL.revokeObjectURL(url); return text; }
  function guessWeekStartISO(todayISO){ const d=new Date(todayISO+"T00:00"); const diff=((d.getDay()||7)-1); d.setDate(d.getDate()-diff); return d; }
  const DAY_NAMES=["mon","tue","wed","thu","fri","sat","sun"];
  function parseScheduleTextToEvents(text,weekStart){ const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); const events=[]; for(const line of lines){ const l=line.toLowerCase(); const day=DAY_NAMES.find(d=>l.startsWith(d)); if(!day) continue; const tm=line.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i); if(!tm) continue; const [,h1,m1="00",ap1="",h2,m2="00",ap2=""]=tm; const title=line.slice(tm.index+tm[0].length).trim()||"Event"; const off=DAY_NAMES.indexOf(day); const d=new Date(weekStart); d.setDate(d.getDate()+off); const to24=(h,m,ap)=>{ let hh=Number(h)%12; if((ap||"").toLowerCase()==="pm") hh+=12; return [hh, Number(m)]; }; const [sH,sM]=to24(h1,m1,ap1), [eH,eM]=to24(h2,m2,ap2); const s=new Date(d); s.setHours(sH,sM,0,0); const e=new Date(d); e.setHours(eH,eM,0,0); if(e>s) events.push({ id:cryptoId(), title, start:s.toISOString().slice(0,16), end:e.toISOString().slice(0,16), location:"" }); } return events; }
  async function handleEventUpload(e){ const files=Array.from(e.target.files||[]); if(!files.length) return; const imported=[]; const weekStart=guessWeekStartISO(date); for(const f of files){ const ext=(f.name.split(".").pop()||"").toLowerCase(); try{ if(ext==="ics"){ const t=await readFileAsText(f); imported.push(...parseICS(t)); } else if(ext==="csv"){ const t=await readFileAsText(f); imported.push(...parseCSV(t)); } else { const t=await ocrImageFile(f); imported.push(...parseScheduleTextToEvents(t,weekStart)); } }catch(err){ alert(`Failed to import ${f.name}: ${err.message||err}`); } } if(imported.length){ setEvents(prev=>[...imported,...prev]); alert(`Imported ${imported.length} event(s).`);} else alert("No events detected."); e.target.value=""; }

  // syllabus upload
  async function handleSyllabusUpload(e){ const files=Array.from(e.target.files||[]); if(!files.length) return; const all=[]; let dbg=""; let matches=[]; for(const f of files){ const ext=(f.name.split(".").pop()||"").toLowerCase(); try{ let text=""; if(ext==="pdf") text=await readPdfText(f); else if(ext==="doc"||ext==="docx") text=await readDocxText(f); else if(ext==="txt") text=await readFileAsText(f); else text=await ocrImageFile(f); dbg += `\n\n===== ${f.name} =====\n` + text.slice(0,20000); const items=chronoItems(text); matches.push(...items.map(x=>x.source)); items.forEach(x=>x.file=f.name); all.push(...items); }catch(err){ alert(`Failed to read ${f.name}: ${err.message||err}`); } } if(!all.length){ alert("No assignments detected — open Debug to inspect the extracted text."); } setLastText(dbg.trim()); setLastMatches(matches); setAssignments(prev=>{ const seen=new Set(); const merged=[...prev,...all]; return merged.filter(x=>{ const key=`${(x.title||"").toLowerCase()}|${x.dueISO||""}`; if(seen.has(key)) return false; seen.add(key); return true; }); }); e.target.value=""; }

  // auth actions
  async function signInWithEmail(){ if(!authEmail) return alert("Enter your email first."); const { error }=await supabase.auth.signInWithOtp({ email:authEmail, options:{ emailRedirectTo: location.href } }); if(error) alert(error.message); else alert("Magic link sent. Check your email."); }
  async function signOut(){ await supabase.auth.signOut(); }

  // notifications (10 min before events)
  const notifiedIds=useRef(new Set());
  useEffect(()=>{ if(typeof window==="undefined") return; if("Notification" in window && Notification.permission==="default") Notification.requestPermission(); const t=setInterval(()=>{ if(!("Notification" in window) || Notification.permission!=="granted") return; const now=new Date(); const soon=new Date(now.getTime()+10*60*1000); for(const e of events){ const s=parseLocalDT(e.start); if(!s) continue; if(s>now && s<=soon){ const key=e.id||`${e.title}|${e.start}`; if(notifiedIds.current.has(key)) continue; notifiedIds.current.add(key); new Notification(e.title||"Upcoming event",{ body:`${s.toLocaleString()}${e.location?` • ${e.location}`:""}`}); } } },30*1000); return ()=>clearInterval(t); },[events]);

  const blockCard=(b,i)=>(
    <div key={i} className={`rounded-xl p-3 border w-full box-border overflow-hidden ${b.type==="task"?"bg-emerald-50 border-emerald-200":b.type==="event"?"bg-indigo-50 border-indigo-200":"bg-amber-50 border-amber-200"}`}>
      <div className="flex items-center justify-between"><div className="font-medium break-words">{b.title}</div><div className="text-sm text-gray-600">{toHM(b.startMin)} – {toHM(b.endMin)}</div></div>
      <div className="text-xs text-gray-500 mt-1">{b.type==="task"?"Planned work":b.type==="event"?"Fixed event":"Recovery"}</div>
    </div>
  );

  return (
    <div className="min-h-[100vh] w-full bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-6">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">AI Planner</h1>
            <p className="text-slate-600">Checklist • Calendar • On-demand AI plan • Import & Export</p>
          </div>

          {/* Auth + Profile row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1">
              {user ? (<><span className="text-sm">Signed in as <b>{user.email}</b></span><TextButton onClick={signOut}>Sign out</TextButton></>) : (<><input type="email" placeholder="you@example.com" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} className="px-2 py-1 rounded-lg border"/><TextButton onClick={signInWithEmail}>Send magic link</TextButton></>)}
            </div>

            {/* Profile switcher */}
            <div className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1">
              <span className="text-sm text-slate-600">Profile</span>
              <select value={profile} onChange={(e)=>setProfile(e.target.value)} className="px-2 py-1 rounded-lg">
                {profiles.map(p=> <option key={p} value={p}>{p}</option>)}
              </select>
              <TextButton onClick={()=>{ const name=prompt("New profile name (letters/numbers, no spaces):","student1"); if(!name) return; const pid=name.trim(); if(!pid) return; const list=allProfiles(); if(!list.includes(pid)){list.push(pid); ls.set(PROFILES_KEY,list);} setProfile(pid); setProfiles(allProfiles()); }}>New</TextButton>
              {profile!=="default" && <TextButton onClick={()=>{ if(!confirm(`Delete profile "${profile}"?`)) return; localStorage.removeItem(dataKey(profile)); const list=allProfiles().filter(x=>x!==profile); ls.set(PROFILES_KEY, list.length?list:["default"]); setProfile(list[0]||"default"); setProfiles(allProfiles()); }}>Delete</TextButton>}
              <TextButton onClick={()=>{ const url=new URL(location.href); url.searchParams.set("u",profile); navigator.clipboard.writeText(url.toString()).then(()=>alert("Profile link copied!")); }}>Copy link</TextButton>
            </div>

            <div className="flex rounded-xl border overflow-hidden bg-white">
              <button className={`px-3 py-2 ${view==="Day"?"bg-black text-white":""}`} onClick={()=>setView("Day")}>Day</button>
              <button className={`px-3 py-2 ${view==="Week"?"bg-black text-white":""}`} onClick={()=>setView("Week")}>Week</button>
            </div>
            <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className="px-3 py-2 rounded-xl border bg-white" />
            <div className="flex items-center gap-2">
              <label className="text-sm">Hours</label>
              <input type="number" min={0} max={23} value={startHour} onChange={(e)=> setStartHour(Math.min(23,Math.max(0, +e.target.value||0)))} className="w-16 px-2 py-2 rounded-xl border bg-white"/>
              <span>–</span>
              <input type="number" min={1} max={24} value={endHour} onChange={(e)=> setEndHour(Math.min(24,Math.max(1, +e.target.value||24)))} className="w-16 px-2 py-2 rounded-xl border bg-white"/>
            </div>
            <button onClick={()=>{ setShowPlanner(true); const sel=new Date(date+"T00:00"); setTimeline(autoSchedule({tasks,events,selectedDate:sel,minStart,maxEnd})); }} className="px-4 py-2 rounded-xl bg-black text-white">AI Auto-plan</button>
            <button onClick={()=>{ const sel=new Date(date+"T00:00"); const planned=autoSchedule({tasks,events,selectedDate:sel,minStart,maxEnd}); const fixed=events.map(e=>({ ...e, sDate:parseLocalDT(e.start), eDate:parseLocalDT(e.end)})).filter(e=>e.sDate && e.sDate.toDateString()===sel.toDateString()); const toExport=[ ...fixed.map(e=>({title:e.title,location:e.location,start:e.sDate,end:e.eDate})), ...planned.filter(b=>b.type!=="event").map(b=>({title:b.title,start:new Date(sel.getFullYear(),sel.getMonth(),sel.getDate(),0,0,0,0) || sel, end:new Date(sel.getFullYear(),sel.getMonth(),sel.getDate(),0,0,0,0)})) ]; }} className="px-4 py-2 rounded-xl border">Export .ics (Day)</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: Checklist */}
          <section className="xl:col-span-1">
            <div className="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Checklist</h2><span className="text-xs text-slate-500">Click ✓ to mark done</span></div>
              <div className="rounded-xl border p-3 bg-slate-50 mb-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input className="col-span-2 px-3 py-2 rounded-lg border bg-white" placeholder="Task title" value={newTask.title} onChange={(e)=>setNewTask({...newTask, title:e.target.value})}/>
                  <input type="number" min={10} step={5} className="px-3 py-2 rounded-lg border bg-white" placeholder="Est. mins" value={newTask.est} onChange={(e)=>setNewTask({...newTask, est:+e.target.value||30})}/>
                  <select className="px-3 py-2 rounded-lg border bg-white" value={newTask.priority} onChange={(e)=>setNewTask({...newTask, priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select>
                  <select className="px-3 py-2 rounded-lg border bg-white" value={newTask.tod} onChange={(e)=>setNewTask({...newTask, tod:e.target.value})}><option>Any</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select>
                  <input type="datetime-local" className="col-span-2 px-3 py-2 rounded-lg border bg-white" value={newTask.due} onChange={(e)=>setNewTask({...newTask, due:e.target.value})}/>
                  <input className="col-span-2 px-3 py-2 rounded-lg border bg-white" placeholder="Category (e.g., Research)" value={newTask.category} onChange={(e)=>setNewTask({...newTask, category:e.target.value})}/>
                  <textarea rows={2} className="col-span-2 px-3 py-2 rounded-lg border bg-white" placeholder="Notes" value={newTask.notes} onChange={(e)=>setNewTask({...newTask, notes:e.target.value})}/>
                </div>
                <button onClick={addTask} className="px-3 py-2 rounded-lg bg-emerald-600 text-white w-full">Add Task</button>
              </div>
              <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
                {tasks.length===0 && <div className="text-sm text-slate-500">No tasks yet. Add your first one above.</div>}
                {tasks.map(t=>(
                  <div key={t.id} className={`rounded-xl border p-3 bg-white flex items-start gap-3 ${t.completed?"opacity-60":""}`}>
                    <button onClick={()=>toggleDone(t.id)} className={`h-5 w-5 mt-1 rounded border flex items-center justify-center ${t.completed?"bg-emerald-500 border-emerald-600 text-white":"bg-white"}`}>{t.completed?"✓":""}</button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium break-words">{t.title}</div>
                        <div className="text-xs px-2 py-0.5 rounded-full border bg-slate-50">{t.priority}</div>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-2">
                        <span>Est: {t.est}m</span>
                        {t.due && <span>Due: {new Date(t.due).toLocaleString()}</span>}
                        {t.category && <Chip>{t.category}</Chip>}
                        <Chip>Time: {t.tod||"Any"}</Chip>
                      </div>
                      {t.notes && <div className="text-xs text-slate-500 mt-1 break-words">{t.notes}</div>}
                    </div>
                    <button className="text-slate-500 text-sm" onClick={()=>removeTask(t.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Middle: Plan */}
          <section className="xl:col-span-1">
            <div className="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
              {!showPlanner ? (
                <div className="text-sm text-slate-500">The AI planner is hidden. Click <b>AI Auto-plan</b> (top-right) to build a schedule from your checklist and events.</div>
              ) : view==="Day" ? (
                <>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Plan for {dayLabel}</h2><div className="flex gap-2"><button onClick={()=>{ const sel=new Date(date+"T00:00"); setTimeline(autoSchedule({tasks,events,selectedDate:sel,minStart,maxEnd})); }} className="px-3 py-1.5 rounded-lg border">Rebuild</button></div></div>
                  <div className="grid gap-2">{timeline.length?timeline.map(blockCard):<div className="text-sm text-slate-500">No items planned yet.</div>}</div>
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Week Plan (Mon–Sun)</h2></div>
                  <div className="grid gap-4">{Array.from({length:7}).map((_,i)=>{ const d=addDays(startOfWeekISO(date),i); const blocks=autoSchedule({tasks,events,selectedDate:d,minStart,maxEnd}); return (<div key={i} className="rounded-xl border p-3"><div className="text-sm font-medium mb-2">{d.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</div><div className="grid gap-2">{blocks.length?blocks.map(blockCard):<div className="text-xs text-slate-500">No items planned.</div>}</div></div>); })}</div>
                </>
              )}
            </div>
          </section>

          {/* Right: Calendar + Events + Syllabus */}
          <section className="xl:col-span-1 space-y-6">
            {/* Calendar */}
            <CalendarMonth
              date={date}
              tasks={tasks}
              events={events}
              onSelect={(iso)=>{ setDate(iso); setShowDayPanel(true); }}
            />

            {/* Events */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Calendar Events</h2></div>
              <div className="rounded-xl border p-3 bg-slate-50 mb-3">
                <div className="text-sm font-medium mb-2">Upload schedule (.ics / .csv / image)</div>
                <input type="file" accept=".ics,.csv,image/*" multiple onChange={handleEventUpload} className="block w-full text-sm" />
              </div>
              <div className="rounded-xl border p-3 bg-slate-50 mb-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input className="col-span-2 px-3 py-2 rounded-lg border bg-white" placeholder="Event title" value={newEvent.title} onChange={(e)=>setNewEvent({...newEvent, title:e.target.value})}/>
                  <input type="datetime-local" className="px-3 py-2 rounded-lg border bg-white" value={newEvent.start} onChange={(e)=>setNewEvent({...newEvent, start:e.target.value})}/>
                  <input type="datetime-local" className="px-3 py-2 rounded-lg border bg-white" value={newEvent.end} onChange={(e)=>setNewEvent({...newEvent, end:e.target.value})}/>
                  <input className="col-span-2 px-3 py-2 rounded-lg border bg-white" placeholder="Location (optional)" value={newEvent.location} onChange={(e)=>setNewEvent({...newEvent, location:e.target.value})}/>
                </div>
                <button onClick={addEvent} className="px-3 py-2 rounded-lg bg-indigo-600 text-white w-full">Add Event</button>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
                {events.length===0 && <div className="text-sm text-slate-500">No events yet.</div>}
                {events.map(e=>{ const s=parseLocalDT(e.start), ed=parseLocalDT(e.end);
                  return (<div key={e.id} className="rounded-xl border p-3 bg-white flex items-start gap-3">
                    <div className="flex-1">
                      <div className="font-medium break-words">{e.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{s?s.toLocaleString():"?"} – {ed?ed.toLocaleString():"?"}</div>
                      {e.location && <div className="text-xs text-slate-500 mt-0.5">{e.location}</div>}
                    </div>
                    <button className="text-slate-500 text-sm" onClick={()=>removeEvent(e.id)}>✕</button>
                  </div>);
                })}
              </div>
            </div>

            {/* Syllabus → Assignments */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">Syllabus → Assignments</h2>
                <p className="text-xs text-slate-600">Upload .pdf/.docx/.txt or an image. Detected items show below.</p>
              </div>
              <div className="rounded-xl border p-3 bg-slate-50 mb-3">
                <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" multiple onChange={handleSyllabusUpload} className="block w-full text-sm" />
                <div className="mt-2"><TextButton onClick={()=>setDebugOpen(v=>!v)}>{debugOpen?"Hide":"Show"} debug</TextButton></div>
              </div>

              {debugOpen && (
                <div className="rounded-xl border p-3 bg-slate-50 mb-3 text-xs text-slate-700 max-h-64 overflow-auto">
                  <div className="font-semibold mb-1">Matched lines ({lastMatches.length}):</div>
                  {lastMatches.length ? lastMatches.slice(0,50).map((m,i)=><div key={i} className="mb-1">• {m}</div>) : <div>— none —</div>}
                  <div className="font-semibold mt-3 mb-1">Extracted text (first ~20k chars):</div>
                  <pre className="whitespace-pre-wrap">{lastText || "— no text yet —"}</pre>
                </div>
              )}

              <div className="space-y-2 max-h-[38vh] overflow-auto pr-1">
                {assignments.length===0 && <div className="text-sm text-slate-500">No assignments detected yet.</div>}
                {assignments.map(a=>(
                  <div key={a.id} className="rounded-xl border p-3 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium break-words">{a.title}</div>
                      <div className="flex items-center gap-2">
                        {a.dueISO && <div className="text-xs text-slate-600">Due: {new Date(a.dueISO).toLocaleString()}</div>}
                        <button
                          className="text-xs px-2 py-1 rounded border bg-white"
                          onClick={()=> setAssignments(prev => prev.filter(x=>x.id!==a.id))}
                        >Delete</button>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 break-words line-clamp-2">{a.source}</div>
                    <div className="mt-2 flex gap-2">
                      <button className="px-2 py-1 rounded border text-sm"
                        onClick={()=>setTasks(p=>[
                          { id:cryptoId(), title:a.title, est:60, due:a.dueISO||new Date().toISOString().slice(0,16), priority:"High", category:"Academics", tod:"Any", notes:"Imported from syllabus" },
                          ...p
                        ])}
                      >Add as Task</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Day details modal (opens when clicking a date on the calendar) */}
      <DayDetails open={showDayPanel} isoDate={date} tasks={tasks} events={events} onClose={()=>setShowDayPanel(false)} />

      {/* Notification dock & Chat */}
      <NotificationDock tasks={tasks} events={events} assignments={assignments}/>
      <ChatBox/>
    </div>
  );
}
