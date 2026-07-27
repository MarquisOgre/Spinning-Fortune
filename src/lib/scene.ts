import { CREAM } from "./winner-card";
import type { Member, Winner } from "./lottery";

/**
 * Draws the whole "stage" (members list, wheel with its pointer, hall of winners)
 * onto the recording canvas so the exported video mirrors what is on screen.
 */
export function drawStage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: {
    title: string;
    monthLabel: string;
    members: Member[];
    winners: Winner[];
    wheel: HTMLCanvasElement | null;
  },
) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, CREAM.bgFrom);
  g.addColorStop(1, CREAM.bgTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.fillStyle = CREAM.title;
  ctx.font = "600 30px serif";
  ctx.fillText(`${d.title} — ${d.monthLabel}`, w / 2, 46);

  const colW = 250;
  panel(ctx, 24, 70, colW, h - 94);
  panel(ctx, w - colW - 24, 70, colW, h - 94);

  ctx.textAlign = "left";
  ctx.fillStyle = CREAM.title;
  ctx.font = "600 20px sans-serif";
  ctx.fillText("Members", 44, 100);
  ctx.fillText("Hall of Winners", w - colW - 4, 100);

  ctx.font = "500 15px sans-serif";
  d.members.slice(0, 24).forEach((m, i) => {
    const y = 130 + i * 20;
    if (y > h - 40) return;
    const used = m.is_winner || m.status === "used";
    ctx.fillStyle = used ? CREAM.sub : CREAM.strong;
    const label = `${m.position}. ${m.name}`;
    ctx.fillText(label.length > 24 ? `${label.slice(0, 23)}…` : label, 44, y);
    if (used) {
      const tw = ctx.measureText(label.length > 24 ? `${label.slice(0, 23)}…` : label).width;
      ctx.strokeStyle = CREAM.sub;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(44, y - 5);
      ctx.lineTo(44 + tw, y - 5);
      ctx.stroke();
    }
  });

  d.winners.slice(0, 16).forEach((win, i) => {
    const y = 132 + i * 34;
    if (y > h - 40) return;
    ctx.fillStyle = CREAM.gold;
    ctx.font = "600 15px sans-serif";
    ctx.fillText(trim(win.member_name, 22), w - colW - 4, y);
    ctx.fillStyle = CREAM.sub;
    ctx.font = "400 12px sans-serif";
    ctx.fillText(win.month_year, w - colW - 4, y + 15);
  });

  const size = Math.min(h - 150, w - 2 * colW - 120);
  const cx = w / 2;
  const cy = 70 + (h - 94) / 2 + 6;
  if (d.wheel) ctx.drawImage(d.wheel, cx - size / 2, cy - size / 2, size, size);

  // pointer
  const top = cy - size / 2 - 6;
  ctx.fillStyle = "#f5c34a";
  ctx.strokeStyle = "#8a5a12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 16, top - 28);
  ctx.lineTo(cx + 16, top - 28);
  ctx.lineTo(cx, top + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.strokeStyle = "rgba(184,137,74,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();
}

function trim(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}