export type UserRole = 'user' | 'admin'
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type ChainNetwork = 'tron' | 'ethereum'
export type TokenSymbol = 'USDT' | 'USDC' | 'ETH'
export type TaskStatus =
  | 'unassigned' | 'offered' | 'in_progress' | 'under_review'
  | 'pending_payment' | 'completed' | 'cancelled'
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn'
export type SubmissionStatus = 'submitted' | 'returned' | 'approved'

export interface Profile {
  id: string
  role: UserRole
  display_name: string | null
  full_name: string | null
  date_of_birth: string | null
  address: string | null
  address_zip: string | null
  contact_whatsapp: string | null
  contact_telegram: string | null
  phone_verified: boolean
  kyc_status: KycStatus
  open_to_work: boolean
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  is_suspended: boolean
  is_banned: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  client_id: string
  title: string
  description: string | null
  attachment_paths: string[]
  acceptance_criteria: string
  amount: number
  payout_network: ChainNetwork
  payout_token: TokenSymbol
  payout_address: string | null
  status: TaskStatus
  deadline: string | null
  assigned_freelancer: string | null
  assigned_at: string | null
  tx_hash: string | null
  paid_at: string | null
  payment_note: string | null
  freelancer_confirmed_at: string | null
  cancelled_reason: string | null
  created_at: string
}

export interface TaskOffer {
  id: string
  task_id: string
  freelancer_id: string
  status: OfferStatus
  note: string | null
  created_at: string
  expires_at: string
  responded_at: string | null
}

export interface TaskSubmission {
  id: string
  task_id: string
  freelancer_id: string
  version: number
  content: string | null
  attachment_paths: string[]
  status: SubmissionStatus
  review_note: string | null
  reviewed_at: string | null
  created_at: string
}

export interface WalletOption {
  key: string
  label: string
  network: ChainNetwork
  token: TokenSymbol
  placeholder: string
  pattern: RegExp
}

// The three supported payout combos (must match the DB check constraint)
export const WALLET_OPTIONS: WalletOption[] = [
  { key: 'usdt-tron', label: 'USDT · TRC20 (Tron)', network: 'tron', token: 'USDT', placeholder: 'T…', pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  { key: 'usdc-eth', label: 'USDC · Ethereum', network: 'ethereum', token: 'USDC', placeholder: '0x…', pattern: /^0x[0-9a-fA-F]{40}$/ },
  { key: 'eth-eth', label: 'ETH · Ethereum', network: 'ethereum', token: 'ETH', placeholder: '0x…', pattern: /^0x[0-9a-fA-F]{40}$/ },
]

export function walletOptionFor(network: ChainNetwork | null, token: TokenSymbol | null): WalletOption | undefined {
  return WALLET_OPTIONS.find(o => o.network === network && o.token === token)
}

export function payoutLabel(network: ChainNetwork, token: TokenSymbol): string {
  return walletOptionFor(network, token)?.label ?? `${token} · ${network}`
}

export type KycDocType = 'id_front' | 'id_back' | 'address_proof' | 'selfie_handheld'

export const KYC_DOCS: { key: KycDocType; label: string; hint: string }[] = [
  { key: 'id_front', label: 'Government ID — front', hint: 'Passport, driver\u2019s license, or state ID.' },
  { key: 'id_back', label: 'Government ID — back', hint: 'Back side of the same ID.' },
  { key: 'address_proof', label: 'Proof of address', hint: 'Bank or utility statement from the last 3 months, showing your name.' },
  { key: 'selfie_handheld', label: 'Selfie holding your ID', hint: 'A clear photo of you holding the same ID beside your face.' },
]

// Task status → badge tone + user-facing label (freelancer side)
export const TASK_BADGE: Record<TaskStatus, { s: 'verified' | 'pending' | 'unverified'; label: string }> = {
  unassigned: { s: 'unverified', label: 'Open' },
  offered: { s: 'pending', label: 'Offer sent' },
  in_progress: { s: 'pending', label: 'In progress' },
  under_review: { s: 'pending', label: 'Under review' },
  pending_payment: { s: 'verified', label: 'Approved' },
  completed: { s: 'verified', label: 'Completed' },
  cancelled: { s: 'unverified', label: 'Cancelled' },
}
