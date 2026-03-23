'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { SubjectIconDisplay } from '@/components/ui/SubjectIconPicker'
import { fmtTime, fmtDuration, BADGES, XP_PER_MIN, RANKS, getRank, XP_PER_LEVEL, Subject, Material, Session } from '@/types'

type TimerMode = 'normal' | 'pomodoro'
type TimerState = 'idle' | 'subject' | 'material' | 'running' | 'paused' | 'saving' | 'pomo_break'
type DisplayMode = 'timer' | 'clock'

export default function TimerTab() {
  const { subjects, refreshSubjects, userId, userMeta, profile, goal, theme, settings, showToast, refreshProfile, refreshBadges, badges } = useApp()
  const supabase = createClient()

  const [mode, setMode] = useState<TimerMode>('normal')
  const [state, setState] = useState<TimerState>('idle')
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [memo, setMemo] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [showSave, setShowSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('timer')
  const [clockTime, setClockTime] = useState(new Date())

  // Pomodoro
  const pomoWork = settings?.pomo_settings?.work ?? 25
  const pomoShort = settings?.pomo_settings?.short ?? 5
  const pomoRounds = settings?.pomo_settings?.rounds ?? 4
  const [pomoPhase, setPomoPhase] = useState<'work' | 'break'>('work')
  const [pomoRound, setPomoRound] = useState(1)
  const [pomoRemaining, setPomoRemaining] = useState(pomoWork * 60)
  const [pomoElapsed, setPomoElapsed] = useState(0)

  // Today's sessions for idle screen
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const [weekData, setWeekData] = useState<number[]>([0,0,0,0,0,0,0])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const hiddenStartRef = useRef<number>(0)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  // Visibility API (スマホ封印)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenStartRef.current = Date.now()
        if (state === 'running') {
          clearInterval(intervalRef.current!)
          setState('paused')
          showToast('タブ離脱を検出。タイマーを一時停止しました')
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state, showToast])

  // Timer tick
  useEffect(() => {
    if (state === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsed(e => e + 1)
        if (mode === 'pomodoro') {
          setPomoRemaining(r => {
            if (r <= 1) {
              clearInterval(intervalRef.current!)
              if (pomoPhase === 'work') {
                setPomoElapsed(pe => pe + pomoWork * 60)
                setState('pomo_break')
                showToast(`${pomoRound}ポモ完了！休憩しましょう`)
                return pomoShort * 60
              } else {
                if (pomoRound >= pomoRounds) {
                  setState('paused')
                  showToast('全ポモドーロ完了！お疲れ様でした')
                  return 0
                }
                setPomoRound(rnd => rnd + 1)
                setPomoPhase('work')
                setState('running')
                return pomoWork * 60
              }
            }
            return r - 1
          })
        }
      }, 1000)
    } else {
      clearInterval(intervalRef.current!)
    }
    return () => clearInterval(intervalRef.current!)
  }, [state, mode, pomoPhase, pomoRound, pomoRounds, pomoWork, pomoShort, showToast])

  // Clock tick (fullscreen時計モード用)
  const isFullscreen = state === 'running' || state === 'paused' || state === 'pomo_break'
  useEffect(() => {
    if (!isFullscreen) return
    const id = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [isFullscreen])

  // Auto-hide fullscreen controls after 4s
  useEffect(() => {
    if (!isFullscreen || state === 'pomo_break') return
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current) }
  }, [isFullscreen, state])

  const handleScreenTap = () => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
  }

  // Load today's sessions + week data for idle screen
  useEffect(() => {
    if (!userId) return
    const today = new Date().toLocaleDateString('en-CA')
    supabase.from('sessions').select('*').eq('user_id', userId).eq('date', today).then(({ data }) => setTodaySessions(data || []))
    // Week data
    const ws = new Date(); ws.setDate(ws.getDate() - ws.getDay()); ws.setHours(0,0,0,0)
    const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0] })
    const weStart = dates[0]
    const weEnd = dates[6]
    supabase.from('sessions').select('date, duration').eq('user_id', userId).gte('date', weStart).lte('date', weEnd).then(({ data }) => {
      const w = [0,0,0,0,0,0,0]
      ;(data || []).forEach(s => { const idx = dates.indexOf(s.date); if (idx >= 0) w[idx] += s.duration })
      setWeekData(w)
    })
  }, [userId, state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Past tag suggestions
  useEffect(() => {
    if (!showSave || !userId) return
    supabase.from('session_tags').select('tag').then(({ data }) => {
      if (data) {
        const unique = [...new Set(data.map(d => d.tag))].sort()
        setTagSuggestions(unique)
      }
    })
  }, [showSave, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMaterials = async (subjectId: string) => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
    setMaterials(data || [])
  }

  const handleSelectSubject = async (s: Subject) => {
    setSelectedSubject(s)
    await loadMaterials(s.id)
    setState('material')
  }

  const handleStartTimer = (mat?: Material) => {
    if (mat) setSelectedMaterial(mat)
    else setSelectedMaterial(null)
    setElapsed(0)
    setPomoRemaining(pomoWork * 60)
    setPomoElapsed(0)
    setPomoRound(1)
    setPomoPhase('work')
    setState('running')
    startTimeRef.current = Date.now()
  }

  const handlePause = () => {
    if (state === 'running') setState('paused')
    else if (state === 'paused') setState('running')
  }

  const handleStop = () => {
    setState('paused')
    setShowSave(true)
  }

  const confirmTag = () => {
    const t = tagInput.trim().replace(/^#+/, '')
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      confirmTag()
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleSave = async () => {
    if (!selectedSubject) return
    setSaving(true)
    const totalSec = mode === 'pomodoro' ? (pomoElapsed + (pomoPhase === 'work' ? elapsed % (pomoWork*60) : 0)) : elapsed
    if (totalSec < 10) { showToast('10秒未満は記録できません'); setSaving(false); return }

    const startDate = new Date(startTimeRef.current)
    const date = startDate.toLocaleDateString('en-CA')
    const start_time = startDate.toTimeString().slice(0, 8)
    const insertPayload = {
      user_id: userId,
      subject_id: selectedSubject.id,
      material_id: selectedMaterial?.id || null,
      date,
      start_time,
      duration: totalSec,
      memo: memo || null,
    }
    console.log('[sessions] insert payload:', JSON.stringify(insertPayload))
    const { data: session, error } = await supabase.from('sessions').insert(insertPayload).select().single()

    if (error) {
      console.error('[sessions] insert error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }))
      showToast('保存に失敗しました')
      setSaving(false)
      return
    }

    // Tags
    const allTags = tagInput.trim() ? [...tags, tagInput.trim().replace(/^#+/, '')] : tags
    if (allTags.length > 0 && session) {
      const tagList = allTags.map(tag => ({ session_id: session.id, tag }))
      const { error: tagError } = await supabase.from('session_tags').insert(tagList)
      if (tagError) {
        console.error('[session_tags] insert error:', tagError.code, tagError.message)
      }
    }

    // XP: 1 XP per minute
    const xpGain = Math.floor(totalSec / 60) * XP_PER_MIN
    if (xpGain > 0) {
      const { data: prof } = await supabase.from('profiles').select('xp').eq('id', userId).single()
      if (prof) {
        await supabase.from('profiles').update({ xp: prof.xp + xpGain }).eq('id', userId)
        await refreshProfile()
      }
    }

    // Badge check
    await checkBadges(totalSec)

    showToast(`${fmtDuration(totalSec)} 記録しました！+${xpGain}XP`)
    setSaving(false)
    setShowSave(false)
    setMemo('')
    setTags([])
    setTagInput('')
    setElapsed(0)
    setState('idle')
    setSelectedSubject(null)
    setSelectedMaterial(null)
  }

  const checkBadges = async (sessionSec: number) => {
    const { data: todaySessions } = await supabase
      .from('sessions')
      .select('duration')
      .eq('user_id', userId)
      .gte('date', new Date().toLocaleDateString('en-CA'))
    const todayTotal = (todaySessions || []).reduce((sum, s) => sum + s.duration, 0)

    const newBadges: string[] = []
    const hasBadge = (key: string) => badges.some(b => b.badge_key === key)

    if (!hasBadge('first_session')) newBadges.push('first_session')
    if (todayTotal >= 3600 && !hasBadge('daily_1h')) newBadges.push('daily_1h')
    if (todayTotal >= 7200 && !hasBadge('daily_2h')) newBadges.push('daily_2h')
    if (todayTotal >= 10800 && !hasBadge('daily_3h')) newBadges.push('daily_3h')
    if (todayTotal >= 18000 && !hasBadge('daily_5h')) newBadges.push('daily_5h')

    if (newBadges.length > 0) {
      await supabase.from('badge_awards').insert(
        newBadges.map(key => ({ user_id: userId, badge_key: key }))
      )
      const totalXp = newBadges.reduce((sum, key) => {
        const badge = BADGES.find(b => b.key === key)
        return sum + (badge?.xp || 0)
      }, 0)
      if (totalXp > 0) {
        const { data: prof } = await supabase.from('profiles').select('xp').eq('id', userId).single()
        if (prof) {
          await supabase.from('profiles').update({ xp: prof.xp + totalXp }).eq('id', userId)
        }
      }
      await refreshBadges()
      await refreshProfile()
      showToast(`🏅 バッジ獲得！${newBadges.map(k => BADGES.find(b=>b.key===k)?.emoji).join('')}`)
    }
  }

  const handleCancel = () => {
    setShowSave(false)
    setElapsed(0)
    setState('idle')
    setSelectedSubject(null)
    setSelectedMaterial(null)
    setMemo('')
    setTags([])
    setTagInput('')
  }

  const handleBreakResume = () => {
    setPomoPhase('work')
    setState('running')
    setPomoRemaining(pomoWork * 60)
  }

  // --- Renders ---
  if (state === 'idle' || state === 'subject') {
    const xp = profile?.xp || 0
    const level = Math.floor(xp / 100) + 1
    const rank = getRank(level)
    const displayAvatar = profile?.avatar_url || userMeta?.avatar_url || ''
    const displayInitial = (profile?.name || userMeta?.full_name || 'U')[0]

    const todayTotalSec = todaySessions.reduce((sum, s) => sum + s.duration, 0)
    const todayMin = Math.round(todayTotalSec / 60)
    const goalMin = goal?.daily_minutes ?? 120
    const remaining = Math.max(goalMin - todayMin, 0)
    const progress = Math.min(todayMin / goalMin * 100, 100)

    // Per-subject today minutes
    const subjectTodayMin: Record<string, number> = {}
    todaySessions.forEach(s => { subjectTodayMin[s.subject_id] = (subjectTodayMin[s.subject_id] || 0) + Math.round(s.duration / 60) })

    const weekDays = ['日','月','火','水','木','金','土']
    const todayDow = new Date().getDay()
    const maxWeek = Math.max(...weekData, 1)

    // Progress ring SVG
    const ringSize = 56, ringStroke = 5, ringR = (ringSize - ringStroke) / 2
    const ringCirc = 2 * Math.PI * ringR
    const ringOffset = ringCirc - (progress / 100) * ringCirc

    return (
      <div>
        {/* 1. Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          {displayAvatar ? (
            <img src={displayAvatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', marginRight: 8 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: theme.accent, marginRight: 8 }}>
              {displayInitial}
            </div>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1 }}>Study Load</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSub }}>Lv.{level} {rank.emoji}</span>
        </div>

        {/* 2. Today's progress card */}
        <div style={{ background: theme.card, borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Ring */}
          <div style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0 }}>
            <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none" stroke={theme.border} strokeWidth={ringStroke} />
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none" stroke={theme.accent} strokeWidth={ringStroke}
                strokeDasharray={ringCirc} strokeDashoffset={ringOffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: theme.accent, lineHeight: 1 }}>{todayMin}</span>
              <span style={{ fontSize: 9, color: theme.textSub }}>/ {goalMin}分</span>
            </div>
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 2 }}>今日の進捗</div>
            <div style={{ fontSize: 11, color: theme.textSub, marginBottom: 6 }}>
              {progress >= 100 ? '目標達成！' : `あと${remaining}分で目標達成！`}
            </div>
            <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? theme.success : theme.accent, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>

        {/* 3. Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, justifyContent: 'center' }}>
          {(['normal','pomodoro'] as TimerMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '7px 20px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${mode===m ? theme.accent : theme.border}`,
              background: mode===m ? theme.accent : theme.card,
              color: mode===m ? '#fff' : theme.textSub,
            }}>
              {m === 'normal' ? '通常' : '⚡ ポモドーロ'}
            </button>
          ))}
        </div>

        {mode === 'pomodoro' && (
          <div style={{ background: theme.card, borderRadius: 12, padding: '8px 14px', marginBottom: 10, border: `1px solid ${theme.border}`, display: 'flex', gap: 10, fontSize: 11, color: theme.textSub, justifyContent: 'center' }}>
            <span>作業{pomoWork}分</span><span>休憩{pomoShort}分</span><span>{pomoRounds}ラウンド</span>
          </div>
        )}

        {/* 4. Subject grid */}
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSub, marginBottom: 8 }}>教科を選んでスタート</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {subjects.map(s => (
            <button key={s.id} onClick={() => handleSelectSubject(s)} style={{
              background: theme.card, border: `2px solid ${s.color}26`,
              borderRadius: 14, padding: '12px 6px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.background = `${s.color}14` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${s.color}26`; e.currentTarget.style.background = theme.card }}
            >
              <SubjectIconDisplay icon={s.icon} size={28} />
              <span style={{ fontSize: 11, fontWeight: 700, color: theme.text }}>{s.name}</span>
              {(subjectTodayMin[s.id] || 0) > 0 && (
                <span style={{ fontSize: 10, color: theme.textSub }}>{subjectTodayMin[s.id]}分</span>
              )}
            </button>
          ))}
        </div>

        {/* 5. Weekly mini chart */}
        <div style={{ background: theme.card, borderRadius: 14, padding: '10px 14px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>今週</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
            {weekData.map((sec, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '100%',
                  height: sec > 0 ? Math.max(sec / maxWeek * 36, 4) : 2,
                  background: i === todayDow ? theme.accent : sec > 0 ? theme.accent + '44' : theme.border,
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.5s ease',
                  opacity: sec > 0 ? 1 : 0.3,
                }} />
                <div style={{ fontSize: 9, color: i === todayDow ? theme.accent : theme.textSub, fontWeight: i === todayDow ? 700 : 400, marginTop: 2 }}>{weekDays[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (state === 'material') {
    return (
      <div>
        <button onClick={() => setState('idle')} style={{ background: 'none', border: 'none', color: theme.textSub, cursor: 'pointer', marginBottom: 16, fontSize: 13 }}>
          ← 戻る
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <SubjectIconDisplay icon={selectedSubject?.icon || '📚'} size={28} />
          <span style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{selectedSubject?.name}</span>
        </div>

        <button onClick={() => handleStartTimer()} style={{
          width: '100%', padding: '16px', borderRadius: 16,
          background: theme.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 16,
        }}>
          教材なしで開始
        </button>

        {materials.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: theme.textSub, marginBottom: 8, fontWeight: 600 }}>教材を選択</div>
            {materials.map(m => (
              <button key={m.id} onClick={() => handleStartTimer(m)} style={{
                width: '100%', background: theme.card, border: `1px solid ${theme.border}`,
                borderRadius: 12, padding: '14px 16px', cursor: 'pointer', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              }}>
                {m.image_url ? (
                  <img src={m.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 20, width: 40, textAlign: 'center', flexShrink: 0 }}>📖</span>
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{m.name}</div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    )
  }

  // ── フルスクリーン（running / paused / pomo_break）──
  if (isFullscreen) {
    const subjectColor = selectedSubject?.color || theme.accent
    const hh = String(clockTime.getHours()).padStart(2,'0')
    const mm = String(clockTime.getMinutes()).padStart(2,'0')
    const ss = String(clockTime.getSeconds()).padStart(2,'0')

    const filteredSuggestions = tagSuggestions.filter(s =>
      s.includes(tagInput.replace(/^#+/, '')) && !tags.includes(s)
    )

    return (
      <div
        onClick={handleScreenTap}
        style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh',
          zIndex: 200, background: theme.bg, overflow: 'hidden',
          userSelect: 'none', WebkitUserSelect: 'none',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'DM Sans', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
        }}
      >
        {/* 教科カラー: 上部の細い線 */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: subjectColor, zIndex: 2 }} />

        {/* 教科カラーの薄いオーバーレイ */}
        <div style={{ position: 'absolute', inset: 0, background: subjectColor, opacity: 0.08, pointerEvents: 'none' }} />

        {/* 中央: タイマー数字のみ */}
        <div
          onClick={(e) => { e.stopPropagation(); setDisplayMode(d => d === 'timer' ? 'clock' : 'timer') }}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1, cursor: 'pointer',
          }}
        >
          {state === 'pomo_break' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 52 }}>☕</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>休憩タイム</div>
              <div style={{ fontSize: 14, color: theme.textSub }}>{pomoRound}/{pomoRounds} ラウンド完了</div>
              <div style={{ fontSize: 'clamp(56px, 14vw, 80px)', fontWeight: 700, color: subjectColor, fontVariantNumeric: 'tabular-nums', letterSpacing: 4, lineHeight: 1, marginTop: 8 }}>
                {fmtTime(pomoRemaining)}
              </div>
              <div style={{ fontSize: 13, color: theme.textSub, marginTop: 4 }}>累計: {fmtDuration(pomoElapsed)}</div>
            </div>
          ) : (
            <>
              {mode === 'pomodoro' && (
                <div style={{ fontSize: 12, color: subjectColor, marginBottom: 16, fontWeight: 600, opacity: 0.7 }}>
                  {pomoPhase === 'work' ? `${pomoRound}/${pomoRounds}` : '☕'}
                </div>
              )}

              {displayMode === 'timer' ? (
                <div style={{
                  fontSize: 'clamp(80px, 22vw, 120px)', fontWeight: 700, color: theme.text,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: 4, lineHeight: 1,
                  transition: 'opacity 0.3s',
                  width: '80%', textAlign: 'center',
                }}>
                  {mode === 'pomodoro' ? fmtTime(pomoRemaining) : fmtTime(elapsed)}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'center',
                  transition: 'opacity 0.3s',
                }}>
                  <span style={{
                    fontSize: 'clamp(72px, 20vw, 110px)', fontWeight: 700, color: theme.text,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: 4, lineHeight: 1,
                  }}>
                    {hh}:{mm}
                  </span>
                  <span style={{
                    fontSize: 'clamp(32px, 8vw, 48px)', fontWeight: 400, color: theme.textSub,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: 2,
                  }}>
                    :{ss}
                  </span>
                </div>
              )}

              {mode === 'pomodoro' && (
                <div style={{ fontSize: 13, color: theme.textSub, marginTop: 20, opacity: 0.6 }}>
                  累計 {fmtDuration(pomoElapsed + elapsed)}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 下部ボタン（ミニマル丸ボタン、フェードイン/アウト） ── */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
          padding: '24px 40px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          opacity: controlsVisible ? 0.6 : 0.15,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'auto',
        }}>
          {state === 'pomo_break' ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleBreakResume() }} style={{
                flex: 1, padding: '16px', borderRadius: 28,
                background: subjectColor, color: '#fff', border: 'none',
                fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: 0.9,
              }}>
                次のラウンド
              </button>
              <div style={{ width: 16 }} />
              <button onClick={(e) => { e.stopPropagation(); handleStop() }} style={{
                width: 56, height: 56, borderRadius: '50%',
                background: theme.danger, border: 'none',
                fontSize: 22, cursor: 'pointer', color: '#fff',
              }}>
                ⏹
              </button>
            </>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); handlePause() }} style={{
                width: 56, height: 56, borderRadius: '50%',
                background: state === 'paused' ? subjectColor : theme.cardAlt,
                border: 'none',
                fontSize: 22, cursor: 'pointer',
                color: state === 'paused' ? '#fff' : theme.text,
              }}>
                {state === 'paused' ? '▶' : '⏸'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleStop() }} style={{
                width: 56, height: 56, borderRadius: '50%',
                background: theme.danger, border: 'none',
                fontSize: 22, cursor: 'pointer', color: '#fff',
              }}>
                ⏹
              </button>
            </>
          )}
        </div>

        {/* 保存モーダル */}
        <Modal open={showSave} onClose={() => setShowSave(false)} title="記録を保存">
          <div style={{ textAlign: 'left' }}>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: theme.accentLight, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: theme.textSub }}>勉強時間</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: theme.accent }}>
                {fmtDuration(mode === 'pomodoro' ? pomoElapsed : elapsed)}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>メモ</label>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="今日の学習メモ..."
                rows={3}
                style={{
                  width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                  background: theme.cardAlt, color: theme.text, fontSize: 14,
                  padding: '10px 12px', resize: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            {/* タグ入力 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>タグ</label>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {tags.map(tag => (
                    <div key={tag} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: theme.accentLight, borderRadius: 20, padding: '4px 10px',
                    }}>
                      <span style={{ fontSize: 13, color: theme.accent, fontWeight: 600 }}>#{tag}</span>
                      <button
                        onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSub, fontSize: 14, padding: 0, lineHeight: 1, display: 'flex' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="#タグを入力してスペース"
                  style={{
                    width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                    background: theme.cardAlt, color: theme.text, fontSize: 14,
                    padding: '10px 12px', fontFamily: 'inherit',
                  }}
                />
                {tagInput.replace(/^#+/, '') && filteredSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: theme.card, border: `1px solid ${theme.border}`,
                    borderRadius: 10, marginTop: 4, maxHeight: 140, overflowY: 'auto',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}>
                    {filteredSuggestions.slice(0, 6).map(s => (
                      <button
                        key={s}
                        onClick={() => { setTags(prev => [...prev, s]); setTagInput('') }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '8px 12px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: theme.text, fontSize: 13, display: 'block',
                        }}
                      >
                        #{s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} style={{
                flex: 1, padding: '14px', borderRadius: 12,
                border: `1px solid ${theme.border}`, background: theme.card,
                color: theme.textSub, fontWeight: 700, cursor: 'pointer', fontSize: 14,
              }}>
                破棄
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, padding: '14px', borderRadius: 12,
                background: theme.accent, color: '#fff',
                border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14,
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  return null
}
