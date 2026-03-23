'use client'
import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { BADGES, TITLES, THEMES, Theme, RANKS, getRank, XP_PER_LEVEL } from '@/types'
import { useRouter } from 'next/navigation'

export default function ProfileTab() {
  const { userId, userMeta, profile, badges, subjects, goal, theme, themeName, setThemeName, saveSettings, settings, refreshProfile, showToast } = useApp()
  const supabase = createClient()
  const router = useRouter()

  const [themeModal, setThemeModal] = useState(false)
  const [badgeModal, setBadgeModal] = useState(false)
  const [titleModal, setTitleModal] = useState(false)
  const [pomoModal, setPomoModal] = useState(false)
  const [shareImgUrl, setShareImgUrl] = useState<string | null>(null)
  const [editModal, setEditModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayName = profile?.name || userMeta?.full_name || 'ユーザー'
  const displayAvatar = profile?.avatar_url || userMeta?.avatar_url || ''

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
        console.error('[avatar] upload error:', uploadError.message)
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

    // Fetch today's sessions
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data: todaySessions } = await supabase
      .from('sessions')
      .select('duration, subject_id')
      .eq('user_id', userId)
      .eq('date', todayStr)

    const subjectTotals: Record<string, number> = {}
    for (const sess of todaySessions || []) {
      subjectTotals[sess.subject_id] = (subjectTotals[sess.subject_id] || 0) + sess.duration
    }
    const totalTodaySec = Object.values(subjectTotals).reduce((a, b) => a + b, 0)
    const allSubjectItems = subjects
      .filter(s => subjectTotals[s.id])
      .map(s => ({ ...s, sec: subjectTotals[s.id] }))
      .sort((a, b) => b.sec - a.sec)

    const MAX_SUBJ = 5
    const topSubjects = allSubjectItems.slice(0, MAX_SUBJ)
    const restSubjects = allSubjectItems.slice(MAX_SUBJ)
    const restSec = restSubjects.reduce((sum, s) => sum + s.sec, 0)

    const dailyGoalSec = (goal?.daily_minutes ?? 120) * 60

    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600)
      const m = Math.floor((sec % 3600) / 60)
      if (h > 0 && m > 0) return `${h}時間${m}分`
      if (h > 0) return `${h}時間`
      if (m > 0) return `${m}分`
      return `${sec}秒`
    }

    const selectedTitleLabel = profile.selected_title
      ? TITLES.find(tt => tt.key === profile.selected_title)?.label
      : null

    canvas.width = 1200
    canvas.height = 630
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t = THEMES[themeName]
    const L = 64
    const R = 1136
    const CW = R - L
    const F = `"DM Sans", system-ui, -apple-system, sans-serif`
    const sf = (size: number, weight: 400 | 600 | 700 = 400) => {
      ctx.font = `${weight === 400 ? '' : weight + ' '}${size}px ${F}`.trim()
    }

    // ── Background ──
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, 1200, 630)

    // Top accent bar (3px)
    ctx.fillStyle = t.accent
    ctx.fillRect(0, 0, 1200, 3)

    // ── Row 1: logo + date (y≈36) ──
    sf(16)
    ctx.fillStyle = t.textSub
    ctx.fillText('Study Load', L, 38)

    const todayLabel = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    ctx.textAlign = 'right'
    ctx.fillText(todayLabel, R, 38)
    ctx.textAlign = 'left'

    // ── Row 2: name + title (y≈64) ──
    const nameStr = profile.name || userMeta?.full_name || 'ユーザー'
    sf(24, 700)
    ctx.fillStyle = t.text
    ctx.fillText(nameStr, L, 66)

    if (selectedTitleLabel) {
      const nw = ctx.measureText(nameStr).width
      sf(16)
      ctx.fillStyle = t.accent
      ctx.fillText(`✨ ${selectedTitleLabel}`, L + nw + 12, 66)
    }

    // ── Status bar (y: 80–132) ──
    ctx.fillStyle = t.card
    roundRect(ctx, L, 80, CW, 46, 10)
    ctx.fill()
    ctx.strokeStyle = t.border
    ctx.lineWidth = 1
    roundRect(ctx, L, 80, CW, 46, 10)
    ctx.stroke()

    sf(14, 600)
    const statItems = [
      { label: `Lv. ${level}`,                           color: t.accent },
      { label: `${currentRank.emoji} ${currentRank.name}`, color: t.text },
      { label: `XP: ${xp}`,                              color: t.text },
      { label: `バッジ: ${badges.length}/${BADGES.length}`, color: t.text },
    ]
    const sw = CW / statItems.length
    statItems.forEach((item, i) => {
      const cx = L + sw * i + sw / 2
      const iw = ctx.measureText(item.label).width
      ctx.fillStyle = item.color
      ctx.fillText(item.label, cx - iw / 2, 109)
      if (i < statItems.length - 1) {
        ctx.fillStyle = t.border
        ctx.fillRect(L + sw * (i + 1) - 0.5, 88, 1, 30)
      }
    })

    // ── Main: today's records (y: 144–) ──
    const MY = 148

    // "今日の記録" heading
    sf(14, 600)
    ctx.fillStyle = t.accent
    ctx.fillText('今日の記録', L, MY + 16)

    if (totalTodaySec === 0) {
      sf(18)
      ctx.fillStyle = t.textSub
      ctx.fillText('本日の学習記録がありません', L, MY + 70)
    } else {
      // Total time: large part + goal part
      sf(56, 600)
      ctx.fillStyle = t.accent
      const totalStr = fmt(totalTodaySec)
      ctx.fillText(totalStr, L, MY + 76)
      const totalW = ctx.measureText(totalStr).width

      sf(20)
      ctx.fillStyle = t.textSub
      ctx.fillText(` / ${fmt(dailyGoalSec)}`, L + totalW, MY + 70)

      // "合計" label
      sf(12)
      ctx.fillStyle = t.textSub
      ctx.fillText('合計', L, MY + 92)

      // ── Subject bars ──
      const BAR_MAX_W = Math.round(CW * 0.80)  // 80% of content width
      let rowY = MY + 112

      topSubjects.forEach(s => {
        // Name (left) + time (right)
        sf(14)
        ctx.fillStyle = t.text
        ctx.fillText(s.name, L, rowY + 13)
        ctx.fillStyle = t.textSub
        ctx.textAlign = 'right'
        ctx.fillText(fmt(s.sec), R, rowY + 13)
        ctx.textAlign = 'left'

        // Bar background (80% width)
        ctx.fillStyle = t.border
        roundRect(ctx, L, rowY + 18, BAR_MAX_W, 6, 3)
        ctx.fill()

        // Bar fill: ratio against daily goal
        const ratio = Math.min(s.sec / dailyGoalSec, 1)
        const barW = Math.max(Math.round(BAR_MAX_W * ratio), 12)
        ctx.fillStyle = s.color
        roundRect(ctx, L, rowY + 18, barW, 6, 3)
        ctx.fill()

        rowY += 38
      })

      // 他N教科
      if (restSubjects.length > 0) {
        sf(13)
        ctx.fillStyle = t.textSub
        ctx.fillText(`他${restSubjects.length}教科  ${fmt(restSec)}`, L, rowY + 13)
      }
    }

    // ── Footer ──
    sf(14, 600)
    ctx.fillStyle = t.accent
    ctx.textAlign = 'right'
    ctx.fillText('#StudyLoad', R, 616)
    ctx.textAlign = 'left'

    setShareImgUrl(canvas.toDataURL('image/png'))
  }, [profile, themeName, level, xp, currentRank, badges, subjects, goal, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadShare = () => {
    if (!shareImgUrl) return
    const a = document.createElement('a')
    a.href = shareImgUrl
    a.download = 'study-load-share.png'
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
      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Profile card */}
      <div style={{ background: theme.card, borderRadius: 20, padding: '20px', marginBottom: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={displayAvatar}
              alt=""
              style={{ width: 60, height: 60, borderRadius: '50%', border: `3px solid ${theme.accent}`, display: displayAvatar ? 'block' : 'none' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {!displayAvatar && (
              <div style={{ width: 60, height: 60, borderRadius: '50%', border: `3px solid ${theme.accent}`, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                👤
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{displayName}</div>
            {profile?.selected_title && (
              <div style={{ fontSize: 12, color: theme.accent, fontWeight: 600, marginTop: 2 }}>
                ✨ {TITLES.find(t => t.key === profile.selected_title)?.label}
              </div>
            )}
          </div>
          <button onClick={handleEditOpen} style={{
            marginLeft: 'auto', background: theme.cardAlt, border: `1px solid ${theme.border}`,
            borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', color: theme.textSub, flexShrink: 0,
          }}>
            ✏️ 編集
          </button>
        </div>

        {/* Level & Rank */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: theme.accentLight, borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: theme.textSub }}>レベル</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: theme.accent }}>{level}</div>
          </div>
          <div style={{ flex: 1, background: theme.cardAlt, borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: theme.textSub }}>ランク</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{currentRank.emoji} {currentRank.name}</div>
          </div>
        </div>

        {/* XP bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: theme.textSub }}>XP: {xp} (Lv.{level})</span>
            <span style={{ fontSize: 12, color: theme.textSub }}>
              {nextRank ? `→ ${nextRank.name} Lv.${nextRank.minLevel}` : '最高ランク'}
            </span>
          </div>
          <div style={{ height: 8, background: theme.border, borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${xpProgress}%`, background: theme.accent, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: '🏅 バッジ', onClick: () => setBadgeModal(true) },
          { label: '✨ 称号', onClick: () => setTitleModal(true) },
          { label: '🎨 テーマ', onClick: () => setThemeModal(true) },
          { label: '⚡ ポモドーロ', onClick: () => { setPomoEdit({ work: pomoWork, short: pomoShort, long: pomoLong, rounds: pomoRounds }); setPomoModal(true) } },
          { label: '📊 シェア画像', onClick: generateShareImage },
          { label: '🚪 ログアウト', onClick: handleLogout },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} style={{
            background: theme.card, border: `1px solid ${theme.border}`,
            borderRadius: 14, padding: '14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: theme.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* Theme Modal */}
      <Modal open={themeModal} onClose={() => setThemeModal(false)} title="テーマ設定">
        <div>
          {(['minimal','pop','midnight','pastel'] as Theme[]).map(t => (
            <button key={t} onClick={() => { setThemeName(t); setThemeModal(false) }} style={{
              width: '100%', marginBottom: 8, padding: '14px 16px',
              borderRadius: 12, border: `2px solid ${themeName===t ? theme.accent : theme.border}`,
              background: THEMES[t].card, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: THEMES[t].accent, flexShrink: 0 }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, color: THEMES[t].text }}>
                  {t === 'minimal' ? 'シンプル' : t === 'pop' ? 'ポップ' : t === 'midnight' ? 'ミッドナイト' : 'パステル'}
                </div>
                <div style={{ fontSize: 12, color: THEMES[t].textSub }}>
                  {t === 'minimal' ? 'クリーンな白ベース' : t === 'pop' ? 'やわらかピンク系' : t === 'midnight' ? 'ダークモード' : 'やさしいパステル'}
                </div>
              </div>
              {themeName===t && <span style={{ marginLeft: 'auto', color: theme.accent, fontSize: 18 }}>✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      {/* Badge Modal */}
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

      {/* Title Modal */}
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

      {/* Pomodoro settings Modal */}
      <Modal open={pomoModal} onClose={() => setPomoModal(false)} title="ポモドーロ設定">
        <div>
          {([
            { label: '作業時間（分）', key: 'work', min: 1, max: 90 },
            { label: '短い休憩（分）', key: 'short', min: 1, max: 30 },
            { label: '長い休憩（分）', key: 'long', min: 5, max: 60 },
            { label: 'ラウンド数', key: 'rounds', min: 1, max: 10 },
          ] as { label: string; key: keyof typeof pomoEdit; min: number; max: number }[]).map(({ label, key, min, max }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 13, color: theme.textSub }}>{label}</label>
                <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{pomoEdit[key]}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                value={pomoEdit[key]}
                onChange={e => setPomoEdit(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: theme.accent }}
              />
            </div>
          ))}
          <button onClick={async () => {
            await saveSettings({ pomo_settings: pomoEdit } as any)
            setPomoModal(false)
            showToast('設定を保存しました')
          }} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
          }}>
            保存
          </button>
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="プロフィール編集">
        <div>
          {/* Avatar */}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>表示名</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder={userMeta?.full_name || 'ユーザー'}
              maxLength={50}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${theme.border}`, background: theme.cardAlt,
                color: theme.text, fontSize: 15, boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={handleEditSave}
            disabled={saving}
            style={{
              width: '100%', background: theme.accent, color: '#fff',
              border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', fontSize: 15, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </Modal>

      {/* Share image Modal */}
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
