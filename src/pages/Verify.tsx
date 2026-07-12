import { Link } from 'react-router-dom'
import { Button } from '../components/ui'

export default function Verify() {
  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-3 font-display text-2xl font-medium tracking-tight text-ink">Email confirmation</h1>
      <p className="mb-6 text-sm text-muted">If you just confirmed your email, you can now log in.</p>
      <Link to="/login"><Button>Go to login</Button></Link>
    </div>
  )
}
