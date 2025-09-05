import { createWorker } from "tesseract.js";

const pad=n=>String(n).padStart(2,"0");
function parse12h(t){ if(!t)return null; const m=t.match(/(\d{1,2})[.:](\d{2})\s*([AP]M)/i); if(!m)return null; let h=(+m[1])%12; if(/PM/i.test(m[3]))h+=12; return {h,m:+m[2]}; }
function buildLocal(y,m,d,{h,m:min}){ return new Date(y,m-1,d,h,min,0,0); }
function cryptoId(){ try{ return crypto.randomUUID(); }catch{ return Math.random().toString(36).slice(2,10);} }

async function fileToCanvas(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url;});
    const maxW=2200, scale=Math.min(3,Math.max(1,maxW/img.width));
    const W=Math.round(img.width*scale), H=Math.round(img.height*scale);
    const c=document.createElement("canvas"); c.width=W; c.height=H; const ctx=c.getContext("2d");
    ctx.drawImage(img,0,0,W,H);
    const id=ctx.getImageData(0,0,W,H), d=id.data;
    for(let i=0;i<d.length;i+=4){ const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; const v=g>190?255:g<70?0:g; d[i]=d[i+1]=d[i+2]=v; }
    ctx.putImageData(id,0,0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

function globalFallback(text){
  const today=new Date(); const yy=today.getFullYear(), mm=today.getMonth()+1, dd=today.getDate();
  const hits=[...text.matchAll(/(\d{1,2}[:.]\d{2}\s*[AP]M)[^\dAP]{0,12}(\d{1,2}[:.]\d{2}\s*[AP]M)(.*)$/img)];
  const out=[];
  for(const h of hits.slice(0,20)){
    const s12=parse12h(h[1]), e12=parse12h(h[2]); if(!s12||!e12) continue;
    const title=(h[3]||"").replace(/^\s*[-–]\s*/,"").trim()||"Scheduled item";
    out.push({
      id:cryptoId(), title, location:null, professor:null,
      start:buildLocal(yy,mm,dd,s12).toISOString(),
      end:buildLocal(yy,mm,dd,e12).toISOString(),
      repeatWeekly:false, allDay:false, source:"image-ocr-fallback"
    });
  }
  return out;
}

export async function ocrGetText(file){
  const worker = await createWorker({
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath:  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath:  'https://cdn.jsdelivr.net/npm/tesseract.js@5/languages'
  });
  try{
    await worker.load(); await worker.loadLanguage('eng'); await worker.initialize('eng');
    await worker.setParameters({ tessedit_pageseg_mode:'6' });
    const canvas = await fileToCanvas(file);
    const { data:{ text } } = await worker.recognize(canvas);
    return text||"";
  } finally { await worker.terminate(); }
}

export function buildFallbackEventsFromText(text){ return globalFallback(text||""); }
