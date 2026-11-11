-- Additive mapping and provenance only. Existing wallets, orders and ledgers
-- remain under their original authority; this migration reissues no credits.
CREATE SCHEMA IF NOT EXISTS supdance_federation;

CREATE TABLE supdance_federation.link_challenges (
  nonce TEXT PRIMARY KEY,
  one_user_id TEXT REFERENCES auth_usr.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'link' CHECK(purpose IN ('link','login')),
  session_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK((purpose='link' AND one_user_id IS NOT NULL) OR (purpose='login' AND one_user_id IS NULL))
);

CREATE TABLE supdance_federation.identity_links (
  one_user_id TEXT PRIMARY KEY REFERENCES auth_usr.users(id) ON DELETE CASCADE,
  main_user_id TEXT NOT NULL UNIQUE,
  proof_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supdance_federation.identity_events (
  id TEXT PRIMARY KEY,
  one_user_id TEXT NOT NULL,
  main_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('linked', 'suspended', 'restored')),
  proof_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supdance_federation.legacy_finance_snapshots (
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_user_id TEXT,
  source_hash TEXT NOT NULL,
  source_payload JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_kind, source_id, source_hash)
);
CREATE INDEX legacy_finance_snapshots_user_idx
  ON supdance_federation.legacy_finance_snapshots(source_user_id, source_kind, observed_at DESC);
