CREATE TABLE IF NOT EXISTS public.writeright_writing_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT UNIQUE NOT NULL,
    top_mistakes JSONB DEFAULT '[]'::JSONB,
    improvement_count INTEGER DEFAULT 0,
    last_analyzed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.writeright_writing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own writing profile"
    ON public.writeright_writing_profiles
    FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update own writing profile"
    ON public.writeright_writing_profiles
    FOR UPDATE
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own writing profile"
    ON public.writeright_writing_profiles
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Function used by the trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a generic trigger to auto-update the 'updated_at' column
DROP TRIGGER IF EXISTS trg_writeright_writing_profiles_updated_at
ON public.writeright_writing_profiles;

CREATE TRIGGER trg_writeright_writing_profiles_updated_at
BEFORE UPDATE ON public.writeright_writing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();