import { Link } from 'react-router-dom'
import LogoMark from '../components/LogoMark'
import { SUPPORT } from '../lib/support'
import SupportDock from '../components/SupportDock'

const SECTIONS: { h: string; b: string }[] = [
  { h: '1 · What we collect', b: 'Account basics (name, email, date of birth, address), identity verification documents (government ID, proof of address, selfie with ID, SSN), payout details (wallet addresses or payment-account email), task and payment records, and the contact handles you choose to share (WhatsApp / Telegram / X).' },
  { h: '2 · Why we collect it', b: 'One reason above all: keeping every person on the network real. Verification is what makes the tasks, the counterparties and the payments trustworthy. Payout details exist to pay you; task records exist so both sides can prove what happened.' },
  { h: '3 · Who can see what', b: 'Verification documents are visible to platform administrators only — never to clients, never to other freelancers. Your SSN is restricted further: encrypted at rest, admin-only, used solely for identity verification and duplicate prevention. Your account manager sees your profile and task context; clients see only what a specific task requires.' },
  { h: '4 · How it is stored', b: 'Data lives in access-controlled infrastructure (Supabase) with row-level security. Sensitive documents are encrypted at rest. Access is role-based and logged by operation (who reviewed, who approved, who marked paid).' },
  { h: '5 · What we never do', b: 'We do not sell your data. We do not share your documents with third parties for marketing. We do not use your SSN for anything except verifying that you are you.' },
  { h: '6 · Retention & deletion', b: 'We keep records for as long as your account is active and as long as payment history requires. You can request account deletion through support; records tied to completed financial transactions may be retained where bookkeeping requires it.' },
  { h: '7 · Analytics', b: 'The public site uses no advertising trackers and no third-party analytics cookies.' },
  { h: '8 · Changes', b: 'If this policy changes materially, this page is updated with a new date.' },
  { h: '9 · Contact', b: `Privacy questions: Telegram @${SUPPORT.telegram}. A person answers.` },
]

export default function Privacy() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight">
            <LogoMark className="h-6 w-6 rounded-md" />
            LocalTask
          </Link>
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition hover:text-ink">← Back</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">Privacy Policy</p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">Your data, handled like it matters.</h1>
        <p className="mt-3 font-mono text-xs text-faint">Last updated · July 2026</p>
        <div className="mt-10">
          {SECTIONS.map(s => (
            <section key={s.h} className="border-t border-hair py-6 last:border-b">
              <h2 className="font-display text-lg font-medium tracking-tight">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
            </section>
          ))}
        </div>
      </main>
      <SupportDock />
    </div>
  )
}
