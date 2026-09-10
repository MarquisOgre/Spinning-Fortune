import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — Lucky Draw" },
      { name: "description", content: "Sign in to manage members, settings and monthly spins." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center gap-2 mb-8">
          <img src="/logo.png" alt="Fortune Wheel" className="h-16 w-16 rounded-xl object-cover" />
          <span className="font-serif text-3xl text-gold">Fortune Wheel</span>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur p-8 shadow-[var(--shadow-card)]">
          <h1 className="text-3xl font-semibold text-gold mb-1">Admin Sign In</h1>
          <p className="text-muted-foreground text-sm mb-6">Sign in to manage the lottery.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gold text-primary-foreground font-semibold h-11">
              {loading ? "Please wait…" : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
