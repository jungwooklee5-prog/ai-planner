import React, { useEffect, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/**
 * BoardLayout
 * - Renders any number of panels (items) as draggable + resizable cards
 * - Saves per-profile layouts in localStorage
 * - Each item should be { id: string, element: ReactNode }
 */
const RGL = WidthProvider(Responsive);

const defaultLayouts = {
  lg: [
    { i: "checklist", x: 0,  y: 0, w: 4, h: 28, minW: 3, minH: 12 },
    { i: "planner",   x: 4,  y: 0, w: 4, h: 28, minW: 3, minH: 12 },
    { i: "calendar",  x: 8,  y: 0, w: 4, h: 18, minW: 3, minH: 10 },
    { i: "events",    x: 8,  y: 18, w: 4, h: 18, minW: 3, minH: 12 },
    { i: "due",       x: 0,  y: 28, w: 4, h: 16, minW: 3, minH: 10 },
    { i: "syllabus",  x: 4,  y: 28, w: 4, h: 22, minW: 3, minH: 12 },
  ],
  md: [
    { i: "checklist", x: 0, y: 0,  w: 6, h: 24 },
    { i: "planner",   x: 6, y: 0,  w: 6, h: 24 },
    { i: "calendar",  x: 0, y: 24, w: 6, h: 14 },
    { i: "events",    x: 6, y: 24, w: 6, h: 18 },
    { i: "due",       x: 0, y: 38, w: 6, h: 12 },
    { i: "syllabus",  x: 6, y: 42, w: 6, h: 18 },
  ],
  sm: [
    { i: "checklist", x: 0, y: 0, w: 1, h: 20 },
    { i: "planner",   x: 0, y: 1, w: 1, h: 20 },
    { i: "calendar",  x: 0, y: 2, w: 1, h: 12 },
    { i: "events",    x: 0, y: 3, w: 1, h: 18 },
    { i: "due",       x: 0, y: 4, w: 1, h: 12 },
    { i: "syllabus",  x: 0, y: 5, w: 1, h: 18 },
  ],
};

export default function BoardLayout({ profile="default", items, lockedExternal }) {
  const LKEY = `planner:layout:${profile}`;
  const [layouts, setLayouts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LKEY)) || defaultLayouts; } catch { return defaultLayouts; }
  });
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LKEY));
      if (saved) setLayouts(saved);
    } catch {}
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

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-2">
        <button className="px-3 py-1.5 rounded-lg border bg-white" onClick={() => setLocked(v => !v)}>
          {isLocked ? "Unlock layout" : "Lock layout"}
        </button>
        <button className="px-3 py-1.5 rounded-lg border bg-white" onClick={reset}>Reset layout</button>
        <span className="text-xs text-slate-500">Drag panels by their body; resize from bottom-right handle.</span>
      </div>

      <RGL
        className="layout"
        layouts={layouts}
        onLayoutChange={onLayoutChange}
        rowHeight={8}                 /* 8px per grid unit; h=20 ~ 160px */
        margin={[12, 12]}
        isDraggable={!isLocked}
        isResizable={!isLocked}
        compactType="vertical"
        cols={{ lg: 12, md: 12, sm: 1, xs: 1, xxs: 1 }}
        breakpoints={{ lg: 1200, md: 996, sm: 640, xs: 480, xxs: 0 }}
      >
        {items.map(({ id, element }) => (
          <div key={id} className="h-full">
            {element}
          </div>
        ))}
      </RGL>
    </div>
  );
}
