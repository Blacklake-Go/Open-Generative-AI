import 'server-only';

const SAFE_ERROR_CODES = new Set([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_REQUIRED',
  'INSUFFICIENT_CREDITS',
  'MODEL_NOT_FOUND',
  'USER_NOT_FOUND',
  'ACCOUNT_BINDING_CONFLICT',
  'PROVIDER_NOT_CONFIGURED',
  'SETTLEMENT_MISMATCH',
]);

const INTERNAL_ERROR_TEXT = /password|secret|token|authorization|cookie|postgres|database|sql|query|relation|constraint|stack|at\s+file:|https?:\/\//i;

// 下单/报价链路上面向普通用户的失败原因。内部诊断文案含「渠道」「规格」「价盘版本」
// 等运营术语，且原始 message 可能带模型 ID 与供应商细节，因此这些错误码统一返回固定文案，
// 原始信息仍保留在 error.code 与服务端日志中供排查。
const USER_FACING_ERROR_MESSAGES = new Map([
  ['MODEL_NOT_FOUND', '所选模型不存在或已下架，请重新选择模型。'],
  ['MODEL_DISABLED', '所选模型当前已停用，请更换其他模型。'],
  ['MODEL_PRICING_UNCONFIGURED', '该模型尚未完成价格配置，暂时无法下单，请更换其他模型或联系管理员。'],
  ['MODEL_PRICE_INVALID', '该模型的价格配置异常，暂时无法下单，请稍后重试或更换其他模型。'],
  ['NO_COST_VERIFIED_ROUTE', '该模型暂时没有可用的生成渠道，请稍后重试或更换其他模型。'],
  ['PROVIDER_NOT_CONFIGURED', '该模型的生成服务尚未完成接入，暂时无法生成，请稍后重试。'],
  ['SITE_PRICE_NOT_EFFECTIVE', '该模型价格尚未生效，请稍后重试。'],
  ['SITE_PRICE_EXPIRED', '模型价格已更新，请重新提交生成请求。'],
  ['QUOTE_NOT_FOUND', '报价已失效，请重新提交生成请求。'],
  ['QUOTE_EXPIRED', '报价已过期，请重新提交生成请求。'],
  ['QUOTE_ALREADY_CONSUMED', '该报价已被使用，请重新提交生成请求。'],
  ['PROMPT_REQUIRED', '请先输入提示词后再提交生成任务。'],
  ['PROMPT_TOO_LONG', '提示词长度超出限制，请精简后重试。'],
  ['INVALID_PROMPT', '提示词格式无效，请重新输入。'],
]);

export function publicErrorMessage(error, fallback = '请求暂时无法完成，请稍后重试') {
  const code = String(error?.code || '');
  const userFacingMessage = USER_FACING_ERROR_MESSAGES.get(code);
  if (userFacingMessage) return userFacingMessage;
  const message = String(error?.message || '').trim();
  if (!message || message.length > 240) return fallback;
  if (!SAFE_ERROR_CODES.has(code) || INTERNAL_ERROR_TEXT.test(message)) return fallback;
  return message;
}
