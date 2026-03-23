'use client'
import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { BADGES, TITLES, THEMES, Theme, RANKS, getRank, XP_PER_LEVEL } from '@/types'
import { useRouter } from 'next/navigation'

export default function ProfileTab() {
  const { userId, userMeta, profile, badges, subjects, goal, theme, themeName, setThemeName, saveSettings, settings, refreshProfile, refreshGoal, showToast } = useApp()
  const supabase = createClient()
  const router = useRouter()

  const [settingsModal, setSettingsModal] = useState(false)
  const [badgeModal, setBadgeModal] = useState(false)
  const [titleModal, setTitleModal] = useState(false)
  const [goalModal, setGoalModal] = useState(false)
  const [shareImgUrl, setShareImgUrl] = useState<string | null>(null)
  const [editModal, setEditModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const headerInputRef = useRef<HTMLInputElement>(null)

  // Goal editing
  const [goalDaily, setGoalDaily] = useState(goal?.daily_minutes ?? 120)
  const [goalWeekly, setGoalWeekly] = useState(goal?.weekly_minutes ?? 600)

  const displayName = profile?.name || userMeta?.full_name || 'ユーザー'
  const displayAvatar = profile?.avatar_url || userMeta?.avatar_url || ''
  const displayHeader = profile?.header_url || ''

  const xp = profile?.xp || 0
  const level = Math.floor(xp / 100) + 1
  const currentRank = getRank(level)
  const nextRank = RANKS.find(r => r.minLevel > level) || null
  const xpInLevel = xp % XP_PER_LEVEL
  const xpProgress = xpInLevel / XP_PER_LEVEL * 100

  const pomoWork = settings?.pomo_settings?.work ?? 25
  const pomoShort = settings?.pomo_settings?.short ?? 5
  const pomoLong = settings?.pomo_settings?.long ?? 15
  const pomoRounds = settings?.pomo_settings?.rounds ?? 4
  const [pomoEdit, setPomoEdit] = useState({ work: pomoWork, short: pomoShort, long: pomoLong, rounds: pomoRounds })

  const handleEditOpen = () => {
    setEditName(profile?.name || userMeta?.full_name || '')
    setEditAvatarFile(null)
    setEditAvatarPreview(null)
    setEditModal(true)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditAvatarFile(file)
    const reader = new FileReader()
    reader.onload = () => setEditAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleHeaderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}.${ext}`
    const { error } = await supabase.storage
      .from('headers')
      .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` })
    if (error) {
      showToast('ヘッダー画像のアップロードに失敗しました')
      return
    }
    const { data: urlData } = supabase.storage.from('headers').getPublicUrl(path)
    const headerUrl = `${urlData.publicUrl}?t=${Date.now()}`
    await supabase.from('profiles').update({ header_url: headerUrl }).eq('id', userId)
    await refreshProfile()
    showToast('ヘッダー画像を更新しました')
  }

  const handleEditSave = async () => {
    if (!userId) return
    setSaving(true)

    let avatarUrl: string | null = profile?.avatar_url || null
    if (editAvatarFile) {
      const ext = editAvatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, editAvatarFile, { upsert: true, contentType: editAvatarFile.type || `image/${ext}` })
      if (uploadError) {
        showToast('画像のアップロードに失敗しました')
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`
    }

    await supabase.from('profiles').update({
      name: editName.trim() || null,
      ...(editAvatarFile ? { avatar_url: avatarUrl } : {}),
    }).eq('id', userId)
    await refreshProfile()
    setSaving(false)
    setEditModal(false)
    showToast('プロフィールを更新しました')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleTitleSelect = async (titleKey: string) => {
    await supabase.from('profiles').update({ selected_title: titleKey }).eq('id', userId)
    await refreshProfile()
    showToast('称号を変更しました')
    setTitleModal(false)
  }

  const handleGoalSave = async () => {
    if (!goal) return
    await supabase.from('goals').update({
      daily_minutes: goalDaily,
      weekly_minutes: goalWeekly,
    }).eq('id', goal.id)
    await refreshGoal()
    setGoalModal(false)
    showToast('目標を更新しました')
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  const generateShareImage = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !profile) return

    await document.fonts.ready

    // ── Fetch today's sessions ──
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data: todaySessions } = await supabase
      .from('sessions')
      .select('duration, subject_id')
      .eq('user_id', userId)
      .eq('date', todayStr)

    const totals: Record<string, number> = {}
    for (const s of todaySessions || []) {
      totals[s.subject_id] = (totals[s.subject_id] || 0) + s.duration
    }
    const totalSec = Object.values(totals).reduce((a, b) => a + b, 0)
    const allSubj = subjects
      .filter(s => totals[s.id] > 0)
      .map(s => ({ ...s, sec: totals[s.id] }))
      .sort((a, b) => b.sec - a.sec)
    const topSubj = allSubj.slice(0, 5)
    const restSubj = allSubj.slice(5)
    const restSec = restSubj.reduce((sum, s) => sum + s.sec, 0)

    const goalSec = (goal?.daily_minutes ?? 120) * 60

    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
      if (h > 0 && m > 0) return `${h}時間${m}分`
      if (h > 0) return `${h}時間`
      if (m > 0) return `${m}分`
      return `${sec}秒`
    }

    const titleLabel = profile.selected_title
      ? TITLES.find(tt => tt.key === profile.selected_title)?.label : null

    // ── Canvas setup ──
    canvas.width = 1200
    canvas.height = 630
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const T = THEMES[themeName]
    const L = 74, R = 1126, CW = R - L
    const FF = '"Helvetica Neue", Arial, sans-serif'
    const sf = (size: number, w: 400 | 600 | 700 = 400) => {
      ctx.font = `${w === 400 ? 'normal' : w} ${size}px ${FF}`
    }

    const CARDS_H = 90

    ctx.fillStyle = T.bg
    ctx.fillRect(0, 0, 1200, 630)
    ctx.fillStyle = T.accent
    ctx.fillRect(0, 0, 1200, 4)

    let y = 56

    sf(16)
    ctx.fillStyle = T.textSub
    ctx.textAlign = 'right'
    ctx.fillText(new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }), R, y + 16)
    ctx.textAlign = 'left'

    const nameStr = profile.name || userMeta?.full_name || 'ユーザー'
    sf(32, 700)
    ctx.fillStyle = T.text
    ctx.fillText(nameStr, L, y + 16)
    if (titleLabel) {
      const nw = ctx.measureText(nameStr).width
      sf(20)
      ctx.fillStyle = T.accent
      ctx.fillText(` ✨${titleLabel}`, L + nw, y + 16)
    }
    y += 36 + 16

    const SY = y, SH = CARDS_H, CGAP = 16
    const cw = Math.floor((CW - CGAP * 2) / 3)
    const cardDefs = [
      { x: L,                     w: cw },
      { x: L + cw + CGAP,         w: cw },
      { x: L + 2 * (cw + CGAP),   w: R - (L + 2 * (cw + CGAP)) },
    ]
    cardDefs.forEach(({ x, w }) => {
      ctx.fillStyle = T.card
      roundRect(ctx, x, SY, w, SH, 12); ctx.fill()
      ctx.strokeStyle = T.border; ctx.lineWidth = 1
      roundRect(ctx, x, SY, w, SH, 12); ctx.stroke()
    })
    const PX = 16, PY = 12

    sf(12); ctx.fillStyle = T.textSub
    ctx.fillText('レベル', cardDefs[0].x + PX, SY + PY + 14)
    const lvBaseY = SY + PY + 14 + 4 + 32
    sf(36, 700); ctx.fillStyle = T.accent
    ctx.fillText(String(level), cardDefs[0].x + PX, lvBaseY)
    const lvNumW = ctx.measureText(String(level)).width
    sf(13); ctx.fillStyle = T.textSub
    ctx.fillText(`XP:${xp}`, cardDefs[0].x + PX + lvNumW + 8, lvBaseY)
    const xpBarY = lvBaseY + 12
    const xbMax = Math.floor(cardDefs[0].w * 0.70)
    ctx.fillStyle = T.border
    roundRect(ctx, cardDefs[0].x + PX, xpBarY, xbMax, 6, 3); ctx.fill()
    ctx.fillStyle = T.accent
    roundRect(ctx, cardDefs[0].x + PX, xpBarY, Math.max(Math.round(xbMax * xpProgress / 100), 4), 6, 3); ctx.fill()

    sf(12); ctx.fillStyle = T.textSub
    ctx.fillText('ランク', cardDefs[1].x + PX, SY + PY + 14)
    sf(22, 700); ctx.fillStyle = T.text
    ctx.fillText(`${currentRank.emoji} ${currentRank.name}`, cardDefs[1].x + PX, SY + PY + 14 + 4 + 22)

    sf(12); ctx.fillStyle = T.textSub
    ctx.fillText('バッジ', cardDefs[2].x + PX, SY + PY + 14)
    sf(34, 700); ctx.fillStyle = T.accent
    ctx.fillText(String(badges.length), cardDefs[2].x + PX, SY + PY + 14 + 4 + 30)
    sf(14); ctx.fillStyle = T.textSub
    ctx.fillText(`/ ${BADGES.length}個`, cardDefs[2].x + PX, SY + PY + 14 + 4 + 30 + 18)

    y = SY + SH + 8

    sf(20, 700); ctx.fillStyle = T.accent
    ctx.fillText('今日の記録', L, y + 18)
    ctx.fillStyle = T.border
    ctx.fillRect(L, y + 24, CW, 1)
    y += 26

    if (totalSec === 0) {
      sf(16); ctx.fillStyle = T.textSub
      ctx.fillText('本日の学習記録がありません', L, y + 40)
    } else {
      y += 8

      const totalStr = fmt(totalSec)
      sf(44, 600)
      ctx.globalAlpha = 0.75; ctx.fillStyle = T.accent
      ctx.fillText(totalStr, L, y + 38)
      ctx.globalAlpha = 1.0
      const totalW = ctx.measureText(totalStr).width
      sf(18); ctx.fillStyle = T.textSub
      ctx.fillText(` / ${fmt(goalSec)}`, L + totalW, y + 38)
      y += 44

      sf(12); ctx.fillStyle = T.textSub
      ctx.fillText('合計', L, y + 12)
      y += 24 + 6

      const INDENT = 16
      const SL = L + INDENT
      const timeX = R - 10
      const BAR_RIGHT = R - 16
      const BAR_MAX = BAR_RIGHT - SL
      const ROW_H = 46

      topSubj.forEach((s, i) => {
        const isTop = i < 2
        const barH = isTop ? 10 : 8

        if (isTop) {
          sf(14, 600); ctx.fillStyle = T.text
        } else {
          ctx.globalAlpha = 0.45; sf(13); ctx.fillStyle = T.textSub
        }
        ctx.fillText(s.name, SL, y + 14)
        ctx.textAlign = 'right'
        if (isTop) {
          sf(14, 600); ctx.fillStyle = T.text
        } else {
          sf(13); ctx.fillStyle = T.textSub
        }
        ctx.fillText(fmt(s.sec), timeX, y + 14)
        ctx.textAlign = 'left'
        if (!isTop) ctx.globalAlpha = 1.0

        const barY2 = y + 18
        ctx.fillStyle = T.border
        roundRect(ctx, SL, barY2, BAR_MAX, barH, barH / 2); ctx.fill()
        const ratio = s.sec / totalSec
        const barW = Math.max(Math.round(BAR_MAX * ratio), 20)
        ctx.globalAlpha = isTop ? 0.9 : 0.2
        ctx.fillStyle = s.color
        roundRect(ctx, SL, barY2, barW, barH, barH / 2); ctx.fill()
        ctx.globalAlpha = 1.0

        y += ROW_H
      })

      if (restSubj.length > 0) {
        ctx.globalAlpha = 0.45; sf(13); ctx.fillStyle = T.textSub
        ctx.fillText(`他${restSubj.length}教科  ${fmt(restSec)}`, SL, y + 14)
        ctx.globalAlpha = 1.0
        y += 20
      }
    }

    const footerY = Math.max(y + 16, 630 - 24)
    sf(16, 600); ctx.fillStyle = T.accent
    ctx.textAlign = 'center'
    ctx.fillText('#StudyLoad', 600, footerY)
    ctx.textAlign = 'left'

    setShareImgUrl(canvas.toDataURL('image/png'))
  }, [profile, themeName, level, xp, xpProgress, currentRank, badges, subjects, goal, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadShare = () => {
    if (!shareImgUrl) return
    const a = document.createElement('a')
    a.href = shareImgUrl
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    a.download = `study-load-${ts}.png`
    a.click()
  }

  const hasBadge = (key: string) => badges.some(b => b.badge_key === key)
  const unlockedTitles = TITLES.filter(t => {
    if (t.condition.startsWith('lv')) {
      const lv = parseInt(t.condition.slice(2))
      return level >= lv
    }
    return true
  })

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input ref={headerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleHeaderChange} />

      {/* Header banner + Avatar overlay */}
      <div style={{ position: 'relative', marginBottom: 40 }}>
        {/* Header image */}
        <div
          onClick={() => headerInputRef.current?.click()}
          style={{
            width: '100%', height: 120, borderRadius: '20px 20px 0 0', cursor: 'pointer', overflow: 'hidden',
            background: displayHeader ? undefined : `linear-gradient(135deg, ${theme.accent}40, ${theme.accent}15)`,
          }}
        >
          {displayHeader && (
            <img src={displayHeader} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </div>

        {/* Avatar overlapping header */}
        <div style={{ position: 'absolute', bottom: -30, left: 20 }}>
          {displayAvatar ? (
            <img src={displayAvatar} alt=""
              style={{ width: 64, height: 64, borderRadius: '50%', border: `3px solid ${theme.bg}`, objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: `3px solid ${theme.bg}`, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
              👤
            </div>
          )}
        </div>

        {/* Edit button */}
        <button onClick={handleEditOpen} style={{
          position: 'absolute', bottom: -24, right: 12,
          background: theme.cardAlt, border: `1px solid ${theme.border}`,
          borderRadius: 10, padding: '5px 10px', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', color: theme.textSub,
        }}>
          ✏️ 編集
        </button>
      </div>

      {/* Name + Title */}
      <div style={{ padding: '0 4px', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{displayName}</div>
        {profile?.selected_title && (
          <div style={{ fontSize: 12, color: theme.accent, fontWeight: 600, marginTop: 2 }}>
            ✨ {TITLES.find(t => t.key === profile.selected_title)?.label}
          </div>
        )}
      </div>

      {/* Rank + XP bar */}
      <div style={{ background: theme.card, borderRadius: 16, padding: '12px 14px', marginBottom: 10, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{currentRank.emoji}</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{currentRank.name}</span>
          <span style={{ fontSize: 12, color: theme.textSub, marginLeft: 'auto' }}>Lv.{level}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: theme.textSub }}>XP: {xp}</span>
          <span style={{ fontSize: 11, color: theme.textSub }}>
            {nextRank ? `→ ${nextRank.name} Lv.${nextRank.minLevel}` : '最高ランク'}
          </span>
        </div>
        <div style={{ height: 6, background: theme.border, borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${xpProgress}%`, background: theme.accent, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Badges inline */}
      <div
        onClick={() => setBadgeModal(true)}
        style={{ background: theme.card, borderRadius: 16, padding: '10px 14px', marginBottom: 10, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>🏅 バッジ</span>
          <span style={{ fontSize: 12, color: theme.textSub }}>{badges.length}/{BADGES.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {BADGES.slice(0, 10).map(b => (
            <span key={b.key} style={{ fontSize: 18, opacity: hasBadge(b.key) ? 1 : 0.2 }}>{b.emoji}</span>
          ))}
          {BADGES.length > 10 && <span style={{ fontSize: 12, color: theme.textSub, alignSelf: 'center' }}>…</span>}
        </div>
      </div>

      {/* Title select inline */}
      <div
        onClick={() => setTitleModal(true)}
        style={{ background: theme.card, borderRadius: 16, padding: '10px 14px', marginBottom: 12, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>✨ 称号</span>
          <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>
            {profile?.selected_title ? TITLES.find(t => t.key === profile.selected_title)?.label : '未選択'}
          </span>
        </div>
      </div>

      {/* Menu grid — 4 buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: '🎯 目標設定', onClick: () => { setGoalDaily(goal?.daily_minutes ?? 120); setGoalWeekly(goal?.weekly_minutes ?? 600); setGoalModal(true) } },
          { label: '📤 シェア画像', onClick: generateShareImage },
          { label: '⚙️ 設定', onClick: () => { setPomoEdit({ work: pomoWork, short: pomoShort, long: pomoLong, rounds: pomoRounds }); setSettingsModal(true) } },
          { label: '🚪 ログアウト', onClick: handleLogout },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} style={{
            background: theme.card, border: `1px solid ${theme.border}`,
            borderRadius: 14, padding: '12px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: theme.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Settings Modal (theme + pomodoro) ── */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="設定">
        <div>
          {/* Theme */}
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 8 }}>テーマ</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['minimal','pop','midnight','pastel'] as Theme[]).map(t => (
              <button key={t} onClick={() => setThemeName(t)} style={{
                flex: 1, padding: '10px 4px', borderRadius: 12,
                border: `2px solid ${themeName===t ? theme.accent : theme.border}`,
                background: THEMES[t].card, cursor: 'pointer', textAlign: 'center',
              }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: THEMES[t].accent, margin: '0 auto 4px' }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: THEMES[t].text }}>
                  {t === 'minimal' ? 'シンプル' : t === 'pop' ? 'ポップ' : t === 'midnight' ? 'ミッドナイト' : 'パステル'}
                </div>
              </button>
            ))}
          </div>

          {/* Pomodoro */}
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 8 }}>ポモドーロ</div>
          {([
            { label: '作業（分）', key: 'work', min: 1, max: 90 },
            { label: '短い休憩', key: 'short', min: 1, max: 30 },
            { label: '長い休憩', key: 'long', min: 5, max: 60 },
            { label: 'ラウンド', key: 'rounds', min: 1, max: 10 },
          ] as { label: string; key: keyof typeof pomoEdit; min: number; max: number }[]).map(({ label, key, min, max }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: theme.textSub }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.accent }}>{pomoEdit[key]}</span>
              </div>
              <input
                type="range" min={min} max={max} value={pomoEdit[key]}
                onChange={e => setPomoEdit(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: theme.accent }}
              />
            </div>
          ))}
          <button onClick={async () => {
            await saveSettings({ pomo_settings: pomoEdit } as any)
            setSettingsModal(false)
            showToast('設定を保存しました')
          }} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
          }}>
            保存
          </button>
        </div>
      </Modal>

      {/* ── Goal Modal ── */}
      <Modal open={goalModal} onClose={() => setGoalModal(false)} title="目標設定">
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: theme.textSub }}>1日の目標（分）</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{goalDaily}分</span>
            </div>
            <input type="range" min={10} max={480} step={10} value={goalDaily}
              onChange={e => setGoalDaily(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: theme.accent }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: theme.textSub }}>1週間の目標（分）</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{goalWeekly}分</span>
            </div>
            <input type="range" min={60} max={3000} step={30} value={goalWeekly}
              onChange={e => setGoalWeekly(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: theme.accent }} />
          </div>
          <button onClick={handleGoalSave} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
          }}>
            保存
          </button>
        </div>
      </Modal>

      {/* ── Badge Modal ── */}
      <Modal open={badgeModal} onClose={() => setBadgeModal(false)} title={`バッジ (${badges.length}/${BADGES.length})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {BADGES.map(badge => {
            const owned = hasBadge(badge.key)
            return (
              <div key={badge.key} style={{
                background: owned ? theme.accentLight : theme.cardAlt,
                borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                border: `1px solid ${owned ? theme.accent : theme.border}`,
                opacity: owned ? 1 : 0.5,
              }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{badge.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.text }}>{badge.label}</div>
                <div style={{ fontSize: 10, color: theme.textSub, marginTop: 2 }}>{badge.desc}</div>
                <div style={{ fontSize: 10, color: theme.accent, marginTop: 2, fontWeight: 600 }}>+{badge.xp}XP</div>
              </div>
            )
          })}
        </div>
      </Modal>

      {/* ── Title Modal ── */}
      <Modal open={titleModal} onClose={() => setTitleModal(false)} title="称号を選択">
        <div>
          {unlockedTitles.map(t => (
            <button key={t.key} onClick={() => handleTitleSelect(t.key)} style={{
              width: '100%', marginBottom: 8, padding: '12px 16px',
              borderRadius: 12, border: `2px solid ${profile?.selected_title===t.key ? theme.accent : theme.border}`,
              background: profile?.selected_title===t.key ? theme.accentLight : theme.card,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700, color: theme.text }}>✨ {t.label}</span>
              {profile?.selected_title===t.key && <span style={{ color: theme.accent, fontSize: 18 }}>✓</span>}
            </button>
          ))}
          {TITLES.filter(t => !unlockedTitles.includes(t)).map(t => (
            <div key={t.key} style={{
              marginBottom: 8, padding: '12px 16px',
              borderRadius: 12, border: `1px solid ${theme.border}`,
              background: theme.cardAlt, opacity: 0.5,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ color: theme.textSub }}>🔒 {t.label}</span>
              <span style={{ fontSize: 12, color: theme.textSub }}>{t.condition}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="プロフィール編集">
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ position: 'relative', cursor: 'pointer', width: 80, height: 80 }}
            >
              {(editAvatarPreview || displayAvatar) ? (
                <img
                  src={editAvatarPreview || displayAvatar}
                  alt=""
                  style={{ width: 80, height: 80, borderRadius: '50%', border: `3px solid ${theme.accent}`, objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: theme.accentLight, border: `3px solid ${theme.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                  👤
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                background: theme.accent, borderRadius: '50%',
                width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#fff', border: `2px solid ${theme.card}`,
              }}>
                📷
              </div>
            </div>
            <div style={{ fontSize: 11, color: theme.textSub, marginTop: 6 }}>タップして変更</div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>表示名</label>
            <input
              type="text" value={editName} onChange={e => setEditName(e.target.value)}
              placeholder={userMeta?.full_name || 'ユーザー'} maxLength={50}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${theme.border}`, background: theme.cardAlt,
                color: theme.text, fontSize: 15, boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          <button onClick={handleEditSave} disabled={saving} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700,
            cursor: saving ? 'default' : 'pointer', fontSize: 15, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </Modal>

      {/* ── Share image Modal ── */}
      <Modal open={!!shareImgUrl} onClose={() => setShareImgUrl(null)} title="シェア画像">
        <div>
          {shareImgUrl && (
            <img src={shareImgUrl} alt="share" style={{ width: '100%', borderRadius: 12, border: `1px solid ${theme.border}`, marginBottom: 16 }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={downloadShare} style={{
              flex: 1, background: theme.accent, color: '#fff',
              border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer',
            }}>
              ⬇ ダウンロード
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
