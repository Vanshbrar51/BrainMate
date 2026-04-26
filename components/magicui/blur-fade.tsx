'use client'

import { AnimatePresence, motion, Variants } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

interface BlurFadeProps {
  children: React.ReactNode
  className?: string
  variant?: Variants
  duration?: number
  delay?: number
  inView?: boolean
  inViewMargin?: string
  blur?: string
}

export function BlurFade({
  children,
  className,
  variant,
  duration = 0.5,
  delay = 0,
  inView = false,
  inViewMargin = '-50px',
  blur = '8px',
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inViewResult, setInViewResult] = useState(false)
  const isVisible = !inView || inViewResult

  useEffect(() => {
    if (!inView) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInViewResult(true); observer.disconnect() } },
      { rootMargin: inViewMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, inViewMargin])

  const defaultVariants: Variants = {
    hidden: { opacity: 0, y: 8, filter: `blur(${blur})` },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { delay, duration, ease: [0.16, 1, 0.3, 1] },
    },
  }

  const combinedVariants = variant ?? defaultVariants

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial="hidden"
        animate={isVisible ? 'visible' : 'hidden'}
        exit="hidden"
        variants={combinedVariants}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
