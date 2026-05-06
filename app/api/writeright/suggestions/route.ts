import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError, WriteRightError } from "@/lib/writeright-errors";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.suggestions.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      const { searchParams } = new URL(req.url);
      const jobId = searchParams.get("jobId");

      if (!jobId) {
          throw createApiError("VALIDATION_ERROR", "jobId is required", 400);
      }

      // 1. Rate limit
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const limitKey = ns("writeright", "suggestions", "ratelimit", userId);
          const count = await redis.incr(limitKey);
          if (count === 1) await redis.expire(limitKey, 60);
          if (count > 30) throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429);
        } catch (err) {
            if (err instanceof WriteRightError) throw err;
        }
      }

      // 2. Check Cache
      if (!isCircuitOpen()) {
          try {
              const redis = getRedisPool();
              const cacheKey = ns("writeright", "suggestions", jobId);
              const cached = await redis.get(cacheKey);
              if (cached) return NextResponse.json(JSON.parse(cached));
          } catch {
              // Ignore cache read errors
          }
      }

      // 3. Get Improved Text
      const supabase = getSupabaseAdmin();
      const { data: job } = await supabase.from("writeright_ai_jobs").select("output").eq("id", jobId).eq("user_id", userId).single();

      if (!job || !job.output || typeof job.output !== 'object') {
          throw createApiError("NOT_FOUND", "Job output not found", 404);
      }

      const output = job.output as Record<string, unknown>;
      const text = output.improved_text;

      if (!text) {
           return NextResponse.json({ suggestions: ["Make it formal", "Make it shorter", "Fix grammar"] });
      }

      // 4. Fast AI call
      let suggestions = ["Make it formal", "Make it shorter", "Fix grammar"];
      try {
        const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
        if (apiKey) {
           const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
               method: "POST",
               headers: {
                   "Authorization": `Bearer ${apiKey}`,
                   "Content-Type": "application/json"
               },
               body: JSON.stringify({
                   model: "gemini-2.0-flash", // Use stable model name
                   messages: [
                       { role: "system", content: "You are an AI assistant. Given the text, suggest exactly 3 specific next edits as short action chips (≤ 8 words each). Return a JSON array of strings: [\"suggestion 1\", \"suggestion 2\", \"suggestion 3\"]" },
                       { role: "user", content: text }
                   ],
                   max_tokens: 50,
                   temperature: 0.4
               })
           });

           if (response.ok) {
               const data = await response.json();
               const content = data.choices[0]?.message?.content;
               if (content) {
                   const parsed = JSON.parse(content);
                   if (Array.isArray(parsed) && parsed.length === 3) {
                       suggestions = parsed.map(s => String(s).slice(0, 50));
                   }
               }
           }
        }
      } catch (err) {
          console.error("[api.writeright.suggestions] AI call failed:", err);
      }

      // 5. Cache result
      const result = { suggestions };
      if (!isCircuitOpen()) {
          try {
              const redis = getRedisPool();
              await redis.setex(ns("writeright", "suggestions", jobId), 600, JSON.stringify(result));
          } catch {
              // Ignore cache write errors
          }
      }

      return NextResponse.json(result);
    });
  });
}
