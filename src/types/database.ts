export type UserRole = 'user' | 'admin'
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type ChainNetwork = 'tron' | 'ethereum'
export type TokenSymbol = 'USDT' | 'USDC'

export interface Profile {
  id: string
  role: UserRole
  display_name: string | null
  full_name: string | null
  date_of_birth: string | null
  address: string | null
  address_zip: string | null
  phone_verified: boolean
  kyc_status: KycStatus
  rating_avg: number
  rating_count: number
  completed_count: number
  is_banned: boolean
  contact_telegram: string | null
  contact_whatsapp: string | null
  created_at: string
  updated_at: string
}

export interface WalletAddress {
  id: string
  user_id: string
  network: ChainNetwork
  token: TokenSymbol
  address: string
  created_at: string
}

export interface WalletOption {
  key: string
  label: string
  network: ChainNetwork
  token: TokenSymbol
  family: 'tron' | 'evm'
}

// The two supported payout combos (must match the DB check constraints)
export const WALLET_OPTIONS: WalletOption[] = [
  { key: 'usdt-trc20', label: 'USDT · TRC20 (Tron)', network: 'tron', token: 'USDT', family: 'tron' },
  { key: 'usdc-eth', label: 'USDC · Ethereum (ERC20)', network: 'ethereum', token: 'USDC', family: 'evm' },
]

export const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/
export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export type KycDocType = 'id_front' | 'id_back' | 'address_proof' | 'selfie_handheld'

export const KYC_DOCS: { key: KycDocType; label: string; hint: string }[] = [
  { key: 'id_front', label: 'Government ID — front', hint: 'Passport, driver\u2019s license, or state ID.' },
  { key: 'id_back', label: 'Government ID — back', hint: 'Back side of the same ID.' },
  { key: 'address_proof', label: 'Proof of address', hint: 'Bank or utility statement from the last 3 months, showing your name.' },
  { key: 'selfie_handheld', label: 'Selfie holding your ID', hint: 'A clear photo of you holding the same ID beside your face.' },
]

export type PackType = 'single' | 'single_pack' | 'full_pack'
export type TaskStatus = 'draft' | 'open' | 'in_progress' | 'submitted' | 'confirmed' | 'settled' | 'closed' | 'cancelled' | 'disputed'

export interface Task {
  id: string
  client_id: string
  title: string
  description: string | null
  pack_type: PackType
  bounty_total: number
  // Chosen by the freelancer at accept time; null while the task is open.
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  status: TaskStatus
  deadline: string | null
  accepted_by: string | null
  created_at: string
}

export function payoutLabel(network: ChainNetwork, token: TokenSymbol): string {
  const opt = WALLET_OPTIONS.find(o => o.network === network && o.token === token)
  return opt ? opt.label : `${token} · ${network}`
}

export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
