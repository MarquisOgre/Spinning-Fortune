ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive','used'));

UPDATE public.members SET status = 'used' WHERE is_winner = true AND status = 'active';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS favicon_url TEXT DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS winners_month_year_unique ON public.winners(month_year);