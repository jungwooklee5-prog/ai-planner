import React, { useMemo } from "react";

function toISO(d){ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
function sameDayISO(a,b){ return toISO(a)===toISO(b); }

export default function CalendarMonth({ date, onSelect, tasks=[], events=[] }){
  const month = new Date(date + "T00:00");
  const year  = month.getFullYear();
  const monthIdx = month.getMonth();

  const days = useMemo(()=>{
    // first of month
    const first = new Date(year, monthIdx, 1);
    const start = new Date(first);
    // start on Monday
    const weekday = (start.getDay()+6)%7; // 0=Mon
    start.setDate(start.getDate()-weekday);

    // build 6 weeks * 7 days = 42 cells
    const cells = [];
    for (let i=0;i<42;i++){
      const d = new Date(start);
      d.setDate(start.getDate()+i);
      cells.push(d);
    }
    return cells;
  }, [year,monthIdx]);

  // index due items by day
  const dueMap = useMemo(()=>{
    const m = new Map();
    const bump = (iso, type)=>{ const v=m.get(iso)||{t:0,e:0}; v[type]++; m.set(iso,v); };
    for (const t of tasks){ if(t.due){ bump(toISO(t.due), "t"); } }
    for (const e of events){ if(e.start){ bump(toISO(e.start), "e"); } }
    return m;
  }, [tasks, events]);

  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString(undefined, { month:"long", year:"numeric" });
  const todayISO = toISO(new Date());

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Calendar</h2>
        <div className="text-sm text-slate-600">{monthLabel}</div>
      </div>

      <div className="grid grid-cols-7 text-xs text-slate-500 mb-1">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d} className="px-1 py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d,i)=>{
          const iso = toISO(d);
          const inMonth = d.getMonth()===monthIdx;
          const marks = dueMap.get(iso);
          const isToday = iso===todayISO;
          return (
            <button
              key={i}
              onClick={()=> onSelect(iso)}
              className={[
                "relative text-left rounded-lg border px-2 py-2 min-h-[54px] hover:bg-slate-50 focus:outline-none",
                inMonth ? "bg-white" : "bg-slate-50/60 text-slate-400",
                isToday ? "ring-2 ring-indigo-500" : ""
              ].join(" ")}
            >
              <div className="text-xs font-medium">{d.getDate()}</div>
              {marks && (
                <div className="absolute bottom-1 left-2 flex gap-1">
                  {marks.t>0 && <span className="text-[10px] px-1 rounded bg-emerald-100 border border-emerald-200">✓ {marks.t}</span>}
                  {marks.e>0 && <span className="text-[10px] px-1 rounded bg-indigo-100 border border-indigo-200">📅 {marks.e}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
