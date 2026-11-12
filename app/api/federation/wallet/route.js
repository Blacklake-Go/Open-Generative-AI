import { getUserFromRequest, json } from '@/lib/services/auth';
import { readConnectedWallet } from '@/lib/federation/accounts';
import { federationErrorResponse } from '@/lib/federation/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    return json(await readConnectedWallet(await getUserFromRequest(request)), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return federationErrorResponse(error); }
}
