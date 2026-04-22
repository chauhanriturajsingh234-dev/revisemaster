
CREATE TABLE public.deck_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'primary',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deck_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groups select own" ON public.deck_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Groups insert own" ON public.deck_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Groups update own" ON public.deck_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Groups delete own" ON public.deck_groups FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_deck_groups_updated_at
BEFORE UPDATE ON public.deck_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.decks
  ADD COLUMN group_id UUID REFERENCES public.deck_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_decks_group_id ON public.decks(group_id);
CREATE INDEX idx_deck_groups_user_id ON public.deck_groups(user_id);
