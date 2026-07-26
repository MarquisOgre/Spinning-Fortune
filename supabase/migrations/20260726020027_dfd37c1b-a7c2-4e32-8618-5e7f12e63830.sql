UPDATE public.settings
SET font_family = 'modern'
WHERE font_family IS NULL OR font_family = '' OR font_family = 'serif';

ALTER TABLE public.settings
  ALTER COLUMN font_family SET DEFAULT 'modern';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_font_family_allowed'
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_font_family_allowed
      CHECK (font_family IN ('modern', 'classic', 'elegant', 'clean'));
  END IF;
END $$;