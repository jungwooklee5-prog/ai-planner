import React from "react";

function sameDay(a,b){ const x=new Date(a), y=new Date(b); return x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate(); }
function fmt(dt){ try{ return new Date(dt).toLocaleString(); }catch{ return String(dt); } }

export default function DayDetails({ open, isoDate, tasks=[], events=[], onClose }){
  if(!open) return null;
  const day = new Date(isoDate+"T00:00");
  const dueTasks = tasks.filter(t => t.due && sameDay(t.due, isoDate));
  const dayEvents = events.filter(e => e.start && sameDay(e.start, isoDate));
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">Items for {day.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</div>
          <button onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <section>
            <div className="text-sm font-medium mb-2">Tasks due</div>
            <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
              {dueTasks.length===0 && <div className="text-sm text-slate-500">No tasks due this day.</div>}
              {dueTasks.map(t=>(
                <div key={t.id} className="rounded-xl border p-3 bg-slate-50">
                  <div className="font-medium break-words">{t.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">Due: {fmt(t.due)}</div>
                  {t.category && <div className="text-[11px] mt-1 px-2 py-0.5 inline-block rounded-full border bg-white">{t.category}</div>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="text-sm font-medium mb-2">Events</div>
            <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
              {dayEvents.length===0 && <div className="text-sm text-slate-500">No events this day.</div>}
              {dayEvents.map(e=>(
                <div key={e.id} className="rounded-xl border p-3 bg-slate-50">
                  <div className="font-medium break-words">{e.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{fmt(e.start)} – {fmt(e.end)}</div>
                  {e.location && <div className="text-xs text-slate-500 mt-0.5">{e.location}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
