import React, { useMemo, useState } from "react";

function soonestFirst(a,b){ return a.time - b.time; }
function toTime(x){ const d = new Date(x); return isNaN(+d) ? null : +d; }

export default function NotificationDock({ tasks=[], events=[], assignments=[] }){
  const [open, setOpen] = useState(true);
  const now = Date.now();
  const upcomingHours = 24; // window for "Upcoming"
  const soonCutoff = now + upcomingHours*60*60*1000;

  const lists = useMemo(()=>{
    const overdue = [];
    const upcoming = [];

    // tasks
    for(const t of tasks){
      const tt = toTime(t.due);
      if(tt==null || t.completed) continue;
      if(tt < now) overdue.push({ kind:"task", title:t.title, when: new Date(tt).toLocaleString(), time: tt });
      else if(tt <= soonCutoff) upcoming.push({ kind:"task", title:t.title, when: new Date(tt).toLocaleString(), time: tt });
    }
    // assignments
    for(const a of assignments){
      const tt = toTime(a.dueISO);
      if(tt==null) continue;
      if(tt < now) overdue.push({ kind:"assign", title:a.title, when: new Date(tt).toLocaleString(), time: tt });
      else if(tt <= soonCutoff) upcoming.push({ kind:"assign", title:a.title, when: new Date(tt).toLocaleString(), time: tt });
    }
    // events
    for(const e of events){
      const tt = toTime(e.start);
      if(tt==null) continue;
      if(tt < now) overdue.push({ kind:"event", title:e.title, when: new Date(tt).toLocaleString(), time: tt });
      else if(tt <= soonCutoff) upcoming.push({ kind:"event", title:e.title, when: new Date(tt).toLocaleString(), time: tt });
    }

    overdue.sort(soonestFirst);
    upcoming.sort(soonestFirst);
    return { overdue, upcoming };
  }, [tasks, events, assignments, now, soonCutoff]);

  const count = lists.upcoming.length + lists.overdue.length;

  const Item = ({x}) => (
    <div className="rounded-lg border px-2 py-1 bg-white">
      <div className="text-xs font-medium break-words">{x.title}</div>
      <div className="text-[11px] text-slate-600">{x.when} • {x.kind}</div>
    </div>
  );

  // Collapsed button (bottom-left)
  if (!open) {
    return (
      <div className="fixed bottom-3 left-3 z-40">
        <button
          onClick={()=>setOpen(true)}
          className="rounded-full border bg-white shadow px-3 py-2 text-sm"
          aria-label="Open notifications"
          title="Open notifications"
        >
          🔔 Notifications{count?` (${count})`:""}
        </button>
      </div>
    );
  }

  // Expanded panel (bottom-left)
  return (
    <div className="fixed bottom-3 left-3 z-40 w-[320px] max-w-[90vw]">
      <div className="rounded-2xl border bg-white shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between">
          <div className="font-medium text-sm">Notifications {count?`(${count})`:""}</div>
          <button
            onClick={()=>setOpen(false)}
            className="text-xs underline"
            aria-label="Close notifications"
            title="Close notifications"
          >
            Close
          </button>
        </div>
        <div className="p-3 grid gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Upcoming (≤ 24h)</div>
            <div className="space-y-1 max-h-40 overflow-auto pr-1">
              {lists.upcoming.length ? lists.upcoming.map((x,i)=><Item key={i} x={x}/>) : <div className="text-xs text-slate-500">None</div>}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Overdue</div>
            <div className="space-y-1 max-h-24 overflow-auto pr-1">
              {lists.overdue.length ? lists.overdue.map((x,i)=><Item key={i} x={x}/>) : <div className="text-xs text-slate-500">None</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
