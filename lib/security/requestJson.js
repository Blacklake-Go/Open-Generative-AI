/** Read a JSON request body and require a top-level object for API payloads. */
export async function readJsonObjectRequestBody(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    return { ok: false, code: 'INVALID_JSON' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'INVALID_REQUEST_BODY' };
  }

  return { ok: true, value };
}
