'use client'
import { useApp } from '@/contexts/AppContext'

export function LevelUpPopup() {
  const { levelUpInfo, clearLevelUp, theme } = useApp()
  if (!levelUpInfo) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={clearLevelUp}>
      <div style={{
        background: theme.card, borderRadius: 24, padding: '40px 32px',
        textAlign: 'center', animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: theme.accent, marginBottom: 4 }}>
          LEVEL UP!
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, color: theme.text, marginBottom: 8 }}>
          Lv.{levelUpInfo.level}
        </div>
        <div style={{ fontSize: 16, color: theme.textSub, marginBottom: 24 }}>
          {levelUpInfo.rank} に昇格！
        </div>
        <button onClick={clearLevelUp} style={{
          background: theme.accent, color: '#fff', border: 'none',
          borderRadius: 12, padding: '12px 32px', fontSize: 15, fontWeight: 700,
          cursor: 'pointer',
        }}>
          OK
        </button>
      </div>
    </div>
  )
}
