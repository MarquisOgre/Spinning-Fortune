import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crown, Lock, Share2, Download, Trophy, Settings as SettingsIcon, Sun, Moon, History } from "lucide-react";
import { SpinningWheel, type WheelHandle } from "@/components/SpinningWheel";
import { useTheme } from "@/hooks/use-theme";
import {
  fetchMembers,
  fetchSettings,
  fetchWinners,
  currentMonthKey,
  currentMonthLabel,
  isSpinAllowedToday,
  buildWhatsappShareText,
  whatsappShareUrl,
  type Member,
  type Winner,
} from "@/lib/lottery";

export const Route = createFileRoute("/")({
  component: Index,
});

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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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
  const alreadySpunThisMonth = winners.some((w) => w.month_year === monthKey);
  const dateOk = settings ? isSpinAllowedToday(settings.spin_day) : false;
  const canSpin = isAdmin && !spinning && !alreadySpunThisMonth && dateOk && eligible.length > 0;

  const startRecording = async () => {
    const canvas = wheelRef.current?.canvas;
    if (!canvas || typeof (canvas as HTMLCanvasElement).captureStream !== "function") return null;
    try {
      const stream = (canvas as HTMLCanvasElement).captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
      return rec;
    } catch {
      return null;
    }
  };

  const stopRecording = () =>
    new Promise<string | null>((resolve) => {
      const rec = recorderRef.current;
      if (!rec) return resolve(null);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(URL.createObjectURL(blob));
      };
      rec.stop();
    });

  const handleSpin = async () => {
    if (!canSpin || !settings) return;
    setSpinning(true);
    setWinner(null);
    setVideoUrl(null);

    // Pick an index that exists on the wheel (wheelMembers), and only among active/non-winner
    const eligibleWheelIdx = wheelMembers
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.status === "active" && !m.is_winner);
    const chosen = eligibleWheelIdx[Math.floor(Math.random() * eligibleWheelIdx.length)];
    const picked = chosen.m;

    await startRecording();
    await wheelRef.current!.spinTo(chosen.i);
    await new Promise((r) => setTimeout(r, 1200));
    const url = await stopRecording();
    setVideoUrl(url);

    // Server-side lock: unique index on winners.month_year prevents double-draws.
    const { error: e2 } = await supabase.from("winners").insert({
      member_id: picked.id,
      member_name: picked.name,
      month_year: monthKey,
    });
    if (e2) {
      toast.error("Draw already recorded for this month");
      setSpinning(false);
      load();
      return;
    }
    const { error: e1 } = await supabase
      .from("members")
      .update({ is_winner: true, status: "used", won_month: monthLabel, won_at: new Date().toISOString() })
      .eq("id", picked.id);
    if (e1) toast.error(e1.message);
    setWinner(picked);
    setSpinning(false);
    load();
  };

  const shareText =
    winner && settings
      ? buildWhatsappShareText({
          title: settings.lottery_title,
          winnerName: winner.name,
          monthLabel,
          prize: settings.prize_amount,
        })
      : "";

  const displayMembers = members.length ? members : placeholderMembers;

  // Auto-open WhatsApp share once a winner is set (one-tap send).
  useEffect(() => {
    if (!winner || !settings) return;
    const url = whatsappShareUrl(shareText, settings.whatsapp_group_link);
    const t = setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), 900);
    return () => clearTimeout(t);
  }, [winner, settings, shareText]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur shrink-0">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
            ) : (
              <Crown className="h-5 w-5 text-primary" />
            )}
            <span className="font-serif text-xl text-gold">
              {settings?.lottery_title ?? "Lucky Draw"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/winners">
              <Button variant="ghost" size="sm"><History className="h-4 w-4 mr-2" /> Hall of Winners</Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {session ? (
              <Link to="/admin">
                <Button variant="outline" size="sm">
                  <SettingsIcon className="h-4 w-4 mr-2" /> Admin
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button variant="ghost" size="sm">Admin sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-6 py-4 grid lg:grid-cols-[280px_1fr_280px] gap-6">
        <aside className="rounded-2xl border border-border/60 bg-card/80 p-4 flex flex-col min-h-0">
          <h2 className="font-serif text-lg text-gold mb-1 flex items-center gap-2 shrink-0">
            <Crown className="h-4 w-4" /> Members
          </h2>
          <p className="text-xs text-muted-foreground mb-3 shrink-0">
            {members.length} total • {eligible.length} in the running
          </p>
          <ol className="space-y-1.5 overflow-y-auto pr-2 flex-1 min-h-0">
            {displayMembers.map((m) => {
              const isUsed = m.is_winner || m.status === "used";
              const isInactive = m.status === "inactive";
              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                    isUsed ? "bg-primary/10 border border-primary/30"
                    : isInactive ? "bg-muted/40 opacity-60"
                    : "bg-background/60 hover:bg-background"
                  }`}
                >
                  <span className="text-xs w-6 text-muted-foreground">{m.position}</span>
                  <span className={`flex-1 text-sm ${isUsed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {m.name}
                  </span>
                  {isUsed && <Trophy className="h-3.5 w-3.5 text-primary" />}
                  {isInactive && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Inactive</span>}
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="flex flex-col items-center justify-start min-h-0 overflow-y-auto">
          <SpinningWheel ref={wheelRef} members={wheelMembers} size={420} />

          <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-4">
  <h1 className="text-3xl md:text-4xl font-serif text-gold">
    Spin for {monthLabel}
  </h1>

  <Button
    size="lg"
    onClick={handleSpin}
    disabled={!canSpin}
    className="bg-gold text-primary-foreground font-serif text-base px-8 h-12 rounded-full shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
  >
    {spinning
      ? "Spinning…"
      : alreadySpunThisMonth
      ? "Already drawn"
      : !dateOk
      ? (
        <>
          <Lock className="h-4 w-4 mr-2" />
          Locked
        </>
      )
      : "Spin the Wheel"}
  </Button>
</div>

{settings && (
  <p className="mt-2 text-center text-sm text-muted-foreground">
    {alreadySpunThisMonth
      ? "This month's winner has been drawn."
      : dateOk
      ? isAdmin
        ? "The wheel is unlocked."
        : "Only the admin can spin today."
      : `Unlocks on the ${ordinal(settings.spin_day)} of each month.`}
  </p>
)}

          {winner && settings && (
            <WinnerCard
              winner={winner}
              monthLabel={monthLabel}
              prize={settings.prize_amount}
              title={settings.lottery_title}
              videoUrl={videoUrl}
              shareText={shareText}
              groupLink={settings.whatsapp_group_link}
            />
          )}
        </main>

        <aside className="rounded-2xl border border-border/60 bg-card/80 p-4 flex flex-col min-h-0">
          <h2 className="font-serif text-lg text-gold mb-3 flex items-center gap-2 shrink-0">
            <Trophy className="h-4 w-4" /> Hall of Winners
          </h2>
          <ul className="space-y-2 overflow-y-auto pr-2 flex-1 min-h-0">
            {winners.map((w) => (
              <li key={w.id} className="rounded-lg bg-background/60 px-3 py-2">
                <div className="text-sm font-semibold text-primary">{w.member_name}</div>
                <div className="text-xs text-muted-foreground">{w.month_year}</div>
              </li>
            ))}
            {winners.length === 0 && <li className="text-sm text-muted-foreground">No winners yet.</li>}
          </ul>
        </aside>
      </div>

      <footer className="border-t border-border/60 bg-card/60 backdrop-blur shrink-0">
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} • Developed with <span className="text-destructive mx-1">♥</span> by
          <span className="ml-1 font-semibold text-foreground">Dexorzo Creations</span>
        </div>
      </footer>
    </div>
  );
}

const placeholderMembers: Member[] = Array.from({ length: 20 }, (_, i) => ({
  id: `p-${i}`,
  name: `Member ${i + 1}`,
  phone: null,
  position: i + 1,
  is_winner: false,
  won_month: null,
  won_at: null,
  status: "active",
}));

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function WinnerCard({
  winner, monthLabel, prize, title, videoUrl, shareText, groupLink,
}: {
  winner: Member;
  monthLabel: string;
  prize?: string | null;
  title: string;
  videoUrl: string | null;
  shareText: string;
  groupLink?: string | null;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 1200, 630);
    g.addColorStop(0, "#1a0f2e");
    g.addColorStop(1, "#3b1e5e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#f5c34a";
    ctx.font = "600 32px serif";
    ctx.textAlign = "center";
    ctx.fillText(title.toUpperCase(), 600, 120);
    ctx.font = "italic 28px serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(monthLabel, 600, 170);
    ctx.fillStyle = "#fff";
    ctx.font = "600 48px sans-serif";
    ctx.fillText("\uD83C\uDFC6 WINNER \uD83C\uDFC6", 600, 280);
    ctx.fillStyle = "#f5c34a";
    ctx.font = "700 84px serif";
    ctx.fillText(winner.name, 600, 400);
    if (prize) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "500 36px sans-serif";
      ctx.fillText(`Prize: ${prize}`, 600, 470);
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "500 22px sans-serif";
    ctx.fillText("Congratulations!", 600, 560);
    c.toBlob((b) => b && setImgUrl(URL.createObjectURL(b)), "image/png");
  }, [winner, monthLabel, prize, title]);

  const waHref = whatsappShareUrl(shareText, groupLink);

  return (
    <div className="mt-6 w-full max-w-xl rounded-3xl border-2 border-primary/50 bg-gradient-to-br from-card to-background/50 p-6 shadow-[var(--shadow-glow)] animate-pop-in">
      <div className="text-center">
        <div className="text-sm uppercase tracking-[0.3em] text-primary">Winner of {monthLabel}</div>
        <div className="mt-3 text-4xl md:text-5xl font-serif text-gold">🎉 {winner.name} 🎉</div>
        {prize && <div className="mt-2 text-muted-foreground text-lg">Prize: {prize}</div>}
      </div>
      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white h-12 font-semibold hover:brightness-110">
          <Share2 className="h-4 w-4" /> Share to WhatsApp
        </a>
        {imgUrl && (
          <a href={imgUrl} download={`winner-${monthLabel}.png`} className="flex items-center justify-center gap-2 rounded-full bg-secondary text-secondary-foreground h-12 font-semibold hover:brightness-110">
            <Download className="h-4 w-4" /> Download image
          </a>
        )}
        {videoUrl && (
          <a href={videoUrl} download={`spin-${monthLabel}.webm`} className="sm:col-span-2 flex items-center justify-center gap-2 rounded-full bg-primary/20 border border-primary/40 text-primary h-12 font-semibold hover:bg-primary/30">
            <Download className="h-4 w-4" /> Download spin video
          </a>
        )}
      </div>
    </div>
  );
}
