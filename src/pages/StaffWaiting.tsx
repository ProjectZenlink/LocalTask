import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { Card, Button } from '../components/ui'

/** 员工等待激活页：pending 角色的唯一落点。激活后自动跳转对应后台。 */
export default function StaffWaiting() {
  const { session, loading } = useAuth()
  const { profile, refresh } = useProfile()
  const navigate = useNavigate()

  // 每 8 秒刷新一次角色；被激活即自动跳转
  useEffect(() => {
    const timer = setInterval(() => { void refresh() }, 8000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (profile?.role === 'am') navigate('/am', { replace: true })
    else if (profile?.role === 'admin') navigate('/admin', { replace: true })
    else if (profile && profile.role === 'user') navigate('/', { replace: true })
  }, [profile, navigate])

  if (loading) return <div className="p-8 text-muted">…</div>

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink">
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
          LocalTask <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">员工通道</span>
        </div>
        <Card className="p-5">
          {!session ? (
            <>
              <p className="text-sm leading-relaxed text-ink">请先登录你注册的员工账号。</p>
              <Link to="/login"><Button className="mt-4 w-full">去登录</Button></Link>
            </>
          ) : (
            <>
              <p className="font-display text-base font-medium tracking-tight text-ink">等待管理员激活</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                你的注册已收到。管理员把你设为账户经理或管理员后，这个页面会自动跳进对应后台（每几秒自动检查一次）。
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => void refresh()}>手动刷新</Button>
                <Button variant="ghost" className="flex-1" onClick={() => void supabase.auth.signOut()}>退出登录</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
