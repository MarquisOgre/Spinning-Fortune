import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { Member } from "@/lib/lottery";

const PALETTE = [
  "#b8894a", "#d4a76a", "#7a5c3a", "#a67856", "#c9a961", "#8f6f4f",
  "#e0b877", "#9b7d5c", "#6b8e6b", "#a8b596", "#c48b5a", "#7d9b7d",
  "#d9b482", "#8b6a48", "#b09174", "#c9a375", "#8a6f52", "#a58968",
  "#bfa27a", "#96795a",
];

export type WheelHandle = {
  spinTo: (index: number) => Promise<void>;
  settleTo: (index: number) => void;
  canvas: HTMLCanvasElement | null;
};

type Props = { members: Member[]; size?: number };

export const SpinningWheel = forwardRef<WheelHandle, Props>(function SpinningWheel(
  { members, size = 520 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const rotRef = useRef(0);

  const draw = (rot: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 12;
    const n = Math.max(members.length, 1);
    const step = (Math.PI * 2) / n;

    const grd = ctx.createRadialGradient(cx, cy, r - 8, cx, cy, r + 12);
    grd.addColorStop(0, "#f5c34a");
    grd.addColorStop(1, "#8a5a12");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    members.forEach((m, i) => {
      const start = i * step;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, start, start + step);
      ctx.closePath();
      const c1 = PALETTE[i % PALETTE.length];
      const g = ctx.createLinearGradient(0, 0, Math.cos(start + step / 2) * r, Math.sin(start + step / 2) * r);
      g.addColorStop(0, c1);
      g.addColorStop(1, shade(c1, -25));
      ctx.fillStyle = m.is_winner ? "#3a2f4a" : g;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(start + step / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = m.is_winner ? "#6b6478" : "#fff";
      ctx.font = "600 15px 'Inter', sans-serif";
      const base = `#${m.position} ${m.name}`;
      const label = m.is_winner ? `~${base}~` : base;
      ctx.fillText(truncate(label, 20), r - 18, 5);
      ctx.restore();
    });

    ctx.restore();

    const hub = ctx.createRadialGradient(cx, cy, 4, cx, cy, 36);
    hub.addColorStop(0, "#fff5c8");
    hub.addColorStop(1, "#a67512");
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3b2a08";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => {
    draw(rotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, size, rotation]);

  useImperativeHandle(ref, () => ({
    canvas: canvasRef.current,
    settleTo: (index: number) => {
      const n = members.length;
      if (n === 0) return;
      const step = (Math.PI * 2) / n;
      const target = -Math.PI / 2 - (index * step + step / 2);
      rotRef.current = target;
      setRotation(target);
    },
    spinTo: (index: number) =>
      new Promise<void>((resolve) => {
        const n = members.length;
        if (n === 0) return resolve();
        const step = (Math.PI * 2) / n;
        const targetSlice = -Math.PI / 2 - (index * step + step / 2);
        const fullTurns = 6 + Math.floor(Math.random() * 3);
        const start = rotRef.current;
        const tau = Math.PI * 2;
        const normalize = (angle: number) => ((angle % tau) + tau) % tau;
        const deltaToTarget = normalize(normalize(targetSlice) - normalize(start));
        const delta = fullTurns * tau + deltaToTarget;
        const duration = 6500;
        const t0 = performance.now();
        const tick = (t: number) => {
          const elapsed = t - t0;
          const p = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - p, 4);
          const cur = start + delta * eased;
          rotRef.current = cur;
          setRotation(cur);
          if (p < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
  }));

  return (
    <>
      <style>{`
        main:has(.spinning-wheel-root) {
          justify-content: flex-end !important;
          overflow: visible !important;
          padding-bottom: 10px;
        }
        main:has(.spinning-wheel-root) > .mt-4 {
          margin-top: 8px !important;
        }
        main:has(.spinning-wheel-root) > .mt-4 h1 {
          font-size: clamp(1.65rem, 2.8vw, 2.35rem) !important;
          line-height: 1.05 !important;
        }
        main:has(.spinning-wheel-root) > .mt-2 {
          margin-top: 5px !important;
        }
        main:has(.spinning-wheel-root) > .mt-3 {
          margin-top: 6px !important;
        }
        @media (max-height: 700px) {
          main:has(.spinning-wheel-root) > .mt-4 h1 {
            font-size: clamp(1.45rem, 2.5vw, 2rem) !important;
          }
        }
      `}</style>
      <div className="spinning-wheel-root relative w-full max-w-[min(440px,calc(100vh-350px))] aspect-square mx-auto shrink-0">
        <canvas
          ref={canvasRef}
          className="block w-full h-full drop-shadow-[0_0_40px_color-mix(in_oklab,var(--gold)_35%,transparent)]"
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 z-10 pointer-events-none"
          style={{
            width: 0,
            height: 0,
            borderLeft: "18px solid transparent",
            borderRight: "18px solid transparent",
            borderTop: "34px solid #f5c34a",
            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
          }}
        />
      </div>
    </>
  );
});

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function shade(hex: string, pct: number) {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  let r = (num >> 16) + Math.round((pct / 100) * 255);
  let g = ((num >> 8) & 0xff) + Math.round((pct / 100) * 255);
  let b = (num & 0xff) + Math.round((pct / 100) * 255);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}