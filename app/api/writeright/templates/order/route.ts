// FILE: app/api/writeright/templates/order/route.ts
// PURPOSE: PUT route to update the sort order of user templates for drag-and-drop persistence.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { withErrorHandler, createApiError } from "@/lib/writeright-errors"
import { withSpan, addSpanAttributes } from "@/lib/tracing"
import { z } from "zod"

const OrderSchema = z.object({
  ids: z.array(z.string().uuid())
})

export async function PUT(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.templates.order.update", async () => {
      const { userId } = await auth()
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401)
      addSpanAttributes({ "user.id": userId })

      let body
      try {
        body = await req.json()
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON format", 400)
      }

      const parsed = OrderSchema.safeParse(body)
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid template IDs list", 400, { issues: parsed.error.issues })
      }

      const { ids } = parsed.data
      const supabase = getSupabaseAdmin()

      // Update sort order sequentially or in parallel batches
      // Since supabase does not support atomic batch updates with different values easily in a single RPC,
      // we perform updates in parallel. To be robust, we filter strictly by user_id.
      const updatePromises = ids.map((id, index) =>
        supabase
          .from("writeright_templates")
          .update({ sort_order: index, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId)
      )

      const results = await Promise.all(updatePromises)
      const error = results.find(res => res.error)

      if (error) {
        throw createApiError("DB_ERROR", "Failed to update templates ordering", 500)
      }

      return NextResponse.json({ success: true })
    })
  )
}
