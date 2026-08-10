import { drawWelcomeCard, drawWinnerCard } from "./winner-card";
import { drawStage } from "./scene";
import type { Member, Winner } from "./lottery";

const PALETTE = [
  "#b8894a", "#d4a76a", "#7a5c3a", "#a67856", "#c9a961", "#8f6f4f",
  "#e0b877", "#9b7d5c", "#6b8e6b", "#a8b596", "#c48b5a", "#7d9b7d",
  "#d9b482", "#8b6a48", "#b09174", "#c9a375", "#8a6f52", "#a58968",
  "#bfa27a", "#96795a",
];

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Standalone copy of the on-screen wheel so videos can be rendered offscreen. */
function drawWheel(ctx: CanvasRenderingContext2D, size: number, members: Member[], rot: number) {
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
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.rotate(start + step / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "600 15px 'Inter', sans-serif";
    ctx.fillText(truncate(`#${m.position} ${m.name}`, 20), r - 18, 5);
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
}

export type SpinVideoInput = {
  title: string;
  monthLabel: string;
  monthNumberLabel?: string | null;
  prize?: string | null;
  members: Member[];
  winners: Winner[];
  winnerName: string;
};

/**
 * Renders a full spin video offscreen: welcome screen → spinning wheel stage →
 * winner announcement. Used for past winners that have no recording.
 */
export function generateSpinVideo(input: SpinVideoInput): Promise<Blob | null> {
  return new Promise((resolve) => {
    const compose = document.createElement("canvas");
    compose.width = 1200;
    compose.height = 630;
    const ctx = compose.getContext("2d");
    if (!ctx || typeof compose.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      return resolve(null);
    }

    const wheelCanvas = document.createElement("canvas");
    const wheelSize = 520;
    wheelCanvas.width = wheelSize;
    wheelCanvas.height = wheelSize;
    const wctx = wheelCanvas.getContext("2d");
    if (!wctx) return resolve(null);

    const wheelMembers = input.members.length
      ? input.members
      : [{ id: "x", name: input.winnerName, position: 1, phone: null, status: "active", is_winner: false } as unknown as Member];
    const idx = Math.max(0, wheelMembers.findIndex((m) => m.name === input.winnerName));

    const card = {
      title: input.title,
      monthLabel: input.monthLabel,
      monthNumberLabel: input.monthNumberLabel ?? null,
      prize: input.prize ?? null,
      memberName: input.winnerName,
    };

    const WELCOME = 2200;
    const SPIN = 5500;
    const HOLD = 900;
    const WINNER = 3000;
    const total = WELCOME + SPIN + HOLD + WINNER;

    const tau = Math.PI * 2;
    const step = tau / wheelMembers.length;
    const target = -Math.PI / 2 - (idx * step + step / 2);
    const delta = 7 * tau + ((target % tau) + tau) % tau;

    const chunks: Blob[] = [];
    const stream = compose.captureStream(30);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    } catch {
      return resolve(null);
    }
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(blob.size > 0 ? blob : null);
    };
    rec.start();

    const t0 = performance.now();
    const frame = (t: number) => {
      const e = t - t0;
      if (e < WELCOME) {
        drawWelcomeCard(ctx, 1200, 630, { ...card, memberName: undefined });
      } else if (e < WELCOME + SPIN + HOLD) {
        const p = Math.min((e - WELCOME) / SPIN, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        drawWheel(wctx, wheelSize, wheelMembers, delta * eased);
        drawStage(ctx, 1200, 630, {
          title: input.title,
          monthLabel: input.monthLabel,
          members: input.members,
          winners: input.winners,
          wheel: wheelCanvas,
        });
      } else {
        drawWinnerCard(ctx, 1200, 630, card);
      }
      if (e < total) requestAnimationFrame(frame);
      else rec.stop();
    };
    requestAnimationFrame(frame);
  });
}
