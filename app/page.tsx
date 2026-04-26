import { RevealObserver } from '@/hooks/useRevealObserver'
import Navbar from '@/components/layout/Navbar'
import Hero from '@/components/sections/Hero'
import SocialProof from '@/components/sections/SocialProof'
import Features from '@/components/sections/Features'

import { CardFeature } from '@/components/sections/CardFeature'
import Pricing from '@/components/sections/Pricing'
import FAQ from '@/components/sections/FAQ'
import CTA from '@/components/sections/CTA'
import Footer from '@/components/layout/Footer'

export default function Home() {
  return (
    <>
      <RevealObserver />
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <Features />
        <CardFeature />
        <div style={{ marginTop: '-120px' }}>
          <Pricing />
        </div>
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
