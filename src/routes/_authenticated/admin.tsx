import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchMembers,
  fetchSettings,
  fetchWinners,
  monthKeyLabel,
  monthNumber,
  ordinal,
  currentMonthKey,
  type FontFamily,
  type Member,
  type Settings,
  type Winner,
} from "@/lib/lottery";
import { ArrowLeft, Save, Trash2, Plus, LogOut, RotateCcw, Sun, Moon, History } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Settings — Lucky Draw" },
      { name: "description", content: "Manage lottery members, spin date, sharing, branding, fonts, and winner popup settings." },
      { property: "og:title", content: "Admin Settings — Lucky Draw" },
      { property: "og:description", content: "Admin controls for the monthly lucky draw." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [pastMonth, setPastMonth] = useState(currentMonthKey());
  const [pastMemberId, setPastMemberId] = useState("");
  const [pastImageUrl, setPastImageUrl] = useState("");
  const [pastVideoUrl, setPastVideoUrl] = useState("");
  const [addingPast, setAddingPast] = useState(false);

  const reload = async () => {
    const [m, s, w] = await Promise.all([fetchMembers(), fetchSettings(), fetchWinners()]);
    setMembers(m);
    setSettings(s);
    setWinners(w);
    setLoading(false);
    document.documentElement.dataset.font = s.font_family;
  };

  const addPastWinner = async () => {
    const member = members.find((m) => m.id === pastMemberId);
    if (!member) return toast.error("Pick a member");
    if (!/^\d{4}-\d{2}$/.test(pastMonth)) return toast.error("Pick a valid month");
    if (winners.some((w) => w.month_year === pastMonth)) return toast.error("A winner already exists for that month");
    setAddingPast(true);
    const { error } = await supabase.from("winners").insert({
      member_id: member.id,
      member_name: member.name,
      month_year: pastMonth,
      image_url: pastImageUrl.trim() || null,
      video_url: pastVideoUrl.trim() || null,
      spun_at: new Date(`${pastMonth}-01T12:00:00Z`).toISOString(),
    });
    if (error) { setAddingPast(false); return toast.error(error.message); }
    const { error: mErr } = await supabase
      .from("members")
      .update({ is_winner: true, status: "used", won_month: pastMonth, won_at: new Date(`${pastMonth}-01T12:00:00Z`).toISOString() })
      .eq("id", member.id);
    if (mErr) toast.error(mErr.message);
    setAddingPast(false);
    setPastMemberId("");
    setPastImageUrl("");
    setPastVideoUrl("");
    toast.success(`Recorded ${member.name} for ${monthKeyLabel(pastMonth)}`);
    reload();
  };

  const deleteWinner = async (w: Winner) => {
    const { error } = await supabase.from("winners").delete().eq("id", w.id);
    if (error) return toast.error(error.message);
    if (w.member_id) {
      await supabase
        .from("members")
        .update({ is_winner: false, status: "active", won_month: null, won_at: null })
        .eq("id", w.member_id);
    }
    toast.success("Winner entry removed");
    reload();
  };

  useEffect(() => { reload(); }, []);

  const updateMember = (id: string, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const addMember = async () => {
    const nextPos = (members.at(-1)?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("members")
      .insert({ name: `Member ${nextPos}`, position: nextPos, status: "active" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setMembers((p) => [...p, data as Member]);
  };

  const deleteMember = async (id: string) => {
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setMembers((p) => p.filter((m) => m.id !== id));
  };

  const resetWinners = async () => {
    if (!confirm("Reset all winners? This clears winner flags on members and deletes winner history.")) return;
    const zero = "00000000-0000-0000-0000-000000000000";
    const { error: e1 } = await supabase.from("winners").delete().neq("id", zero);
    const { error: e2 } = await supabase
      .from("members")
      .update({ is_winner: false, status: "active", won_month: null, won_at: null })
      .neq("id", zero);
    if (e1 || e2) return toast.error((e1 || e2)?.message ?? "Unable to reset cycle");
    toast.success("Cycle reset");
    reload();
  };

  const saveAll = async () => {
    if (!settings) return;
    setSaving(true);
    const { error: sErr } = await supabase.from("settings").update({
      spin_day: settings.spin_day,
      whatsapp_group_link: settings.whatsapp_group_link,
      whatsapp_group_name: settings.whatsapp_group_name,
      lottery_title: settings.lottery_title,
      prize_amount: settings.prize_amount,
      logo_url: settings.logo_url,
      favicon_url: settings.favicon_url,
      winning_popup_days: settings.winning_popup_days,
      font_family: settings.font_family,
    }).eq("id", 1);
    if (sErr) { toast.error(sErr.message); setSaving(false); return; }
    for (const m of members) {
      const { error } = await supabase
        .from("members")
        .update({ name: m.name, phone: m.phone, position: m.position, status: m.status })
        .eq("id", m.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    document.documentElement.dataset.font = settings.font_family;
    toast.success("Saved");
    setSaving(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading || !settings) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur shrink-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to wheel
          </Link>
          <h1 className="text-2xl text-gold font-serif">Admin Panel</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-6xl w-full mx-auto px-6 py-6 grid lg:grid-cols-3 gap-8 overflow-hidden">
        <section className="lg:col-span-1 rounded-2xl border border-border/60 bg-card/80 p-6 flex flex-col min-h-0">
          <h2 className="text-xl font-semibold text-gold shrink-0">Settings</h2>
          <div className="mt-4 space-y-4 overflow-y-auto pr-2 flex-1 min-h-0">
            <div><Label>Lottery Title</Label><Input value={settings.lottery_title} onChange={(e) => setSettings({ ...settings, lottery_title: e.target.value })} /></div>
            <div><Label>Prize Amount</Label><Input value={settings.prize_amount ?? ""} placeholder="e.g. ₹50,000" onChange={(e) => setSettings({ ...settings, prize_amount: e.target.value })} /></div>
            <div><Label>Spin Day of Month (1–28)</Label><Input type="number" min={1} max={28} value={settings.spin_day} onChange={(e) => setSettings({ ...settings, spin_day: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} /><p className="text-xs text-muted-foreground mt-1">The wheel unlocks only on this date each month.</p></div>
            <div><Label>Winner Popup Days</Label><Input type="number" min={0} max={31} value={settings.winning_popup_days} onChange={(e) => setSettings({ ...settings, winning_popup_days: Math.max(0, Math.min(31, Number(e.target.value) || 0)) })} /><p className="text-xs text-muted-foreground mt-1">How many days the winner popup stays visible after a draw.</p></div>
            <div>
              <Label>App Font</Label>
              <Select value={settings.font_family} onValueChange={(value) => { const font = value as FontFamily; setSettings({ ...settings, font_family: font }); document.documentElement.dataset.font = font; }}>
                <SelectTrigger><SelectValue placeholder="Choose a font" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern">Modern — Sora</SelectItem>
                  <SelectItem value="clean">Clean — Inter</SelectItem>
                  <SelectItem value="classic">Classic — Lora</SelectItem>
                  <SelectItem value="elegant">Elegant — Playfair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>WhatsApp Group Name</Label><Input value={settings.whatsapp_group_name ?? ""} onChange={(e) => setSettings({ ...settings, whatsapp_group_name: e.target.value })} /></div>
            <div><Label>WhatsApp Group Invite Link</Label><Input value={settings.whatsapp_group_link ?? ""} placeholder="https://chat.whatsapp.com/…" onChange={(e) => setSettings({ ...settings, whatsapp_group_link: e.target.value })} /></div>
            <div><Label>Logo URL</Label><Input value={settings.logo_url ?? ""} placeholder="https://…/logo.png" onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })} /></div>
            <div><Label>Favicon URL</Label><Input value={settings.favicon_url ?? ""} placeholder="https://…/favicon.png" onChange={(e) => setSettings({ ...settings, favicon_url: e.target.value })} /></div>
          </div>
          <div className="mt-4 space-y-3 shrink-0">
            <Button onClick={saveAll} disabled={saving} className="w-full bg-gold text-primary-foreground font-semibold"><Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : "Save all"}</Button>
            <Button variant="outline" onClick={resetWinners} className="w-full"><RotateCcw className="h-4 w-4 mr-2" /> Reset cycle</Button>
          </div>
        </section>

        <section className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/80 p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-xl font-semibold text-gold">Members ({members.length})</h2>
            <Button size="sm" onClick={addMember} disabled={members.length >= 20}><Plus className="h-4 w-4 mr-1" /> Add member</Button>
          </div>
          {members.length === 0 && <p className="text-sm text-muted-foreground">No members yet. Add up to 20.</p>}
          <div className="space-y-2 overflow-y-auto pr-2 flex-1 min-h-0">
            {members.map((m) => (
              <div key={m.id} className="grid grid-cols-[36px_minmax(0,1fr)_160px_112px_36px] items-center gap-2 rounded-xl border border-border/50 bg-background/30 p-3">
                <div className="w-8 text-center text-primary font-semibold">{m.position}</div>
                <Input value={m.name} onChange={(e) => updateMember(m.id, { name: e.target.value })} className="min-w-0" />
                <Input value={m.phone ?? ""} placeholder="Phone" onChange={(e) => updateMember(m.id, { phone: e.target.value })} />
                <select value={m.status} onChange={(e) => updateMember(m.id, { status: e.target.value as Member["status"] })} className="h-9 text-xs rounded-md border border-input bg-background px-2 py-1.5">
                  <option value="active">Active</option><option value="inactive">Inactive</option><option value="used">Used</option>
                </select>
                <Button size="icon" variant="ghost" onClick={() => deleteMember(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <footer className="border-t border-border/60 bg-card/40 shrink-0"><div className="max-w-6xl mx-auto px-6 h-10 flex items-center justify-center text-xs text-muted-foreground">© {new Date().getFullYear()} • Developed with <span className="text-destructive mx-1">♥</span> by <span className="ml-1 font-semibold text-foreground">Dexorzo Creations</span></div></footer>
    </div>
  );
}
