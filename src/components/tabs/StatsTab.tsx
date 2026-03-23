'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { fmtDuration, Session } from '@/types'
import { StatsSkeleton } from '@/components/ui/Skeleton'
import { getDemoSessions } from '@/lib/demo-data'

type Tab = 'total' | 'today' | 'week' | 'month' | 'subject'

function getWeekStart(date: Date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0,0,0,0)
  return d
}

function ds(d: Date) { return d.toISOString().split('T')[0] }

export default function StatsTab() {
  const { userId, theme, subjects, goal, isDemo } = useApp()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('total')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    if (isDemo) { setSessions(getDemoSessions()); setLoading(false); return }
    const { data } = await supabase
      .from('sessions').select('*, session_tags(*)').eq('user_id', userId).order('created_at', { ascending: false })
    setSessions(data || [])
    setLoading(false)
  }, [userId, supabase, isDemo])

  useEffect(() => { loadSessions() }, [loadSessions])

  const now = new Date()
  const todayStr = ds(now)

  // ── Helpers ──
  const tot = (ss: Session[]) => ss.reduce((sum, s) => sum + s.duration, 0)

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: theme.card, borderRadius: 14, padding: '14px 16px', marginBottom: 12, border: `1px solid ${theme.border}`, ...style }}>{children}</div>
  )
  const Title = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>{children}</div>
  )

  // ── Period data ──
  const todaySessions = useMemo(() => sessions.filter(s => s.date === todayStr), [sessions, todayStr])

  const weekStart = useMemo(() => { const w = getWeekStart(now); w.setDate(w.getDate() + weekOffset * 7); return w }, [weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekEnd = useMemo(() => { const e = new Date(weekStart); e.setDate(e.getDate() + 6); return e }, [weekStart])
  const weekSessions = useMemo(() => sessions.filter(s => { const d = new Date(s.date); return d >= weekStart && d <= weekEnd }), [sessions, weekStart, weekEnd])
  const prevWeekStart = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); return d }, [weekStart])
  const prevWeekEnd = useMemo(() => { const d = new Date(prevWeekStart); d.setDate(d.getDate() + 6); return d }, [prevWeekStart])
  const prevWeekSessions = useMemo(() => sessions.filter(s => { const d = new Date(s.date); return d >= prevWeekStart && d <= prevWeekEnd }), [sessions, prevWeekStart, prevWeekEnd])

  const monthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps
  const monthSessions = useMemo(() => sessions.filter(s => { const d = new Date(s.date); return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() }), [sessions, monthDate])
  const prevMonthDate = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1), [monthDate])
  const prevMonthSessions = useMemo(() => sessions.filter(s => { const d = new Date(s.date); return d.getFullYear() === prevMonthDate.getFullYear() && d.getMonth() === prevMonthDate.getMonth() }), [sessions, prevMonthDate])

  // Streak
  const { streak, maxStreak } = useMemo(() => {
    const days = new Set(sessions.map(s => s.date))
    let cur = 0, max = 0, d = new Date()
    while (days.has(ds(d))) { cur++; d.setDate(d.getDate() - 1) }
    // Max streak scan
    const sorted = [...days].sort()
    let run = 0
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { run = 1 } else {
        const prev = new Date(sorted[i-1]); prev.setDate(prev.getDate() + 1)
        run = ds(prev) === sorted[i] ? run + 1 : 1
      }
      if (run > max) max = run
    }
    return { streak: cur, maxStreak: Math.max(max, cur) }
  }, [sessions])

  // Heatmap
  const heatmapData = useMemo(() => {
    const data: { date: string; sec: number }[] = []
    for (let i = 167; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const s = ds(d); data.push({ date: s, sec: sessions.filter(x => x.date === s).reduce((sum, x) => sum + x.duration, 0) }) }
    return data
  }, [sessions])
  const maxHeat = Math.max(...heatmapData.map(d => d.sec), 1)
  const heatColor = (sec: number) => {
    if (sec === 0) return theme.border
    const i = Math.min(sec / maxHeat, 1)
    return i < 0.25 ? theme.accentLight : i < 0.5 ? theme.accent + '88' : i < 0.75 ? theme.accent + 'BB' : theme.accent
  }

  // Tags (all time for total, month for month)
  const tagData = useMemo(() => {
    const src = tab === 'month' ? monthSessions : sessions
    const d: Record<string, number> = {}
    src.forEach(s => (s.session_tags as any[] || []).forEach((t: any) => { d[t.tag] = (d[t.tag] || 0) + s.duration }))
    return Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [sessions, monthSessions, tab])

  // Subject bars component
  const SubjectBars = ({ ss }: { ss: Session[] }) => {
    const total = tot(ss)
    const data = subjects.map(s => ({ ...s, sec: ss.filter(x => x.subject_id === s.id).reduce((sum, x) => sum + x.duration, 0) })).filter(s => s.sec > 0).sort((a, b) => b.sec - a.sec)
    if (!data.length) return <div style={{ fontSize: 12, color: theme.textSub }}>データなし</div>
    const goalDaily = (goal?.daily_minutes ?? 120) * 60
    return <>{data.map(s => (
      <div key={s.id} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 12, color: theme.text }}>{s.icon} {s.name}</span>
          <span style={{ fontSize: 11, color: theme.textSub }}>{fmtDuration(s.sec)}{total > 0 ? ` / ${fmtDuration(goalDaily)}` : ''}</span>
        </div>
        <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${Math.min(total > 0 ? s.sec/total*100 : 0, 100)}%`, background: s.color, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      </div>
    ))}</>
  }

  // Diff label
  const diffLabel = (cur: number, prev: number) => {
    const d = cur - prev
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${fmtDuration(Math.abs(d))}`, up: d > 0 }
  }

  // Study style label
  const studyStyleLabel = (ss: Session[]) => {
    const hours = Array.from({ length: 24 }, (_, h) => ss.filter(s => parseInt(s.start_time?.slice(0, 2) ?? '0') === h).reduce((sum, s) => sum + s.duration, 0))
    const peak = hours.indexOf(Math.max(...hours))
    if (peak >= 5 && peak < 12) return '🌅 朝型勉強スタイル'
    if (peak >= 12 && peak < 17) return '☀️ 昼型勉強スタイル'
    if (peak >= 17 && peak < 21) return '🌇 夕方型勉強スタイル'
    return '🌙 夜型勉強スタイル'
  }

  if (loading) return <StatsSkeleton border={theme.border} borderLight={theme.cardAlt} />

  return (
    <div>
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {([['total','累計'],['today','今日'],['week','週間'],['month','月間'],['subject','教科別']] as [Tab,string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '7px 2px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${tab===t ? theme.accent : theme.border}`,
            background: tab===t ? theme.accent : theme.card,
            color: tab===t ? '#fff' : theme.textSub,
          }}>
            {l}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          TOTAL
         ════════════════════════════════════════════════ */}
      {tab === 'total' && <>
        <Card>
          <div style={{ fontSize: 11, color: theme.textSub }}>総学習時間</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: theme.accent }}>{fmtDuration(tot(sessions))}</div>
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: theme.textSub }}>総学習日数</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{new Set(sessions.map(s => s.date)).size}日</div>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: theme.textSub }}>総セッション</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{sessions.length}回</div>
          </Card>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: theme.textSub }}>🔥 連続日数</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{streak}日</div>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: theme.textSub }}>🏆 最長連続</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{maxStreak}日</div>
          </Card>
        </div>
        <Card>
          <Title>ヒートマップ（24週）</Title>
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gap: 2 }}>
            {heatmapData.map((d, i) => (
              <div key={i} title={`${d.date}: ${fmtDuration(d.sec)}`} style={{ width: 11, height: 11, borderRadius: 2, background: heatColor(d.sec) }} />
            ))}
          </div>
        </Card>
        {tagData.length > 0 && (
          <Card>
            <Title>タグ別</Title>
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
      </>}

      {/* ════════════════════════════════════════════════
          TODAY
         ════════════════════════════════════════════════ */}
      {tab === 'today' && <>
        <Card>
          <div style={{ fontSize: 11, color: theme.textSub }}>今日の合計</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: theme.accent }}>{fmtDuration(tot(todaySessions))}</div>
          <div style={{ fontSize: 12, color: theme.textSub }}>{todaySessions.length}セッション</div>
        </Card>

        {/* Session bars */}
        {todaySessions.length > 0 && (
          <Card>
            <Title>セッション一覧</Title>
            {todaySessions.map((s, i) => {
              const sub = subjects.find(x => x.id === s.subject_id)
              const maxD = Math.max(...todaySessions.map(x => x.duration), 1)
              return (
                <div key={s.id} style={{ marginBottom: i < todaySessions.length - 1 ? 8 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: theme.text }}>{s.start_time?.slice(0,5)} {sub?.icon} {sub?.name}</span>
                    <span style={{ fontSize: 11, color: theme.textSub }}>{fmtDuration(s.duration)}</span>
                  </div>
                  <div style={{ height: 8, background: theme.border, borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${s.duration/maxD*100}%`, background: sub?.color || theme.accent, borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </Card>
        )}

        {/* Subject progress */}
        <Card>
          <Title>教科別進捗</Title>
          <SubjectBars ss={todaySessions} />
        </Card>

        {/* Hourly distribution — full 24h */}
        <Card>
          <Title>学習時間帯</Title>
          {(() => {
            const hours = Array.from({ length: 24 }, (_, h) => ({
              h, sec: todaySessions.filter(s => parseInt(s.start_time?.slice(0,2) ?? '0') === h).reduce((sum, s) => sum + s.duration, 0)
            }))
            const maxH = Math.max(...hours.map(x => x.sec), 1)
            const peakH = hours.reduce((p, c) => c.sec > p.sec ? c : p, hours[0]).h
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, marginBottom: 4 }}>
                  {hours.map(x => (
                    <div key={x.h} style={{
                      flex: 1,
                      height: x.sec > 0 ? Math.max(x.sec / maxH * 56, 4) : 2,
                      background: x.h === peakH && x.sec > 0 ? theme.accent : x.sec > 0 ? theme.accent + '66' : theme.border,
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.5s ease',
                      opacity: x.sec > 0 ? 1 : 0.4,
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {[0,6,12,18,24].map(h => <span key={h} style={{ fontSize: 9, color: theme.textSub }}>{h}時</span>)}
                </div>
                <div style={{ fontSize: 12, color: theme.textSub, marginTop: 8, textAlign: 'center' }}>
                  {studyStyleLabel(todaySessions)}
                </div>
              </>
            )
          })()}
        </Card>
      </>}

      {/* ════════════════════════════════════════════════
          WEEK
         ════════════════════════════════════════════════ */}
      {tab === 'week' && (() => {
        const wTotal = tot(weekSessions)
        const pTotal = tot(prevWeekSessions)
        const diff = diffLabel(wTotal, pTotal)
        const dayLabels = ['日','月','火','水','木','金','土']
        const dailyData = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart); d.setDate(d.getDate() + i)
          return { label: dayLabels[i], dateStr: ds(d), sec: weekSessions.filter(s => s.date === ds(d)).reduce((sum, s) => sum + s.duration, 0), isToday: ds(d) === todayStr }
        })
        const maxDay = Math.max(...dailyData.map(d => d.sec), 1)
        const fmtShort = (sec: number) => { const m = Math.round(sec / 60); return m > 0 ? `${m}m` : '' }
        const fmtRange = () => `${weekStart.getMonth()+1}/${weekStart.getDate()} 〜 ${weekEnd.getMonth()+1}/${weekEnd.getDate()}`

        return <>
          <Card>
            <div style={{ fontSize: 11, color: theme.textSub }}>今週の合計</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: theme.accent }}>{fmtDuration(wTotal)}</div>
            {diff && (
              <div style={{ fontSize: 12, color: diff.up ? theme.success : theme.danger }}>
                {diff.up ? '↑' : '↓'} 前週比 {diff.text}　先週: {fmtDuration(pTotal)}
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub, padding: '0 8px' }}>◀</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{fmtRange()}</span>
              <button onClick={() => setWeekOffset(o => Math.min(o + 1, 0))} disabled={weekOffset >= 0} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: weekOffset >= 0 ? theme.border : theme.textSub, padding: '0 8px' }}>▶</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
              {dailyData.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 9, color: theme.textSub, marginBottom: 2, minHeight: 12 }}>{fmtShort(d.sec)}</div>
                  <div style={{
                    width: '100%',
                    height: d.sec > 0 ? Math.max(d.sec / maxDay * 68, 6) : 3,
                    background: d.isToday ? theme.accent : d.sec > 0 ? theme.accent + '55' : theme.border,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s ease',
                    opacity: d.sec > 0 ? 1 : 0.3,
                  }} />
                  <div style={{ fontSize: 10, color: d.isToday ? theme.accent : theme.textSub, fontWeight: d.isToday ? 700 : 400, marginTop: 3 }}>{d.label}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <Title>教科別進捗</Title>
            <SubjectBars ss={weekSessions} />
          </Card>
        </>
      })()}

      {/* ════════════════════════════════════════════════
          MONTH
         ════════════════════════════════════════════════ */}
      {tab === 'month' && (() => {
        const mTotal = tot(monthSessions)
        const pTotal = tot(prevMonthSessions)
        const diff = diffLabel(mTotal, pTotal)
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
        const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1)
          return { day: i + 1, sec: sessions.filter(s => s.date === ds(d)).reduce((sum, s) => sum + s.duration, 0) }
        })
        const maxDay = Math.max(...dailyData.map(d => d.sec), 1)
        const xLabels = [1, 5, 10, 15, 20, 25, 30, daysInMonth].filter((v, i, a) => a.indexOf(v) === i && v <= daysInMonth)

        return <>
          <Card>
            <div style={{ fontSize: 11, color: theme.textSub }}>{monthDate.getFullYear()}年{monthDate.getMonth()+1}月</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: theme.accent }}>{fmtDuration(mTotal)}</div>
            {diff && (
              <div style={{ fontSize: 12, color: diff.up ? theme.success : theme.danger }}>
                {diff.text} {diff.up ? '↑' : '↓'} 前月比
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub, padding: '0 8px' }}>◀</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{monthDate.getFullYear()}年{monthDate.getMonth()+1}月</span>
              <button onClick={() => setMonthOffset(o => Math.min(o + 1, 0))} disabled={monthOffset >= 0} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: monthOffset >= 0 ? theme.border : theme.textSub, padding: '0 8px' }}>▶</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 64, marginBottom: 4 }}>
              {dailyData.map((d, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: d.sec > 0 ? Math.max(d.sec / maxDay * 56, 4) : 2,
                  background: d.sec > 0 ? theme.accent : theme.border,
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.5s ease',
                  opacity: d.sec > 0 ? 1 : 0.3,
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {xLabels.map(d => <span key={d} style={{ fontSize: 8, color: theme.textSub }}>{d}</span>)}
            </div>
          </Card>
        </>
      })()}

      {/* ════════════════════════════════════════════════
          SUBJECT
         ════════════════════════════════════════════════ */}
      {tab === 'subject' && (() => {
        const stats = subjects.map(sub => {
          const ss = sessions.filter(s => s.subject_id === sub.id)
          const sec = tot(ss)
          const days = new Set(ss.map(s => s.date)).size
          const spark = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - 6 + i)
            return ss.filter(s => s.date === ds(d)).reduce((sum, s) => sum + s.duration, 0)
          })
          return { ...sub, sec, count: ss.length, days, avg: days > 0 ? Math.round(sec / days) : 0, spark }
        }).filter(s => s.sec > 0).sort((a, b) => b.sec - a.sec)

        if (!stats.length) return <Card><div style={{ fontSize: 12, color: theme.textSub, textAlign: 'center' }}>データなし</div></Card>

        const sparkDays = ['月','火','水','木','金','土','日']

        return <>{stats.map(s => {
          const maxS = Math.max(...s.spark, 1)
          return (
            <Card key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{fmtDuration(s.sec)}</span>
              </div>
              <div style={{ fontSize: 12, color: theme.textSub, marginBottom: 8 }}>
                {s.count}回　{s.days}日　平均{fmtDuration(s.avg)}/日
              </div>
              {/* Sparkline */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
                {s.spark.map((v, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: v > 0 ? Math.max(v / maxS * 18, 3) : 2,
                    background: v > 0 ? s.color : theme.border,
                    borderRadius: 2,
                    opacity: v > 0 ? 0.8 : 0.3,
                    transition: 'height 0.5s ease',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                {sparkDays.map(d => <span key={d} style={{ fontSize: 8, color: theme.textSub, flex: 1, textAlign: 'center' }}>{d}</span>)}
              </div>
            </Card>
          )
        })}</>
      })()}
    </div>
  )
}
