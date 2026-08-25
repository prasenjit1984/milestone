"use client";

import { useCallback, useRef } from "react";
import { Clock, Minus, Plus } from "lucide-react";

/**
 * A draggable analog-clock-style dial for picking a whole number of minutes
 * (1..max, default max 60 — once around the face). Drag the handle around
 * the rim, or tap anywhere on the track to jump there; +/- buttons give a
 * precise 1-minute-at-a-time alternative for fiddly touch targets.
 */
export function ClockDial({
  value,
  onChange,
  min = 1,
  max = 60,
  size = 168,
}: {
  value: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
  size?: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const minutesFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return value;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const raw = Math.round((angle / 360) * max);
      return Math.min(max, Math.max(min, raw === 0 ? max : raw));
    },
    [max, min, value]
  );

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onChange(minutesFromPoint(e.clientX, e.clientY));
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    onChange(minutesFromPoint(e.clientX, e.clientY));
  }
  function handlePointerUp() {
    draggingRef.current = false;
  }

  const r = 74;
  const cx = 90;
  const cy = 90;
  const angleDeg = (value / max) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const handleX = cx + r * Math.sin(angleRad);
  const handleY = cy - r * Math.cos(angleRad);
  // SVG large-arc-flag progress ring from 12 o'clock to the handle.
  const largeArc = angleDeg > 180 ? 1 : 0;
  const arcEndX = cx + r * Math.sin(angleRad);
  const arcEndY = cy - r * Math.cos(angleRad);

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label="Subtract one minute"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-secondary"
      >
        <Minus className="h-4 w-4" />
      </button>

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox="0 0 180 180"
        className="touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* tick marks every 5 minutes */}
        {Array.from({ length: 12 }, (_, i) => {
          const tickAngle = (i * 30 * Math.PI) / 180;
          const inner = i % 3 === 0 ? r - 10 : r - 6;
          const x1 = cx + inner * Math.sin(tickAngle);
          const y1 = cy - inner * Math.cos(tickAngle);
          const x2 = cx + (r + 2) * Math.sin(tickAngle);
          const y2 = cy - (r + 2) * Math.cos(tickAngle);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-border" strokeWidth={2} strokeLinecap="round" />;
        })}

        <circle cx={cx} cy={cy} r={r} className="fill-none stroke-secondary" strokeWidth={10} />
        {value > 0 && (
          <path
            d={`M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`}
            className="fill-none stroke-math"
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}

        <circle cx={handleX} cy={handleY} r={11} className="fill-math stroke-background" strokeWidth={3} />

        <foreignObject x={cx - 45} y={cy - 24} width={90} height={48}>
          <div className="flex h-full flex-col items-center justify-center pointer-events-none">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono-num text-xl font-semibold leading-tight">{value}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">min</span>
          </div>
        </foreignObject>
      </svg>

      <button
        type="button"
        aria-label="Add one minute"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-secondary"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
