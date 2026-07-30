/** 工作流事件总线(v59):AM 在站内任意页面处理完事项后 ping 一下,
 *  「今日待办」浮窗与顶部导航徽标立即刷新 —— 处理完即消失,无需刷新页面。
 *  纯前端同页签广播,不涉库。 */
const EVENT = 'lt:workline'

/** 处理动作完成后调用:通知所有订阅方立即重新拉取。 */
export function pingWorkline(): void {
  window.dispatchEvent(new Event(EVENT))
}

/** 订阅工作流变化;返回取消订阅函数(可直接作为 useEffect 清理函数)。 */
export function onWorkline(handler: () => void): () => void {
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
