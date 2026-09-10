import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Crown, Lock, Share2, Download, Trophy, Settings as SettingsIcon, Sun, Moon, History } from "lucide-react";
import { SpinningWheel, type WheelHandle } from "@/components/SpinningWheel";
import { useTheme } from "@/hooks/use-theme";
import { drawWelcomeCard, drawWinnerCard, renderWinnerImage, renderWinnerImageDataUrl, shareWinner } from "@/lib/winner-card";
import { drawStage } from "@/lib/scene";
import { baseMime, pickVideoMime, videoExtFromUrl } from "@/lib/video-format";
import {
  fetchMembers,
  fetchSettings,
  fetchWinners,
  currentMonthKey,
  currentMonthLabel,
  isSpinAllowedToday,
  buildWhatsappShareText,
  whatsappShareUrl,
  monthNumber,
  ordinal,
  type Member,
  type Winner,
} from "@/lib/lottery";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lucky Draw — Monthly Spinning Wheel" },
      { name: "description", content: "Spin a beautiful monthly lottery wheel, announce the winner, and share draw proof to WhatsApp." },
      { property: "og:title", content: "Lucky Draw — Monthly Spinning Wheel" },
      { property: "og:description", content: "A 20-member monthly lucky draw with winner history and WhatsApp sharing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type WinnerPopupData = {
  recordId: string;
  memberName: string;
  monthKey: string;
  monthLabel: string;
  monthNumberLabel: string;
  prize?: string | null;
  title: string;
  videoUrl: string | null;
  shareText: string;
  groupLink?: string | null;
};

function Index() {
  const wheelRef = useRef<WheelHandle>(null);
  const { theme, toggle } = useTheme();
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof fetchSettings>> | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Member | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [winnerDialogOpen, setWinnerDialogOpen] = useState(false);
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [dismissedWinnerId, setDismissedWinnerId] = useState<string | null>(null);
  const [seenWelcomeId, setSeenWelcomeId] = useState<string | null>(null);
  const [forcedWinnerId, setForcedWinnerId] = useState<string>(() => {
    if (typeof window === "undefined") return "random";
    return window.localStorage.getItem("lucky-draw-forced-winner") ?? "random";
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recMimeRef = useRef<string>("video/mp4");
  const chunksRef = useRef<BlobPart[]>([]);
  const composeRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<{ kind: "welcome" | "wheel" | "winner"; data: any }>({ kind: "welcome", data: null });
  const rafRef = useRef<number | null>(null);
  const stageRef = useRef<{ members: Member[]; winners: Winner[]; title: string; monthLabel: string }>({
    members: [],
    winners: [],
    title: "",
    monthLabel: "",
  });

  useEffect(() => {
    window.localStorage.setItem("lucky-draw-forced-winner", forcedWinnerId);
  }, [forcedWinnerId]);

  const load = async () => {
    const [m, s, w] = await Promise.all([fetchMembers(), fetchSettings(), fetchWinners()]);
    setMembers(m);
    setSettings(s);
    setWinners(w);
  };

  useEffect(() => {
    load();
    supabase.auth.getUser().then(async ({ data }) => {
      setSession(!!data.user);
      if (data.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      }
    });
  }, []);

  const eligible = useMemo(
    () => members.filter((m) => m.status === "active" && !m.is_winner),
    [members],
  );
  const wheelMembers = useMemo(
    () => (members.length ? members.filter((m) => m.status !== "inactive") : placeholderMembers),
    [members],
  );
  const monthKey = currentMonthKey();
  const monthLabel = currentMonthLabel();
  const cycleMonthNo = settings ? monthNumber(settings.start_month, monthKey) : 1;
  const cycleMonthLabel = `${ordinal(cycleMonthNo)} Month`;
  const alreadySpunThisMonth = winners.some((w) => w.month_year === monthKey);
  const currentMonthWinner = useMemo(
    () => winners.find((w) => w.month_year === monthKey) ?? null,
    [winners, monthKey],
  );
  const latestWinner = useMemo(
    () => [...winners].sort((a, b) => b.month_year.localeCompare(a.month_year))[0] ?? null,
    [winners],
  );
  const dateOk = settings ? isSpinAllowedToday(settings.spin_day) : false;
  const canSpin = isAdmin && !spinning && !alreadySpunThisMonth && dateOk && eligible.length > 0;

  useEffect(() => {
    stageRef.current = {
      members: members.length ? members : placeholderMembers,
      winners,
      title: settings?.lottery_title ?? "Lucky Draw",
      monthLabel,
    };
  }, [members, winners, settings?.lottery_title, monthLabel]);

  const startRecording = async () => {
    try {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 630;
      composeRef.current = c;
      const ctx = c.getContext("2d");
      if (!ctx || typeof c.captureStream !== "function") return null;
      const frame = () => {
        const phase = phaseRef.current;
        if (phase.kind === "welcome") drawWelcomeCard(ctx, 1200, 630, phase.data);
        else if (phase.kind === "winner") drawWinnerCard(ctx, 1200, 630, phase.data);
        else drawStage(ctx, 1200, 630, { title: stageRef.current.title, monthLabel: stageRef.current.monthLabel, members: stageRef.current.members, winners: stageRef.current.winners, wheel: wheelRef.current?.canvas ?? null });
        rafRef.current = requestAnimationFrame(frame);
      };
      frame();
      const stream = c.captureStream(30);
      const mime = pickVideoMime();
      recMimeRef.current = mime;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
      return rec;
    } catch {
      return null;
    }
  };

  const stopRecording = () => new Promise<string | null>((resolve) => {
    const rec = recorderRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!rec) return resolve(null);
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: baseMime(recMimeRef.current) });
      if (blob.size === 0) return resolve(null);
      resolve(await blobToDataUrl(blob));
    };
    rec.stop();
  });

  const handleSpin = async () => {
    if (!canSpin || !settings) return;
    setSpinning(true);
    setWinner(null);
    setVideoUrl(null);
    setSeenWelcomeId(null);
    setDismissedWinnerId(null);
    const eligibleWheelIdx = wheelMembers.map((m, i) => ({ m, i })).filter(({ m }) => m.status === "active" && !m.is_winner);
    const forced = eligibleWheelIdx.find(({ m }) => m.id === forcedWinnerId);
    const chosen = forced ?? eligibleWheelIdx[Math.floor(Math.random() * eligibleWheelIdx.length)];
    const picked = chosen.m;
    const cardBase = { title: settings.lottery_title, monthLabel, memberName: picked.name, prize: settings.prize_amount, monthNumberLabel: cycleMonthLabel };
    phaseRef.current = { kind: "welcome", data: { ...cardBase, memberName: undefined } };
    await startRecording();
    await new Promise((r) => setTimeout(r, 2200));
    phaseRef.current = { kind: "wheel", data: null };
    const wheel = wheelRef.current;
    if (!wheel) { setSpinning(false); return; }
    await wheel.spinTo(chosen.i);
    await new Promise((r) => setTimeout(r, 900));
    phaseRef.current = { kind: "winner", data: cardBase };
    await new Promise((r) => setTimeout(r, 3000));
    const url = await stopRecording();
    setVideoUrl(url);
    const imageDataUrl = renderWinnerImageDataUrl(cardBase);
    const { error: e2 } = await supabase.from("winners").insert({ member_id: picked.id, member_name: picked.name, month_year: monthKey, video_url: url, image_url: imageDataUrl });
    if (e2) { toast.error("Draw already recorded for this month"); setSpinning(false); load(); return; }
    const { error: e1 } = await supabase.from("members").update({ is_winner: true, status: "used", won_month: monthLabel, won_at: new Date().toISOString() }).eq("id", picked.id);
    if (e1) toast.error(e1.message);
    setWinner(picked);
    setForcedWinnerId("random");
    setWelcomeDialogOpen(true);
    setSpinning(false);
    load();
  };

  const shareText = winner && settings ? buildWhatsappShareText({ title: settings.lottery_title, winnerName: winner.name, monthLabel, prize: settings.prize_amount }) : "";
  const displayMembers = members.length ? members : placeholderMembers;
  const persistentWinner = useMemo(() => {
    if (!settings || !currentMonthWinner || settings.winning_popup_days <= 0) return null;
    const spunAt = Date.parse(currentMonthWinner.spun_at);
    if (Number.isNaN(spunAt)) return null;
    const ageDays = (Date.now() - spunAt) / 86_400_000;
    return ageDays <= settings.winning_popup_days ? currentMonthWinner : null;
  }, [currentMonthWinner, settings]);

  const winnerPopup = useMemo<WinnerPopupData | null>(() => {
    if (!settings) return null;
    if (winner) {
      return { recordId: `fresh-${winner.id}`, memberName: winner.name, monthKey, monthLabel, monthNumberLabel: cycleMonthLabel, prize: settings.prize_amount, title: settings.lottery_title, videoUrl, shareText, groupLink: settings.whatsapp_group_link };
    }
    if (!persistentWinner) return null;
    const persistentMonthLabel = monthLabelFromKey(persistentWinner.month_year);
    return { recordId: persistentWinner.id, memberName: persistentWinner.member_name, monthKey: persistentWinner.month_year, monthLabel: persistentMonthLabel, monthNumberLabel: `${ordinal(monthNumber(settings.start_month, persistentWinner.month_year))} Month`, prize: settings.prize_amount, title: settings.lottery_title, videoUrl: persistentWinner.video_url, shareText: buildWhatsappShareText({ title: settings.lottery_title, winnerName: persistentWinner.member_name, monthLabel: persistentMonthLabel, prize: settings.prize_amount }), groupLink: settings.whatsapp_group_link };
  }, [cycleMonthLabel, monthKey, monthLabel, persistentWinner, settings, shareText, videoUrl, winner]);

  useEffect(() => {
    if (!winnerPopup) return;
    if (seenWelcomeId === winnerPopup.recordId) return;
    if (dismissedWinnerId === winnerPopup.recordId) return;
    setWelcomeDialogOpen(true);
  }, [dismissedWinnerId, seenWelcomeId, winnerPopup]);

  useEffect(() => {
    if (spinning || !latestWinner || !wheelMembers.length) return;
    const idx = wheelMembers.findIndex((m) => m.id === latestWinner.member_id || m.name === latestWinner.member_name);
    if (idx >= 0) wheelRef.current?.settleTo(idx);
  }, [latestWinner, spinning, wheelMembers]);

  const nextDrawLabel = nextMonthLabel(monthKey);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background mobile-home-scroll">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur shrink-0 mobile-home-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2 mobile-home-header-inner">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="Fortune Draw" className="h-16 w-16 rounded object-cover mobile-home-logo shrink-0" />
            <span className="font-serif text-xl text-gold mobile-home-title">{settings?.lottery_title ?? "Lucky Draw"}</span>
          </div>
          <div className="flex items-center gap-2 mobile-home-nav">
            <Link to="/winners"><Button variant="ghost" size="sm"><History className="h-4 w-4 mr-2" /><span className="hidden sm:inline">Hall of Winners</span></Button></Link>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            {session ? <Link to="/admin"><Button variant="outline" size="sm"><SettingsIcon className="h-4 w-4 mr-2" /><span className="hidden sm:inline">Admin</span></Button></Link> : <Link to="/auth"><Button variant="ghost" size="sm">Admin sign in</Button></Link>}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-6 py-4 grid lg:grid-cols-[300px_1fr_300px] gap-6 overflow-hidden mobile-home-main">
        <aside className="h-full rounded-2xl border border-border/60 bg-card/80 p-4 flex flex-col min-h-0">
          <h2 className="font-serif text-lg text-gold mb-1 flex items-center gap-2 shrink-0"><Crown className="h-4 w-4" /> Members</h2>
          <p className="text-xs text-muted-foreground mb-3 shrink-0">{members.length} total • {eligible.length} in the running</p>
          <ol className="flex-1 min-h-0 flex flex-col justify-between gap-1 pr-1 mobile-home-members">
            {displayMembers.map((m) => {
              const isUsed = m.is_winner && !!m.won_month;
              const isInactive = m.status === "inactive";
              return <li key={m.id} className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${isUsed ? "bg-primary/10 border border-primary/30" : isInactive ? "bg-muted/40 opacity-60" : "bg-background/70 hover:bg-background"}`}>
                <span className="text-[11px] w-5 text-muted-foreground shrink-0">{m.position}</span>
                <span className={`flex-1 text-xs truncate ${isUsed ? "line-through text-muted-foreground" : "text-foreground"}`}>{m.name}</span>
                {isUsed && <Trophy className="h-3 w-3 text-primary shrink-0" />}
                {isInactive && <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">Off</span>}
              </li>;
            })}
          </ol>
        </aside>

        <main className="flex flex-col items-center justify-center min-h-0 overflow-hidden">
          <div className="mobile-wheel-stage relative w-full max-w-[min(440px,55vh,100%)] aspect-square mx-auto shrink-0">
            <SpinningWheel ref={wheelRef} members={wheelMembers} size={420} />
          </div>
          <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-4 mobile-wheel-heading">
            <h1 className="text-3xl md:text-4xl font-serif text-gold whitespace-nowrap text-center text-[clamp(1.1rem,2vw,2.25rem)]">Spin for {monthLabel} · {cycleMonthLabel}</h1>
            <Button size="lg" onClick={handleSpin} disabled={!canSpin} className="bg-gold text-primary-foreground font-serif text-base px-8 h-12 rounded-full shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50">
              {spinning ? "Spinning…" : alreadySpunThisMonth ? "Already drawn" : !dateOk ? <><Lock className="h-4 w-4 mr-2" />Locked</> : "Spin the Wheel"}
            </Button>
          </div>
          {settings && <p className="mt-2 text-center text-sm text-muted-foreground">{alreadySpunThisMonth ? "This month's winner has been drawn." : dateOk ? isAdmin ? "The wheel is unlocked." : "Only the admin can spin today." : `Unlocks on the ${ordinal(settings.spin_day)} of each month.`}</p>}
        </main>

        <aside className="h-full rounded-2xl border border-border/60 bg-card/80 p-4 flex flex-col min-h-0">
          <h2 className="font-serif text-lg text-gold mb-3 flex items-center gap-2 shrink-0"><Trophy className="h-4 w-4" /> Hall of Winners</h2>
          <ul className="space-y-2 overflow-y-auto pr-2 flex-1 min-h-0">{winners.map((w) => <li key={w.id} className="rounded-lg bg-background/60 px-3 py-2"><div className="text-sm font-semibold text-primary">{w.member_name}</div><div className="text-xs text-muted-foreground">{settings ? `${ordinal(monthNumber(settings.start_month, w.month_year))} Month · ` : ""}{monthLabelFromKey(w.month_year)}</div></li>)}{winners.length === 0 && <li className="text-sm text-muted-foreground">No winners yet.</li>}</ul>
        </aside>
      </div>

      <footer className="border-t border-border/60 bg-card/60 backdrop-blur shrink-0 mobile-home-footer"><div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-10 flex items-center justify-center text-xs text-muted-foreground">© {new Date().getFullYear()} • Developed with <span className="text-destructive mx-1">♥</span> by <span className="ml-1 font-semibold text-foreground">Dexorzo Creations</span></div></footer>

      <WinnerDialog open={winnerDialogOpen} winner={winnerPopup} onOpenChange={(open) => { setWinnerDialogOpen(open); if (!open && winnerPopup) setDismissedWinnerId(winnerPopup.recordId); }} />
      <Dialog open={welcomeDialogOpen} onOpenChange={(open) => { setWelcomeDialogOpen(open); if (!open) { if (winnerPopup) setSeenWelcomeId(winnerPopup.recordId); if (winnerPopup) setWinnerDialogOpen(true); } }}>
        <DialogContent className="max-w-2xl rounded-3xl border-2 border-primary/40 bg-card p-8 text-center shadow-[var(--shadow-glow)] mobile-home-dialog">
          <DialogHeader className="items-center text-center"><div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><CalendarDays className="h-7 w-7" /></div><DialogTitle className="text-3xl md:text-4xl font-serif text-gold">Welcome to {settings?.lottery_title ?? "the Lucky Draw"}</DialogTitle><div className="mt-1 text-sm uppercase tracking-[0.3em] text-primary">{winnerPopup?.monthNumberLabel ?? cycleMonthLabel} · {winnerPopup?.monthLabel ?? monthLabel}</div><DialogDescription className="text-base text-muted-foreground">The {monthLabel} draw is complete. Next up: the {nextDrawLabel} draw, unlocking on the configured spin date.</DialogDescription></DialogHeader>
          <Button onClick={() => { setWelcomeDialogOpen(false); if (winnerPopup) setSeenWelcomeId(winnerPopup.recordId); if (winnerPopup) setWinnerDialogOpen(true); }} className="mt-4 h-12 rounded-full bg-gold px-10 text-primary-foreground">See the winner</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function nextMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month || 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const placeholderMembers: Member[] = Array.from({ length: 20 }, (_, i) => ({
  id: `placeholder-${i + 1}`,
  position: i + 1,
  name: `Member ${i + 1}`,
  status: "active",
  is_winner: false,
  won_month: null,
  won_at: null,
}));

function WinnerDialog({ open, winner, onOpenChange }: { open: boolean; winner: WinnerPopupData | null; onOpenChange: (open: boolean) => void }) {
  if (!winner) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl rounded-3xl bg-card p-5 sm:p-8 mobile-home-dialog"><DialogHeader className="text-center items-center"><DialogTitle className="font-serif text-gold text-2xl sm:text-3xl">{winner.memberName}</DialogTitle><DialogDescription>{winner.monthNumberLabel} · {winner.monthLabel}{winner.prize ? ` · Prize: ${winner.prize}` : ""}</DialogDescription></DialogHeader><div className="mt-4 space-y-4">{winner.videoUrl && <video src={winner.videoUrl} controls playsInline className="w-full max-h-[60vh] rounded-2xl bg-black object-contain" />}</div><div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => shareWinner(winner)} className="rounded-full bg-gold text-primary-foreground"><Share2 className="h-4 w-4 mr-2" />Share</Button>{winner.videoUrl && <a href={winner.videoUrl} download={videoExtFromUrl(winner.videoUrl)}><Button variant="outline" className="rounded-full"><Download className="h-4 w-4 mr-2" />Download</Button></a>}{winner.groupLink && <a href={whatsappShareUrl(winner.groupLink, winner.shareText)} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-full">WhatsApp</Button></a>}</div></DialogContent></Dialog>;
}
