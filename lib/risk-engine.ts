// lib/risk-engine.ts — Risk engine client for Next.js
//
// Interprets risk assessment headers from the Rust gateway and handles
// step-up authentication requirements on the frontend.

import { addSpanAttributes, addSpanEvent } from "@/lib/tracing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskAction =
  | "allow"
  | "log_and_monitor"
  | "require_step_up"
  | "block_and_invalidate";

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  action: RiskAction;
  signals: Array<{
    name: string;
    weight: number;
    detail: string;
  }>;
}

// ---------------------------------------------------------------------------
// Response Header Parser
// ---------------------------------------------------------------------------

/**
 * Extract risk assessment from gateway response headers.
 * The Rust gateway sets these headers on authenticated responses:
 *   x-risk-score: 45
 *   x-risk-level: medium
 *   x-risk-action: log_and_monitor
 *   x-step-up-required: true  (when action = require_step_up)
 */
export function parseRiskHeaders(headers: Headers): RiskAssessment | null {
  const scoreHeader = headers.get("x-risk-score");
  if (!scoreHeader) return null;

  const score = parseInt(scoreHeader, 10);
  if (isNaN(score)) return null;

  return {
    score,
    level: (headers.get("x-risk-level") as RiskLevel) || "low",
    action: (headers.get("x-risk-action") as RiskAction) || "allow",
    signals: [], // Signals are not sent in headers (privacy)
  };
}

/**
 * Check if the gateway response requires step-up authentication.
 */
export function requiresStepUp(headers: Headers): boolean {
  return headers.get("x-step-up-required") === "true";
}

// ---------------------------------------------------------------------------
// Step-Up Auth Flow
// ---------------------------------------------------------------------------

/**
 * Handle step-up authentication requirement.
 * Redirects to MFA verification or triggers OTP flow.
 */
export async function handleStepUpAuth(
  assessment: RiskAssessment,
  options: {
    redirectUrl?: string;
    onRequireOTP?: () => Promise<void>;
  } = {},
): Promise<void> {
  addSpanAttributes({
    "risk.score": assessment.score,
    "risk.level": assessment.level,
    "risk.action": assessment.action,
  });

  switch (assessment.action) {
    case "require_step_up":
      addSpanEvent("risk.step_up_required");
      if (options.onRequireOTP) {
        await options.onRequireOTP();
      } else if (options.redirectUrl) {
        if (typeof window !== "undefined") {
          window.location.href = options.redirectUrl;
        }
      }
      break;

    case "block_and_invalidate":
      addSpanEvent("risk.blocked", { score: assessment.score });
      // Force sign-out — the gateway has already invalidated the session
      if (typeof window !== "undefined") {
        window.location.href = "/sign-in?error=session_invalidated";
      }
      break;

    default:
      // allow or log_and_monitor — no action needed
      break;
  }
}

// ---------------------------------------------------------------------------
// Risk Score Display Utility
// ---------------------------------------------------------------------------

/**
 * Get a human-readable risk level label and color for UI display.
 */
export function getRiskDisplay(level: RiskLevel): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (level) {
    case "low":
      return { label: "Low Risk", color: "#16a34a", bgColor: "#dcfce7" };
    case "medium":
      return { label: "Medium Risk", color: "#ca8a04", bgColor: "#fef9c3" };
    case "high":
      return { label: "High Risk", color: "#ea580c", bgColor: "#ffedd5" };
    case "critical":
      return { label: "Critical Risk", color: "#dc2626", bgColor: "#fef2f2" };
  }
}
