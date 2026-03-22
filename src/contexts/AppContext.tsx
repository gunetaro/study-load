'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Theme, ThemeColors, THEMES, Subject, UserSettings, Profile, BadgeAward, Goal } from '@/types'

interface AppContextValue {
  // Auth
  userId: string | null
  userMeta: Record<string, any> | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  // Subjects
  subjects: Subject[]
  refreshSubjects: () => Promise<void>
  // Settings / Theme
  settings: UserSettings | null
  theme: ThemeColors
  themeName: Theme
  setThemeName: (t: Theme) => void
  saveSettings: (s: Partial<UserSettings>) => Promise<void>
  // Goals
  goal: Goal | null
  refreshGoal: () => Promise<void>
  // Badges
  badges: BadgeAward[]
  refreshBadges: () => Promise<void>
  // Toast
  toast: string | null
  showToast: (msg: string) => void
  // Level up
  levelUpInfo: { level: number; rank: string } | null
  clearLevelUp: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const supabase = createClient()
  const [userMeta, setUserMeta] = useState<Record<string, any> | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [badges, setBadges] = useState<BadgeAward[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [levelUpInfo, setLevelUpInfo] = useState<{ level: number; rank: string } | null>(null)

  const themeName: Theme = (settings?.theme_name as Theme) || 'minimal'
  const theme: ThemeColors = { ...THEMES[themeName], ...(settings?.custom_colors || {}) }

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }, [userId, supabase])

  const refreshSubjects = useCallback(async () => {
    const { data } = await supabase.from('subjects').select('*').eq('user_id', userId).order('sort_order')
    setSubjects(data || [])
  }, [userId, supabase])

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single()
    if (data) setSettings(data)
  }, [userId, supabase])

  const refreshGoal = useCallback(async () => {
    const { data } = await supabase.from('goals').select('*').eq('user_id', userId).single()
    if (data) setGoal(data)
  }, [userId, supabase])

  const refreshBadges = useCallback(async () => {
    const { data } = await supabase.from('badge_awards').select('*').eq('user_id', userId)
    setBadges(data || [])
  }, [userId, supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) setUserMeta(user.user_metadata)
    })
    refreshProfile()
    refreshSubjects()
    refreshSettings()
    refreshGoal()
    refreshBadges()
  }, [refreshProfile, refreshSubjects, refreshSettings, refreshGoal, refreshBadges, supabase])

  const setThemeName = (t: Theme) => {
    saveSettings({ theme_name: t })
  }

  const saveSettings = async (patch: Partial<UserSettings>) => {
    const merged = { ...settings, ...patch, user_id: userId }
    const { data } = await supabase
      .from('user_settings')
      .upsert(merged, { onConflict: 'user_id' })
      .select()
      .single()
    if (data) setSettings(data)
  }

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const clearLevelUp = () => setLevelUpInfo(null)

  return (
    <AppContext.Provider value={{
      userId,
      userMeta,
      profile,
      refreshProfile,
      subjects,
      refreshSubjects,
      settings,
      theme,
      themeName,
      setThemeName,
      saveSettings,
      goal,
      refreshGoal,
      badges,
      refreshBadges,
      toast,
      showToast,
      levelUpInfo,
      clearLevelUp,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
