import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const CHALLENGES = [
  {
    title: "Make the Ask Clear",
    description: "Rewrite a vague request into a crisp action-oriented message.",
    mode: "email",
    difficulty: "easy",
    prompt_text: "Turn a vague email into a clear request with an owner and deadline.",
  },
  {
    title: "Sharper LinkedIn Update",
    description: "Convert a routine update into a useful professional post.",
    mode: "linkedin",
    difficulty: "medium",
    prompt_text: "Write a LinkedIn update that teaches one practical lesson.",
  },
  {
    title: "Calm WhatsApp Reply",
    description: "Make a rushed WhatsApp reply sound warm and decisive.",
    mode: "whatsapp",
    difficulty: "easy",
    prompt_text: "Rewrite a hurried message into a calm, clear reply.",
  },
] as const;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureTodayChallenge() {
  const supabase = getSupabaseAdmin();
  const date = todayKey();
  const { data: existing } = await supabase
    .from("writeright_daily_challenges")
    .select("id, date, title, description, mode, difficulty, prompt_text")
    .eq("date", date)
    .maybeSingle();
  if (existing) return existing;

  const index = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000) % CHALLENGES.length;
  const seed = CHALLENGES[index];
  const { data, error } = await supabase
    .from("writeright_daily_challenges")
    .insert({ date, ...seed })
    .select("id, date, title, description, mode, difficulty, prompt_text")
    .single();
  if (error || !data) throw createApiError("DB_ERROR", "Failed to load challenge", 500);
  return data;
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.challenges.today.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const challenge = await ensureTodayChallenge();
      const [{ count }, { data: top }, { data: userCompletion }] = await Promise.all([
        supabase
          .from("writeright_challenge_completions")
          .select("id", { head: true, count: "exact" })
          .eq("challenge_id", challenge.id),
        supabase
          .from("writeright_challenge_completions")
          .select("score")
          .eq("challenge_id", challenge.id)
          .order("score", { ascending: false })
          .limit(1),
        supabase
          .from("writeright_challenge_completions")
          .select("score")
          .eq("challenge_id", challenge.id)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      return NextResponse.json({
        challenge_id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        mode: challenge.mode,
        difficulty: challenge.difficulty,
        completions_today: count ?? 0,
        top_score_today: top?.[0]?.score ?? 0,
        user_completed: Boolean(userCompletion),
        user_score: userCompletion?.score,
      });
    });
  });
}
