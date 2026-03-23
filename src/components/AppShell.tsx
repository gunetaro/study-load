'use client'
import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { Toast } from '@/components/ui/Toast'
import { LevelUpPopup } from '@/components/ui/LevelUpPopup'
import TimerTab from '@/components/tabs/TimerTab'
import TimelineTab from '@/components/tabs/TimelineTab'
import MaterialsTab from '@/components/tabs/MaterialsTab'
import StatsTab from '@/components/tabs/StatsTab'
import ProfileTab from '@/components/tabs/ProfileTab'

type Tab = 'timer' | 'timeline' | 'materials' | 'stats' | 'profile'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'timer', icon: '⏱', label: 'タイマー' },
  { id: 'timeline', icon: '📅', label: '記録' },
  { id: 'stats', icon: '📊', label: '統計' },
  { id: 'materials', icon: '📚', label: '教材' },
  { id: 'profile', icon: '👤', label: 'マイ' },
]

const TAB_TITLES: Record<Tab, string> = {
  timer: 'タイマー',
  timeline: '学習記録',
  materials: '教科・教材',
  stats: '統計',
  profile: 'マイページ',
}

export default function AppShell() {
  const { theme, profile, isDemo } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>('timer')

  return (
    <div style={{
      minHeight: '100dvh',
      background: theme.bg,
      fontFamily: "'DM Sans', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 90px' }}>
        {activeTab === 'timer' && <TimerTab />}
        {activeTab === 'timeline' && <TimelineTab />}
        {activeTab === 'materials' && <MaterialsTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </div>

      {/* Bottom Navigation */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: theme.card, borderTop: `1px solid ${theme.border}`,
        display: 'flex', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, border: 'none', background: 'none',
              padding: '10px 0 8px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span style={{ fontSize: activeTab === tab.id ? 22 : 20, transition: 'transform 0.15s', transform: activeTab === tab.id ? 'translateY(-2px)' : 'none' }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 10, fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? theme.accent : theme.textSub,
            }}>
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: theme.accent, marginTop: -2 }} />
            )}
          </button>
        ))}
      </div>

      <Toast />
      <LevelUpPopup />
    </div>
  )
}
