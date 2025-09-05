/** Local date helpers & weekly recurrence expansion **/

export const pad = n => String(n).padStart(2,"0");
export const toYMD = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

// Build a local Date at midnight from "YYYY-MM-DD"
export function fromYMDLocal(isoYMD){
  const [y,m,day] = isoYMD.split("-").map(Number);
  return new Date(y, m-1, day, 0, 0, 0, 0);
}

export function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}

export function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
export function startOfGrid(d){
  const first = startOfMonth(d);
  const weekday = (first.getDay()+6)%7; // Monday=0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate()-weekday);
  return gridStart;
}

/** Expand weekly repeating events into instances within [rangeStart, rangeEnd) */
export function expandWeeklyInRange(events, rangeStart, rangeEnd){
  const out = [];
  for(const e of (events||[])){
    if(!e.repeatWeekly){
      out.push(e);
      continue;
    }
    if(!e.start || !e.end) continue;

    const tplStart = new Date(e.start);
    const tplEnd   = new Date(e.end);
    const tplDow   = tplStart.getDay();

    // Start generating from the first occurrence on/after rangeStart
    // Find the next date >= rangeStart that has same weekday as tplStart
    const first = new Date(rangeStart);
    const delta = (tplDow - first.getDay() + 7) % 7;
    const firstHit = addDays(first, delta);

    // Ensure we don't generate before the template's own start date
    const begin = firstHit < tplStart ? addDays(firstHit, 7) : firstHit;

    for(let d = begin; d < rangeEnd; d = addDays(d, 7)){
      // shift start/end by the weekday difference from template base
      const shiftDays = Math.round((d - new Date(toYMD(tplStart))) / 86400000);
      const instStart = new Date(tplStart); instStart.setDate(tplStart.getDate()+shiftDays);
      const instEnd   = new Date(tplEnd);   instEnd.setDate(tplEnd.getDate()+shiftDays);
      out.push({ ...e, start: instStart.toISOString(), end: instEnd.toISOString(), _expanded:true });
    }
  }
  return out;
}
