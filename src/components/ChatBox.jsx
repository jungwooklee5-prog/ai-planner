import React, { useState, useRef, useEffect } from "react";
import { askOpenAI } from "../lib/openai";

export default function ChatBox(){
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([{ role:"assistant", content:"Hi! Ask me about your tasks, schedule, or anything." }]);
  const [busy, setBusy] = useState(false);
  const viewRef = useRef(null);
  useEffect(()=>{ viewRef.current?.scrollTo({ top: viewRef.current.scrollHeight, behavior:"smooth" }); }, [msgs, open]);

  async function send(){
    const q = input.trim(); if(!q) return;
    setMsgs(m=>[...m,{role:"user",content:q}]); setInput(""); setBusy(true);
    try{
      const key = import.meta.env.VITE_OPENAI_API_KEY;
      if(!key){ setMsgs(m=>[...m,{role:"assistant",content:"Set VITE_OPENAI_API_KEY in .env.local (or proxy via /api)."}]); }
      else { const a = await askOpenAI(q); setMsgs(m=>[...m,{role:"assistant",content:a||"(no reply)"}]); }
    }catch(err){ setMsgs(m=>[...m,{role:"assistant",content:`Error: ${err.message}`}]); }
    finally{ setBusy(false); }
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 md:left-auto md:right-6 md:w-[420px] z-50">
      <div className="rounded-2xl border shadow-lg bg-white overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
          <div className="font-medium">Chat</div>
          <button className="text-sm underline" onClick={()=>setOpen(o=>!o)}>{open?"Hide":"Show"}</button>
        </div>
        {open && (
          <>
            <div ref={viewRef} className="max-h-[40vh] overflow-auto p-3 space-y-2">
              {msgs.map((m,i)=>(
                <div key={i} className={`text-sm ${m.role==="user"?"text-right":""}`}>
                  <span className={`inline-block rounded-2xl px-3 py-2 ${m.role==="user"?"bg-indigo-600 text-white":"bg-slate-100"}`}>{m.content}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 p-3 border-t bg-white">
              <input className="flex-1 px-3 py-2 border rounded-lg" placeholder="Ask anything…" value={input}
                     onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") send(); }}/>
              <button disabled={busy} onClick={send} className="px-3 py-2 rounded-lg bg-black text-white">{busy?"…":"Send"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
