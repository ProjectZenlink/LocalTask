import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PAYOUT_OPTIONS } from '../types/database'
import { PageHeading, Field, Label, Button, Alert, Card } from '../components/ui'

export default function PostTask() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [bounty, setBounty] = useState('')
  const [payout, setPayout] = useState(PAYOUT_OPTIONS[0].key)
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('kyc_status').eq('id', user.id).single()
      .then(({ data }) => {
        setKycStatus(data?.kyc_status ?? 'none')
        setLoaded(true)
      })
  }, [user])

  const bountyNum = Number(bounty)
  const ready = title.trim().length > 0 && bounty.trim() !== '' && bountyNum > 0

  async function publish() {
    if (!ready || !user) return
    setError(null)
    setBusy(true)
    const opt = PAYOUT_OPTIONS.find(o => o.key === payout)!
    const { data, error: err } = await supabase.from('tasks').insert({
      client_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      pack_type: 'single',
      bounty_total: bountyNum,
      payout_network: opt.network,
      payout_token: opt.token,
      status: 'open',
      deadline: deadline ? new Date(deadline).toISOString() : null,
    }).select('id').single()
    setBusy(false)
    if (err) { setError(err.message); return }
    navigate(`/tasks/${data.id}`)
  }

  if (!loaded) return <div className="text-muted">Loading…</div>

  if (kycStatus !== 'verified') {
    return (
      <div className="mx-auto max-w-md">
        <PageHeading>Post a task</PageHeading>
        <Card className="p-5">
          <p className="text-sm text-muted">
            Posting tasks is available to verified members only. Complete identity verification first — it usually takes 1–2 business days to review.
          </p>
          <Link to={kycStatus === 'pending' ? '/' : '/onboarding/kyc'}>
            <Button className="mt-4 w-full">
              {kycStatus === 'pending' ? 'Verification under review' : 'Start verification'}
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub="Describe the work, set the bounty, and publish. Payment goes directly from you to the freelancer's wallet.">
        Post a task
      </PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 5 product photos on white background" />
      <div className="mb-4">
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={5}
          placeholder="What exactly needs to be done? What does 'done' look like?"
          className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
        />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <Label>Bounty amount</Label>
          <input
            value={bounty}
            onChange={e => setBounty(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="30"
            className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 font-mono text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          />
        </div>
        <div>
          <Label>Paid in</Label>
          <select
            value={payout}
            onChange={e => setPayout(e.target.value)}
            className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          >
            {PAYOUT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-6">
        <Label>Deadline (optional)</Label>
        <input
          type="date"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
        />
      </div>
      <Button onClick={publish} disabled={!ready || busy} className="w-full">
        {busy ? 'Publishing…' : 'Publish task'}
      </Button>
      {!ready && !busy && (
        <p className="mt-2 text-center text-xs text-faint">Enter a title and a bounty amount to publish.</p>
      )}
    </div>
  )
}
