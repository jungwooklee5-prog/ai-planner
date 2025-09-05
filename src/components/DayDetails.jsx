import React from "react";

// Helper to get "YYYY-MM-DD" from a Date in local time
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

export default function DayDetails({ open, isoDate, tasks, events, onClose }) {
  if (!open) return null;
  const selected = isoDate; // "YYYY-MM-DD"

  // Match by local day string to avoid timezone drift
  const eventsToday = (events||[]).filter(e => {
    if (!e.repeatWeekly) {
      return (e.start || "").slice(0,10) === selected;
    }
    // Weekly repeats: same weekday as original start
    const tpl = e.start ? new Date(e.start) : null;
    const sel = new Date(selected+"T12:00"); // Noon avoids DST edges
    return tpl && sel.getDay() === tpl.getDay();
  });

  const tasksDue = (tasks||[]).filter(t => {
    if (!t.due || t.completed) return false;
    return t.due.slice(0,10) === selected;
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <div className="text-lg font-semibold">
            Items for {new Date(selected).toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" })}
          </div>
          <button className="text-sm underline" onClick={onClose}>Close</button>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div>
            <div className="font-medium mb-2">Tasks due</div>
            {tasksDue.length===0 && <div className="text-sm text-slate-500">No tasks due this day.</div>}
            {tasksDue.map(t=>(
              <div key={t.id} className="mb-1 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-sm">
                {t.title}
              </div>
            ))}
          </div>
          <div>
            <div className="font-medium mb-2">Events</div>
            {eventsToday.length===0 && <div className="text-sm text-slate-500">No events this day.</div>}
            {eventsToday.map(e=>(
              <div key={e.id} className="mb-1 px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-sm">
                <div className="font-medium">{e.title}</div>
                <div className="text-xs">
                  {new Date(e.start).toLocaleString()} – {new Date(e.end).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
