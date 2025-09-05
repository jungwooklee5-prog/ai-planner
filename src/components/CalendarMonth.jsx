import React, { useMemo, useState } from "react";
import { toYMD, startOfGrid, startOfMonth, addDays, expandWeeklyInRange, ymdLocalFromISO } from "../lib/dates";

function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }

export default function CalendarMonth({ date, tasks=[], events=[], onSelect, onMonthChange }) {
  const init = useMemo(()=> new Date(date + "T00:00"), [date]);
  const [month, setMonth] = useState(startOfMonth(init));

  const goto = (d) => { const m = startOfMonth(d); setMonth(m); onMonthChange && onMonthChange(m); };

  const gridStart = startOfGrid(month);
  const gridEnd = addDays(gridStart, 42); // 6 weeks

  const expandedEvents = useMemo(()=> expandWeeklyInRange(events, gridStart, gridEnd), [events, gridStart, gridEnd]);

  const cells = [];
  for(let i=0;i<42;i++){
    const d = addDays(gridStart, i);
    const iso = toYMD(d); // local day
    const isOtherMonth = d.getMonth() !== month.getMonth();
    const isSelected = iso === date;

    const dayTasks  = tasks.filter(t => t.due && ymdLocalFromISO(t.due) === iso);
    const dayEvents = expandedEvents.filter(e => e.start && ymdLocalFromISO(e.start) === iso);

    cells.push({ d, iso, isOtherMonth, isSelected, dayTasks, dayEvents });
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-base font-semibold">{month.toLocaleString(undefined, { month:"long", year:"numeric" })}</div>
        <div className="flex gap-2">
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(addMonths(month,-1))}>‹ Prev</button>
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(new Date())}>Today</button>
          <button className="px-2 py-1 rounded border bg-white" onClick={()=>goto(addMonths(month, 1))}>Next ›</button>
        </div>
      </div>

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
                <div key={e.id+(e._expanded?'-x':'')} className="text-[11px] truncate rounded bg-indigo-50 border border-indigo-200 px-1">• {e.title}</div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
