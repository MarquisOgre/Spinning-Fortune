ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS start_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 20;

ALTER TABLE public.winners
  ADD COLUMN IF NOT EXISTS image_url text;