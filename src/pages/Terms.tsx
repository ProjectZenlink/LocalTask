import { Link } from 'react-router-dom'
import { SUPPORT } from '../lib/support'

const SECTIONS: { h: string; b: string }[] = [
  { h: '1 · What LocalTask is', b: 'LocalTask is a task platform operated by Local Group ("we", "us"). We match verified, US-based independent contractors ("freelancers") with structured tasks commissioned by vetted cross-border businesses. We coordinate the work and the payment flow; we are not your employer.' },
  { h: '2 · Independent contractor relationship', b: 'You work task by task as an independent contractor. Nothing here creates employment, agency or partnership. You have no obligation to accept any offer, and we have no obligation to send you any particular volume of offers. You are responsible for your own taxes.' },
  { h: '3 · Eligibility & verification', b: 'You must be at least 18 years old, US-based, and complete identity verification (KYC) truthfully. Accounts based on false, borrowed or synthetic identities are terminated, and related task history may be voided.' },
  { h: '4 · Tasks, scope and acceptance', b: 'Every task offer states its scope, acceptance criteria and USD amount before you accept. Accepting an offer is agreeing to that written scope. Work is reviewed against the stated criteria; submissions may be returned for fixes. If a task or account is flagged for review, your account manager will contact you and the formal review process applies.' },
  { h: '5 · Payment', b: 'Tasks are denominated in USD and paid via the payout method you keep on file (USDT TRC20, USDC ERC20, or PayPal). Payment details are snapshotted when you accept a task. A task is closed only after you confirm receipt of the payment — until you confirm, it remains open.' },
  { h: '6 · No fees', b: 'We never charge freelancers. We will never ask you for deposits, fees, equipment purchases or "training kits". Any such request is fraudulent and does not come from us — report it to support immediately.' },
  { h: '7 · Account rules', b: 'One account per person, in your own legal name. Do not share credentials, misrepresent your identity, or use the platform for anything unlawful. We may suspend or terminate accounts that break these rules or put the network at risk; where money is owed to you for completed and confirmed work, it remains owed.' },
  { h: '8 · Communication', b: 'Task coordination happens with your assigned account manager on WhatsApp, Telegram or X. In-app notices are reminders, not a replacement for that direct line.' },
  { h: '9 · Changes', b: 'We may update these terms as the platform evolves. Material changes will be reflected on this page with a new date. Continuing to use LocalTask after a change means you accept the updated terms.' },
  { h: '10 · Contact', b: `Questions about these terms: Telegram @${SUPPORT.telegram}. A person answers.` },
]

export default function Terms() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight">
            <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
            LocalTask
          </Link>
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition hover:text-ink">← Back</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">Terms of Service</p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">The rules, written down.</h1>
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
    </div>
  )
}
