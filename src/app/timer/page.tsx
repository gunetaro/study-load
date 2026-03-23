'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setupNewUser } from '@/lib/setup-user'
import { AppProvider } from '@/contexts/AppContext'
import AppShell from '@/components/AppShell'

function AppPageInner() {
  const [userId, setUserId] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('demo') === '1') {
      setUserId('demo-user')
      setIsDemo(true)
      setLoading(false)
      return
    }

    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase
        .from('profiles').select('id').eq('id', user.id).single()

      if (!prof) {
        await supabase.from('profiles').insert({
          id: user.id,
          name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          xp: 0,
          selected_title: 'beginner',
        })
      }

      await setupNewUser(supabase, user.id)
      setUserId(user.id)
      setLoading(false)
    }
    init()
  }, [router, searchParams])

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F5F4F0', gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>📚</div>
        <div style={{ fontSize: 16, color: '#9A9A94', fontFamily: 'sans-serif' }}>読み込み中...</div>
      </div>
    )
  }

  if (!userId) return null

  return (
    <AppProvider userId={userId} isDemo={isDemo}>
      <AppShell />
    </AppProvider>
  )
}

export default function AppPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F5F4F0', gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>📚</div>
        <div style={{ fontSize: 16, color: '#9A9A94', fontFamily: 'sans-serif' }}>読み込み中...</div>
      </div>
    }>
      <AppPageInner />
    </Suspense>
  )
}
