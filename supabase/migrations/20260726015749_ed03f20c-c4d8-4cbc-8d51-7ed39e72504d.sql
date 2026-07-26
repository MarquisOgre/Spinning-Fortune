ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS winning_popup_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'serif';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_winning_popup_days_range'
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_winning_popup_days_range
      CHECK (winning_popup_days >= 0 AND winning_popup_days <= 31);
  END IF;
END $$;