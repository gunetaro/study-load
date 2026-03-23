'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ThemeColors } from '@/types'

export const EMOJIS = ['📐','📘','📗','📙','📕','🎯','💡','🌟','✨','🎨','🎵','💻','📊','🔬','🌍','✏️','📝','📚','🧠','⭐','🌸','🍎','🔢','🅰️','🧪','📖','🏃','⚽','🎹','🖥️']

interface PickerProps {
  value: string
  userId: string | null
  onChange: (v: string) => void
  theme: ThemeColors
}

/** アイコン値（絵文字 or URL）を表示する汎用コンポーネント */
export function SubjectIconDisplay({ icon, size = 24 }: { icon: string; size?: number }) {
  if (icon.startsWith('http')) {
    return (
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size, borderRadius: 6, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle' }}
      />
    )
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>
}

/** 教科アイコン選択UI（絵文字 / 画像アップロード タブ切替） */
export function SubjectIconPicker({ value, userId, onChange, theme }: PickerProps) {
  const isUrl = value.startsWith('http')
  const [tab, setTab] = useState<'emoji' | 'image'>(isUrl ? 'image' : 'emoji')
  const [imagePreview, setImagePreview] = useState<string | null>(isUrl ? value : null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `subjects/${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('materials')
      .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` })
    if (error) {
      console.error('[subject icon] upload error:', error.message)
    } else {
      const { data } = supabase.storage.from('materials').getPublicUrl(path)
      onChange(`${data.publicUrl}?t=${Date.now()}`)
    }
    setUploading(false)
  }

  return (
    <div>
      {/* タブ切替 */}
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
        {(['emoji', 'image'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t ? theme.accent : theme.card,
            color: tab === t ? '#fff' : theme.textSub,
          }}>
            {t === 'emoji' ? '😀 絵文字' : '🖼 画像'}
          </button>
        ))}
      </div>

      {tab === 'emoji' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EMOJIS.map(emoji => (
            <button key={emoji} onClick={() => onChange(emoji)} style={{
              width: 40, height: 40, borderRadius: 10,
              border: `2px solid ${value === emoji ? theme.accent : theme.border}`,
              background: value === emoji ? theme.accentLight : theme.card,
              cursor: 'pointer', fontSize: 20,
            }}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {tab === 'image' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {imagePreview && (
            <div style={{
              width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
              background: theme.cardAlt, border: `1px solid ${theme.border}`,
            }}>
              <img
                src={imagePreview}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${theme.border}`, background: theme.card, color: theme.text,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'アップロード中...' : imagePreview ? '📸 変更' : '📸 画像を選択'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
        </div>
      )}
    </div>
  )
}
