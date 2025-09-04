import React, { useEffect, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const RGL = WidthProvider(Responsive);

const defaultLayouts = {
  lg: [
    { i: "left",  x: 0,  y: 0, w: 4, h: 24, minW: 3, minH: 12 },
    { i: "mid",   x: 4,  y: 0, w: 4, h: 24, minW: 3, minH: 12 },
    { i: "right", x: 8,  y: 0, w: 4, h: 24, minW: 3, minH: 12 },
  ],
  md: [
    { i: "left",  x: 0, y: 0, w: 6, h: 22 },
    { i: "mid",   x: 6, y: 0, w: 6, h: 22 },
    { i: "right", x: 0, y: 1, w: 12, h: 20 },
  ],
  sm: [
    { i: "left",  x: 0, y: 0, w: 1, h: 18 },
    { i: "mid",   x: 0, y: 1, w: 1, h: 18 },
    { i: "right", x: 0, y: 2, w: 1, h: 18 },
  ],
};

export default function BoardLayout({ profile="default", children, lockedExternal }) {
  const LKEY = `planner:layout:${profile}`;
  const [layouts, setLayouts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LKEY)) || defaultLayouts; } catch { return defaultLayouts; }
  });
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(LKEY)); if (saved) setLayouts(saved); } catch {}
  }, [profile]);

  const onLayoutChange = (_current, all) => {
    setLayouts(all);
    try { localStorage.setItem(LKEY, JSON.stringify(all)); } catch {}
  };

  const reset = () => {
    setLayouts(defaultLayouts);
    try { localStorage.setItem(LKEY, JSON.stringify(defaultLayouts)); } catch {}
  };

  const isLocked = lockedExternal ?? locked;
  const [left, mid, right] = React.Children.toArray(children);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-2">
        <button className="px-3 py-1.5 rounded-lg border bg-white" onClick={() => setLocked(v => !v)}>
          {isLocked ? "Unlock layout" : "Lock layout"}
        </button>
        <button className="px-3 py-1.5 rounded-lg border bg-white" onClick={reset}>Reset layout</button>
        <span className="text-xs text-slate-500">Drag panels; resize from bottom-right.</span>
      </div>

      <RGL
        className="layout"
        layouts={layouts}
        onLayoutChange={onLayoutChange}
        rowHeight={8}
        margin={[12,12]}
        isDraggable={!isLocked}
        isResizable={!isLocked}
        compactType="vertical"
        cols={{ lg:12, md:12, sm:1, xs:1, xxs:1 }}
        breakpoints={{ lg:1200, md:996, sm:640, xs:480, xxs:0 }}
      >
        <div key="left"  className="h-full">{left}</div>
        <div key="mid"   className="h-full">{mid}</div>
        <div key="right" className="h-full">{right}</div>
      </RGL>
    </div>
  );
}
