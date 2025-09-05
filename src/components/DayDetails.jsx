import React from "react";
import { fromYMDLocal, addDays, expandWeeklyInRange, ymdLocalFromISO } from "../lib/dates";

export default function DayDetails({ open, isoDate, tasks, events, onClose }) {
  if (!open) return null;

  const dayStart = fromYMDLocal(isoDate);
  const dayEnd   = addDays(dayStart, 1);

  const expanded = expandWeeklyInRange(events, dayStart, dayEnd);

  const eventsToday = expanded.filter(e => e.start && ymdLocalFromISO(e.start) === isoDate);
  const tasksDue    = (tasks||[]).filter(t => t.due && !t.completed && ymdLocalFromISO(t.due) === isoDate);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <div className="text-lg font-semibold">
            Items for {new Date(isoDate+"T12:00").toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" })}
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
              <div key={e.id+(e._expanded?'-x':'')} className="mb-1 px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-sm">
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
