import { videoExtFromUrl } from "./video-format";

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
  monthNumberLabel?: string | null;
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
  if (d.monthNumberLabel) {
    ctx.fillStyle = CREAM.soft;
    ctx.font = `500 ${22 * s}px sans-serif`;
    ctx.fillText(d.monthNumberLabel, w / 2, 208 * s);
  }
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
  if (d.monthNumberLabel) {
    ctx.fillStyle = CREAM.gold;
    ctx.font = `600 ${26 * s}px sans-serif`;
    ctx.fillText(d.monthNumberLabel, w / 2, 420 * s);
  }
  ctx.fillStyle = CREAM.soft;
  ctx.font = `500 ${24 * s}px sans-serif`;
  ctx.fillText("The lucky draw is about to begin…", w / 2, 470 * s);
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

/** Same card, but as a data URL so it can be persisted with the winner record. */
export function renderWinnerImageDataUrl(d: CardData): string | null {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  drawWinnerCard(ctx, 1200, 630, d);
  return c.toDataURL("image/png");
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
}): Promise<"shared" | "fallback" | "failed"> {
  let imageFile: File | null = null;
  let videoFile: File | null = null;
  try {
    if (opts.imageUrl) imageFile = await urlToFile(opts.imageUrl, `winner-${opts.monthKey}.png`, "image/png");
    if (opts.videoUrl)
      videoFile = await urlToFile(
        opts.videoUrl,
        `spin-${opts.monthKey}.${videoExtFromUrl(opts.videoUrl)}`,
        "video/mp4",
      );
  } catch {
    /* ignore */
  }

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const tryShare = async (data: ShareData) => {
    if (!nav.canShare?.(data)) return false;
    try {
      await navigator.share(data);
      return true;
    } catch {
      return false;
    }
  };

  const both = [imageFile, videoFile].filter(Boolean) as File[];
  // 1) both attachments in one share sheet
  if (both.length > 1 && (await tryShare({ files: both, text: opts.text }))) return "shared";
  // 2) some platforms (incl. WhatsApp) accept only one file per share → send sequentially
  if (both.length) {
    let sentAny = false;
    if (imageFile && (await tryShare({ files: [imageFile], text: opts.text }))) sentAny = true;
    if (videoFile && (await tryShare({ files: [videoFile], text: sentAny ? undefined : opts.text })))
      sentAny = true;
    if (sentAny) return "shared";
  }

  try {
    await navigator.clipboard?.writeText(opts.text);
  } catch {
    /* ignore */
  }
  let delivered = 0;
  try {
    if (opts.imageUrl) {
      triggerDownload(opts.imageUrl, `winner-${opts.monthKey}.png`);
      delivered++;
    }
    if (opts.videoUrl) {
      triggerDownload(opts.videoUrl, `spin-${opts.monthKey}.${videoExtFromUrl(opts.videoUrl)}`);
      delivered++;
    }
  } catch {
    /* download blocked */
  }
  const win = window.open(opts.waHref, "_blank", "noopener,noreferrer");
  if (!win || (delivered === 0 && (opts.imageUrl || opts.videoUrl))) return "failed";
  return "fallback";
}
