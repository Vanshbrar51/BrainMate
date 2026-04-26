"use client";
import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useAuth } from "@clerk/nextjs";

// Layout
import { FloatingNav } from "@/components/aceternity/floating-nav";
import { ThemeSelector } from "@/components/ui/ThemeSelector";

// Sections
import { HeroSection } from "@/components/sections/hero-section";
import { SocialProofSection } from "@/components/sections/social-proof-section";
import { ProductsSection } from "@/components/sections/products-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { MetricsSection } from "@/components/sections/metrics-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { FAQSection } from "@/components/sections/faq-section";
import { CTASection } from "@/components/sections/cta-section";
import { Footer } from "@/components/sections/footer";

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { isSignedIn } = useAuth();

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      // Setup hero counter animation
      gsap.from("[data-counter]", {
        textContent: 0,
        duration: 2,
        ease: "power2.out",
        snap: { textContent: 1 },
        stagger: 0.15,
        delay: 0.8,
      });

      // Scroll-based batch reveal for ALL sections
      ScrollTrigger.batch("[data-reveal]", {
        onEnter: (elements) => {
          gsap.fromTo(
            elements,
            { opacity: 0, y: 48, filter: "blur(8px)" },
            {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              duration: 0.9,
              stagger: 0.08,
              ease: "power3.out",
              clearProps: "all",
            }
          );
        },
        start: "top 82%",
        once: true,
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const navItems = [
    { name: "Home", link: "/" },
    { name: "Features", link: "#products" },
    { name: "Pricing", link: "#pricing" },
    { name: "FAQ", link: "#faq" },
  ];

  return (
    <div ref={rootRef} className="min-h-screen selection:bg-[color:var(--brand-600)] selection:text-white bg-[color:var(--background)]">
      <FloatingNav
        navItems={navItems}
        rightActions={
          <>
            <ThemeSelector />
            <a
              href={isSignedIn ? "/dashboard" : "/sign-up"}
              className="bg-[linear-gradient(120deg,var(--brand-600),var(--brand-500))] text-white text-sm font-semibold py-1.5 px-4 rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {isSignedIn ? "Dashboard" : "Try Free"}
            </a>
          </>
        }
      />

      <main className="flex flex-col overflow-hidden relative">
        <HeroSection />
        <SocialProofSection />
        <div id="products">
          <ProductsSection />
        </div>
        <HowItWorksSection />
        <MetricsSection />
        <div id="pricing">
          <PricingSection />
        </div>
        <TestimonialsSection />
        <div id="faq">
          <FAQSection />
        </div>
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
