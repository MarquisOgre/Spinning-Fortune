import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Crown, Lock, Share2, Download, Trophy, Settings as SettingsIcon } from "lucide-react";
import { SpinningWheel, type WheelHandle } from "@/components/SpinningWheel";
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
  type Settings,
  type Winner,
} from "@/lib/lottery";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const wheelRef = useRef<WheelHandle>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
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

  const eligible = useMemo(() => members.filter((m) => !m.is_winner), [members]);
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

    const eligibleIdx = members.map((m, i) => ({ m, i })).filter(({ m }) => !m.is_winner);
    const pickIndexInMembers = eligibleIdx[Math.floor(Math.random() * eligibleIdx.length)].i;
    const picked = members[pickIndexInMembers];

    await startRecording();
    await wheelRef.current!.spinTo(pickIndexInMembers);
    await new Promise((r) => setTimeout(r, 1200));
    const url = await stopRecording();
    setVideoUrl(url);

    const { error: e1 } = await supabase
      .from("members")
      .update({ is_winner: true, won_month: monthLabel, won_at: new Date().toISOString() })
      .eq("id", picked.id);
    const { error: e2 } = await supabase.from("winners").insert({
      member_id: picked.id,
      member_name: picked.name,
      month_year: monthKey,
    });
    if (e1 || e2) toast.error((e1 || e2)!.message);
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur bg-background/40 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-shimmer" />
            <span className="font-serif text-2xl text-gold">
              {settings?.lottery_title ?? "Lucky Draw"}
            </span>
          </div>
          <div className="flex items-center gap-2">
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

      <div className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-[320px_1fr_320px] gap-8">
        <aside className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur p-5 h-fit lg:sticky lg:top-24">
          <h2 className="font-serif text-xl text-gold mb-1 flex items-center gap-2">
            <Crown className="h-4 w-4" /> Members
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {members.length} total • {eligible.length} in the running
          </p>
          <ol className="space-y-1.5">
            {displayMembers.map((m) => (
              <li
                key={m.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                  m.is_winner
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-background/40 hover:bg-background/60"
                }`}
              >
                <span className="text-xs w-6 text-muted-foreground">{m.position}</span>
                <span className={`flex-1 text-sm ${m.is_winner ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {m.name}
                </span>
                {m.is_winner && <Trophy className="h-3.5 w-3.5 text-primary" />}
              </li>
            ))}
            {members.length === 0 && (
              <li className="text-xs text-muted-foreground pt-2">
                Preview names. <Link to="/auth" className="text-primary underline">Sign in</Link> to add real members.
              </li>
            )}
          </ol>
        </aside>

        <main className="flex flex-col items-center">
          <div className="text-center mb-6">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{monthLabel}</p>
            <h1 className="text-4xl md:text-5xl font-serif text-gold mt-2">Spin for {monthLabel}</h1>
            {settings && (
              <p className="mt-3 text-muted-foreground">
                {alreadySpunThisMonth
                  ? "This month's winner has been drawn."
                  : dateOk
                    ? isAdmin
                      ? "The wheel is unlocked. Time to spin."
                      : "The wheel unlocks only for the admin today."
                    : `The wheel unlocks on the ${ordinal(settings.spin_day)} of each month.`}
              </p>
            )}
          </div>

          <SpinningWheel ref={wheelRef} members={displayMembers} />

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              size="lg"
              onClick={handleSpin}
              disabled={!canSpin}
              className="bg-gold text-primary-foreground font-serif text-lg px-10 h-14 rounded-full shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
            >
              {spinning ? "Spinning\u2026" : alreadySpunThisMonth ? "Already drawn" : !dateOk ? (<><Lock className="h-4 w-4 mr-2" /> Locked</>) : "Spin the Wheel"}
            </Button>
            {!session && (
              <p className="text-xs text-muted-foreground">
                Only the admin can spin. <Link to="/auth" className="text-primary underline">Sign in</Link>
              </p>
            )}
          </div>

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

        <aside className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur p-5 h-fit lg:sticky lg:top-24">
          <h2 className="font-serif text-xl text-gold mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Hall of Winners
          </h2>
          <ul className="space-y-2">
            {winners.map((w) => (
              <li key={w.id} className="rounded-lg bg-background/40 px-3 py-2">
                <div className="text-sm font-semibold text-primary">{w.member_name}</div>
                <div className="text-xs text-muted-foreground">{w.month_year}</div>
              </li>
            ))}
            {winners.length === 0 && <li className="text-sm text-muted-foreground">No winners yet.</li>}
          </ul>
        </aside>
      </div>
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
    <div className="mt-10 w-full max-w-2xl rounded-3xl border-2 border-primary/50 bg-gradient-to-br from-card to-background/50 p-8 shadow-[var(--shadow-glow)] animate-pop-in">
      <div className="text-center">
        <div className="text-sm uppercase tracking-[0.3em] text-primary">Winner of {monthLabel}</div>
        <div className="mt-3 text-5xl md:text-6xl font-serif text-gold">\uD83C\uDF89 {winner.name} \uD83C\uDF89</div>
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
