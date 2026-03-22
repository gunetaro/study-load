'use client'
import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Modal } from '@/components/ui/Modal'
import { Subject, Material } from '@/types'

const ICONS = ['📚','✏️','📐','🧪','🌍','📝','💻','🎵','🏋️','🎨','📊','🔬','📖','🧮','🗺️','🔭','⚗️','🎯','🎭','🌐']
const COLORS = ['#5B8DEF','#EF8B5B','#6BC9A4','#C97BB6','#E8B44A','#EF5B5B','#5BEFD0','#B45BEF','#8BC97B','#C9B47B']

interface EditSubject { id?: string; name: string; icon: string; color: string }
interface EditMaterial { id?: string; name: string; subject_id: string; current_image_url?: string | null }

export default function MaterialsTab() {
  const { subjects, refreshSubjects, userId, theme, showToast } = useApp()
  const supabase = createClient()

  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [materials, setMaterials] = useState<Record<string, Material[]>>({})
  const [loadingMats, setLoadingMats] = useState<string | null>(null)

  // Subject edit
  const [subjectModal, setSubjectModal] = useState(false)
  const [editSubject, setEditSubject] = useState<EditSubject>({ name: '', icon: '📚', color: '#5B8DEF' })
  const [savingSubject, setSavingSubject] = useState(false)

  // Material edit
  const [materialModal, setMaterialModal] = useState(false)
  const [editMaterial, setEditMaterial] = useState<EditMaterial>({ name: '', subject_id: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [savingMaterial, setSavingMaterial] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const loadMaterials = useCallback(async (subjectId: string) => {
    if (materials[subjectId]) return
    setLoadingMats(subjectId)
    const { data } = await supabase.from('materials').select('*').eq('user_id', userId).eq('subject_id', subjectId)
    setMaterials(prev => ({ ...prev, [subjectId]: data || [] }))
    setLoadingMats(null)
  }, [materials, userId, supabase])

  const reloadMaterials = useCallback(async (subjectId: string) => {
    setLoadingMats(subjectId)
    const { data } = await supabase.from('materials').select('*').eq('user_id', userId).eq('subject_id', subjectId)
    setMaterials(prev => ({ ...prev, [subjectId]: data || [] }))
    setLoadingMats(null)
  }, [userId, supabase])

  const toggleExpand = async (subjectId: string) => {
    if (expandedSubject === subjectId) {
      setExpandedSubject(null)
    } else {
      setExpandedSubject(subjectId)
      await loadMaterials(subjectId)
    }
  }

  // Subject CRUD
  const openAddSubject = () => {
    setEditSubject({ name: '', icon: '📚', color: '#5B8DEF' })
    setSubjectModal(true)
  }

  const openEditSubject = (s: Subject, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditSubject({ id: s.id, name: s.name, icon: s.icon, color: s.color })
    setSubjectModal(true)
  }

  const saveSubject = async () => {
    if (!editSubject.name.trim()) { showToast('教科名を入力してください'); return }
    setSavingSubject(true)
    if (editSubject.id) {
      await supabase.from('subjects').update({
        name: editSubject.name,
        icon: editSubject.icon,
        color: editSubject.color,
      }).eq('id', editSubject.id)
    } else {
      await supabase.from('subjects').insert({
        user_id: userId,
        name: editSubject.name,
        icon: editSubject.icon,
        color: editSubject.color,
        sort_order: subjects.length + 1,
      })
    }
    await refreshSubjects()
    setSavingSubject(false)
    setSubjectModal(false)
    showToast(editSubject.id ? '教科を更新しました' : '教科を追加しました')
  }

  const deleteSubject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この教科と関連する教材をすべて削除しますか？')) return
    await supabase.from('materials').delete().eq('subject_id', id)
    await supabase.from('subjects').delete().eq('id', id)
    await refreshSubjects()
    if (expandedSubject === id) setExpandedSubject(null)
    showToast('削除しました')
  }

  // Material CRUD
  const openAddMaterial = (subjectId: string) => {
    setEditMaterial({ name: '', subject_id: subjectId })
    setImageFile(null)
    setImagePreview(null)
    setMaterialModal(true)
  }

  const openEditMaterial = (m: Material) => {
    setEditMaterial({ id: m.id, name: m.name, subject_id: m.subject_id, current_image_url: m.image_url })
    setImageFile(null)
    setImagePreview(m.image_url || null)
    setMaterialModal(true)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const saveMaterial = async () => {
    if (!editMaterial.name.trim()) { showToast('教材名を入力してください'); return }
    setSavingMaterial(true)

    let imageUrl: string | null = editMaterial.current_image_url ?? null
    if (imageFile) {
      const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/${editMaterial.id || Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('materials')
        .upload(path, imageFile, { upsert: true, contentType: imageFile.type || `image/${ext}` })
      if (uploadError) {
        console.error('[material image] upload error:', uploadError.message)
        showToast('画像のアップロードに失敗しました')
        setSavingMaterial(false)
        return
      }
      const { data: urlData } = supabase.storage.from('materials').getPublicUrl(path)
      imageUrl = `${urlData.publicUrl}?t=${Date.now()}`
    }

    if (editMaterial.id) {
      await supabase.from('materials').update({
        name: editMaterial.name,
        ...(imageFile ? { image_url: imageUrl } : {}),
      }).eq('id', editMaterial.id)
    } else {
      await supabase.from('materials').insert({
        user_id: userId,
        subject_id: editMaterial.subject_id,
        name: editMaterial.name,
        image_url: imageUrl,
      })
    }

    await reloadMaterials(editMaterial.subject_id)
    setSavingMaterial(false)
    setMaterialModal(false)
    showToast(editMaterial.id ? '教材を更新しました' : '教材を追加しました')
  }

  const deleteMaterial = async (m: Material) => {
    if (!confirm('この教材を削除しますか？')) return
    await supabase.from('materials').delete().eq('id', m.id)
    setMaterials(prev => ({ ...prev, [m.subject_id]: (prev[m.subject_id] || []).filter(x => x.id !== m.id) }))
    showToast('削除しました')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: theme.textSub, fontWeight: 600 }}>教科・教材管理</div>
        <button onClick={openAddSubject} style={{
          background: theme.accent, color: '#fff', border: 'none',
          borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          + 教科追加
        </button>
      </div>

      {subjects.length === 0 && (
        <div style={{ textAlign: 'center', color: theme.textSub, padding: 32 }}>
          教科が登録されていません
        </div>
      )}

      {subjects.map(s => (
        <div key={s.id} style={{ marginBottom: 8 }}>
          <div
            onClick={() => toggleExpand(s.id)}
            style={{
              background: theme.card, borderRadius: expandedSubject === s.id ? '14px 14px 0 0' : 14,
              padding: '14px 16px', cursor: 'pointer',
              border: `1px solid ${theme.border}`,
              borderLeftWidth: 4, borderLeftColor: s.color,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: theme.text, flex: 1 }}>{s.name}</span>
            <button onClick={e => openEditSubject(s, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: theme.textSub }}>✏️</button>
            <button onClick={e => deleteSubject(s.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: theme.danger }}>🗑</button>
            <span style={{ color: theme.textSub, fontSize: 14 }}>{expandedSubject === s.id ? '▲' : '▼'}</span>
          </div>

          {expandedSubject === s.id && (
            <div style={{
              background: theme.cardAlt, borderRadius: '0 0 14px 14px',
              border: `1px solid ${theme.border}`, borderTop: 'none',
              padding: '12px 16px',
            }}>
              <button onClick={() => openAddMaterial(s.id)} style={{
                width: '100%', padding: '10px', borderRadius: 10, marginBottom: 10,
                border: `1.5px dashed ${theme.border}`, background: 'transparent',
                color: theme.accent, fontWeight: 600, cursor: 'pointer', fontSize: 13,
              }}>
                + 教材を追加
              </button>

              {loadingMats === s.id && (
                <div style={{ textAlign: 'center', color: theme.textSub, padding: 12, fontSize: 13 }}>読み込み中...</div>
              )}

              {(materials[s.id] || []).length === 0 && loadingMats !== s.id && (
                <div style={{ textAlign: 'center', color: theme.textSub, fontSize: 13, padding: '8px 0' }}>教材が登録されていません</div>
              )}

              {(materials[s.id] || []).map(m => (
                <div key={m.id} style={{
                  background: theme.card, borderRadius: 10, padding: '10px 14px',
                  marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
                  border: `1px solid ${theme.border}`,
                }}>
                  {m.image_url ? (
                    <img src={m.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: 24, width: 40, textAlign: 'center', flexShrink: 0 }}>📖</span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{m.name}</div>
                  </div>
                  <button onClick={() => openEditMaterial(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>✏️</button>
                  <button onClick={() => deleteMaterial(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: theme.danger }}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Subject Modal */}
      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title={editSubject.id ? '教科を編集' : '教科を追加'}>
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>教科名</label>
            <input
              value={editSubject.name}
              onChange={e => setEditSubject(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 数学"
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 14,
                padding: '10px 12px', fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>アイコン</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map(icon => (
                <button key={icon} onClick={() => setEditSubject(p => ({ ...p, icon }))} style={{
                  width: 40, height: 40, borderRadius: 10, border: `2px solid ${editSubject.icon===icon ? theme.accent : theme.border}`,
                  background: editSubject.icon===icon ? theme.accentLight : theme.card,
                  cursor: 'pointer', fontSize: 20,
                }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>カラー</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLORS.map(color => (
                <button key={color} onClick={() => setEditSubject(p => ({ ...p, color }))} style={{
                  width: 32, height: 32, borderRadius: '50%', background: color,
                  border: `3px solid ${editSubject.color===color ? theme.text : 'transparent'}`,
                  cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>
          <button onClick={saveSubject} disabled={savingSubject} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
            opacity: savingSubject ? 0.7 : 1,
          }}>
            {savingSubject ? '保存中...' : '保存'}
          </button>
        </div>
      </Modal>

      {/* Material Modal */}
      <Modal open={materialModal} onClose={() => setMaterialModal(false)} title={editMaterial.id ? '教材を編集' : '教材を追加'}>
        <div>
          {/* Image upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 8 }}>サムネイル画像（任意）</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                background: theme.cardAlt, border: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28 }}>📖</span>
                )}
              </div>
              <button
                onClick={() => imageInputRef.current?.click()}
                style={{
                  padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${theme.border}`, background: theme.card, color: theme.text,
                }}
              >
                {imagePreview ? '変更' : '画像を選択'}
              </button>
              {imagePreview && (
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: theme.danger }}
                >
                  削除
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageChange}
              />
            </div>
          </div>

          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: theme.textSub, display: 'block', marginBottom: 6 }}>教材名</label>
            <input
              value={editMaterial.name}
              onChange={e => setEditMaterial(p => ({ ...p, name: e.target.value }))}
              placeholder="例: チャート式数学"
              style={{
                width: '100%', borderRadius: 10, border: `1px solid ${theme.border}`,
                background: theme.cardAlt, color: theme.text, fontSize: 14,
                padding: '10px 12px', fontFamily: 'inherit',
              }}
            />
          </div>

          <button onClick={saveMaterial} disabled={savingMaterial} style={{
            width: '100%', background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, cursor: 'pointer', fontSize: 15,
            opacity: savingMaterial ? 0.7 : 1,
          }}>
            {savingMaterial ? '保存中...' : '保存'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
