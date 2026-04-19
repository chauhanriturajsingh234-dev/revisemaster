-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles select own" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Profiles insert own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- User roles (separate table, never on profiles)
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Decks
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Decks select own" ON public.decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Decks insert own" ON public.decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Decks update own" ON public.decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Decks delete own" ON public.decks FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_decks_user ON public.decks(user_id, created_at DESC);
CREATE TRIGGER trg_decks_updated BEFORE UPDATE ON public.decks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cards (SM-2 lite)
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease NUMERIC NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cards select own" ON public.cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Cards insert own" ON public.cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Cards update own" ON public.cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Cards delete own" ON public.cards FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_cards_deck ON public.cards(deck_id);
CREATE INDEX idx_cards_user_due ON public.cards(user_id, due_at);
CREATE TRIGGER trg_cards_updated BEFORE UPDATE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents
CREATE TYPE public.doc_status AS ENUM ('uploaded','processing','ready','failed');
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  status public.doc_status NOT NULL DEFAULT 'uploaded',
  error TEXT,
  deck_id UUID REFERENCES public.decks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Docs select own" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Docs insert own" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Docs update own" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Docs delete own" ON public.documents FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_docs_user ON public.documents(user_id, created_at DESC);
CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket: documents (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('documents','documents', false);

CREATE POLICY "Docs storage select own" ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Docs storage insert own" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Docs storage delete own" ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);