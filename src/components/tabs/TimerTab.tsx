'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { SubjectIconDisplay } from '@/components/ui/SubjectIconPicker'
import { fmtTime, fmtDuration, BADGES, XP_PER_MIN, Subject, Material } from '@/types'

type TimerMode = 'normal' | 'pomodoro'
type TimerState = 'idle' | 'subject' | 'material' | 'running' | 'paused' | 'saving' | 'pomo_break'
type DisplayMode = 'timer' | 'clock'

export default function TimerTab() {
  const { subjects, refreshSubjects, userId, theme, settings, showToast, refreshProfile, refreshBadges, badges } = useApp()
  const supabase = createClient()

  const [mode, setMode] = useState<TimerMode>('normal')
  const [state, setState] = useState<TimerState>('idle')
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [memo, setMemo] = useState('')
  const [tags, setTags] = useState('')
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const hiddenStartRef = useRef<number>(0)

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
    if (tags.trim() && session) {
      const tagList = tags.split(/[,、\s]+/).filter(Boolean).map(tag => ({
        session_id: session.id,
        tag: tag.trim(),
      }))
      if (tagList.length > 0) {
        const { error: tagError } = await supabase.from('session_tags').insert(tagList)
        if (tagError) {
          console.error('[session_tags] insert error:', tagError.code, tagError.message, tagError.details, tagError.hint)
        }
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
    setTags('')
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
    setTags('')
  }

  const handleBreakResume = () => {
    setPomoPhase('work')
    setState('running')
    setPomoRemaining(pomoWork * 60)
  }

  // --- Renders ---
  if (state === 'idle' || state === 'subject') {
    return (
      <div>
        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['normal','pomodoro'] as TimerMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '10px', borderRadius: 12,
              border: `2px solid ${mode===m ? theme.accent : theme.border}`,
              background: mode===m ? theme.accentLight : theme.card,
              color: mode===m ? theme.accent : theme.textSub,
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              {m === 'normal' ? '⏱ 通常' : '⏰ ポモドーロ'}
            </button>
          ))}
        </div>

        {mode === 'pomodoro' && (
          <div style={{ background: theme.card, borderRadius: 16, padding: '12px 16px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 12, color: theme.textSub, marginBottom: 4 }}>ポモドーロ設定</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 13, color: theme.text }}>
              <span>作業 {pomoWork}分</span>
              <span>休憩 {pomoShort}分</span>
              <span>{pomoRounds}ラウンド</span>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, color: theme.textSub, marginBottom: 10 }}>教科を選択</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {subjects.map(s => (
            <button key={s.id} onClick={() => handleSelectSubject(s)} style={{
              background: theme.card, border: `2px solid ${theme.border}`,
              borderRadius: 16, padding: '16px 8px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = s.color)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
            >
              <SubjectIconDisplay icon={s.icon} size={32} />
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{s.name}</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            </button>
          ))}
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
    const clockHHMM = `${String(clockTime.getHours()).padStart(2,'0')}:${String(clockTime.getMinutes()).padStart(2,'0')}`
    const clockSS = `:${String(clockTime.getSeconds()).padStart(2,'0')}`

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: theme.bg,
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
      }}>
        {/* 教科カラーの薄いオーバーレイ */}
        <div style={{
          position: 'absolute', inset: 0, background: subjectColor, opacity: 0.07, pointerEvents: 'none',
        }} />

        {/* 中央コンテンツ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, padding: '0 24px', textAlign: 'center' }}>

          {/* 教科情報 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <SubjectIconDisplay icon={selectedSubject?.icon || '📚'} size={28} />
            <span style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{selectedSubject?.name}</span>
          </div>
          {selectedMaterial && (
            <div style={{ fontSize: 12, color: theme.textSub, marginBottom: 8 }}>📖 {selectedMaterial.name}</div>
          )}

          {state === 'pomo_break' ? (
            /* ── ポモドーロ休憩 ── */
            <div>
              <div style={{ fontSize: 52, marginBottom: 8 }}>☕</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginBottom: 4 }}>休憩タイム</div>
              <div style={{ fontSize: 14, color: theme.textSub, marginBottom: 20 }}>{pomoRound}/{pomoRounds} ラウンド完了</div>
              <div style={{ fontSize: 72, fontWeight: 900, color: subjectColor, fontVariantNumeric: 'tabular-nums', letterSpacing: -2, lineHeight: 1 }}>
                {fmtTime(pomoRemaining)}
              </div>
              <div style={{ fontSize: 13, color: theme.textSub, marginTop: 12 }}>累計: {fmtDuration(pomoElapsed)}</div>
            </div>
          ) : (
            /* ── タイマー / 時計 ── */
            <div style={{ width: '100%' }}>
              {mode === 'pomodoro' && (
                <div style={{ fontSize: 12, color: subjectColor, marginBottom: 12, fontWeight: 600 }}>
                  {pomoPhase === 'work' ? `⏰ 作業 ${pomoRound}/${pomoRounds}` : '☕ 休憩'}
                </div>
              )}

              {/* モード切替ボタン */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                {(['timer', 'clock'] as const).map(m => (
                  <button key={m} onClick={() => setDisplayMode(m)} style={{
                    padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: displayMode === m ? subjectColor : theme.cardAlt,
                    color: displayMode === m ? '#fff' : theme.textSub,
                  }}>
                    {m === 'timer' ? '⏱ タイマー' : '🕐 時計'}
                  </button>
                ))}
              </div>

              {displayMode === 'timer' ? (
                <div style={{ fontSize: 80, fontWeight: 900, color: theme.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -3, lineHeight: 1 }}>
                  {mode === 'pomodoro' ? fmtTime(pomoRemaining) : fmtTime(elapsed)}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 80, fontWeight: 900, color: theme.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -3, lineHeight: 1 }}>
                    {clockHHMM}
                  </div>
                  <div style={{ fontSize: 28, color: theme.textSub, fontVariantNumeric: 'tabular-nums', marginTop: 4, fontWeight: 400 }}>
                    {clockSS}
                  </div>
                </div>
              )}

              {mode === 'pomodoro' && (
                <div style={{ fontSize: 14, color: theme.textSub, marginTop: 16 }}>
                  累計: {fmtDuration(pomoElapsed + elapsed)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 下部ボタン ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          padding: '20px 32px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', gap: 16, justifyContent: 'center',
        }}>
          {state === 'pomo_break' ? (
            <>
              <button onClick={handleBreakResume} style={{
                flex: 1, padding: '18px', borderRadius: 16,
                background: subjectColor, color: '#fff', border: 'none',
                fontWeight: 700, fontSize: 16, cursor: 'pointer',
              }}>
                次のラウンド開始
              </button>
              <button onClick={handleStop} style={{
                padding: '18px 20px', borderRadius: 16,
                background: theme.cardAlt, color: theme.textSub, border: 'none',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
                終了
              </button>
            </>
          ) : (
            <>
              <button onClick={handlePause} style={{
                width: 72, height: 72, borderRadius: '50%',
                background: state === 'paused' ? subjectColor : theme.cardAlt,
                border: `2px solid ${state === 'paused' ? subjectColor : theme.border}`,
                fontSize: 26, cursor: 'pointer', color: state === 'paused' ? '#fff' : theme.text,
              }}>
                {state === 'paused' ? '▶' : '⏸'}
              </button>
              <button onClick={handleStop} style={{
                width: 72, height: 72, borderRadius: '50%',
                background: theme.danger, border: 'none',
                fontSize: 26, cursor: 'pointer', color: '#fff',
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
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>タグ（カンマ区切り）</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="例: 過去問, 暗記, 復習"
                style={{
                  width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                  background: theme.cardAlt, color: theme.text, fontSize: 14,
                  padding: '10px 12px', fontFamily: 'inherit',
                }}
              />
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
