import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function Page() {
  return (
    <AuthShell
      title="Start learning."
      subtitle="Join 220K+ developers and students worldwide."
    >
      <SignUp
        routing="path"
        path="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          elements: {
            cardBox: "shadow-none bg-transparent mx-auto",
            card: "shadow-none bg-transparent",
            headerTitle: "text-[color:var(--ink-900)] font-heading font-semibold",
            headerSubtitle: "text-[color:var(--ink-600)] font-sans",
            socialButtonsBlockButton:
              "border border-[color:var(--surface-300)] bg-[color:var(--surface-glass)] hover:bg-[color:var(--surface-200)] transition-colors rounded-xl",
            formButtonPrimary:
              "bg-[linear-gradient(120deg,var(--brand-600),var(--brand-500))] hover:opacity-90 text-white rounded-[14px] font-sans font-semibold h-11 transition-opacity",
            formFieldInput:
              "border border-[color:var(--surface-300)] bg-[color:var(--surface-glass)] focus:border-[color:var(--brand-600)] text-[color:var(--ink-900)] rounded-xl font-sans focus:ring-2 focus:ring-[color:var(--brand-600)]/20",
            formFieldLabel: "text-[color:var(--ink-700)] font-sans font-medium",
            footer: "bg-transparent",
            footerActionLink: "text-[color:var(--brand-600)] hover:text-[color:var(--brand-500)] font-sans font-medium",
            dividerLine: "bg-[color:var(--surface-300)]",
            dividerText: "text-[color:var(--ink-600)] font-sans",
          },
        }}
      />
    </AuthShell>
  );
}
