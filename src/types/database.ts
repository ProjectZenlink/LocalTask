export type UserRole = 'user' | 'am' | 'admin' | 'pending'
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type PayoutMethod = 'crypto' | 'paypal'
export type ChainNetwork = 'tron' | 'ethereum'
export type TokenSymbol = 'USDT' | 'USDC' | 'ETH'
export type TaskStatus =
  | 'unassigned' | 'offered' | 'in_progress' | 'under_review'
  | 'pending_payment' | 'completed' | 'cancelled'
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn'
export type SubmissionStatus = 'submitted' | 'returned' | 'approved'
export type PlatformType =
  | 'Paypal' | 'Square' | 'Wise' | 'Airwallex'
  | 'Ether.fi' | 'Shopify' | 'Etsy' | 'Amazon' | 'Other'
/** 八项平台清单（AM 看板的八盏灯；不含「其他」） */
export const PLATFORMS: PlatformType[] =
  ['Paypal', 'Square', 'Wise', 'Airwallex', 'Ether.fi', 'Shopify', 'Etsy', 'Amazon']
/** 建任务可选的全部类型 = 八项 + 其他 */
export const TASK_TYPES: PlatformType[] = [...PLATFORMS, 'Other']

export interface Profile {
  id: string
  role: UserRole
  display_name: string | null
  full_name: string | null
  date_of_birth: string | null
  address: string | null
  city: string | null
  state: string | null
  address_zip: string | null
  contact_whatsapp: string | null
  contact_telegram: string | null
  contact_x: string | null
  phone_verified: boolean
  kyc_status: KycStatus
  open_to_work: boolean
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  payout_method: PayoutMethod
  payout_paypal_email: string | null
  is_suspended: boolean
  suspended_reason: string | null
  is_banned: boolean
  is_rejected: boolean
  rejected_reason: string | null
  managed_by: string | null
  created_at: string
  updated_at: string
}

export interface AccountManager {
  id: string
  name: string
  whatsapp: string | null
  telegram: string | null
  x: string | null
  user_id: string | null
  is_active: boolean
  created_at: string
}

export interface Task {
  id: string
  client_id: string | null
  am_id: string | null
  title: string
  description: string | null
  attachment_paths: string[]
  tags: string[]
  acceptance_criteria: string
  amount: number                       // 语义 = 美元；LT 账本 1 LT = $1
  payout_network: ChainNetwork | null  // 接受时快照
  payout_token: TokenSymbol | null
  payout_address: string | null
  payout_method: PayoutMethod | null   // 接受时快照(老任务为空=crypto)
  payout_paypal_email: string | null
  status: TaskStatus
  deadline: string | null
  assigned_freelancer: string | null
  assigned_at: string | null
  tx_hash: string | null
  paid_at: string | null
  payment_note: string | null
  freelancer_confirmed_at: string | null
  cancelled_reason: string | null
  task_type: PlatformType | null
  commission_override: number | null
  share_token: string
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

export interface Client {
  id: string
  company_name: string
  contact_name: string | null
  contact_info: string | null
  payment_wallet: string | null
  notes: string | null
  is_blacklisted: boolean
  blacklist_reason: string | null
  created_at: string
}

/** Row shape of the admin-only freelancer_pool view. */
export interface PoolRow {
  id: string
  display_name: string | null
  full_name: string | null
  kyc_status: KycStatus
  open_to_work: boolean
  is_suspended: boolean
  is_banned: boolean
  contact_whatsapp: string | null
  contact_telegram: string | null
  contact_x: string | null
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  payout_method: PayoutMethod
  payout_paypal_email: string | null
  active_tasks: number
  completed_tasks: number
  avg_quality: number | null
  avg_speed: number | null
  avg_attitude: number | null
  ratings_count: number
  strikes_count: number
  created_at: string
  managed_by: string | null
  is_rejected: boolean
}

export interface CommissionRate {
  task_type: PlatformType
  amount: number
}

export type AcceptanceStatus = 'pending_admin' | 'approved' | 'rejected'

export interface AcceptanceRow {
  id: string
  freelancer_id: string
  task_type: PlatformType
  task_id: string | null
  am_id: string
  amount: number
  status: AcceptanceStatus
  decided_at: string | null
  review_note: string | null
  created_at: string
}

export interface PendingStaff {
  id: string
  display_name: string | null
  email: string
  created_at: string
}

export interface LedgerRow {
  id: string
  am_id: string
  kind: 'commission' | 'payout'
  amount: number
  freelancer_id: string | null
  task_type: PlatformType | null
  note: string | null
  created_at: string
}

export interface AccountRecord {
  id: string
  freelancer_id: string
  task_type: PlatformType
  account_login: string | null
  account_password: string | null
  twofa: string | null
  phone_number: string | null
  sms_link: string | null
  phone_expires_on: string | null
  notes: string | null
  created_at: string
}

export interface AmNote {
  id: string
  am_id: string
  content: string
  remind_on: string | null
  done: boolean
  created_at: string
}

export interface FreelancerCompany {
  id: string
  freelancer_id: string
  company_name: string
  ein: string | null
  state: string | null
  notes: string | null
  doc_paths: string[]
  created_at: string
}

export interface Rating {
  id: string
  task_id: string
  freelancer_id: string
  quality: number
  speed: number
  attitude: number
  note: string | null
  created_at: string
}

/** kyc_risk_scan RPC 返回行 */
export interface ScanFinding {
  severity: 'red' | 'amber'
  flag: 'identity_exact' | 'dob_ssn4' | 'id_doc' | 'contact' | 'payout' | 'blacklist'
  matched_user: string | null
  matched_name: string | null
  matched_banned: boolean
  detail: string | null
}

/** 多收款方式列表行 */
export interface PayoutMethodRow {
  id: string
  user_id: string
  method: PayoutMethod
  network: ChainNetwork | null
  token: TokenSymbol | null
  address: string | null
  paypal_email: string | null
  is_default: boolean
  created_at: string
}
