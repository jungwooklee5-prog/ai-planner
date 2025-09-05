import { createWorker } from "tesseract.js";

/** Helpers */
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function parse12h(t){ const m=t&&t.match(/(\d{1,2}):(\d{2})\s*([AP]M)\b/i); if(!m)return null; let h=(+m[1])%12; if(/PM/i.test(m[3]))h+=12; return {h, m:+m[2]}; }
function buildLocal(y,m,d,{h,m:min}){ return new Date(y,m-1,d,h,min,0,0); }

function cryptoId(){ try{ return crypto.randomUUID(); }catch{ return Math.random().toString(36).slice(2,10);} }

/** More tolerant day & block parsing tailored to your screenshot layout */
export function parseScheduleTextFromImage(text){
  const T = (text||"")
    .replace(/\r/g,"")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/[ \t]{2,}/g," ")
    .replace(/[–—]/g,"-")        // normalize dashes
    .trim();

  // Guess month & year from header (e.g. "Mon, Aug 25"). Default to current.
  const monthMap = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const monthHit = T.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  const month = monthMap[(monthHit?.[1]||"Aug").slice(0,3)];
  const year = new Date().getFullYear();

  // Split by day columns: OCR can drop commas or mis-space, so be permissive.
  const dayHeader = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(\d{1,2})/ig;

  const parts = [];
  let m, last = 0, lastLabel = null;
  while ((m = dayHeader.exec(T))) {
    if (lastLabel) {
      parts[parts.length-1].body = T.slice(last, m.index);
    }
    last = dayHeader.lastIndex;
    lastLabel = m[0];
    const day = +m[2];
    parts.push({ day, body: "" });
  }
  if (parts.length) parts[parts.length-1].body = T.slice(last);

  // Fallback: if no day headers, treat the whole image as one day (user can edit)
  if (!parts.length) parts.push({ day: new Date().getDate(), body: T });

  const events = [];

  for (const p of parts) {
    const lines = p.body.split(/\n+/).map(s=>s.trim()).filter(Boolean);

    // Scan for time lines like "10:30AM - 11:45AM" (OCR may space oddly)
    for (let i=0;i<lines.length;i++){
      const L = lines[i];
      const tm = L.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (!tm) continue;

      // Look up 3–4 lines for title / prof / location (as in your screenshot)
      const up = (k)=> lines[i-k]?.trim()||"";
      let title = up(3) || up(4) || up(2) || "Untitled";
      // Avoid taking “Campus/Room” as title
      if (/Campus|Room|Bldg|Building|AS\.\d+/i.test(title)) title = up(4) || up(3) || "Untitled";

      // Professor line is usually one above time
      let professor = null;
      const profLine = up(1);
      const profRe = /^(?:Professor|Prof\.?|Instructor|Dr\.?)?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})$/;
      if (profRe.test(profLine)) professor = profLine.replace(/^(?:Professor|Prof\.?|Instructor|Dr\.?)\s*/i,"").trim();

      // Location often includes “Campus”, building, room, or AS.xxx code
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
        repeatWeekly: true,   // class blocks repeat weekly
        allDay: false,
        source: "image-ocr"
      });
    }
  }
  return events;
}

/** OCR with CDN worker/core paths so it works on Vercel */
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
    const { data:{ text } } = await worker.recognize(file);
    return parseScheduleTextFromImage(text||"");
  } finally {
    await worker.terminate();
  }
}
