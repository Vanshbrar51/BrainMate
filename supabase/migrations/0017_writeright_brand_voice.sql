-- 0017_writeright_brand_voice.sql
-- Enable the vector extension to allow high-dimensional similarity searches
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store user writing examples and their embeddings
CREATE TABLE IF NOT EXISTS public.writeright_brand_voice (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- Optimized for Google text-embedding-004
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.writeright_brand_voice ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see/edit their own data
CREATE POLICY writeright_brand_voice_select ON public.writeright_brand_voice
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_brand_voice_insert ON public.writeright_brand_voice
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_brand_voice_update ON public.writeright_brand_voice
    FOR UPDATE USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_brand_voice_delete ON public.writeright_brand_voice
    FOR DELETE USING (auth.uid()::text = user_id);

-- Create a GIST index for efficient vector search
CREATE INDEX ON public.writeright_brand_voice USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Trigger for updated_at
CREATE TRIGGER trg_writeright_brand_voice_updated_at
    BEFORE UPDATE ON public.writeright_brand_voice
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_brand_voice (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  p_user_id TEXT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wbv.id,
    wbv.content,
    1 - (wbv.embedding <=> query_embedding) AS similarity
  FROM public.writeright_brand_voice wbv
  WHERE wbv.user_id = p_user_id
    AND 1 - (wbv.embedding <=> query_embedding) > match_threshold
  ORDER BY wbv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
