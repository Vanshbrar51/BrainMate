import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

interface AnimatedShinyTextProps {
  children: ReactNode
  className?: string
  shimmerWidth?: number
}

export function AnimatedShinyText({
  children,
  className,
  shimmerWidth = 100,
}: AnimatedShinyTextProps) {
  return (
    <p
      style={
        {
          '--shimmer-width': `${shimmerWidth}px`,
          backgroundImage: 'linear-gradient(to right, transparent, var(--accent-subtle) 50%, transparent)',
        } as CSSProperties
      }
      className={cn(
        'animated-shiny-text',
        'animate-shimmer-slide bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shimmer-width)_100%] [transition:background-position_1s_cubic-bezier(.6,.6,0,1)_infinite]',
        className,
      )}
    >
      {children}
    </p>
  )
}
