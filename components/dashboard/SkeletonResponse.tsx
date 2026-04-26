export function SkeletonResponse() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="skeleton" style={{ width: 56, height: 9 }} />
      <div className="skeleton" style={{ width: '68%', height: 20 }} />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <div className="skeleton" style={{ width: '92%', height: 13 }} />
      <div className="skeleton" style={{ width: '78%', height: 13 }} />
      <div className="skeleton" style={{ width: '85%', height: 13 }} />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <div style={{ background: 'var(--panel-bg)', borderRadius: 'var(--r-md)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="skeleton" style={{ width: '55%', height: 11 }} />
        <div className="skeleton" style={{ width: '75%', height: 11 }} />
        <div className="skeleton" style={{ width: '40%', height: 11 }} />
      </div>
    </div>
  )
}
