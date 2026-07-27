import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Share2, Trophy, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchSettings, fetchWinners, buildWhatsappShareText, whatsappShareUrl, type Winner } from "@/lib/lottery";
import { useTheme } from "@/hooks/use-theme";
import { renderWinnerImage } from "@/lib/winner-card";

export const Route = createFileRoute("/winners")({
  head: () => ({
    meta: [
      { title: "Hall of Winners — Lucky Draw" },
      { name: "description", content: "Browse every monthly lottery winner with downloadable proof and quick WhatsApp share." },
      { property: "og:title", content: "Hall of Winners — Lucky Draw" },
      { property: "og:description", content: "Every monthly winner, forever archived." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WinnersPage,
});

function WinnersPage() {
  const { theme, toggle } = useTheme();
  const [winners, setWinners] = useState<Winner[]>([]);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof fetchSettings>> | null>(null);

  useEffect(() => {
    Promise.all([fetchWinners(), fetchSettings()]).then(([w, s]) => {
      setWinners(w);
      setSettings(s);
    });
  }, []);

  const grouped = useMemo(() => {
    const byYear: Record<string, Winner[]> = {};
    winners.forEach((w) => {
      const year = w.month_year.slice(0, 4);
      (byYear[year] ||= []).push(w);
    });
    return Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]));
  }, [winners]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="font-serif text-xl text-gold flex items-center gap-2">
            <Trophy className="h-5 w-5" /> Hall of Winners
          </h1>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {winners.length === 0 && (
          <p className="text-center text-muted-foreground py-20">No winners recorded yet.</p>
        )}
        {grouped.map(([year, list]) => (
          <section key={year} className="mb-10">
            <h2 className="font-serif text-2xl text-gold mb-4">{year}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((w) => (
                <WinnerTile key={w.id} winner={w} settings={settings} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-border/60 bg-card/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-10 flex items-center justify-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} • Developed with <span className="text-destructive mx-1">♥</span> by
          <span className="ml-1 font-semibold text-foreground">Dexorzo Creations</span>
        </div>
      </footer>
    </div>
  );
}

function WinnerTile({ winner, settings }: { winner: Winner; settings: Awaited<ReturnType<typeof fetchSettings>> | null }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const monthLabel = useMemo(() => {
    const [y, m] = winner.month_year.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }, [winner.month_year]);

  useEffect(() => {
    let active = true;
    renderWinnerImage({
      title: settings?.lottery_title ?? "Lucky Draw",
      monthLabel,
      memberName: winner.member_name,
      prize: settings?.prize_amount,
    }).then((url) => active && setImgUrl(url));
    return () => { active = false; };
  }, [winner, monthLabel, settings?.lottery_title, settings?.prize_amount]);

  const shareText = settings
    ? buildWhatsappShareText({ title: settings.lottery_title, winnerName: winner.member_name, monthLabel, prize: settings.prize_amount })
    : `🏆 ${winner.member_name} — ${monthLabel}`;
  const waHref = whatsappShareUrl(shareText, settings?.whatsapp_group_link);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{monthLabel}</div>
      <div className="mt-1 text-2xl font-serif text-gold">{winner.member_name}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={waHref} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 rounded-full bg-whatsapp text-whatsapp-foreground text-xs px-3 py-1.5 font-semibold hover:brightness-110">
          <Share2 className="h-3.5 w-3.5" /> WhatsApp
        </a>
        {imgUrl && (
          <a href={imgUrl} download={`winner-${winner.month_year}.png`}
             className="inline-flex items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground text-xs px-3 py-1.5 font-semibold hover:brightness-110">
            <Download className="h-3.5 w-3.5" /> Proof
          </a>
        )}
        {winner.video_url && (
          <a href={winner.video_url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs px-3 py-1.5 font-semibold">
            <Download className="h-3.5 w-3.5" /> Video
          </a>
        )}
      </div>
    </div>
  );
}