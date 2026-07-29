import AdminTaskDetail from '../admin/TaskDetail'
import { useAm } from './AmLayout'

/** AM 端任务详情 = 控制台同页 + amScope（提成只读，池限自己名下）。 */
export default function AmTaskDetail() {
  const { am } = useAm()
  if (!am) return <p className="text-muted">…</p>
  return <AdminTaskDetail amScope={am} />
}
