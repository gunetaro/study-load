'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { fmtDuration, Session } from '@/types'

type Tab = 'today' | 'week' | 'month' | 'subject'

function getWeekStart(date: Date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0,0,0,0)
  return d
}

function dateStr(d: Date) { return d.toISOString().split('T')[0] }

export default function StatsTab() {
  const { userId, theme, subjects, goal } = useApp()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)

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

  const now = new Date()
  const todayStr = dateStr(now)

  // ── Derived data ──
  const todaySessions = useMemo(() => sessions.filter(s => s.date === todayStr), [sessions, todayStr])

  const weekStart = useMemo(() => {
    const ws = getWeekStart(now)
    ws.setDate(ws.getDate() + weekOffset * 7)
    return ws
  }, [weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekEnd = useMemo(() => {
    const we = new Date(weekStart)
    we.setDate(we.getDate() + 6)
    return we
  }, [weekStart])

  const weekSessions = useMemo(() =>
    sessions.filter(s => { const d = new Date(s.date); return d >= weekStart && d <= weekEnd }),
  [sessions, weekStart, weekEnd])

  const monthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps
  const monthSessions = useMemo(() =>
    sessions.filter(s => { const d = new Date(s.date); return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() }),
  [sessions, monthDate])

  // Previous week/month for comparison
  const prevWeekStart = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); return d }, [weekStart])
  const prevWeekEnd = useMemo(() => { const d = new Date(prevWeekStart); d.setDate(d.getDate() + 6); return d }, [prevWeekStart])
  const prevWeekSessions = useMemo(() =>
    sessions.filter(s => { const d = new Date(s.date); return d >= prevWeekStart && d <= prevWeekEnd }),
  [sessions, prevWeekStart, prevWeekEnd])

  const prevMonthDate = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1), [monthDate])
  const prevMonthSessions = useMemo(() =>
    sessions.filter(s => { const d = new Date(s.date); return d.getFullYear() === prevMonthDate.getFullYear() && d.getMonth() === prevMonthDate.getMonth() }),
  [sessions, prevMonthDate])

  // Helpers
  const totalSec = (ss: Session[]) => ss.reduce((sum, s) => sum + s.duration, 0)
  const subjectBreakdown = (ss: Session[]) =>
    subjects.map(s => ({ ...s, sec: ss.filter(sess => sess.subject_id === s.id).reduce((sum, sess) => sum + sess.duration, 0) }))
      .filter(s => s.sec > 0).sort((a, b) => b.sec - a.sec)

  const diffLabel = (cur: number, prev: number) => {
    const diff = cur - prev
    if (diff === 0) return null
    const sign = diff > 0 ? '+' : ''
    return `${sign}${fmtDuration(Math.abs(diff))} ${diff > 0 ? '↑' : '↓'}`
  }

  // Streak
  const streak = useMemo(() => {
    const days = new Set(sessions.map(s => s.date))
    let count = 0
    let d = new Date()
    while (days.has(dateStr(d))) { count++; d.setDate(d.getDate() - 1) }
    return count
  }, [sessions])

  // Heatmap
  const heatmapData = useMemo(() => {
    const data: { date: string; sec: number }[] = []
    for (let i = 167; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = dateStr(d)
      data.push({ date: ds, sec: sessions.filter(s => s.date === ds).reduce((sum, s) => sum + s.duration, 0) })
    }
    return data
  }, [sessions])

  const maxHeat = Math.max(...heatmapData.map(d => d.sec), 1)
  const getHeatColor = (sec: number) => {
    if (sec === 0) return theme.border
    const i = Math.min(sec / maxHeat, 1)
    return i < 0.25 ? theme.accentLight : i < 0.5 ? theme.accent + '88' : i < 0.75 ? theme.accent + 'BB' : theme.accent
  }

  // Tag breakdown (month)
  const tagData = useMemo(() => {
    const data: Record<string, number> = {}
    monthSessions.forEach(s => (s.session_tags as any[] || []).forEach((t: any) => { data[t.tag] = (data[t.tag] || 0) + s.duration }))
    return Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [monthSessions])

  // ── Render helpers ──
  const SubjectBars = ({ ss }: { ss: Session[] }) => {
    const data = subjectBreakdown(ss)
    const total = totalSec(ss)
    if (data.length === 0) return <div style={{ fontSize: 13, color: theme.textSub, padding: 8 }}>データなし</div>
    return (
      <>
        {data.map(s => (
          <div key={s.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 13, color: theme.text }}>{s.icon} {s.name}</span>
              <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(s.sec)}</span>
            </div>
            <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${total > 0 ? s.sec/total*100 : 0}%`, background: s.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </>
    )
  }

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 12, border: `1px solid ${theme.border}`, ...style }}>
      {children}
    </div>
  )

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>{children}</div>
  )

  if (loading) return <div style={{ textAlign: 'center', color: theme.textSub, padding: 32 }}>読み込み中...</div>

  return (
    <div>
      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['today','今日'],['week','週間'],['month','月間'],['subject','教科別']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${tab===t ? theme.accent : theme.border}`,
            background: tab===t ? theme.accent : theme.card,
            color: tab===t ? '#fff' : theme.textSub,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════ TODAY ════════ */}
      {tab === 'today' && (
        <>
          {/* Summary */}
          <Card>
            <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 2 }}>今日の合計</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: theme.accent }}>{fmtDuration(totalSec(todaySessions))}</div>
            <div style={{ fontSize: 12, color: theme.textSub }}>{todaySessions.length}セッション</div>
          </Card>

          {/* Session horizontal bars */}
          {todaySessions.length > 0 && (
            <Card>
              <SectionTitle>セッション一覧</SectionTitle>
              {todaySessions.map((s, i) => {
                const subj = subjects.find(sub => sub.id === s.subject_id)
                const maxDur = Math.max(...todaySessions.map(ss => ss.duration), 1)
                return (
                  <div key={s.id} style={{ marginBottom: i < todaySessions.length - 1 ? 8 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: theme.text }}>{s.start_time?.slice(0,5) || ''} {subj?.icon} {subj?.name}</span>
                      <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(s.duration)}</span>
                    </div>
                    <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${s.duration/maxDur*100}%`, background: subj?.color || theme.accent, borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </Card>
          )}

          {/* Subject bars */}
          <Card>
            <SectionTitle>教科別進捗</SectionTitle>
            <SubjectBars ss={todaySessions} />
          </Card>

          {/* Hourly distribution */}
          <Card>
            <SectionTitle>学習時間帯</SectionTitle>
            {(() => {
              const hours = Array.from({ length: 24 }, (_, h) => ({
                h, sec: todaySessions.filter(s => parseInt(s.start_time?.slice(0, 2) ?? '0') === h).reduce((sum, s) => sum + s.duration, 0)
              })).filter(x => x.sec > 0)
              if (hours.length === 0) return <div style={{ fontSize: 13, color: theme.textSub }}>データなし</div>
              const maxH = Math.max(...hours.map(x => x.sec), 1)
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                  {hours.map(x => (
                    <div key={x.h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ height: Math.max(x.sec / maxH * 48, 4), width: '100%', background: theme.accent, borderRadius: '3px 3px 0 0' }} />
                      <div style={{ fontSize: 9, color: theme.textSub, marginTop: 2 }}>{x.h}時</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>
        </>
      )}

      {/* ════════ WEEK ════════ */}
      {tab === 'week' && (() => {
        const weekTotal = totalSec(weekSessions)
        const prevTotal = totalSec(prevWeekSessions)
        const diff = diffLabel(weekTotal, prevTotal)
        const weekDays = ['日','月','火','水','木','金','土']
        const dailyData = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart); d.setDate(d.getDate() + i)
          const ds = dateStr(d)
          // Per-subject stacks
          const subjectStacks = subjects.map(sub => ({
            color: sub.color,
            sec: weekSessions.filter(s => s.date === ds && s.subject_id === sub.id).reduce((sum, s) => sum + s.duration, 0),
          })).filter(x => x.sec > 0)
          return { label: weekDays[i], total: subjectStacks.reduce((sum, x) => sum + x.sec, 0), stacks: subjectStacks }
        })
        const maxDay = Math.max(...dailyData.map(d => d.total), 1)

        const fmtWeekRange = () => {
          const fmt = (d: Date) => `${d.getMonth()+1}/${d.getDate()}`
          return `${fmt(weekStart)} 〜 ${fmt(weekEnd)}`
        }

        return (
          <>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{fmtWeekRange()}</span>
                <button onClick={() => setWeekOffset(o => Math.min(o + 1, 0))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: weekOffset >= 0 ? theme.border : theme.textSub }} disabled={weekOffset >= 0}>›</button>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: theme.accent, marginBottom: 2 }}>{fmtDuration(weekTotal)}</div>
              {diff && <div style={{ fontSize: 12, color: weekTotal >= prevTotal ? theme.success : theme.danger }}>{diff} 前週比</div>}
            </Card>

            {/* Stacked bar chart */}
            <Card>
              <SectionTitle>日別学習時間</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                {dailyData.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', height: Math.max(d.total / maxDay * 64, d.total > 0 ? 4 : 0), display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                      {d.stacks.map((s, j) => (
                        <div key={j} style={{ height: d.total > 0 ? `${s.sec/d.total*100}%` : 0, background: s.color, minHeight: s.sec > 0 ? 2 : 0 }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: theme.textSub, marginTop: 2 }}>{d.label}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle>教科別進捗</SectionTitle>
              <SubjectBars ss={weekSessions} />
            </Card>
          </>
        )
      })()}

      {/* ════════ MONTH ════════ */}
      {tab === 'month' && (() => {
        const monthTotal = totalSec(monthSessions)
        const prevTotal = totalSec(prevMonthSessions)
        const diff = diffLabel(monthTotal, prevTotal)
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
        const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1)
          const ds = dateStr(d)
          return { label: String(i + 1), sec: sessions.filter(s => s.date === ds).reduce((sum, s) => sum + s.duration, 0) }
        })
        const maxDay = Math.max(...dailyData.map(d => d.sec), 1)
        const activeDays = new Set(monthSessions.map(s => s.date)).size

        return (
          <>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{monthDate.getFullYear()}年{monthDate.getMonth()+1}月</span>
                <button onClick={() => setMonthOffset(o => Math.min(o + 1, 0))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: monthOffset >= 0 ? theme.border : theme.textSub }} disabled={monthOffset >= 0}>›</button>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: theme.accent, marginBottom: 2 }}>{fmtDuration(monthTotal)}</div>
              {diff && <div style={{ fontSize: 12, color: monthTotal >= prevTotal ? theme.success : theme.danger }}>{diff} 前月比</div>}
            </Card>

            {/* Daily bar chart */}
            <Card>
              <SectionTitle>日別</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, overflowX: 'auto' }}>
                {dailyData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 10, flex: 1 }}>
                    <div style={{ height: Math.max(d.sec / maxDay * 48, d.sec > 0 ? 3 : 0), width: '100%', background: d.sec > 0 ? theme.accent : theme.border, borderRadius: '2px 2px 0 0' }} />
                    {(i === 0 || i === daysInMonth - 1 || (i + 1) % 5 === 0) && (
                      <div style={{ fontSize: 8, color: theme.textSub, marginTop: 1 }}>{d.label}</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Streak + heatmap */}
            <Card>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: theme.textSub }}>🔥 連続日数</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{streak}日</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: theme.textSub }}>学習日数</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{activeDays}日</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: theme.textSub }}>セッション</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{monthSessions.length}回</div>
                </div>
              </div>
              <SectionTitle>ヒートマップ（24週）</SectionTitle>
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gap: 2 }}>
                {heatmapData.map((d, i) => (
                  <div key={i} title={`${d.date}: ${fmtDuration(d.sec)}`} style={{ width: 11, height: 11, borderRadius: 2, background: getHeatColor(d.sec) }} />
                ))}
              </div>
            </Card>

            {/* Tags */}
            {tagData.length > 0 && (
              <Card>
                <SectionTitle>タグ別</SectionTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tagData.map(([tag, sec]) => (
                    <div key={tag} style={{ background: theme.accentLight, borderRadius: 20, padding: '4px 12px', display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>#{tag}</span>
                      <span style={{ fontSize: 12, color: theme.textSub }}>{fmtDuration(sec)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Cumulative stats */}
            <Card>
              <SectionTitle>累計</SectionTitle>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: theme.textSub }}>総学習時間</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent }}>{fmtDuration(totalSec(sessions))}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: theme.textSub }}>総学習日数</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{new Set(sessions.map(s => s.date)).size}日</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: theme.textSub }}>総セッション</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{sessions.length}回</div>
                </div>
              </div>
            </Card>
          </>
        )
      })()}

      {/* ════════ SUBJECT ════════ */}
      {tab === 'subject' && (() => {
        const subjectStats = subjects.map(sub => {
          const ss = sessions.filter(s => s.subject_id === sub.id)
          const sec = totalSec(ss)
          const days = new Set(ss.map(s => s.date)).size
          // 7-day sparkline
          const spark = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - 6 + i)
            return ss.filter(s => s.date === dateStr(d)).reduce((sum, s) => sum + s.duration, 0)
          })
          return { ...sub, sec, sessions: ss.length, days, avgPerDay: days > 0 ? sec / days : 0, spark }
        }).filter(s => s.sec > 0).sort((a, b) => b.sec - a.sec)

        return (
          <>
            {subjectStats.length === 0 && (
              <Card><div style={{ fontSize: 13, color: theme.textSub, textAlign: 'center' }}>データなし</div></Card>
            )}
            {subjectStats.map(s => {
              const maxSpark = Math.max(...s.spark, 1)
              return (
                <Card key={s.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmtDuration(s.sec)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: theme.textSub }}>セッション</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{s.sessions}回</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: theme.textSub }}>学習日数</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{s.days}日</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: theme.textSub }}>平均/日</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{fmtDuration(Math.round(s.avgPerDay))}</div>
                    </div>
                  </div>
                  {/* 7-day sparkline */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 24 }}>
                    {s.spark.map((v, i) => (
                      <div key={i} style={{ flex: 1, height: Math.max(v / maxSpark * 20, v > 0 ? 3 : 1), background: v > 0 ? s.color : theme.border, borderRadius: 2, opacity: v > 0 ? 0.8 : 0.3 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: theme.textSub }}>7日前</span>
                    <span style={{ fontSize: 9, color: theme.textSub }}>今日</span>
                  </div>
                </Card>
              )
            })}
          </>
        )
      })()}
    </div>
  )
}
