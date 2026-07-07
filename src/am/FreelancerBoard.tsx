import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AccountRecord, AcceptanceRow, CommissionRate, PlatformType } from '../types/database'
import { PLATFORMS } from '../types/database'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, StatusBadge, Field, Label, Input } from '../components/ui'
import SecretText from '../components/SecretText'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: {
    back: '← 我的 Freelancer', notFound: '不在你的名下。',
    stGrey: '未完成', stYellow: '待审核', stGreen: '已完成',
    accept: '验收', acceptedOn: '验收于', records: '账号资料', addRec: '＋ 添加账号',
    login: '账号', pw: '密码', twofa: '二步验证(2FA)', phone: '手机号码', sms: '接码链接',
    expires: '手机号到期日', notes: '备注', save: '保存', saving: '保存中…', cancel: '取消', edit: '编辑',
    daysLeft: (d: number) => d < 0 ? '已过期' : d === 0 ? '今天到期' : `剩 ${d} 天`,
    noRec: '还没有账号资料。',
  },
  en: {
    back: '← My freelancers', notFound: 'Not in your roster.',
    stGrey: 'Not done', stYellow: 'Pending review', stGreen: 'Done',
    accept: 'Accept', acceptedOn: 'Accepted', records: 'Account records', addRec: '＋ Add account',
    login: 'Login', pw: 'Password', twofa: '2FA', phone: 'Phone number', sms: 'SMS inbox link',
    expires: 'Phone expires on', notes: 'Notes', save: 'Save', saving: 'Saving…', cancel: 'Cancel', edit: 'Edit',
    daysLeft: (d: number) => d < 0 ? 'expired' : d === 0 ? 'expires today' : `${d}d left`,
    noRec: 'No account records yet.',
  },
}

const REC_EMPTY = { account_login: '', account_password: '', twofa: '', phone_number: '', sms_link: '', phone_expires_on: '', notes: '' }

function daysUntil(iso: string): number {
  const a = new Date(iso + 'T00:00:00')
  const b = new Date(); b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export default function AmFreelancerBoard() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()
  const { am } = useAm()

  const [name, setName] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const [completedTypes, setCompletedTypes] = useState<Set<PlatformType>>(new Set())
  const [acceptances, setAcceptances] = useState<Map<PlatformType, AcceptanceRow>>(new Map())
  const [records, setRecords] = useState<AccountRecord[]>([])
  const [rates, setRates] = useState<Map<PlatformType, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyType, setBusyType] = useState<PlatformType | null>(null)

  const [openType, setOpenType] = useState<PlatformType | null>(null)
  const [recEditing, setRecEditing] = useState<'new' | string | null>(null)
  const [recForm, setRecForm] = useState(REC_EMPTY)
  const [recBusy, setRecBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id || !am) return
    const [p, tk, ac, rc, rt] = await Promise.all([
      supabase.from('profiles').select('display_name, managed_by').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('task_type').eq('assigned_freelancer', id)
        .eq('status', 'completed').not('task_type', 'is', null),
      supabase.from('platform_acceptances').select('*').eq('freelancer_id', id),
      supabase.from('account_records').select('*').eq('freelancer_id', id).order('created_at'),
      supabase.from('commission_rates').select('*'),
    ])
    const prof = p.data as { display_name: string | null; managed_by: string | null } | null
    setName(prof?.display_name ?? null)
    setMine(prof?.managed_by === am.id)
    setCompletedTypes(new Set(((tk.data ?? []) as { task_type: PlatformType }[]).map(x => x.task_type)))
    setAcceptances(new Map(((ac.data ?? []) as AcceptanceRow[]).map(a => [a.task_type, a])))
    setRecords((rc.data ?? []) as AccountRecord[])
    setRates(new Map(((rt.data ?? []) as CommissionRate[]).map(r => [r.task_type, Number(r.amount)])))
    setLoaded(true)
  }, [id, am])

  useEffect(() => { void load() }, [load])

  async function accept(type: PlatformType) {
    if (!id) return
    setError(null); setBusyType(type)
    const { error: e } = await supabase.rpc('am_accept', { p_freelancer: id, p_type: type })
    setBusyType(null)
    if (e) { setError(e.message); return }
    await load()
  }

  function startRec(type: PlatformType, r: AccountRecord | null) {
    setOpenType(type); setError(null)
    if (!r) { setRecEditing('new'); setRecForm(REC_EMPTY); return }
    setRecEditing(r.id)
    setRecForm({
      account_login: r.account_login ?? '', account_password: r.account_password ?? '',
      twofa: r.twofa ?? '', phone_number: r.phone_number ?? '', sms_link: r.sms_link ?? '',
      phone_expires_on: r.phone_expires_on ?? '', notes: r.notes ?? '',
    })
  }

  async function saveRec(type: PlatformType) {
    if (!id) return
    setRecBusy(true); setError(null)
    const payload = {
      account_login: recForm.account_login.trim() || null,
      account_password: recForm.account_password.trim() || null,
      twofa: recForm.twofa.trim() || null,
      phone_number: recForm.phone_number.trim() || null,
      sms_link: recForm.sms_link.trim() || null,
      phone_expires_on: recForm.phone_expires_on || null,
      notes: recForm.notes.trim() || null,
    }
    const res = recEditing === 'new'
      ? await supabase.from('account_records').insert({ ...payload, freelancer_id: id, task_type: type })
      : await supabase.from('account_records').update(payload).eq('id', recEditing!)
    setRecBusy(false)
    if (res.error) { setError(res.error.message); return }
    setRecEditing(null); setRecForm(REC_EMPTY)
    await load()
  }

  if (!loaded || !am) return <p className="text-muted">…</p>
  if (!mine) {
    return (
      <div>
        <Link to="/am/my" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
        <PageHeading>{t.notFound}</PageHeading>
      </div>
    )
  }

  const recFormCard = (type: PlatformType) => (
    <div className="mt-3 rounded-xl border border-petrol/25 bg-paper p-4">
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label={t.login} value={recForm.account_login} onChange={e => setRecForm({ ...recForm, account_login: e.target.value })} />
        <Field label={t.pw} value={recForm.account_password} onChange={e => setRecForm({ ...recForm, account_password: e.target.value })} />
        <Field label={t.twofa} value={recForm.twofa} onChange={e => setRecForm({ ...recForm, twofa: e.target.value })} />
        <Field label={t.phone} value={recForm.phone_number} onChange={e => setRecForm({ ...recForm, phone_number: e.target.value })} />
        <Field label={t.sms} value={recForm.sms_link} onChange={e => setRecForm({ ...recForm, sms_link: e.target.value })} placeholder="https://…" />
        <div className="mb-4">
          <Label>{t.expires}</Label>
          <Input type="date" value={recForm.phone_expires_on} onChange={e => setRecForm({ ...recForm, phone_expires_on: e.target.value })} />
        </div>
      </div>
      <Field label={t.notes} value={recForm.notes} onChange={e => setRecForm({ ...recForm, notes: e.target.value })} />
      <div className="flex gap-2">
        <Button onClick={() => void saveRec(type)} disabled={recBusy}>{recBusy ? t.saving : t.save}</Button>
        <Button variant="ghost" onClick={() => { setRecEditing(null); setRecForm(REC_EMPTY) }}>{t.cancel}</Button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/am/my" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <PageHeading>{name ?? id?.slice(0, 8)}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        {PLATFORMS.map(type => {
          const acc = acceptances.get(type)
          const done = completedTypes.has(type)
          const state: 'grey' | 'yellow' | 'green' = acc ? 'green' : done ? 'yellow' : 'grey'
          const recs = records.filter(r => r.task_type === type)
          const rate = rates.get(type) ?? 0
          return (
            <div key={type} className="border-b border-hair py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-24 font-display text-sm font-medium text-ink">{type}</span>
                  <StatusBadge
                    status={state === 'green' ? 'verified' : state === 'yellow' ? 'pending' : 'unverified'}
                    label={state === 'green' ? t.stGreen : state === 'yellow' ? t.stYellow : t.stGrey}
                  />
                  {state === 'green' && acc && (
                    <span className="font-mono text-xs text-faint">
                      {t.acceptedOn} {dateShort(acc.created_at)} · +{usd(Number(acc.amount))}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {state === 'yellow' && (
                    <Button className="px-3 py-1.5 text-xs" disabled={busyType === type} onClick={() => void accept(type)}>
                      {t.accept}{rate > 0 ? ` +${usd(rate)}` : ''}
                    </Button>
                  )}
                  <Button variant="ghost" className="px-3 py-1.5 text-xs"
                    onClick={() => { setOpenType(openType === type ? null : type); setRecEditing(null) }}>
                    {t.records} {recs.length > 0 && <span className="font-mono">({recs.length})</span>}
                  </Button>
                </div>
              </div>

              {openType === type && (
                <div className="mt-3">
                  {recs.length === 0 && recEditing !== 'new' && (
                    <p className="text-xs text-faint">{t.noRec}</p>
                  )}
                  {recs.map(r => (
                    <div key={r.id} className="mt-2 rounded-lg border border-hair bg-white p-3">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                        <p><span className="text-faint">{t.login}: </span><span className="font-mono text-ink">{r.account_login ?? '—'}</span></p>
                        <p><span className="text-faint">{t.pw}: </span>{r.account_password ? <SecretText value={r.account_password} /> : '—'}</p>
                        <p><span className="text-faint">{t.twofa}: </span>{r.twofa ? <SecretText value={r.twofa} /> : '—'}</p>
                        <p>
                          <span className="text-faint">{t.phone}: </span>
                          <span className="font-mono text-ink">{r.phone_number ?? '—'}</span>
                          {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">SMS</a></>}
                          {r.phone_expires_on && (
                            <span className={`ml-2 font-mono ${daysUntil(r.phone_expires_on) <= 3 ? 'text-danger-text' : 'text-faint'}`}>
                              {r.phone_expires_on} · {t.daysLeft(daysUntil(r.phone_expires_on))}
                            </span>
                          )}
                        </p>
                      </div>
                      {r.notes && <p className="mt-1.5 text-xs text-muted">{r.notes}</p>}
                      <button onClick={() => startRec(type, r)}
                        className="mt-2 font-mono text-[10px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
                        {t.edit}
                      </button>
                      {recEditing === r.id && recFormCard(type)}
                    </div>
                  ))}
                  {recEditing === 'new' ? recFormCard(type) : (
                    <Button variant="ghost" className="mt-2 px-3 py-1.5 text-xs" onClick={() => startRec(type, null)}>
                      {t.addRec}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
