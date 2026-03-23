'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { fmtDuration, Session } from '@/types'

type Period = 'day' | 'week' | 'month'

function getWeekStart(date: Date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0,0,0,0)
  return d
}

function getHeatmapData(sessions: Session[]) {
  const today = new Date()
  const data: { date: string; sec: number }[] = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const sec = sessions
      .filter(s => s.date === dateStr)
      .reduce((sum, s) => sum + s.duration, 0)
    data.push({ date: dateStr, sec })
  }
  return data
}

export default function StatsTab() {
  const { userId, theme, subjects, goal } = useApp()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')

  const loadSessions = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select('*, session_tags(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setSessions(data || [])
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Period data
  const getPeriodSessions = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'day') {
      return sessions.filter(s => s.date === today.toLocaleDateString('en-CA'))
    } else if (period === 'week') {
      const weekStart = getWeekStart(now)
      return sessions.filter(s => new Date(s.date) >= weekStart)
    } else {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return sessions.filter(s => new Date(s.date) >= monthStart)
    }
  }

  const periodSessions = getPeriodSessions()
  const totalSec = periodSessions.reduce((sum, s) => sum + s.duration, 0)

  // Bar chart data
  const getBarData = () => {
    const now = new Date()
    if (period === 'day') {
      // 24 hours
      const hours: { label: string; sec: number }[] = []
      for (let h = 0; h < 24; h++) {
        const todayStr = now.toLocaleDateString('en-CA')
        const sec = sessions
          .filter(s => s.date === todayStr && parseInt(s.start_time?.slice(0, 2) ?? '0') === h)
          .reduce((sum, s) => sum + s.duration, 0)
        hours.push({ label: `${h}時`, sec })
      }
      return hours.filter(h => h.sec > 0 || h.label === `${now.getHours()}時`)
    } else if (period === 'week') {
      const weekDays = ['日','月','火','水','木','金','土']
      return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(getWeekStart(now))
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const sec = sessions.filter(s => s.date === dateStr).reduce((sum, s) => sum + s.duration, 0)
        return { label: weekDays[i], sec }
      })
    } else {
      // Last 12 months
      return Array.from({ length: 30 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), 1)
        d.setDate(d.getDate() + i)
        if (d.getMonth() !== now.getMonth()) return null
        const dateStr = d.toISOString().split('T')[0]
        const sec = sessions.filter(s => s.date === dateStr).reduce((sum, s) => sum + s.duration, 0)
        return { label: String(d.getDate()), sec }
      }).filter(Boolean) as { label: string; sec: number }[]
    }
  }

  const barData = getBarData()
  const maxSec = Math.max(...barData.map(d => d.sec), 1)

  // Subject breakdown
  const subjectData = subjects.map(s => ({
    ...s,
    sec: periodSessions.filter(sess => sess.subject_id === s.id).reduce((sum, sess) => sum + sess.duration, 0),
  })).filter(s => s.sec > 0).sort((a, b) => b.sec - a.sec)

  // Tag breakdown
  const tagData: Record<string, number> = {}
  periodSessions.forEach(s => {
    ;(s.session_tags as any[] || []).forEach((t: any) => {
      tagData[t.tag] = (tagData[t.tag] || 0) + s.duration
    })
  })
  const tagList = Object.entries(tagData).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Streak
  const calcStreak = () => {
    const days = new Set(sessions.map(s => s.date))
    let streak = 0
    let current = new Date()
    while (true) {
      const dateStr = current.toISOString().split('T')[0]
      if (days.has(dateStr)) {
        streak++
        current.setDate(current.getDate() - 1)
      } else break
    }
    return streak
  }

  // Heatmap
  const heatmapData = getHeatmapData(sessions)
  const maxHeat = Math.max(...heatmapData.map(d => d.sec), 1)

  const getHeatColor = (sec: number) => {
    if (sec === 0) return theme.border
    const intensity = Math.min(sec / maxHeat, 1)
    if (intensity < 0.25) return theme.accentLight
    if (intensity < 0.5) return theme.accent + '88'
    if (intensity < 0.75) return theme.accent + 'BB'
    return theme.accent
  }

  const streak = calcStreak()
  const goalSec = period === 'day' ? (goal?.daily_minutes || 120) * 60
    : period === 'week' ? (goal?.weekly_minutes || 600) * 60
    : (goal?.weekly_minutes || 600) * 60 * 4
  const goalProgress = Math.min(totalSec / goalSec * 100, 100)

  if (loading) return <div style={{ textAlign: 'center', color: theme.textSub, padding: 32 }}>読み込み中...</div>

  return (
    <div>
      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['day','week','month'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            flex: 1, padding: '8px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${period===p ? theme.accent : theme.border}`,
            background: period===p ? theme.accent : theme.card,
            color: period===p ? '#fff' : theme.textSub,
          }}>
            {p === 'day' ? '今日' : p === 'week' ? '今週' : '今月'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 4 }}>合計時間</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.accent }}>{fmtDuration(totalSec)}</div>
        </div>
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 4 }}>🔥 連続日数</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{streak}日</div>
        </div>
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 4 }}>セッション数</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{periodSessions.length}回</div>
        </div>
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 4 }}>目標達成率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: goalProgress >= 100 ? theme.success : theme.text }}>
            {Math.round(goalProgress)}%
          </div>
        </div>
      </div>

      {/* Goal progress bar */}
      <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>目標進捗</span>
          <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(totalSec)} / {fmtDuration(goalSec)}</span>
        </div>
        <div style={{ height: 8, background: theme.border, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${goalProgress}%`, background: goalProgress >= 100 ? theme.success : theme.accent, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Bar chart */}
      {barData.length > 0 && (
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 12 }}>時間分布</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, overflowX: 'auto' }}>
            {barData.map((d, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: period === 'month' ? 12 : 20, flex: period === 'week' ? 1 : 'none' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{
                    height: Math.max(d.sec / maxSec * 60, d.sec > 0 ? 4 : 0),
                    background: d.sec > 0 ? theme.accent : theme.border,
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: theme.textSub, marginTop: 2 }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject breakdown */}
      {subjectData.length > 0 && (
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 12 }}>教科別</div>
          {subjectData.map(s => (
            <div key={s.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: theme.text }}>{s.icon} {s.name}</span>
                <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(s.sec)}</span>
              </div>
              <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${s.sec/totalSec*100}%`, background: s.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tag breakdown */}
      {tagList.length > 0 && (
        <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>タグ別</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tagList.map(([tag, sec]) => (
              <div key={tag} style={{ background: theme.accentLight, borderRadius: 20, padding: '4px 12px', display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>#{tag}</span>
                <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(sec)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap */}
      <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>学習ヒートマップ（直近12週）</div>
        <div>
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gap: 2 }}>
            {heatmapData.map((d, i) => (
              <div
                key={i}
                title={`${d.date}: ${fmtDuration(d.sec)}`}
                style={{ width: 11, height: 11, borderRadius: 2, background: getHeatColor(d.sec) }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
