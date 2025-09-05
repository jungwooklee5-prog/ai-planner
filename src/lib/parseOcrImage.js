import { createWorker } from "tesseract.js";

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function parse12h(t){ const m=t&&t.match(/(\d{1,2}):(\d{2})\s*([AP]M)\b/i); if(!m)return null; let h=(+m[1])%12; if(/PM/i.test(m[3]))h+=12; return {h, m:+m[2]}; }
function buildLocal(y,m,d,{h,m:min}){ return new Date(y,m-1,d,h,min,0,0); }
function cryptoId(){ try{ return crypto.randomUUID(); }catch{ return Math.random().toString(36).slice(2,10);} }

/* Load image and preprocess to boost OCR quality */
async function fileToCanvas(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
    // upscale to ~2000px width for clearer text
    const maxW = 2000;
    const scale = Math.min(3, Math.max(1, maxW / img.width));
    const W = Math.round(img.width * scale);
    const H = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    // simple contrast/threshold
    const imgData = ctx.getImageData(0,0,W,H);
    const d = imgData.data;
    for(let i=0;i<d.length;i+=4){
      // grayscale
      const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      // increase contrast a bit
      const cst = Math.max(0, Math.min(255, (g-128)*1.15 + 128));
      const v = cst > 180 ? 255 : cst < 80 ? 0 : cst; // light binarization
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(imgData,0,0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- text parsing tailored to your screenshot ---------- */
export function parseScheduleTextFromImage(text){
  const T = (text||"")
    .replace(/\r/g,"")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/[ \t]{2,}/g," ")
    .replace(/[–—]/g,"-")
    .trim();
  // log a snippet so we can see what OCR actually read
  console.log("[OCR first 500 chars]\\n", T.slice(0,500));

  // Month/year guess from header; default to current
  const monthMap = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const monthHit = T.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  const month = monthMap[(monthHit?.[1]||"Aug").slice(0,3)];
  const year = new Date().getFullYear();

  // Split by day headers like "Mon, Aug 25" or "Tue Aug 26"
  const dayHeader = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(\d{1,2})/ig;
  const parts = [];
  let m, last = 0;
  while ((m = dayHeader.exec(T))) {
    if (parts.length) parts[parts.length-1].body = T.slice(last, m.index);
    parts.push({ day:+m[2], body:"" });
    last = dayHeader.lastIndex;
  }
  if (parts.length) parts[parts.length-1].body = T.slice(last);
  if (!parts.length) parts.push({ day: new Date().getDate(), body: T }); // fallback: single day

  const events = [];
  for (const p of parts) {
    const lines = p.body.split(/\n+/).map(s=>s.trim()).filter(Boolean);
    for (let i=0;i<lines.length;i++){
      const L = lines[i];
      // very tolerant time pattern: "10:30AM-11:45AM" / "10:30 AM - 11:45 AM"
      const tm = L.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (!tm) continue;

      const up = k => (k>0 && lines[i-k]) ? lines[i-k].trim() : "";
      // try to pick a reasonable title not containing Campus/Room
      let title = up(3) || up(4) || up(2) || "Untitled";
      if (/Campus|Room|Bldg|Building|AS\.\d+/i.test(title)) title = up(4) || up(3) || "Untitled";

      let professor = null;
      const profLine = up(1);
      const profRe = /^(?:Professor|Prof\.?|Instructor|Dr\.?)?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})$/;
      if (profRe.test(profLine)) professor = profLine.replace(/^(?:Professor|Prof\.?|Instructor|Dr\.?)\s*/i,"").trim();

      let location = null;
      for (const cand of [up(2), up(1), up(3)]) {
        if (/\bCampus\b|\bRoom\b|\bBldg|Building|AS\.\d+/i.test(cand)) { location = cand; break; }
      }

      const s12 = parse12h(tm[1]); const e12 = parse12h(tm[2]);
      if (!s12 || !e12) continue;

      const start = buildLocal(year, month, p.day, s12);
      const end   = buildLocal(year, month, p.day, e12);

      events.push({
        id: cryptoId(),
        title: title.trim(),
        location: location||null,
        professor,
        start: start.toISOString(),
        end: end.toISOString(),
        repeatWeekly: true,
        allDay: false,
        source: "image-ocr"
      });
    }
  }

  // LAST-RESORT FALLBACK: if still nothing, scan the whole text for any time ranges and use *today*.
  if (!events.length) {
    const today = new Date();
    const mm = today.getMonth()+1, dd = today.getDate(), yy = today.getFullYear();
    const any = [...T.matchAll(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)(.*)$/img)];
    for (const hit of any.slice(0,10)) {
      const s12 = parse12h(hit[1]); const e12 = parse12h(hit[2]);
      if (!s12 || !e12) continue;
      const title = (hit[3]||"").replace(/^\s*[-–]\s*/,"").trim() || "Scheduled item";
      events.push({
        id: cryptoId(),
        title, location:null, professor:null,
        start: buildLocal(yy,mm,dd,s12).toISOString(),
        end:   buildLocal(yy,mm,dd,e12).toISOString(),
        repeatWeekly: false, allDay:false, source:"image-ocr-fallback"
      });
    }
  }

  return events;
}

/* Use CDN worker so it loads in prod; preprocess canvas for better accuracy; log counts */
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
    await worker.setParameters({ tessedit_pageseg_mode: '6' }); // Assume a block of text
    const canvas = await fileToCanvas(file);
    const { data:{ text } } = await worker.recognize(canvas);
    const events = parseScheduleTextFromImage(text||"");
    console.log(`[OCR] Detected ${events.length} events`);
    return events;
  } finally {
    await worker.terminate();
  }
}
