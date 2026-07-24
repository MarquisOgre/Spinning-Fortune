
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Members
CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  position INT NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  won_month TEXT,
  won_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view members" ON public.members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage members" ON public.members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Settings (singleton, id=1)
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  spin_day INT NOT NULL DEFAULT 1 CHECK (spin_day BETWEEN 1 AND 28),
  whatsapp_group_link TEXT DEFAULT '',
  whatsapp_group_name TEXT DEFAULT 'Lottery Group',
  lottery_title TEXT NOT NULL DEFAULT 'Monthly Lucky Draw',
  prize_amount TEXT DEFAULT '',
  CONSTRAINT singleton CHECK (id = 1)
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update settings" ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.settings (id) VALUES (1);

-- Winners history
CREATE TABLE public.winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  month_year TEXT NOT NULL UNIQUE,
  video_url TEXT,
  spun_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.winners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.winners TO authenticated;
GRANT ALL ON public.winners TO service_role;
ALTER TABLE public.winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view winners" ON public.winners FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage winners" ON public.winners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-promote first signup to admin
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_first_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_first_admin();
