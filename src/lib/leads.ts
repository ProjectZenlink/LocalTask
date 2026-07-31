import type { Lead, LeadStatus } from '../types/database'

/** 线索系统共享常量与工具(m42/v62)。
 *  认领水位 3 分钟为全站唯一常量:与数据库 claim_lead() 里的 interval '3 minutes' 同源同值,
 *  改一处必须同改另一处。 */
export const LEAD_CLAIM_MINUTES = 3
/** AM 心跳节拍(工作台在线期间每 60 秒一跳;库侧在线窗口 = 2 分钟内新鲜) */
export const HEARTBEAT_SECONDS = 60
export const AM_ONLINE_WINDOW_MINUTES = 2

/** WhatsApp 国码(默认 +1;标签为「地区 +码」,值为纯数字码) */
export const COUNTRY_CODES: { cc: string; label: string }[] = [
  { cc: '1', label: 'US / CA +1' },
  { cc: '44', label: 'UK +44' },
  { cc: '86', label: 'CN +86' },
  { cc: '852', label: 'HK +852' },
  { cc: '853', label: 'MO +853' },
  { cc: '886', label: 'TW +886' },
  { cc: '65', label: 'SG +65' },
  { cc: '60', label: 'MY +60' },
  { cc: '63', label: 'PH +63' },
  { cc: '62', label: 'ID +62' },
  { cc: '66', label: 'TH +66' },
  { cc: '84', label: 'VN +84' },
  { cc: '81', label: 'JP +81' },
  { cc: '82', label: 'KR +82' },
  { cc: '91', label: 'IN +91' },
  { cc: '971', label: 'AE +971' },
  { cc: '61', label: 'AU +61' },
  { cc: '64', label: 'NZ +64' },
  { cc: '49', label: 'DE +49' },
  { cc: '33', label: 'FR +33' },
  { cc: '34', label: 'ES +34' },
  { cc: '39', label: 'IT +39' },
  { cc: '55', label: 'BR +55' },
  { cc: '52', label: 'MX +52' },
  { cc: '234', label: 'NG +234' },
  { cc: '27', label: 'ZA +27' },
]

/** 归一化为 E.164:'+' + 国码 + 号码纯数字(与 leads.wa_e164 约束同形) */
export function normalizeWa(cc: string, num: string): string {
  return `+${cc.replace(/\D/g, '')}${num.replace(/\D/g, '')}`
}

/** 前端侧号码形状预检(库侧约束为最终兜底) */
export function waLooksValid(cc: string, num: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(normalizeWa(cc, num))
}

/** 惰性认领判定(与 claim_lead() 的 SQL 谓词一致):
 *  status=new 且无首答 且 (无归属 或 分配已超 LEAD_CLAIM_MINUTES) */
export function isClaimable(
  l: Pick<Lead, 'status' | 'first_reply_at' | 'assigned_am' | 'assigned_at'>,
  now: Date = new Date(),
): boolean {
  if (l.status !== 'new' || l.first_reply_at !== null) return false
  if (l.assigned_am === null) return true
  if (!l.assigned_at) return true
  return now.getTime() - new Date(l.assigned_at).getTime() > LEAD_CLAIM_MINUTES * 60_000
}

/** 状态标签与徽章色调(staff 端双语) */
export const LEAD_STATUS_META: Record<LeadStatus, { zh: string; en: string; s: 'verified' | 'pending' | 'unverified' }> = {
  new: { zh: '新线索', en: 'New', s: 'pending' },
  contacted: { zh: '已联系', en: 'Contacted', s: 'pending' },
  converted: { zh: '已转化', en: 'Converted', s: 'verified' },
  lost: { zh: '流失', en: 'Lost', s: 'unverified' },
}

/** 系统通知(kind='system'):body 为 JSON {k, am?},中英内置渲染,不走 DeepL */
export interface SysMsg { k: 'submitted' | 'assigned'; am?: string }

export function parseSystemBody(body: string): SysMsg | null {
  try {
    const o = JSON.parse(body) as SysMsg
    if (o && (o.k === 'submitted' || o.k === 'assigned')) return o
  } catch {
    /* 非系统模板:原样显示 */
  }
  return null
}

export function sysText(m: SysMsg, lang: 'zh' | 'en'): string {
  if (m.k === 'submitted') {
    return lang === 'zh' ? '你的申请已提交。' : 'Your request has been submitted.'
  }
  const am = m.am ?? ''
  return lang === 'zh'
    ? `已为你分配顾问 ${am},随时可以开始沟通。`
    : `${am} is now your advisor — say hello anytime.`
}
