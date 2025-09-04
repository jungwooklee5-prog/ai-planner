import React, { useMemo, useState } from "react";

const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function startOfGrid(d){
  const first = startOfMonth(d);
  const weekday = (first.getDay()+6)%7; // Monday=0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate()-weekday);
  return gridStart;
}

export default function CalendarMonth({
  date,                   // ISO "YYYY-MM-DD" (used to highlight today/selected)
  tasks = [],
  events = [],
  onSelect,               // (isoYmd) => void
  onMonthChange,          // (newMonthDateObj) => void (optional)
}) {
  const init = useMemo(()=> new Date(date + "T00:00"), [date]);
  const [month, setMonth] = useState(startOfMonth(init));

  const goto = (d) => { setMonth(startOfMonth(d)); onMonthChange && onMonthChange(startOfMonth(d)); };

  const gridStart = startOfGrid(month);
  const cells = [];
  for(let i=0;i<42;i++){
    const d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
    const iso = ymd(d);
    const isOtherMonth = d.getMonth() !== month.getMonth();
    const isSelected = iso === date;
    const dayTasks = tasks.filter(t => (t.due||"").startsWith(iso));
    const dayEvents= events.filter(e => (e.start||"").startsWith(iso));
    cells.push({ d, iso, isOtherMonth, isSelected, dayTasks, dayEvents });
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-base font-semibold">
          {month.toLocaleString(undefined, { month:"long", year:"numeric" })}
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(addMonths(month,-1))}>‹ Prev</button>
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(new Date())}>Today</button>
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(addMonths(month, 1))}>Next ›</button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 text-xs text-slate-500 mb-1">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div key={d} className="px-2 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map(cell => (
          <button
            key={cell.iso}
            onClick={()=> onSelect && onSelect(cell.iso)}
            className={[
              "text-left rounded-lg border px-2 py-1 bg-white hover:bg-slate-50 transition",
              cell.isOtherMonth ? "opacity-50" : "",
              cell.isSelected ? "ring-2 ring-black" : "",
            ].join(" ")}
          >
            <div className="text-sm font-medium">{cell.d.getDate()}</div>
            <div className="mt-1 space-y-0.5 max-h-16 overflow-hidden">
              {cell.dayTasks.slice(0,2).map(t=>(
                <div key={t.id} className="text-[11px] truncate rounded bg-emerald-50 border border-emerald-200 px-1">✓ {t.title}</div>
              ))}
              {cell.dayEvents.slice(0,2).map(e=>(
                <div key={e.id} className="text-[11px] truncate rounded bg-indigo-50 border border-indigo-200 px-1">• {e.title}</div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
