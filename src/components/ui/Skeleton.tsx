'use client'

const shimmerStyle = (border: string, borderLight: string): React.CSSProperties => ({
  background: `linear-gradient(90deg, ${border} 25%, ${borderLight} 50%, ${border} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
})

export function SkeletonBox({ w, h, r = 8, style }: { w: string | number; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function SkeletonCircle({ size }: { size: number }) {
  return <div className="sk" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} />
}

function Wrap({ children, border, borderLight }: { children: React.ReactNode; border: string; borderLight: string }) {
  const bg = shimmerStyle(border, borderLight)
  return (
    <>
      <style>{`
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .sk { ${Object.entries(bg).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';')} }
      `}</style>
      {children}
    </>
  )
}

export function TimerSkeleton({ border, borderLight }: { border: string; borderLight: string }) {
  return (
    <Wrap border={border} borderLight={borderLight}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SkeletonCircle size={32} />
        <SkeletonBox w={120} h={16} />
        <div style={{ flex: 1 }} />
        <SkeletonBox w={60} h={16} />
      </div>
      {/* Progress card */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, padding: 12, borderRadius: 14 }}>
        <SkeletonCircle size={56} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBox w={100} h={14} />
          <SkeletonBox w="80%" h={10} />
          <SkeletonBox w="100%" h={6} r={3} />
        </div>
      </div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
        <SkeletonBox w={80} h={32} r={20} />
        <SkeletonBox w={100} h={32} r={20} />
      </div>
      {/* Subject grid */}
      <SkeletonBox w={140} h={12} style={{ marginBottom: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[...Array(6)].map((_, i) => <SkeletonBox key={i} w="100%" h={72} r={14} />)}
      </div>
      {/* Mini chart */}
      <SkeletonBox w="100%" h={80} r={14} />
    </Wrap>
  )
}

export function TimelineSkeleton({ border, borderLight }: { border: string; borderLight: string }) {
  return (
    <Wrap border={border} borderLight={borderLight}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <SkeletonBox w={80} h={18} />
        <div style={{ flex: 1 }} />
        <SkeletonBox w={100} h={30} r={10} />
      </div>
      {/* Search */}
      <SkeletonBox w="100%" h={38} r={10} style={{ marginBottom: 8 }} />
      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[50, 60, 55, 65].map((w, i) => <SkeletonBox key={i} w={w} h={24} r={12} />)}
      </div>
      {/* Session cards */}
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          {i === 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <SkeletonBox w={80} h={12} />
            <SkeletonBox w={120} h={12} />
          </div>}
          <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden' }}>
            <SkeletonBox w={4} h={72} r={0} />
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <SkeletonBox w={100} h={12} />
                <SkeletonBox w={60} h={12} />
              </div>
              <SkeletonBox w="70%" h={10} />
            </div>
          </div>
        </div>
      ))}
    </Wrap>
  )
}

export function StatsSkeleton({ border, borderLight }: { border: string; borderLight: string }) {
  return (
    <Wrap border={border} borderLight={borderLight}>
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[...Array(5)].map((_, i) => <SkeletonBox key={i} w="100%" h={30} r={10} style={{ flex: 1 }} />)}
      </div>
      {/* Big card */}
      <SkeletonBox w="100%" h={80} r={14} style={{ marginBottom: 12 }} />
      {/* Two cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <SkeletonBox w="100%" h={64} r={14} />
        <SkeletonBox w="100%" h={64} r={14} />
      </div>
      {/* Chart */}
      <SkeletonBox w="100%" h={100} r={14} />
    </Wrap>
  )
}

export function ProfileSkeleton({ border, borderLight }: { border: string; borderLight: string }) {
  return (
    <Wrap border={border} borderLight={borderLight}>
      {/* Header image */}
      <SkeletonBox w="100%" h={120} r={0} style={{ borderRadius: '20px 20px 0 0' }} />
      {/* Avatar */}
      <div style={{ marginTop: -28, marginLeft: 16, marginBottom: 6 }}>
        <SkeletonCircle size={56} />
      </div>
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', marginBottom: 10, gap: 8 }}>
        <SkeletonBox w={120} h={18} />
        <div style={{ flex: 1 }} />
        <SkeletonBox w={60} h={24} r={10} />
      </div>
      {/* Rank card */}
      <SkeletonBox w="100%" h={90} r={14} style={{ marginBottom: 8 }} />
      {/* Badge card */}
      <SkeletonBox w="100%" h={60} r={14} style={{ marginBottom: 8 }} />
      {/* Title card */}
      <SkeletonBox w="100%" h={36} r={14} style={{ marginBottom: 10 }} />
      {/* Menu grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[...Array(6)].map((_, i) => <SkeletonBox key={i} w="100%" h={40} r={12} />)}
      </div>
    </Wrap>
  )
}
