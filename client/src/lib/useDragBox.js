import { useEffect, useRef, useState } from 'react';

function pct(e, rect) {
  const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
  return { x, y };
}

const MIN_SIZE_PCT = 1.5;

/**
 * Drag-to-draw-a-box interaction for pinning a correction to an exact region.
 * Returns { box, onMouseDown } — `box` is the live rectangle while dragging
 * (for a dashed preview), and `onFinish(x, y, w, h)` fires once on release
 * with percentages relative to the element passed to onMouseDown.
 */
export default function useDragBox(enabled, onFinish) {
  const [start, setStart] = useState(null);
  const [cur, setCur] = useState(null);
  const rectRef = useRef(null);

  function onMouseDown(e) {
    if (!enabled) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    rectRef.current = rect;
    const p = pct(e, rect);
    setStart(p);
    setCur(p);
  }

  useEffect(() => {
    if (!start) return;
    function onMove(e) {
      setCur(pct(e, rectRef.current));
    }
    function onUp(e) {
      const end = pct(e, rectRef.current);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.max(MIN_SIZE_PCT, Math.abs(end.x - start.x));
      const h = Math.max(MIN_SIZE_PCT, Math.abs(end.y - start.y));
      setStart(null);
      setCur(null);
      onFinish(x.toFixed(2), y.toFixed(2), w.toFixed(2), h.toFixed(2));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const box = start && cur
    ? {
        left: Math.min(start.x, cur.x),
        top: Math.min(start.y, cur.y),
        width: Math.abs(cur.x - start.x),
        height: Math.abs(cur.y - start.y),
      }
    : null;

  return { box, onMouseDown };
}
