import React from "react";
import { useOcrDebug } from "../lib/ocrDebug";

export default function OcrDebugModal({ onImport }) {
  const { data, setData } = useOcrDebug();
  if (!data?.open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">OCR Debug — {data.proposed?.length||0} events found</div>
          <button className="text-sm underline" onClick={()=>setData({open:false,text:"",proposed:[]})}>Close</button>
        </div>
        <div className="grid grid-cols-2 gap-0">
          <div className="p-3 border-r max-h-[70vh] overflow-auto text-xs whitespace-pre-wrap">
            {data.text?.slice(0,2000) || "(no OCR text)"}
          </div>
          <div className="p-3 max-h-[70vh] overflow-auto">
            {data.proposed?.length===0 && <div className="text-sm text-slate-500">No events detected by fallback.</div>}
            {data.proposed?.map(ev=>(
              <div key={ev.id} className="mb-2 rounded border p-2">
                <div className="font-medium text-sm">{ev.title||"Untitled"}</div>
                <div className="text-xs">{new Date(ev.start).toLocaleString()} — {new Date(ev.end).toLocaleString()}</div>
                {ev.location && <div className="text-xs">📍 {ev.location}</div>}
                {ev.professor && <div className="text-xs">👤 {ev.professor}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button
            className="px-3 py-2 rounded border"
            onClick={()=>setData({open:false,text:"",proposed:[]})}
          >Cancel</button>
          <button
            className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
            disabled={!data.proposed?.length}
            onClick={()=>{
              onImport?.(data.proposed||[]);
              setData({open:false,text:"",proposed:[]});
            }}
          >Import {data.proposed?.length||0} events</button>
        </div>
      </div>
    </div>
  );
}
