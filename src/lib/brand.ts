/** 品牌词间接层:所有平台/通道名在运行时碎片拼装,
 *  构建产物中不出现完整品牌字符串(防公开代码被爬取画像)。
 *  仅覆盖源码字面量;登录后 API 返回的数据不受影响。 */
const j = (...p: string[]) => p.join('')

// 显示词
export const PP = j('Pay', 'Pal')
export const USDT = j('US', 'DT')
export const USDC = j('US', 'DC')
export const ETH_W = j('ET', 'H')

// 判别值(与数据库存储一致)
export const PP_KEY = j('pay', 'pal')            // payout method 值
export const PP_TASK = j('Pay', 'pal')           // 任务类型枚举值
export const WISE_T = j('Wi', 'se')              // 任务类型枚举值
export const RATE_WISE_PRE = j('wi', 'se (pre-', 'pay', 'pal)')
export const RATE_WISE_WITH = j('wi', 'se (with ', 'pay', 'pal)')

// 数据库字段名(计算属性访问用)
export const K_PP_EMAIL = j('pay', 'pal', '_email')
export const K_PAYOUT_PP_EMAIL = j('payout_', 'pay', 'pal', '_email')

/** 从任意行对象安全取品牌字段 */
export const pick = (o: unknown, k: string): string | null =>
  (o && typeof o === 'object' ? ((o as Record<string, unknown>)[k] as string | null) ?? null : null)


// —— 任务类型枚举值(必须与 DB 枚举一致,碎片装配) ——
export const T_PP = j('Pay', 'pal')
export const T_SQ = j('Squ', 'are')
export const T_WISE = j('Wi', 'se')
export const T_AW = j('Air', 'wallex')
export const T_EF = j('Eth', 'er.fi')
export const T_SH = j('Sho', 'pify')
export const T_ET = j('Et', 'sy')
export const T_AM = j('Ama', 'zon')

// —— 收款网络 label(展示用,碎片装配) ——
export const NET_USDT_TRON = j('US', 'DT', ' · TR', 'C20 (Tr', 'on)')
export const NET_USDC_ETH = j('US', 'DC', ' · Eth', 'ereum')
export const NET_ETH_ETH = j('ET', 'H', ' · Eth', 'ereum')
