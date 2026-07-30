import AdminTasks from '../admin/Tasks'
import { useAm } from './AmLayout'

/** AM 端任务列表 = 控制台同页 + amScope（自动限定自己名下）。 */
export default function AmTasks() {
  const { am } = useAm()
  if (!am) return <p className="text-muted">…</p>
  return <AdminTasks amScope={am} />
}
