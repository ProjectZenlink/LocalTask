import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/** 导航未读角标(m26):换页取数 + Realtime 新消息去抖刷新。 */
export function useUnread(enabled: boolean) {
  const [count, setCount] = useState(0)
  const { pathname } = useLocation()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) { setCount(0); return }
    let alive = true
    const fetch = () => {
      void supabase.rpc('unread_total').then(({ data }) => { if (alive) setCount((data as number) ?? 0) })
    }
    fetch()
    const ch = supabase.channel(`unread-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(fetch, 300)
      })
      .subscribe()
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); void supabase.removeChannel(ch) }
  }, [enabled, pathname])

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '')
    document.title = count > 0 ? `(${count}) ${base}` : base
  }, [count])

  return count
}
