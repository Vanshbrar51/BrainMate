'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface ShimmerButtonProps {
  children: ReactNode
  className?: string
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  style?: CSSProperties
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  href?: string
  type?: 'button' | 'submit'
}

export function ShimmerButton({
  children,
  className,
  shimmerColor = 'rgba(255, 248, 235, 0.15)',
  shimmerSize = '0.05em',
  borderRadius = '12px',
  shimmerDuration = '3s',
  background = 'var(--text-1)',
  style,
  onClick,
}: ShimmerButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <button
      ref={buttonRef}
      style={
        {
          '--spread': '90deg',
          '--shimmer-color': shimmerColor,
          '--radius': borderRadius,
          '--speed': shimmerDuration,
          '--cut': shimmerSize,
          '--bg': background,
          background: 'var(--bg)',
          ...style,
        } as CSSProperties
      }
      className={cn(
        'group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border-0 px-7 py-3',
        'transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] hover:scale-[1.01]',
        className,
      )}
      onClick={onClick}
    >
      {/* Shimmer sweep */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-[-100%] animate-[spin_3s_linear_infinite]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, var(--shimmer-color) 10deg, transparent 20deg)`,
          }}
        />
      </div>

      {/* Actual background fill */}
      <div
        className="absolute inset-[1px] z-10"
        style={{ background, borderRadius: `calc(${borderRadius} - 1px)` }}
        aria-hidden="true"
      />

      {/* Content */}
      <span className="relative z-20" style={{ color: 'var(--text-inv)' }}>{children}</span>
    </button>
  )
}
