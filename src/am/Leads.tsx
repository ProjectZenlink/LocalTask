import LeadsDesk from '../components/LeadsDesk'
import { useAm } from './AmLayout'

export default function AmLeads() {
  const { am } = useAm()
  if (!am) return <p className="text-muted">…</p>
  return <LeadsDesk isAdmin={false} amId={am.id} />
}
