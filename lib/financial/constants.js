/**
 * 平台金融与算力系统常量与规则定义
 */

export const CURRENCY = {
  NAME: 'K-Coin',
  CODE: 'KCOIN',
  SYMBOL: '🪙',
  // 核心价值锚定：1 K币 = 1 USD (以美元为基本核算单位，对外不直接展示浮动汇率)
  BASE_UNIT: 'USD',
  USD_TO_COIN_RATE: 1,
  USD_PER_COIN: 1,
  // 浮动汇率底层核算 (当前 1 USD ≈ 7.23 CNY，系统内部核算，对外不展示)
  FLOAT_CNY_USD_RATE: 7.23,
  CNY_TO_COIN_RATE: 1 / 7.23,
  // 平台专属货币属性：不可充值，杜绝投机与现金充值，纯由登录激励与社区创作产生
  IS_RECHARGEABLE: false,
  // 获得机制 (参考 B 站硬币)：每日登录奖励 1 枚 K 币
  DAILY_LOGIN_REWARD: 1,
  // 互动投币机制 (参考 B 站硬币)：单次投币最高 2 币，单作累计最高 2 币
  MAX_POST_TIP_COINS: 2,
};

export const ACCOUNT_CODES = {
  ASSET_GATEWAY_DEPOSIT: '1001',   // 资产类：第三方通道存款 (微信/支付宝/Stripe)
  LIABILITY_USER_AVAILABLE: '2001', // 负债类：用户可用通用货币 (可转账/可兑换)
  LIABILITY_USER_RESTRICTED: '2002',// 负债类：用户受限货币 (活动赠送，不可转账)
  LIABILITY_IN_TRANSIT: '2003',     // 负债类：在途冻结负债
  REVENUE_SERVICE_FEE: '4001',      // 收入类：转账/平台手续费收入
  REVENUE_FULFILLMENT: '4002',      // 收入类：算力兑换/会员履约销售收入
};

export const RISK_RULES = {
  // 转账限制
  MIN_TRANSFER_AMOUNT: 1,           // 最低转账 1 币
  MAX_SINGLE_TRANSFER: 1000,        // 单笔最高 1000 币
  MAX_DAILY_TRANSFER: 5000,         // 单日累计最高 5000 币
  TRANSFER_FEE_RATE: 0.01,          // 1% 转账平台服务费
  MIN_TRANSFER_FEE: 0.1,            // 最低 0.1 币手续费
  TRANSFER_INTERVAL_SECONDS: 5,     // 两次转账最小防刷间隔
};

export const CREDIT_BUCKET_TYPES = {
  DAILY_FREE: 'DAILY_FREE',         // 每日免费池 (当天过期)
  SUBSCRIPTION: 'SUBSCRIPTION',     // 月度订阅池 (随订阅周期过期)
  PERPETUAL: 'PERPETUAL',           // 永久购买池 (永久有效)
};

export const RESERVATION_STATUS = {
  RESERVED: 'RESERVED',             // 预冻结中
  COMMITTED: 'COMMITTED',           // 已确认结算扣减
  VOIDED: 'VOIDED',                 // 已释放解冻
  EXPIRED: 'EXPIRED',               // 超时强制解冻
};

export const RESERVATION_TTL_MINUTES = 15; // 预扣单最大保留 15 分钟
export const DAILY_CHECKIN_REWARD = 10;    // 每日签到奖励 10 积分

/**
 * Credits 的美元面值与美元↔人民币口径的唯一来源。
 *
 * 报价链路、后台毛利率和模型中心成本换算都必须读这里。此前同一份口径被抄成
 * $0.01/Credit 与 ¥0.07/Credit 两份，同一笔消耗能算出两个毛利率。汇率刻意复用
 * CURRENCY.FLOAT_CNY_USD_RATE：它不是独立配置项，放开就会变成一半可改一半改不动。
 */
export const CREDIT_VALUATION = {
  USD_PER_CREDIT: 0.01,
  USD_TO_CNY_RATE: CURRENCY.FLOAT_CNY_USD_RATE,
};
