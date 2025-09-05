import { createWorker } from "tesseract.js";

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2,"0");
function parse12h(t){
  if(!t) return null;
  const m=t.match(/(\d{1,2})[.:](\d{2})\s*([AP]M)/i);
  if(!m) return null;
  let h=(+m[1])%12; if(/PM/i.test(m[3])) h+=12;
  return {h, m:+m[2]};
}
function buildLocal(y,m,d,{h,m:min}){ return new Date(y,m-1,d,h,min,0,0); }
function cryptoId(){ try{ return crypto.randomUUID(); }catch{ return Math.random().toString(36).slice(2,10);} }

/* Upscale + light binarize to improve OCR */
async function fileToCanvas(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
    const maxW = 2200;
    const scale = Math.min(3, Math.max(1, maxW / img.width));
    const W = Math.round(img.width * scale);
    const H = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    const imgData = ctx.getImageData(0,0,W,H);
    const d = imgData.data;
    for(let i=0;i<d.length;i+=4){
      const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      const v = g > 190 ? 255 : g < 70 ? 0 : g;
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(imgData,0,0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/* ——— tolerant text → events ——— */
function pickMonth(T){
  const map={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const m=(T.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)||[])[1]||"Aug";
  return map[m.slice(0,3)];
}

/* Try to group by day headers if OCR kept them; otherwise we still fallback */
function splitByDays(T){
  const re=/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(\d{1,2})/ig;
  const out=[]; let m,last=0;
  while((m=re.exec(T))){
    if(out.length) out[out.length-1].body = T.slice(last, m.index);
    out.push({day:+m[3], body:""});
    last = re.lastIndex;
  }
  if(out.length) out[out.length-1].body = T.slice(last);
  return out;
}

/* Extract title / prof / location from nearby lines */
function harvestMeta(lines, i){
  const up = k => (lines[i-k]||"").trim();
  let title = up(3) || up(4) || up(2) || "Untitled";
  if (/Campus|Room|Bldg|Building|AS\.\d+/i.test(title)) title = up(4) || up(3) || "Untitled";
  const profRe = /^(?:Professor|Prof\.?|Instructor|Dr\.?)?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})$/;
  let professor = profRe.test(up(1)) ? up(1).replace(/^(?:Professor|Prof\.?|Instructor|Dr\.?)\s*/i,"").trim() : null;
  let location = null;
  for(const cand of [up(2), up(1), up(3)]) if(/\bCampus\b|\bRoom\b|\bBldg|Building|AS\.\d+/i.test(cand)){ location=cand; break; }
  return { title:title.trim(), professor, location };
}

/* Main tolerant extractor */
export function parseScheduleTextFromImage(text){
  const T = (text||"")
    .replace(/\r/g,"")
    .replace(/[–—]/g,"-")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\s{2,}/g," ")
    .trim();

  console.log("[OCR first 500 chars]\\n"+T.slice(0,500));

  const month = pickMonth(T);
  const year  = new Date().getFullYear();

  const days = splitByDays(T);
  const events = [];

  const scanBlock = (block, day) => {
    const lines = block.split(/\n+/).map(s=>s.trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      const L = lines[i];
      // SUPER tolerant time range:
      // - allows dot in time (10.30AM), missing dash, or dash/newline between times
      const m = L.match(/(\d{1,2}[:.]\d{2}\s*[AP]M)[^\dAP]{0,12}(\d{1,2}[:.]\d{2}\s*[AP]M)/i)
             || (lines[i+1] && (lines[i] + " " + lines[i+1]).match(/(\d{1,2}[:.]\d{2}\s*[AP]M)[^\dAP]{0,12}(\d{1,2}[:.]\d{2}\s*[AP]M)/i));
      if(!m) continue;
      const s12=parse12h(m[1]), e12=parse12h(m[2]);
      if(!s12||!e12) continue;
      const meta=harvestMeta(lines,i);
      const start=buildLocal(year,month,day,s12), end=buildLocal(year,month,day,e12);
      events.push({
        id: cryptoId(),
        title: meta.title || "Untitled",
        location: meta.location||null,
        professor: meta.professor||null,
        start: start.toISOString(),
        end: end.toISOString(),
        repeatWeekly: true,
        allDay:false,
        source:"image-ocr"
      });
    }
  };

  if(days.length){
    for(const d of days) scanBlock(d.body, d.day);
  }else{
    // fallback: use today's day if day headers missing
    const today = new Date(); const dd = today.getDate();
    scanBlock(T, dd);
  }

  // LAST RESORT: scan entire text globally for any time pairs and create "Scheduled item" today
  if(!events.length){
    const today = new Date(); const mm = today.getMonth()+1, dd = today.getDate(), yy = today.getFullYear();
    const any = [...T.matchAll(/(\d{1,2}[:.]\d{2}\s*[AP]M)[^\dAP]{0,12}(\d{1,2}[:.]\d{2}\s*[AP]M)(.*)$/img)];
    for(const hit of any.slice(0,10)){
      const s12=parse12h(hit[1]), e12=parse12h(hit[2]); if(!s12||!e12) continue;
      const start=buildLocal(yy,mm,dd,s12), end=buildLocal(yy,mm,dd,e12);
      events.push({
        id: cryptoId(),
        title: (hit[3]||"").replace(/^\s*[-–]\s*/,"").trim() || "Scheduled item",
        location:null, professor:null,
        start:start.toISOString(), end:end.toISOString(),
        repeatWeekly:false, allDay:false, source:"image-ocr-fallback"
      });
    }
  }

  console.log(`[OCR] Detected ${events.length} events`);
  return events;
}

/* Use CDN worker so wasm loads in prod; preprocess canvas; verbose logs */
export async function parseOcrImageFile(file){
  const worker = await createWorker({
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath:   'https://cdn.jsdelivr.net/npm/tesseract.js@5/languages'
  });
  try{
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const canvas = await fileToCanvas(file);
    const { data:{ text } } = await worker.recognize(canvas);
    return parseScheduleTextFromImage(text||"");
  } finally {
    await worker.terminate();
  }
}
