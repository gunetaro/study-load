import { Profile, Subject, Session, SessionTag, BadgeAward, Goal, UserSettings } from '@/types'

const DEMO_USER_ID = 'demo-user'

function dayStr(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

export const demoProfile: Profile = {
  id: DEMO_USER_ID,
  name: 'デモユーザー',
  avatar_url: null,
  header_url: null,
  selected_title: 't_diligent',
  xp: 2450,
  created_at: '2026-01-01T00:00:00Z',
}

export const demoSubjects: Subject[] = [
  { id: 'demo-s1', user_id: DEMO_USER_ID, name: '数学', icon: '📐', color: '#8B9FFF', sort_order: 1 },
  { id: 'demo-s2', user_id: DEMO_USER_ID, name: '英語', icon: '📘', color: '#FF9B8B', sort_order: 2 },
  { id: 'demo-s3', user_id: DEMO_USER_ID, name: '理科', icon: '🧪', color: '#7DDBA3', sort_order: 3 },
  { id: 'demo-s4', user_id: DEMO_USER_ID, name: '社会', icon: '🌍', color: '#D4A0E8', sort_order: 4 },
  { id: 'demo-s5', user_id: DEMO_USER_ID, name: '国語', icon: '📝', color: '#F0C56D', sort_order: 5 },
]

export const demoGoal: Goal = {
  id: 'demo-goal',
  user_id: DEMO_USER_ID,
  daily_minutes: 120,
  weekly_minutes: 600,
  subject_goals: {},
}

export const demoBadges: BadgeAward[] = [
  { id: 'db1', user_id: DEMO_USER_ID, badge_key: 'first_session', awarded_at: '2026-03-10T10:00:00Z' },
  { id: 'db2', user_id: DEMO_USER_ID, badge_key: 'daily_1h', awarded_at: '2026-03-12T18:00:00Z' },
  { id: 'db3', user_id: DEMO_USER_ID, badge_key: 'daily_2h', awarded_at: '2026-03-15T20:00:00Z' },
  { id: 'db4', user_id: DEMO_USER_ID, badge_key: 'daily_3h', awarded_at: '2026-03-18T21:00:00Z' },
]

export const demoSettings: UserSettings = {
  id: 'demo-settings',
  user_id: DEMO_USER_ID,
  theme_name: 'pastel',
  custom_colors: {},
  pomo_settings: { work: 25, short: 5, long: 15, rounds: 4 },
  reminder_settings: { enabled: false, time: '20:00', message: '今日まだ勉強してないよ！' },
}

const demoTags = ['テスト勉強', '復習', '予習', 'レポート', '暗記', '宿題', '問題集']
const demoMemos = [
  'チャプター3まで完了',
  '単語100個復習した',
  '過去問2年分',
  '公式の証明を理解',
  'リスニング練習30分',
  '年表まとめ完了',
  '古文の文法復習',
  null, null, null,
]

// Generate sessions for the past 14 days
function generateSessions(): Session[] {
  const sessions: Session[] = []
  let id = 0

  for (let dayOffset = -13; dayOffset <= 0; dayOffset++) {
    const date = dayStr(dayOffset)
    const sessionsPerDay = rnd(2, 5)

    for (let i = 0; i < sessionsPerDay; i++) {
      const subj = demoSubjects[rnd(0, 4)]
      const hour = rnd(8, 22)
      const duration = rnd(600, 5400) // 10min to 90min
      const hasTags = Math.random() > 0.4
      const hasMemo = Math.random() > 0.5

      const sessionId = `demo-sess-${++id}`
      const tags: SessionTag[] = hasTags
        ? [{ id: `dt-${id}-1`, session_id: sessionId, tag: demoTags[rnd(0, demoTags.length - 1)] }]
        : []
      if (hasTags && Math.random() > 0.6) {
        tags.push({ id: `dt-${id}-2`, session_id: sessionId, tag: demoTags[rnd(0, demoTags.length - 1)] })
      }

      sessions.push({
        id: sessionId,
        user_id: DEMO_USER_ID,
        subject_id: subj.id,
        material_id: null,
        date,
        start_time: `${String(hour).padStart(2, '0')}:${String(rnd(0, 59)).padStart(2, '0')}:00`,
        duration,
        break_time: 0,
        pomo_rounds: 0,
        memo: hasMemo ? demoMemos[rnd(0, demoMemos.length - 1)] : null,
        url: null,
        created_at: `${date}T${String(hour).padStart(2, '0')}:00:00Z`,
        subjects: subj,
        session_tags: tags,
      })
    }
  }

  return sessions.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Cache so sessions are stable within a page load
let _cachedSessions: Session[] | null = null
export function getDemoSessions(): Session[] {
  if (!_cachedSessions) _cachedSessions = generateSessions()
  return _cachedSessions
}

export const demoUserMeta = {
  full_name: 'デモユーザー',
  avatar_url: null,
}
