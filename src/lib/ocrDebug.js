import { createContext, useContext, useState } from "react";
const Ctx = createContext(null);
export function OcrDebugProvider({children}){
  const [data,setData] = useState({ open:false, text:"", proposed:[] });
  return <Ctx.Provider value={{data,setData}}>{children}</Ctx.Provider>;
}
export function useOcrDebug(){ return useContext(Ctx); }
