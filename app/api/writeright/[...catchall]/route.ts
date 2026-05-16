import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withErrorHandler } from "@/lib/writeright-errors";
import { withSpan } from "@/lib/tracing";

export async function GET(req: Request) { return withErrorHandler(req, handler); }
export async function POST(req: Request) { return withErrorHandler(req, handler); }
export async function PUT(req: Request) { return withErrorHandler(req, handler); }
export async function PATCH(req: Request) { return withErrorHandler(req, handler); }
export async function DELETE(req: Request) { return withErrorHandler(req, handler); }

async function handler() {
  return withSpan("api.writeright.not_found", async () => {
    await auth().catch(() => null);
    return NextResponse.json(
      {
        error: "NOT_FOUND",
        message: "This WriteRight endpoint does not exist.",
        docs: "https://brainmate.ai/docs/writeright",
      },
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  });
}
