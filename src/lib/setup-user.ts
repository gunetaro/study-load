import { SupabaseClient } from '@supabase/supabase-js'

export async function setupNewUser(supabase: SupabaseClient, userId: string) {
  // goalsがなければ新規ユーザー
  const { data: existing } = await supabase
    .from('goals')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  if (existing) return // 既にセットアップ済み

  // goals作成
  await supabase.from('goals').insert({
    user_id: userId,
    daily_minutes: 120,
    weekly_minutes: 600,
    subject_goals: {},
  })

  // user_settings作成
  await supabase.from('user_settings').insert({
    user_id: userId,
    theme_name: 'minimal',
    custom_colors: {},
    pomo_settings: { work: 25, short: 5, long: 15, rounds: 4 },
  })

  // デフォルト教科作成
  const defaultSubjects = [
    { name: '数学', color: '#5B8DEF', icon: '➗', sort_order: 1 },
    { name: '英語', color: '#EF8B5B', icon: '🔤', sort_order: 2 },
    { name: '理科', color: '#6BC9A4', icon: '🧪', sort_order: 3 },
    { name: '社会', color: '#C97BB6', icon: '🌍', sort_order: 4 },
    { name: '国語', color: '#E8B44A', icon: '📝', sort_order: 5 },
  ]

  await supabase.from('subjects').insert(
    defaultSubjects.map(s => ({ ...s, user_id: userId }))
  )
}
