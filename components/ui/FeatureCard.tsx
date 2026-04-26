interface FeatureCardProps {
  children: React.ReactNode
  className?: string
}

export default function FeatureCard({ children, className = '' }: FeatureCardProps) {
  return (
    <div
      className={`hover-lift rounded-[24px] border border-[var(--border)] bg-[color:rgba(255,255,255,0.72)] shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm ${className}`}
      style={{
        transition: 'transform var(--transition-base), box-shadow var(--transition-base), border-color var(--transition-fast)',
      }}
    >
      {children}
    </div>
  )
}
