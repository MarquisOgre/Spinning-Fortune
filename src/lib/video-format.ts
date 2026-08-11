/**
 * Recording format helpers. MP4 is preferred (plays everywhere, incl. WhatsApp);
 * we only fall back to WebM when the browser cannot encode MP4.
 */
const MP4_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4;codecs=avc1',
  "video/mp4",
];
const WEBM_CANDIDATES = ['video/webm;codecs="vp9"', "video/webm;codecs=vp8", "video/webm"];

export function pickVideoMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/mp4";
  const supported = (t: string) =>
    typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(t) : false;
  return [...MP4_CANDIDATES, ...WEBM_CANDIDATES].find(supported) ?? "video/webm";
}

/** Base container type (no codec params), e.g. "video/mp4". */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim();
}

export function videoExt(mime: string): string {
  return baseMime(mime) === "video/mp4" ? "mp4" : "webm";
}

/** Extension for an existing video URL (data URL, blob URL or file URL). */
export function videoExtFromUrl(url: string | null | undefined): string {
  if (!url) return "mp4";
  if (url.startsWith("data:")) return videoExt(url.slice(5, url.indexOf(";")) || "video/mp4");
  const m = /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.exec(url);
  return m ? m[1].toLowerCase() : "mp4";
}
