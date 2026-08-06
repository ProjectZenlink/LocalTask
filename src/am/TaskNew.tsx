import AdminTaskNew from '../admin/TaskNew'
import { useAm } from './AmLayout'

/** AM 端新建任务 = 控制台同页 + amScope（归属锁定为自己，无提成覆盖入口）。 */
export default function AmTaskNew() {
  const { am } = useAm()
  if (!am) return <p className="text-muted">…</p>
  return <AdminTaskNew amScope={am} />
}
