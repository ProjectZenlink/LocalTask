import { T_PP, T_SQ, T_WISE, T_AW, T_EF, T_SH, T_ET, T_AM, NET_USDT_TRON, NET_USDC_ETH, NET_ETH_ETH } from '../lib/brand'
export type UserRole = 'user' | 'am' | 'admin' | 'pending' | 'lead'
export type BonusState = 'locked' | 'requested' | 'paid'

export interface BonusGrant {
  id: string
  user_id: string
  kind: 'streak_7' | 'streak_15' | 'streak_30'
  amount: number
  state: BonusState
  tx_ref: string | null
  paid_at: string | null
  created_at: string
}
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
  [T_PP, T_SQ, T_WISE, T_AW, T_EF, T_SH, T_ET, T_AM] as PlatformType[]
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
  accepting_leads: boolean          // m42:AM 接收新线索开关
  auto_reply_enabled: boolean       // m44:离线自动回复开关
  auto_reply_text: string | null    // m44:自动回复文案
  last_seen_at: string | null       // m42:AM 心跳(在线判定 = 开关开 且 2 分钟内新鲜)
  created_at: string
  updated_at: string
  signup_bonus_usd: number
  work_email: string | null
  work_email_password: string | null
  email: string | null
  enhanced_kyc_status: KycStatus
  avatar_url: string | null
  signup_bonus_state: BonusState
  bonus_tx_ref: string | null
  bonus_paid_at: string | null
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
  payout_requested_at: string | null
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
  account_login: string | null
  account_password: string | null
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
  { key: 'usdt-tron', label: NET_USDT_TRON, network: 'tron', token: 'USDT', placeholder: 'T…', pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  { key: 'usdc-eth', label: NET_USDC_ETH, network: 'ethereum', token: 'USDC', placeholder: '0x…', pattern: /^0x[0-9a-fA-F]{40}$/ },
  { key: 'eth-eth', label: NET_ETH_ETH, network: 'ethereum', token: 'ETH', placeholder: '0x…', pattern: /^0x[0-9a-fA-F]{40}$/ },
]

export function walletOptionFor(network: ChainNetwork | null, token: TokenSymbol | null): WalletOption | undefined {
  return WALLET_OPTIONS.find(o => o.network === network && o.token === token)
}

export function payoutLabel(network: ChainNetwork, token: TokenSymbol): string {
  return walletOptionFor(network, token)?.label ?? `${token} \u00b7 ${network}`
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
  created_at: string
  managed_by: string | null
  is_rejected: boolean
  email: string | null
}

export interface CommissionRate {
  task_type: PlatformType
  amount: number
}

export type AcceptanceStatus = 'pending_admin' | 'approved' | 'rejected' | 'reopened'

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
  reopened_reason: string | null
  reopened_by: string | null
  reopened_at: string | null
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
  custom_name: string | null
  account_login: string | null
  account_password: string | null
  twofa: string | null
  status: 'active' | 'pending' | 'review' | 'closed'
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

export interface ProfileChangeRequest {
  id: string
  user_id: string
  new_full_name: string | null
  new_address: string | null
  new_city: string | null
  new_state: string | null
  new_zip: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface AmTransfer {
  id: string
  freelancer_id: string
  from_am: string
  to_am: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  review_note: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export interface PayoutItem { kind: 'task' | 'grant' | 'signup'; ref: string; amount: number; label: string }
export interface PayoutRequest {
  id: string
  user_id: string
  am_id: string | null
  total: number
  items: PayoutItem[]
  status: 'pending' | 'paid_pending_confirm' | 'completed' | 'rejected'
  tx_ref: string | null
  note: string | null
  reject_reason: string | null
  decided_by: string | null
  decided_at: string | null
  confirmed_at: string | null
  created_at: string
}

/** m42:线索(公开引导页 /join 的访客) */
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost'

export interface Lead {
  id: string
  full_name: string
  wa_e164: string
  telegram: string | null
  profile_id: string | null
  assigned_am: string | null
  assigned_at: string | null
  first_reply_at: string | null
  status: LeadStatus
  ref_token: string
  converted_profile: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
}

/** m43:客户备注(记录者本人 + admin 可见) */
export interface CrmNote {
  id: string
  owner_id: string
  subject_id: string
  body: string
  created_at: string
  updated_at: string
}

/** m43:快捷话术(严格仅本人可见) */
export interface QuickReply {
  id: string
  owner_id: string
  body: string
  sort: number
  created_at: string
  updated_at: string
}
