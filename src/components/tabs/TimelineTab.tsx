'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { Session, fmtDuration } from '@/types'

type ViewMode = 'list' | 'calendar'

function getDateStr(date: Date) {
  return date.toISOString().split('T')[0]
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export default function TimelineTab() {
  const { userId, theme, subjects, showToast } = useApp()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [editMemo, setEditMemo] = useState('')
  const [editTags, setEditTags] = useState('')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('sessions')
      .select('*, subjects(*), materials(*), session_tags(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const { data } = await query
    const list = data || []
    setSessions(list)

    const tags = new Set<string>()
    list.forEach((s: Session) => {
      s.session_tags?.forEach(t => tags.add(t.tag))
    })
    setAllTags(Array.from(tags).sort())
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => { loadSessions() }, [loadSessions])

  const filtered = sessions.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      const subjectMatch = s.subjects?.name.toLowerCase().includes(q)
      const memoMatch = s.memo?.toLowerCase().includes(q)
      if (!subjectMatch && !memoMatch) return false
    }
    if (tagFilter) {
      const hasTags = s.session_tags?.some(t => t.tag === tagFilter)
      if (!hasTags) return false
    }
    if (selectedDay && viewMode === 'calendar') {
      if (s.date !== selectedDay) return false
    }
    return true
  })

  const handleEdit = (s: Session) => {
    setEditSession(s)
    setEditMemo(s.memo || '')
    setEditTags((s.session_tags || []).map(t => t.tag).join(', '))
  }

  const handleSaveEdit = async () => {
    if (!editSession) return
    await supabase.from('sessions').update({ memo: editMemo || null }).eq('id', editSession.id)
    await supabase.from('session_tags').delete().eq('session_id', editSession.id)
    const tagList = editTags.split(/[,、\s]+/).filter(Boolean).map(tag => ({
      session_id: editSession.id,
      tag: tag.trim(),
    }))
    if (tagList.length > 0) await supabase.from('session_tags').insert(tagList)
    showToast('更新しました')
    setEditSession(null)
    loadSessions()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このセッションを削除しますか？')) return
    await supabase.from('session_tags').delete().eq('session_id', id)
    await supabase.from('sessions').delete().eq('id', id)
    showToast('削除しました')
    loadSessions()
  }

  // Group sessions by date for list view
  const grouped: Record<string, Session[]> = {}
  filtered.forEach(s => {
    const day = s.date
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(s)
  })
  const sortedDays = Object.keys(grouped).sort((a,b) => b.localeCompare(a))

  // Calendar
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = new Date(year, month, 1).getDay()
  const monthSessions: Record<string, number> = {}
  sessions.forEach(s => {
    const day = s.date
    if (day.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
      monthSessions[day] = (monthSessions[day] || 0) + s.duration
    }
  })

  const subject = (id: string) => subjects.find(s => s.id === id)

  return (
    <div>
      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 検索..."
          style={{
            flex: 1, borderRadius: 10, border: `1px solid ${theme.border}`,
            background: theme.card, color: theme.text, fontSize: 14,
            padding: '10px 12px', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['list','calendar'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setViewMode(v); setSelectedDay(null) }} style={{
              padding: '10px 12px', borderRadius: 10,
              background: viewMode===v ? theme.accent : theme.card,
              color: viewMode===v ? '#fff' : theme.textSub,
              border: `1px solid ${theme.border}`, cursor: 'pointer', fontSize: 16,
            }}>
              {v === 'list' ? '☰' : '📅'}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setTagFilter('')} style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            background: !tagFilter ? theme.accent : theme.card,
            color: !tagFilter ? '#fff' : theme.textSub,
            border: `1px solid ${theme.border}`,
          }}>全て</button>
          {allTags.map(t => (
            <button key={t} onClick={() => setTagFilter(t === tagFilter ? '' : t)} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              background: tagFilter===t ? theme.accent : theme.card,
              color: tagFilter===t ? '#fff' : theme.textSub,
              border: `1px solid ${theme.border}`,
            }}>#{t}</button>
          ))}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setCalendarDate(new Date(year, month-1, 1))} style={{ background: 'none', border: 'none', color: theme.textSub, cursor: 'pointer', fontSize: 20 }}>‹</button>
            <span style={{ fontWeight: 700, color: theme.text }}>{year}年{month+1}月</span>
            <button onClick={() => setCalendarDate(new Date(year, month+1, 1))} style={{ background: 'none', border: 'none', color: theme.textSub, cursor: 'pointer', fontSize: 20 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
            {['日','月','火','水','木','金','土'].map(d => (
              <div key={d} style={{ fontSize: 11, color: theme.textSub, padding: '4px 0' }}>{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const dayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const sec = monthSessions[dayStr] || 0
              const isSelected = selectedDay === dayStr
              const isToday = dayStr === getDateStr(new Date())
              return (
                <button key={d} onClick={() => setSelectedDay(isSelected ? null : dayStr)} style={{
                  padding: '6px 2px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: isSelected ? theme.accent : sec > 0 ? theme.accentLight : 'transparent',
                  color: isSelected ? '#fff' : isToday ? theme.accent : theme.text,
                  fontWeight: isToday ? 700 : 400, fontSize: 13,
                  outline: isToday && !isSelected ? `2px solid ${theme.accent}` : 'none',
                }}>
                  <div>{d}</div>
                  {sec > 0 && <div style={{ fontSize: 9, color: isSelected ? '#fff' : theme.accent, marginTop: 1 }}>
                    {Math.floor(sec/3600)}h{Math.floor((sec%3600)/60)}m
                  </div>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: theme.textSub, padding: 32 }}>読み込み中...</div>
      ) : sortedDays.length === 0 ? (
        <div style={{ textAlign: 'center', color: theme.textSub, padding: 32 }}>
          {selectedDay ? 'この日の記録はありません' : '記録がありません'}
        </div>
      ) : (
        sortedDays.map(day => {
          const daySessions = grouped[day]
          const dayTotal = daySessions.reduce((sum, s) => sum + s.duration, 0)
          const dateObj = new Date(day)
          const dateLabel = dateObj.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
          return (
            <div key={day} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.textSub }}>{dateLabel}</span>
                <span style={{ fontSize: 12, color: theme.accent, fontWeight: 700 }}>合計 {fmtDuration(dayTotal)}</span>
              </div>
              {daySessions.map(s => {
                const sub = subject(s.subject_id)
                const time = s.start_time ? s.start_time.slice(0, 5) : ''
                return (
                  <div key={s.id} style={{
                    background: theme.card, borderRadius: 14, padding: '14px 16px',
                    marginBottom: 8, border: `1px solid ${theme.border}`,
                    borderLeft: `4px solid ${sub?.color || theme.accent}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{sub?.icon}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>{sub?.name}</span>
                          <span style={{ fontSize: 11, color: theme.textSub }}>{time}</span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent, marginBottom: 4 }}>
                          {fmtDuration(s.duration)}
                        </div>
                        {s.materials && (
                          <div style={{ fontSize: 12, color: theme.textSub, marginBottom: 4 }}>📖 {s.materials.name}</div>
                        )}
                        {s.memo && (
                          <div style={{ fontSize: 13, color: theme.text, marginBottom: 4 }}>{s.memo}</div>
                        )}
                        {(s.session_tags || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {s.session_tags!.map(t => (
                              <span key={t.id} style={{
                                background: theme.accentLight, color: theme.accent,
                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              }}>#{t.tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8 }}>
                        <button onClick={() => handleEdit(s)} style={{
                          background: theme.cardAlt, border: 'none', borderRadius: 8,
                          padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                        }}>✏️</button>
                        <button onClick={() => handleDelete(s.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: theme.danger,
                        }}>🗑</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {/* Edit Modal */}
      <Modal open={!!editSession} onClose={() => setEditSession(null)} title="セッションを編集">
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>メモ</label>
            <textarea
              value={editMemo}
              onChange={e => setEditMemo(e.target.value)}
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
              value={editTags}
              onChange={e => setEditTags(e.target.value)}
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 14,
                padding: '10px 12px', fontFamily: 'inherit',
              }}
            />
          </div>
          <button onClick={handleSaveEdit} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
          }}>保存</button>
        </div>
      </Modal>
    </div>
  )
}
