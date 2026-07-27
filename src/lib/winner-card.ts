export const CREAM = {
  bgFrom: "#faf6ef",
  bgTo: "#e8dcc4",
  title: "#7a5c3a",
  sub: "#8a7255",
  strong: "#2d2a26",
  gold: "#b8894a",
  soft: "#5b4b36",
};

export type CardData = {
  title: string;
  monthLabel: string;
  memberName?: string;
  prize?: string | null;
};

function bg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, CREAM.bgFrom);
  g.addColorStop(1, CREAM.bgTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = CREAM.gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);
}

export function drawWinnerCard(ctx: CanvasRenderingContext2D, w: number, h: number, d: CardData) {
  const s = h / 630;
  bg(ctx, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = CREAM.title;
  ctx.font = `600 ${32 * s}px serif`;
  ctx.fillText(d.title.toUpperCase(), w / 2, 120 * s);
  ctx.fillStyle = CREAM.sub;
  ctx.font = `italic ${28 * s}px serif`;
  ctx.fillText(d.monthLabel, w / 2, 170 * s);
  ctx.fillStyle = CREAM.strong;
  ctx.font = `600 ${44 * s}px sans-serif`;
  ctx.fillText("\uD83C\uDFC6 WINNER OF THE MONTH \uD83C\uDFC6", w / 2, 280 * s);
  ctx.fillStyle = CREAM.gold;
  ctx.font = `700 ${72 * s}px serif`;
  ctx.fillText(d.memberName ?? "", w / 2, 400 * s);
  if (d.prize) {
    ctx.fillStyle = CREAM.soft;
    ctx.font = `500 ${34 * s}px sans-serif`;
    ctx.fillText(`Prize: ${d.prize}`, w / 2, 470 * s);
  }
  ctx.fillStyle = CREAM.soft;
  ctx.font = `500 ${22 * s}px sans-serif`;
  ctx.fillText("Congratulations!", w / 2, 560 * s);
}

export function drawWelcomeCard(ctx: CanvasRenderingContext2D, w: number, h: number, d: CardData) {
  const s = h / 630;
  bg(ctx, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = CREAM.sub;
  ctx.font = `500 ${26 * s}px sans-serif`;
  ctx.fillText("WELCOME TO", w / 2, 220 * s);
  ctx.fillStyle = CREAM.gold;
  ctx.font = `700 ${58 * s}px serif`;
  ctx.fillText(d.title, w / 2, 310 * s);
  ctx.fillStyle = CREAM.title;
  ctx.font = `italic ${36 * s}px serif`;
  ctx.fillText(d.monthLabel, w / 2, 380 * s);
  ctx.fillStyle = CREAM.soft;
  ctx.font = `500 ${24 * s}px sans-serif`;
  ctx.fillText("The lucky draw is about to begin…", w / 2, 460 * s);
}

export function renderWinnerImage(d: CardData): Promise<string | null> {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const ctx = c.getContext("2d");
    if (!ctx) return resolve(null);
    drawWinnerCard(ctx, 1200, 630, d);
    c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), "image/png");
  });
}

async function urlToFile(url: string, name: string, type: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || type });
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * WhatsApp cannot receive media through a wa.me link. On devices that support
 * the Web Share API with files we hand the image + video straight to WhatsApp;
 * otherwise we download the media and open the chat with the text prefilled.
 */
export async function shareWinner(opts: {
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  waHref: string;
  monthKey: string;
}): Promise<"shared" | "fallback"> {
  const files: File[] = [];
  try {
    if (opts.imageUrl) files.push(await urlToFile(opts.imageUrl, `winner-${opts.monthKey}.png`, "image/png"));
    if (opts.videoUrl) files.push(await urlToFile(opts.videoUrl, `spin-${opts.monthKey}.webm`, "video/webm"));
  } catch {
    /* ignore */
  }

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (files.length && nav.canShare?.({ files }) ) {
    try {
      await navigator.share({ files, text: opts.text });
      return "shared";
    } catch {
      /* user cancelled or unsupported → fall through */
    }
  }

  try {
    await navigator.clipboard?.writeText(opts.text);
  } catch {
    /* ignore */
  }
  if (opts.imageUrl) triggerDownload(opts.imageUrl, `winner-${opts.monthKey}.png`);
  if (opts.videoUrl) triggerDownload(opts.videoUrl, `spin-${opts.monthKey}.webm`);
  window.open(opts.waHref, "_blank", "noopener,noreferrer");
  return "fallback";
}
