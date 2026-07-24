import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetchMembers, fetchSettings, type Member, type Settings } from "@/lib/lottery";
import { ArrowLeft, Save, Trash2, Plus, LogOut, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin Panel \u2014 Lucky Draw" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [m, s] = await Promise.all([fetchMembers(), fetchSettings()]);
    setMembers(m);
    setSettings(s);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const updateMember = (id: string, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const addMember = async () => {
    const nextPos = (members.at(-1)?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("members")
      .insert({ name: `Member ${nextPos}`, position: nextPos })
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
      .update({ is_winner: false, won_month: null, won_at: null })
      .neq("id", zero);
    if (e1 || e2) return toast.error((e1 || e2)!.message);
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
    }).eq("id", 1);
    if (sErr) { toast.error(sErr.message); setSaving(false); return; }
    for (const m of members) {
      const { error } = await supabase
        .from("members")
        .update({ name: m.name, phone: m.phone, position: m.position })
        .eq("id", m.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success("Saved");
    setSaving(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading || !settings) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading\u2026</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to wheel
          </Link>
          <h1 className="text-2xl text-gold font-serif">Admin Panel</h1>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-3 gap-8">
        <section className="lg:col-span-1 rounded-2xl border border-border/60 bg-card/80 p-6 space-y-4 h-fit">
          <h2 className="text-xl font-semibold text-gold">Settings</h2>
          <div>
            <Label>Lottery Title</Label>
            <Input value={settings.lottery_title} onChange={(e) => setSettings({ ...settings, lottery_title: e.target.value })} />
          </div>
          <div>
            <Label>Prize Amount</Label>
            <Input value={settings.prize_amount ?? ""} placeholder="e.g. \u20B950,000" onChange={(e) => setSettings({ ...settings, prize_amount: e.target.value })} />
          </div>
          <div>
            <Label>Spin Day of Month (1\u201328)</Label>
            <Input type="number" min={1} max={28} value={settings.spin_day} onChange={(e) => setSettings({ ...settings, spin_day: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} />
            <p className="text-xs text-muted-foreground mt-1">The wheel unlocks only on this date each month.</p>
          </div>
          <div>
            <Label>WhatsApp Group Name</Label>
            <Input value={settings.whatsapp_group_name ?? ""} onChange={(e) => setSettings({ ...settings, whatsapp_group_name: e.target.value })} />
          </div>
          <div>
            <Label>WhatsApp Group Invite Link</Label>
            <Input value={settings.whatsapp_group_link ?? ""} placeholder="https://chat.whatsapp.com/\u2026" onChange={(e) => setSettings({ ...settings, whatsapp_group_link: e.target.value })} />
          </div>
          <Button onClick={saveAll} disabled={saving} className="w-full bg-gold text-primary-foreground font-semibold">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving\u2026" : "Save all"}
          </Button>
          <Button variant="outline" onClick={resetWinners} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" /> Reset cycle
          </Button>
        </section>

        <section className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/80 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gold">Members ({members.length})</h2>
            <Button size="sm" onClick={addMember} disabled={members.length >= 20}>
              <Plus className="h-4 w-4 mr-1" /> Add member
            </Button>
          </div>
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">No members yet. Add up to 20.</p>
          )}
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/30 p-3">
                <div className="w-8 text-center text-primary font-semibold">{m.position}</div>
                <Input value={m.name} onChange={(e) => updateMember(m.id, { name: e.target.value })} className="flex-1" />
                <Input value={m.phone ?? ""} placeholder="Phone" onChange={(e) => updateMember(m.id, { phone: e.target.value })} className="w-40" />
                {m.is_winner && <span className="text-xs text-primary">\uD83C\uDFC6 {m.won_month}</span>}
                <Button size="icon" variant="ghost" onClick={() => deleteMember(m.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}