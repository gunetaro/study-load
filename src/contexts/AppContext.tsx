'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Theme, ThemeColors, THEMES, Subject, UserSettings, Profile, BadgeAward, Goal } from '@/types'
import { demoProfile, demoSubjects, demoGoal, demoBadges, demoSettings, demoUserMeta } from '@/lib/demo-data'

interface AppContextValue {
  userId: string | null
  isDemo: boolean
  userMeta: Record<string, any> | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  subjects: Subject[]
  refreshSubjects: () => Promise<void>
  settings: UserSettings | null
  theme: ThemeColors
  themeName: Theme
  setThemeName: (t: Theme) => void
  saveSettings: (s: Partial<UserSettings>) => Promise<void>
  goal: Goal | null
  refreshGoal: () => Promise<void>
  badges: BadgeAward[]
  refreshBadges: () => Promise<void>
  toast: string | null
  showToast: (msg: string) => void
  levelUpInfo: { level: number; rank: string } | null
  clearLevelUp: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children, userId, isDemo = false }: { children: React.ReactNode; userId: string; isDemo?: boolean }) {
  const supabase = createClient()
  const [userMeta, setUserMeta] = useState<Record<string, any> | null>(isDemo ? demoUserMeta : null)
  const [profile, setProfile] = useState<Profile | null>(isDemo ? demoProfile : null)
  const [subjects, setSubjects] = useState<Subject[]>(isDemo ? demoSubjects : [])
  const [settings, setSettings] = useState<UserSettings | null>(isDemo ? demoSettings : null)
  const [goal, setGoal] = useState<Goal | null>(isDemo ? demoGoal : null)
  const [badges, setBadges] = useState<BadgeAward[]>(isDemo ? demoBadges : [])
  const [toast, setToast] = useState<string | null>(null)
  const [levelUpInfo, setLevelUpInfo] = useState<{ level: number; rank: string } | null>(null)

  const themeName: Theme = (settings?.theme_name as Theme) || 'minimal'
  const theme: ThemeColors = { ...THEMES[themeName], ...(settings?.custom_colors || {}) }

  const refreshProfile = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }, [userId, supabase, isDemo])

  const refreshSubjects = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase.from('subjects').select('*').eq('user_id', userId).order('sort_order')
    setSubjects(data || [])
  }, [userId, supabase, isDemo])

  const refreshSettings = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single()
    if (data) setSettings(data)
  }, [userId, supabase, isDemo])

  const refreshGoal = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase.from('goals').select('*').eq('user_id', userId).single()
    if (data) setGoal(data)
  }, [userId, supabase, isDemo])

  const refreshBadges = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase.from('badge_awards').select('*').eq('user_id', userId)
    setBadges(data || [])
  }, [userId, supabase, isDemo])

  useEffect(() => {
    if (isDemo) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) setUserMeta(user.user_metadata)
    })
    refreshProfile()
    refreshSubjects()
    refreshSettings()
    refreshGoal()
    refreshBadges()
  }, [refreshProfile, refreshSubjects, refreshSettings, refreshGoal, refreshBadges, supabase, isDemo])

  const setThemeName = (t: Theme) => {
    if (isDemo) { setSettings(s => s ? { ...s, theme_name: t, custom_colors: {} } : s); return }
    saveSettings({ theme_name: t })
  }

  const saveSettings = async (patch: Partial<UserSettings>) => {
    if (isDemo) { setSettings(s => s ? { ...s, ...patch } as UserSettings : s); return }
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
      isDemo,
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
