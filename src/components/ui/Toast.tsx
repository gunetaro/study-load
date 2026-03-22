'use client'
import { useApp } from '@/contexts/AppContext'

export function Toast() {
  const { toast, theme } = useApp()
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      background: theme.text, color: theme.card,
      padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
      zIndex: 2000, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.2s ease',
    }}>
      {toast}
    </div>
  )
}
