import 'server-only';

import { setProviderEnabled as updatePaymentProvider } from '../repositories/providers.js';
import { invalidatePaymentChannelStatus } from '../payments/providerCredentials.js';

export async function setPaymentProviderEnabled(input) {
  const result = await updatePaymentProvider(input);
  invalidatePaymentChannelStatus();
  return result;
}
