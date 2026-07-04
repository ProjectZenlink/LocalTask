export type UserRole = 'user' | 'admin'
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type ChainNetwork = 'tron' | 'base' | 'ethereum'
export type TokenSymbol = 'USDT' | 'USDC' | 'ETH'

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

// The four supported payout combos (must match the DB check constraint)
export const WALLET_OPTIONS: WalletOption[] = [
  { key: 'usdt-trc20', label: 'USDT · TRC20 (Tron)', network: 'tron', token: 'USDT', family: 'tron' },
  { key: 'usdc-base', label: 'USDC · Base', network: 'base', token: 'USDC', family: 'evm' },
  { key: 'usdc-eth', label: 'USDC · Ethereum', network: 'ethereum', token: 'USDC', family: 'evm' },
  { key: 'eth-eth', label: 'ETH · Ethereum', network: 'ethereum', token: 'ETH', family: 'evm' },
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
