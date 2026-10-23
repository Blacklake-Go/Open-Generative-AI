import { assertPaymentChannelUsable, paymentChannelStatus } from './providerCredentials.js';
import { alipayCheckoutPathConfigured, pilotCheckoutEligible } from './paymentPilot.js';

export async function paymentPilotAvailable({ userId, provider, productType, planId }) {
  if (!pilotCheckoutEligible({ userId, provider, productType, planId }) || !alipayCheckoutPathConfigured()) return false;
  const channels = await paymentChannelStatus();
  const alipay = channels?.alipay;
  return alipay?.status === 'closed_for_verification' && alipay?.configured === true;
}

export async function assertCheckoutAdmitted(input) {
  const availability = await assertPaymentChannelUsable(input.provider);
  if (availability.ok || await paymentPilotAvailable(input)) return { ok: true };
  return availability;
}
