// A response/query error cannot prove that an accepted generation stopped.
export function isSubmissionOutcomeUnconfirmed(error, { callStarted = false, providerRequestId = null, terminalFailure = false } = {}) {
  if (!callStarted || terminalFailure) return false;
  if (providerRequestId) return true;
  const status = Number(error?.providerStatus || error?.status || error?.statusCode);
  if (status >= 500 || [408, 409].includes(status)) return true;
  if ([400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(status)) return false;
  return !['AUTH_ERROR', 'INSUFFICIENT_PROVIDER_BALANCE', 'RATE_LIMIT', 'CONTENT_POLICY', 'INVALID_INPUT', 'MODEL_ROUTE_UNAVAILABLE'].includes(error?.code);
}
