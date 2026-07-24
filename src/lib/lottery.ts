import { supabase } from "@/integrations/supabase/client";

export type Member = {
  id: string;
  name: string;
  phone: string | null;
  position: number;
  is_winner: boolean;
  won_month: string | null;
  won_at: string | null;
};

export type Settings = {
  id: number;
  spin_day: number;
  whatsapp_group_link: string | null;
  whatsapp_group_name: string | null;
  lottery_title: string;
  prize_amount: string | null;
};

export type Winner = {
  id: string;
  member_id: string | null;
  member_name: string;
  month_year: string;
  video_url: string | null;
  spun_at: string;
};

export const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const currentMonthLabel = () =>
  new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from("members").select("*").order("position");
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data ?? { id: 1, spin_day: 1, whatsapp_group_link: "", whatsapp_group_name: "Lottery Group", lottery_title: "Monthly Lucky Draw", prize_amount: "" }) as Settings;
}

export async function fetchWinners(): Promise<Winner[]> {
  const { data, error } = await supabase.from("winners").select("*").order("spun_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Winner[];
}

export function isSpinAllowedToday(spinDay: number): boolean {
  return new Date().getDate() === spinDay;
}

export function buildWhatsappShareText(opts: {
  title: string;
  winnerName: string;
  monthLabel: string;
  prize?: string | null;
}) {
  const prize = opts.prize ? `\nPrize: ${opts.prize}` : "";
  return `🎉 ${opts.title} — ${opts.monthLabel}\n\n🏆 Winner: ${opts.winnerName}${prize}\n\nCongratulations! 🥳`;
}

export function whatsappShareUrl(text: string, groupLink?: string | null) {
  if (groupLink && groupLink.includes("chat.whatsapp.com")) {
    return groupLink;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}