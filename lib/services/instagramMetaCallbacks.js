import 'server-only';

import { nowIso, queryOne, randomId, withTransaction } from '@/lib/db/index.js';

const INSTAGRAM_PROVIDER = 'instagram';
const DATA_DELETION_EVENT = 'instagram_data_deletion_completed';

function readProfile(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function recordCallbackEvent(transaction, eventType, metadata) {
  await transaction.execute(`
    INSERT INTO sys_core.auth_events (id, event_type, target, request_ip, metadata_json, created_at)
    VALUES ($1, $2, NULL, NULL, $3::jsonb, $4)
  `, [randomId('auth'), eventType, JSON.stringify(metadata), nowIso()]);
}

/**
 * Remove the Instagram identity and any matching profile fields SupDance copied
 * from it, while preserving the user's SupDance account and other credentials.
 */
export async function removeInstagramIdentity(providerUserId, { eventType = 'instagram_deauthorized', confirmationCode = null } = {}) {
  const externalId = String(providerUserId || '').trim();
  if (!externalId) throw new Error('Missing Instagram user identifier');

  return withTransaction(async (transaction) => {
    const account = await transaction.queryOne(`
      SELECT user_id, provider_email, provider_username, profile_json
      FROM auth_usr.auth_accounts
      WHERE provider = $1 AND provider_user_id = $2
      FOR UPDATE
    `, [INSTAGRAM_PROVIDER, externalId]);

    if (account) {
      const profile = readProfile(account.profile_json);
      const copiedDisplayName = profile.displayName || profile.username || account.provider_username || null;
      const copiedAvatarUrl = profile.avatarUrl || null;

      await transaction.execute(`
        UPDATE auth_usr.users
        SET display_name = CASE
              WHEN $2::text IS NOT NULL AND display_name = $2 THEN 'SupDance 用户'
              ELSE display_name
            END,
            avatar_url = CASE
              WHEN $3::text IS NOT NULL AND avatar_url = $3 THEN NULL
              ELSE avatar_url
            END,
            updated_at = NOW()
        WHERE id = $1
      `, [account.user_id, copiedDisplayName, copiedAvatarUrl]);

      await transaction.execute(`
        DELETE FROM auth_usr.auth_accounts
        WHERE provider = $1 AND provider_user_id = $2
      `, [INSTAGRAM_PROVIDER, externalId]);
    }

    // Earlier OAuth audit events may contain the Instagram-scoped identifier.
    // Keep the audit event but erase the provider identifier and provider email.
    await transaction.execute(`
      UPDATE sys_core.auth_events
      SET metadata_json = metadata_json - 'providerUserId' - 'email'
      WHERE metadata_json->>'provider' = $1
        AND metadata_json->>'providerUserId' = $2
    `, [INSTAGRAM_PROVIDER, externalId]);

    const metadata = confirmationCode
      ? { provider: INSTAGRAM_PROVIDER, confirmation_code: confirmationCode, status: 'completed', account_found: Boolean(account) }
      : { provider: INSTAGRAM_PROVIDER, account_found: Boolean(account) };
    await recordCallbackEvent(transaction, eventType, metadata);

    return { accountFound: Boolean(account) };
  });
}

export async function getInstagramDataDeletionStatus(confirmationCode) {
  const code = String(confirmationCode || '').trim();
  if (!/^[a-f0-9]{24,64}$/i.test(code)) return null;

  return queryOne(`
    SELECT created_at
    FROM sys_core.auth_events
    WHERE event_type = $1
      AND metadata_json->>'confirmation_code' = $2
      AND metadata_json->>'status' = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  `, [DATA_DELETION_EVENT, code]);
}
