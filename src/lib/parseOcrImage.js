import { createWorker } from "tesseract.js";

/** Turn "09:00AM" into {h,m}  -> local Date on given y/m/d */
function parse12h(t){ const m=t.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i); if(!m)return null; let h=(+m[1])%12; if(/PM/i.test(m[3])) h+=12; return {h, m:+m[2]}; }
function buildLocal(y,m,d,{h,m:min}){ return new Date(y,m-1,d,h,min,0,0); }
const pad = n=>String(n).padStart(2,"0"); const ymd = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

/** Parse OCR text from your weekly screenshot */
export function parseScheduleTextFromImage(text){
  // Normalize spacing
  const body = text.replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/[ \t]{2,}/g," ").trim();

  // Split into day sections: "Mon, Aug 25" etc.
  const dayRe = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*[A-Za-z]{3}\s+(\d{1,2})/g;
  // We also need the month/year; infer from the first month name found in header (e.g., Aug).
  const monthMap = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const monthName = (body.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)||[])[1]||"Aug";
  const month = monthMap[monthName.slice(0,3)];
  const yearGuess = new Date().getFullYear(); // ok for fall; user can edit later

  // Split text by day headers while keeping them
  const chunks=[]; let m; let lastIndex=0;
  while((m=dayRe.exec(body))){ const idx=m.index; if(chunks.length){ chunks[chunks.length-1].text = body.slice(lastIndex, idx); } chunks.push({header:m[0], day:+m[1], text:""}); lastIndex = dayRe.lastIndex; }
  if(chunks.length){ chunks[chunks.length-1].text = body.slice(lastIndex); }

  const events=[];
  for(const ch of chunks){
    const y=yearGuess, mo=month, d=ch.day;

    // Each block in that day: we look for sequences that end with a time line like "09:00AM - 09:50AM"
    const lines = ch.text.split(/\n+/).map(s=>s.trim()).filter(Boolean);

    // Walk lines and group around time lines
    for(let i=0;i<lines.length;i++){
      const timeLine = lines[i].match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if(!timeLine) continue;

      // Look upward for title, professor, location lines (the screenshot order is fairly consistent)
      const up2 = lines[i-2] || "";       // often campus/building
      const up1 = lines[i-1] || "";       // often professor
      const up3 = lines[i-3] || "";       // often course title
      const up4 = lines[i-4] || "";       // sometimes title spills up

      // Title: prefer the bold line (up3) if it looks like a course name, else up4/up2
      let title = up3 || up4 || "";
      if(!title || /Campus|Room|Bldg|Building|AS\./i.test(title)) title = up4 || up2 || "Untitled";

      // Professor: single surname line or "Tifft Oshinnaiye" type; else null
      let professor = null;
      const profRe = /^(?:Professor|Prof\.?|Instructor|Dr\.?)?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})$/;
      if(profRe.test(up1)) professor = up1.replace(/^(?:Professor|Prof\.?|Instructor|Dr\.?)\s*/i,"").trim();

      // Location: lines with "Campus" or room codes
      let location = null;
      const locCand = [up2, up1, up3].find(s => /\bCampus\b|\bRoom\b|\bBldg|Building|AS\.\d+/i.test(s));
      if(locCand) location = locCand;

      // Times
      const s12 = parse12h(timeLine[1]), e12 = parse12h(timeLine[2]);
      if(!s12 || !e12) continue;
      const start = buildLocal(y,mo,d,s12), end = buildLocal(y,mo,d,e12);

      events.push({
        id: Math.random().toString(36).slice(2,10),
        title: title.trim(),
        location: location || null,
        start: start.toISOString(),
        end: end.toISOString(),
        professor: professor,
        repeatWeekly: true,      // class blocks repeat weekly
        allDay: false,
        source: "image-ocr"
      });
    }
  }
  return events;
}

/** End-to-end: OCR an image File/Blob, then parse */
export async function parseOcrImageFile(file){
  const worker = await createWorker("eng", 1, { logger: ()=>{} });
  try{
    const { data:{ text } } = await worker.recognize(file);
    return parseScheduleTextFromImage(text || "");
  } finally {
    await worker.terminate();
  }
}
