import FreelancerDetail from '../admin/FreelancerDetail'
import { useAm } from './AmLayout'

/** AM 端 freelancer 档案 = 控制台同页 + amScope（全量可读,操作按角色收敛）。 */
export default function AmFreelancerProfile() {
  const { am } = useAm()
  if (!am) return <p className="text-muted">…</p>
  return <FreelancerDetail amScope={am} />
}
