import { useCallback, useEffect, useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge } from './ui'
import { SITE_URL } from '../lib/site'
import { dateShort } from '../lib/format'
import { LEAD_STATUS_META } from '../lib/leads'
import type { Profile, Lead, CrmNote } from '../types/database'

/** 聊天资料抽屉(v63 ②①):对话内一键拉开客户全档。
 *  freelancer=平台档案全览(基本/联系/地址/状态/收款/SSN 遮蔽可显);lead=线索名片。
 *  底部客户备注(m43 crm_notes):记录者本人可写改;admin 额外可读全部同事备注。 */

const COPY = {
  zh: {
    fl: 'Freelancer 档案', lead: '访客名片', close: '关闭',
    basic: '基本', name: '法定名', dob: '出生日期', email: '注册邮箱', workEmail: '分配邮箱', weSet: '填写', weSave: '保存', weCancel: '取消',
    contact: '联系', addr: '地址', status: '状态', payout: '收款',
    kyc: '基础 KYC', ekyc: 'Enhanced',
    suspended: '已暂停', banned: '已封禁', tasksT: '任务', active: '进行中', done: '已完成',
    ssn: 'SSN', show: '显示', hide: '隐藏', ssnNone: '未留存',
    wa: 'WhatsApp', tg: 'Telegram', copied: '已复制', refLink: '注册链接', copy: '复制',
    noteT: '客户备注', notePh: '只有你和管理员能看到这条备注…', save: '保存', saved: '已保存',
    othersT: '同事备注(仅管理员可见)', by: '记录人',
    none: '—',
  },
  en: {
    fl: 'Freelancer profile', lead: 'Guest card', close: 'Close',
    basic: 'Basics', name: 'Legal name', dob: 'Date of birth', email: 'Email', workEmail: 'Assigned email', weSet: 'Set', weSave: 'Save', weCancel: 'Cancel',
    contact: 'Contact', addr: 'Address', status: 'Status', payout: 'Payout',
    kyc: 'Base KYC', ekyc: 'Enhanced',
    suspended: 'Suspended', banned: 'Banned', tasksT: 'Tasks', active: 'Active', done: 'Completed',
    ssn: 'SSN', show: 'Show', hide: 'Hide', ssnNone: 'Not on file',
    wa: 'WhatsApp', tg: 'Telegram', copied: 'Copied', refLink: 'Signup link', copy: 'Copy',
    noteT: 'Customer note', notePh: 'Only you and admins can see this note…', save: 'Save', saved: 'Saved',
    othersT: "Colleagues' notes (admin only)", by: 'By',
    none: '—',
  },
}

type NoteRow = CrmNote & { owner: { display_name: string | null } | null }

export default function ChatDrawer({
  otherId, otherRole, otherName, lang, isAdmin, meId, onClose, down = false
}: {
  otherId: string
  otherRole: 'user' | 'lead'
  otherName: string | null
  lang: 'zh' | 'en'
  isAdmin: boolean
  meId: string
  onClose: () => void
  down?: boolean
}) {
  const [inn, setInn] = useState(!down)
  useEffect(() => { if (down) requestAnimationFrame(() => setInn(true)) }, [down])
  const t = COPY[lang]
  const [prof, setProf] = useState<Profile | null>(null)
  const [weEdit, setWeEdit] = useState(false)
  const [weVal, setWeVal] = useState('')
  const [weBusy, setWeBusy] = useState(false)
  const [lead, setLead] = useState<Lead | null>(null)
  const [taskN, setTaskN] = useState<{ active: number; done: number }>({ active: 0, done: 0 })
  const [ssn, setSsn] = useState<string | null>(null)
  const [ssnShow, setSsnShow] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [others, setOthers] = useState<NoteRow[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (otherRole === 'user') {
      const [p, a, d] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', otherId).maybeSingle(),
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_freelancer', otherId).in('status', ['in_progress', 'under_review', 'pending_payment']),
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_freelancer', otherId).eq('status', 'completed'),
      ])
      setProf((p.data ?? null) as Profile | null)
      setTaskN({ active: a.count ?? 0, done: d.count ?? 0 })
    } else {
      const { data } = await supabase.from('leads').select('*').eq('profile_id', otherId).maybeSingle()
      setLead((data ?? null) as Lead | null)
    }
    const { data: notes } = await supabase.from('crm_notes')
      .select('*, owner:profiles!crm_notes_owner_id_fkey(display_name)')
      .eq('subject_id', otherId)
    const list = (notes ?? []) as NoteRow[]
    const mine = list.find(n => n.owner_id === meId)
    setNote(mine?.body ?? '')
    setOthers(list.filter(n => n.owner_id !== meId))
  }, [otherId, otherRole, meId])

  useEffect(() => { setSsn(null); setSsnShow(false); setNoteSaved(false); void load() }, [load])

  async function toggleSsn() {
    if (ssnShow) { setSsnShow(false); return }
    if (ssn === null) {
      const { data } = await supabase.from('kyc_ssn')
        .select('ssn_full, ssn_last4').eq('user_id', otherId).maybeSingle()
      const d = data as { ssn_full: string | null; ssn_last4: string | null } | null
      setSsn(d?.ssn_full ?? (d?.ssn_last4 ? `•••-••-${d.ssn_last4}` : ''))
    }
    setSsnShow(true)
  }

  async function saveNote() {
    setBusy(true); setNoteSaved(false)
    const body = note.trim()
    if (body) {
      await supabase.from('crm_notes')
        .upsert({ owner_id: meId, subject_id: otherId, body }, { onConflict: 'owner_id,subject_id' })
    } else {
      await supabase.from('crm_notes').delete().eq('owner_id', meId).eq('subject_id', otherId)
    }
    setBusy(false); setNoteSaved(true)
    window.setTimeout(() => setNoteSaved(false), 1500)
  }

  async function copyText(key: string, text: string) {
    try { await navigator.clipboard.writeText(text) } catch { window.prompt('', text) }
    setCopied(key)
    window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 border-b border-hair py-2 last:border-b-0">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-faint">{k}</span>
      <span className="min-w-0 text-right text-sm text-ink">{v}</span>
    </div>
  )
  const Sect = ({ h, children }: { h: string; children: React.ReactNode }) => (
    <div className="mb-4">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{h}</p>
      <div className="rounded-xl border border-hair bg-white px-3 py-1">{children}</div>
    </div>
  )
  const kycBadge = (s: string) => (
    <StatusBadge status={s === 'verified' ? 'verified' : s === 'pending' ? 'pending' : 'unverified'} label={s} />
  )


  async function saveWorkEmail() {
    if (weBusy || !prof) return
    setWeBusy(true)
    const v = weVal.trim() || null
    const { error: e } = await supabase.from('profiles').update({ work_email: v }).eq('id', otherId)
    setWeBusy(false)
    if (e) return
    setProf({ ...prof, work_email: v })
    setWeEdit(false)
  }

  return (
    <div className={down
      ? `absolute inset-0 z-20 flex flex-col overflow-hidden border-t border-hair bg-surface transition-all duration-200 ${inn ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`
      : 'absolute inset-y-0 right-0 z-20 flex w-full max-w-[21rem] flex-col border-l border-hair bg-surface shadow-[-12px_0_32px_rgba(26,32,30,0.10)]'}>
      <div className="flex items-center justify-between border-b border-hair px-4 py-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{otherName ?? t.none}</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
            {otherRole === 'user' ? t.fl : t.lead}
          </span>
        </span>
        <button onClick={onClose} title={t.close}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-hair text-faint transition hover:text-ink">
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {otherRole === 'user' && prof && (
          <>
            <Sect h={t.basic}>
              <Row k={t.name} v={prof.full_name ?? t.none} />
              <Row k={t.dob} v={prof.date_of_birth ? dateShort(prof.date_of_birth) : t.none} />
              <Row k={t.email} v={<span className="break-all">{prof.email ?? t.none}</span>} />
              {otherRole === 'user' && (
                <Row k={t.workEmail} v={weEdit ? (
                  <span className="flex items-center gap-1.5">
                    <input value={weVal} onChange={e => setWeVal(e.target.value)}
                      className="w-44 rounded-lg border border-hair bg-white px-2 py-1 font-mono text-xs text-ink outline-none focus:border-petrol" />
                    <button onClick={() => void saveWorkEmail()} disabled={weBusy}
                      className="font-mono text-[10px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
                      {t.weSave}
                    </button>
                    <button onClick={() => setWeEdit(false)}
                      className="font-mono text-[10px] uppercase tracking-wider text-faint transition hover:text-ink">
                      {t.weCancel}
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="break-all">{prof.work_email ?? t.none}</span>
                    <button onClick={() => { setWeVal(prof.work_email ?? ''); setWeEdit(true) }}
                      className="font-mono text-[10px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
                      {t.weSet}
                    </button>
                  </span>
                )} />
              )}
              <Row k={t.ssn} v={
                <span className="inline-flex items-center gap-2 font-mono">
                  {ssnShow ? (ssn === '' ? t.ssnNone : ssn) : '•••-••-••••'}
                  <button onClick={() => void toggleSsn()} title={ssnShow ? t.hide : t.show}
                    className="text-faint transition hover:text-petrol">
                    {ssnShow ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </span>
              } />
            </Sect>
            <Sect h={t.contact}>
              <Row k={t.wa} v={prof.contact_whatsapp ?? t.none} />
              <Row k={t.tg} v={prof.contact_telegram ?? t.none} />
            </Sect>
            <Sect h={t.addr}>
              <Row k={t.addr} v={
                [prof.address, prof.city, prof.state, prof.address_zip].filter(Boolean).join(', ') || t.none
              } />
            </Sect>
            <Sect h={t.status}>
              <Row k={t.kyc} v={kycBadge(prof.kyc_status)} />
              <Row k={t.ekyc} v={kycBadge(prof.enhanced_kyc_status ?? 'none')} />
              {(prof.is_suspended || prof.is_banned) && (
                <Row k={t.status} v={prof.is_banned ? t.banned : t.suspended} />
              )}
            </Sect>
            <Sect h={t.tasksT}>
              <Row k={t.active} v={<span className="font-mono">{taskN.active}</span>} />
              <Row k={t.done} v={<span className="font-mono">{taskN.done}</span>} />
            </Sect>
            <Sect h={t.payout}>
              <Row k={t.payout} v={
                prof.payout_method === 'paypal'
                  ? <span className="break-all">PayPal · {prof.payout_paypal_email ?? t.none}</span>
                  : <span className="break-all font-mono text-xs">{prof.payout_address ?? t.none}</span>
              } />
            </Sect>
          </>
        )}

        {otherRole === 'lead' && lead && (
          <>
            <Sect h={t.lead}>
              <Row k={t.wa} v={
                <button className="font-mono underline-offset-2 hover:underline"
                  onClick={() => void copyText('wa', lead.wa_e164)}>
                  {copied === 'wa' ? t.copied : lead.wa_e164}
                </button>
              } />
              <Row k={t.tg} v={lead.telegram ? `@${lead.telegram}` : t.none} />
              <Row k={t.status} v={
                <StatusBadge status={LEAD_STATUS_META[lead.status].s} label={LEAD_STATUS_META[lead.status][lang]} />
              } />
              <Row k="·" v={dateShort(lead.created_at)} />
            </Sect>
            {lead.status !== 'converted' && (
              <Button variant="ghost" className="mb-4 w-full px-3 py-2 text-xs"
                onClick={() => void copyText('ref', `${SITE_URL}/signup?ref=${lead.ref_token}`)}>
                {copied === 'ref' ? t.copied : `${t.refLink} · ${t.copy}`}
              </Button>
            )}
          </>
        )}

        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.noteT}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder={t.notePh}
          className="w-full resize-none rounded-xl border border-hair bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-petrol" />
        <Button className="mt-2 w-full px-3 py-1.5 text-xs" disabled={busy} onClick={() => void saveNote()}>
          {noteSaved ? t.saved : t.save}
        </Button>

        {isAdmin && others.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.othersT}</p>
            {others.map(n => (
              <div key={n.id} className="mb-1.5 rounded-xl border border-hair bg-white px-3 py-2">
                <p className="text-sm leading-relaxed text-ink">{n.body}</p>
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wider text-faint">
                  {t.by} {n.owner?.display_name ?? '?'} · {dateShort(n.updated_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
