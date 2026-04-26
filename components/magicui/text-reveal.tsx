'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { FC, ReactNode, useRef } from 'react'
import { cn } from '@/lib/utils'

interface TextRevealProps {
  children: string
  className?: string
}

export const TextReveal: FC<TextRevealProps> = ({ children, className }) => {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({ target: targetRef, offset: ['start 0.9', 'start 0.25'] })

  if (typeof children !== 'string') {
    throw new TypeError('TextReveal children must be a string')
  }

  const words = children.split(' ')

  return (
    <div ref={targetRef} className={cn('relative z-0', className)}>
      <p className="flex flex-wrap gap-x-[0.22em] gap-y-1">
        {words.map((word, i) => {
          const start = i / words.length
          const end = start + 1 / words.length
          return (
            <Word key={i} progress={scrollYProgress} range={[start, end]}>
              {word}
            </Word>
          )
        })}
      </p>
    </div>
  )
}

interface WordProps {
  children: ReactNode
  progress: ReturnType<typeof useScroll>['scrollYProgress']
  range: [number, number]
}

const Word: FC<WordProps> = ({ children, progress, range }) => {
  const opacity = useTransform(progress, range, [0.15, 1])
  return (
    <motion.span style={{ opacity }} className="text-[var(--panel-text)]">
      {children}
    </motion.span>
  )
}
