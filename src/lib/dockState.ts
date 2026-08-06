/** v77:消息小窗开合的唯一状态源(替代分散事件监听,五处消费零时序差)。 */
type Listener = (open: boolean) => void
let openState = typeof localStorage !== 'undefined' && localStorage.getItem('lt_msgdock_open') === '1'
const subs = new Set<Listener>()

export const getDockOpen = () => openState
export const setDockOpen = (v: boolean) => {
  openState = v
  localStorage.setItem('lt_msgdock_open', v ? '1' : '0')
  subs.forEach(f => f(v))
}
export const subscribeDock = (f: Listener) => { subs.add(f); return () => { subs.delete(f) } }
