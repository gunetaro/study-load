export type Theme = 'minimal' | 'pop' | 'midnight' | 'pastel'

export interface ThemeColors {
  bg: string
  card: string
  cardAlt: string
  text: string
  textSub: string
  accent: string
  accentLight: string
  border: string
  danger: string
  success: string
}

export const THEMES: Record<Theme, ThemeColors> = {
  minimal: {
    bg: '#F5F4F0',
    card: '#FFFFFF',
    cardAlt: '#F0EEE9',
    text: '#1A1A1A',
    textSub: '#9A9A94',
    accent: '#3B82F6',
    accentLight: '#EFF6FF',
    border: '#E2E1DC',
    danger: '#EF4444',
    success: '#10B981',
  },
  pop: {
    bg: '#FFF7FB',
    card: '#FFFFFF',
    cardAlt: '#FFF0F8',
    text: '#3A2D52',
    textSub: '#A38FB8',
    accent: '#FF4FC3',
    accentLight: '#FFE8F8',
    border: '#F3D7F0',
    danger: '#FF5A87',
    success: '#38D9A9',
  },
  midnight: {
    bg: '#10131A',
    card: '#1A1F2B',
    cardAlt: '#151923',
    text: '#ECEAF6',
    textSub: '#8B90A7',
    accent: '#9B8CFF',
    accentLight: '#1E2040',
    border: '#2B3142',
    danger: '#FF6F9F',
    success: '#46D6A8',
  },
  pastel: {
    bg: '#F8F6FF',
    card: '#FFFFFF',
    cardAlt: '#F0ECFF',
    text: '#5C5670',
    textSub: '#AAA4BC',
    accent: '#BFA7FF',
    accentLight: '#EDE8FF',
    border: '#E8E2F4',
    danger: '#F7B6D8',
    success: '#9FE3C1',
  },
}

export interface Profile {
  id: string
  name: string | null
  avatar_url: string | null
  header_url: string | null
  selected_title: string | null
  xp: number
  created_at: string
}

export interface Subject {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  sort_order: number
}

export interface Material {
  id: string
  user_id: string
  subject_id: string
  name: string
  image_url: string | null
  memo: string | null
  created_at: string
}

export interface Session {
  id: string
  user_id: string
  subject_id: string
  material_id: string | null
  date: string
  start_time: string | null
  duration: number
  break_time: number
  pomo_rounds: number
  memo: string | null
  url: string | null
  created_at: string
  subjects?: Subject
  materials?: Material
  session_tags?: SessionTag[]
}

export interface SessionTag {
  id: string
  session_id: string
  tag: string
}

export interface BadgeAward {
  id: string
  user_id: string
  badge_key: string
  awarded_at: string
}

export interface UserTitle {
  id: string
  user_id: string
  title_key: string
  unlocked_at: string
}

export interface Goal {
  id: string
  user_id: string
  daily_minutes: number
  weekly_minutes: number
  subject_goals: Record<string, number>
}

export interface UserSettings {
  id: string
  user_id: string
  theme_name: Theme
  custom_colors: Partial<ThemeColors>
  pomo_settings: {
    work: number
    short: number
    long: number
    rounds: number
  }
  reminder_settings: {
    enabled: boolean
    time: string
    message: string
  }
}

export const RANKS = [
  { name: 'ブロンズ', minLevel: 1, color: '#CD7F32', emoji: '🥉' },
  { name: 'シルバー', minLevel: 6, color: '#C0C0C0', emoji: '🥈' },
  { name: 'ゴールド', minLevel: 11, color: '#FFD700', emoji: '🥇' },
  { name: 'プラチナ', minLevel: 21, color: '#E5E4E2', emoji: '💎' },
  { name: 'ダイヤモンド', minLevel: 31, color: '#B9F2FF', emoji: '💠' },
  { name: 'マスター', minLevel: 51, color: '#FF6B6B', emoji: '👑' },
]

export const XP_PER_LEVEL = 100
export const XP_PER_MIN = 1

export function getRank(level: number) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) return RANKS[i]
  }
  return RANKS[0]
}

export const BADGES = [
  // Daily
  { key: 'daily_1h', label: '1時間達成', emoji: '⏰', desc: '1日1時間勉強', xp: 10 },
  { key: 'daily_2h', label: '2時間達成', emoji: '⏱️', desc: '1日2時間勉強', xp: 20 },
  { key: 'daily_3h', label: '3時間達成', emoji: '🏆', desc: '1日3時間勉強', xp: 30 },
  { key: 'daily_5h', label: '5時間マスター', emoji: '🔥', desc: '1日5時間勉強', xp: 60 },
  // Streak
  { key: 'streak_3', label: '3日連続', emoji: '📅', desc: '3日連続勉強', xp: 15 },
  { key: 'streak_7', label: '7日連続', emoji: '🗓️', desc: '7日連続勉強', xp: 50 },
  { key: 'streak_30', label: '30日連続', emoji: '🌟', desc: '30日連続勉強', xp: 200 },
  // Weekly
  { key: 'weekly_5h', label: '週5時間', emoji: '📚', desc: '週5時間勉強', xp: 25 },
  { key: 'weekly_10h', label: '週10時間', emoji: '📖', desc: '週10時間勉強', xp: 50 },
  { key: 'weekly_20h', label: '週20時間', emoji: '🎯', desc: '週20時間勉強', xp: 100 },
  // Monthly
  { key: 'monthly_30h', label: '月30時間', emoji: '🏅', desc: '月30時間勉強', xp: 150 },
  // Misc
  { key: 'first_session', label: '初回記録', emoji: '🌱', desc: '初めてセッション記録', xp: 5 },
  { key: 'subject_5', label: '5教科', emoji: '📓', desc: '5教科以上登録', xp: 10 },
]

export const TITLES = [
  { key: 'beginner', label: '勉強初心者', condition: 'lv1' },
  { key: 'steady', label: '着実な一歩', condition: 'lv5' },
  { key: 'dedicated', label: '努力家', condition: 'lv10' },
  { key: 'expert', label: '勉強の達人', condition: 'lv20' },
  { key: 'master', label: '勉強マスター', condition: 'lv30' },
  { key: 'legend', label: '伝説の学者', condition: 'lv50' },
  { key: 'streak_hero', label: '連続記録王', condition: 'streak30' },
  { key: 'night_owl', label: '夜型勉強家', condition: 'night' },
]

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}時間${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

export function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}
