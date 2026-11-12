export function providerConfirmedClosed(provider, result, orderId) {
  if (!result || !orderId || result.orderId !== orderId) return false;
  if (provider === 'wechat') return result.tradeState === 'CLOSED';
  if (provider === 'alipay') return result.tradeStatus === 'TRADE_CLOSED';
  return false;
}
