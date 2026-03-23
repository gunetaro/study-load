'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { Session, Material, fmtDuration } from '@/types'
import { TimelineSkeleton } from '@/components/ui/Skeleton'

type ViewMode = 'list' | 'calendar'

function ds(d: Date) { return d.toISOString().split('T')[0] }

export default function TimelineTab() {
  const { userId, theme, subjects, showToast } = useApp()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Edit
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [editMemo, setEditMemo] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editTagInput, setEditTagInput] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editMaterialId, setEditMaterialId] = useState<string | null>(null)
  const [editMaterials, setEditMaterials] = useState<Material[]>([])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sessions').select('*, subjects(*), materials(*), session_tags(*)')
      .eq('user_id', userId).order('created_at', { ascending: false })
    const list = data || []
    setSessions(list)
    const tags = new Set<string>()
    list.forEach((s: Session) => s.session_tags?.forEach(t => tags.add(t.tag)))
    setAllTags(Array.from(tags).sort())
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Filter
  const filtered = sessions.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      const match = s.subjects?.name?.toLowerCase().includes(q)
        || s.memo?.toLowerCase().includes(q)
        || s.session_tags?.some(t => t.tag.toLowerCase().includes(q))
      if (!match) return false
    }
    if (tagFilter && !s.session_tags?.some(t => t.tag === tagFilter)) return false
    if (selectedDay && viewMode === 'calendar' && s.date !== selectedDay) return false
    return true
  })

  // Group by date
  const grouped: Record<string, Session[]> = {}
  filtered.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s) })
  const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const sub = (id: string) => subjects.find(s => s.id === id)

  // Edit handlers
  const handleEdit = async (s: Session) => {
    setEditSession(s)
    setEditMemo(s.memo || '')
    setEditUrl(s.url || '')
    setEditTags((s.session_tags || []).map(t => t.tag))
    setEditTagInput('')
    setEditMaterialId(s.material_id || null)
    const { data } = await supabase.from('materials').select('*').eq('user_id', userId).eq('subject_id', s.subject_id)
    setEditMaterials(data || [])
  }

  const confirmEditTag = () => {
    const t = editTagInput.trim().replace(/^#+/, '')
    if (t && !editTags.includes(t)) setEditTags(p => [...p, t])
    setEditTagInput('')
  }

  const handleEditTagKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); confirmEditTag() }
    else if (e.key === 'Backspace' && editTagInput === '' && editTags.length > 0) setEditTags(p => p.slice(0, -1))
  }

  const handleSaveEdit = async () => {
    if (!editSession) return
    await supabase.from('sessions').update({ memo: editMemo || null, url: editUrl.trim() || null, material_id: editMaterialId || null }).eq('id', editSession.id)
    await supabase.from('session_tags').delete().eq('session_id', editSession.id)
    const finalTags = editTagInput.trim() ? [...editTags, editTagInput.trim().replace(/^#+/, '')] : editTags
    if (finalTags.length > 0) await supabase.from('session_tags').insert(finalTags.map(tag => ({ session_id: editSession.id, tag })))
    showToast('更新しました')
    setEditSession(null)
    loadSessions()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この記録を削除しますか？')) return
    await supabase.from('session_tags').delete().eq('session_id', id)
    await supabase.from('sessions').delete().eq('id', id)
    showToast('削除しました')
    loadSessions()
  }

  // Calendar data
  const year = calendarDate.getFullYear(), month = calendarDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  // Adjust to Mon start: (dow + 6) % 7
  const firstOffset = (firstDow + 6) % 7

  const calDayData = (day: number) => {
    const dayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const daySessions = sessions.filter(s => s.date === dayStr)
    const subjectIds = new Set(daySessions.map(s => s.subject_id))
    const color = subjectIds.size === 1 ? sub([...subjectIds][0])?.color : subjectIds.size > 1 ? theme.accent : null
    return { dayStr, color, isToday: dayStr === ds(new Date()), isSelected: selectedDay === dayStr }
  }

  const todayStr = ds(new Date())
  const formatDateLabel = (day: string) => {
    if (day === todayStr) return '今日'
    const d = new Date(day)
    return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.text, flex: 1 }}>📋 記録</span>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <button onClick={() => { setViewMode('list'); setSelectedDay(null) }} style={{
            padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: viewMode === 'list' ? theme.accent : theme.card,
            color: viewMode === 'list' ? '#fff' : theme.textSub,
          }}>リスト</button>
          <button onClick={() => { setViewMode('calendar'); setSelectedDay(null) }} style={{
            padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 14,
            background: viewMode === 'calendar' ? theme.accent : theme.card,
            color: viewMode === 'calendar' ? '#fff' : theme.textSub,
            borderLeft: `1px solid ${theme.border}`,
          }}>📅</button>
        </div>
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 メモ・タグ・教科で検索"
        style={{
          width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
          background: theme.cardAlt, color: theme.text, fontSize: 13,
          padding: '9px 12px', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box',
        }}
      />

      {/* Tag pills */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
          <button onClick={() => setTagFilter('')} style={{
            padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
            background: !tagFilter ? theme.accent : theme.cardAlt, color: !tagFilter ? '#fff' : theme.textSub,
          }}>すべて</button>
          {allTags.map(t => (
            <button key={t} onClick={() => setTagFilter(t === tagFilter ? '' : t)} style={{
              padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
              background: tagFilter === t ? theme.accent : theme.cardAlt, color: tagFilter === t ? '#fff' : theme.textSub,
            }}>#{t}</button>
          ))}
        </div>
      )}

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <div style={{ background: theme.card, borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button onClick={() => setCalendarDate(new Date(year, month - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub, padding: '0 8px' }}>◀</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{year}年{month+1}月</span>
            <button onClick={() => setCalendarDate(new Date(year, month + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: theme.textSub, padding: '0 8px' }}>▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
            {['月','火','水','木','金','土','日'].map(d => (
              <div key={d} style={{ fontSize: 9, color: theme.textSub, fontWeight: 700, padding: '2px 0' }}>{d}</div>
            ))}
            {Array.from({ length: firstOffset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const { dayStr, color, isToday, isSelected } = calDayData(d)
              return (
                <button key={d} onClick={() => setSelectedDay(isSelected ? null : dayStr)} style={{
                  padding: '5px 2px', borderRadius: 8, cursor: 'pointer',
                  background: color ? `${color}33` : 'transparent',
                  border: isSelected ? `2px solid ${theme.accent}` : '2px solid transparent',
                  color: isToday ? theme.accent : theme.text,
                  fontWeight: isToday ? 700 : 400, fontSize: 12,
                }}>
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sessions */}
      {loading ? (
        <TimelineSkeleton border={theme.border} borderLight={theme.cardAlt} />
      ) : sortedDays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 4 }}>まだ記録がありません</div>
          <div style={{ fontSize: 12, color: theme.textSub }}>タイマーで勉強を始めましょう！</div>
        </div>
      ) : sortedDays.map(day => {
        const daySessions = grouped[day]
        const dayTotal = daySessions.reduce((sum, s) => sum + s.duration, 0)
        return (
          <div key={day} style={{ marginBottom: 16 }}>
            {/* Day header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSub }}>{formatDateLabel(day)}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.accent }}>合計 {fmtDuration(dayTotal)} · {daySessions.length}回</span>
            </div>

            {/* Session cards */}
            {daySessions.map(s => {
              const subj = sub(s.subject_id)
              return (
                <div key={s.id} style={{
                  background: theme.card, borderRadius: 12, padding: 12, marginBottom: 8,
                  border: `1px solid ${theme.border}`, borderLeft: `4px solid ${subj?.color || theme.accent}`,
                }}>
                  {/* Top row: subject + duration + buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{subj?.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginLeft: 4, flex: 1 }}>{subj?.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: subj?.color || theme.accent, marginRight: 6 }}>{fmtDuration(s.duration)}</span>
                    <button onClick={() => handleEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>✏️</button>
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', color: theme.danger }}>🗑</button>
                  </div>

                  {/* Material + time */}
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: theme.textSub, marginBottom: (s.session_tags?.length || s.memo || s.url) ? 4 : 0 }}>
                    {s.materials && <span>📖 {s.materials.name}</span>}
                    {s.start_time && <span>{s.start_time.slice(0, 5)}</span>}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ color: theme.accent, textDecoration: 'none', fontWeight: 600 }}>🔗 リンク</a>
                    )}
                  </div>

                  {/* Tags */}
                  {(s.session_tags || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: s.memo ? 4 : 0 }}>
                      {s.session_tags!.map(t => (
                        <span key={t.id} style={{
                          background: theme.cardAlt, color: theme.textSub,
                          padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                        }}>#{t.tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Memo */}
                  {s.memo && (
                    <div style={{
                      background: theme.cardAlt, borderRadius: 6, padding: 6,
                      fontSize: 10, color: theme.text, lineHeight: 1.4,
                    }}>{s.memo}</div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Edit Modal */}
      <Modal open={!!editSession} onClose={() => setEditSession(null)} title="セッションを編集">
        <div>
          {/* Tags */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>タグ</label>
            {editTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editTags.map(tag => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, background: theme.accentLight, borderRadius: 20, padding: '3px 10px' }}>
                    <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>#{tag}</span>
                    <button onClick={() => setEditTags(p => p.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSub, fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <input
              value={editTagInput} onChange={e => setEditTagInput(e.target.value)}
              onKeyDown={handleEditTagKey}
              placeholder="#タグを入力してスペース"
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 13,
                padding: '9px 12px', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Memo */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>メモ</label>
            <textarea
              value={editMemo} onChange={e => setEditMemo(e.target.value)}
              rows={3}
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 13,
                padding: '9px 12px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* URL */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>🔗 URL</label>
            <input
              type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
              placeholder="GoogleドライブやWebサイトのURL"
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 13,
                padding: '9px 12px', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Material select */}
          {editMaterials.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>教材</label>
              <select
                value={editMaterialId || ''} onChange={e => setEditMaterialId(e.target.value || null)}
                style={{
                  width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                  background: theme.cardAlt, color: theme.text, fontSize: 13,
                  padding: '9px 12px', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              >
                <option value="">教材なし</option>
                {editMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditSession(null)} style={{
              flex: 1, padding: '12px', borderRadius: 12,
              border: `1px solid ${theme.border}`, background: theme.card,
              color: theme.textSub, fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}>キャンセル</button>
            <button onClick={handleSaveEdit} style={{
              flex: 2, padding: '12px', borderRadius: 12,
              background: theme.accent, color: '#fff', border: 'none',
              fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}>保存</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
