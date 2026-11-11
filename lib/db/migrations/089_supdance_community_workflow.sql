ALTER TABLE ai_studio.community_posts
  ADD COLUMN source_asset_id TEXT REFERENCES ai_studio.user_assets(id) ON DELETE SET NULL,
  ADD COLUMN source_main_user_id TEXT,
  ADD COLUMN source_main_asset_id TEXT,
  ADD COLUMN moderation_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX community_active_source_asset_idx
  ON ai_studio.community_posts(source_asset_id)
  WHERE source_asset_id IS NOT NULL AND status IN ('pending','published');
CREATE UNIQUE INDEX community_active_main_source_idx ON ai_studio.community_posts(source_main_user_id,source_main_asset_id)
  WHERE source_main_asset_id IS NOT NULL AND status IN ('pending','published');

CREATE TABLE ai_studio.community_moderation_events (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id,version)
);

CREATE TABLE ai_studio.community_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rules TEXT NOT NULL,
  rules_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','judging','closed')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK(ends_at>starts_at),
  prize_credits INTEGER NOT NULL CHECK(prize_credits>=0),
  max_winners INTEGER NOT NULL CHECK(max_winners>0 AND max_winners<=100),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ai_studio.community_campaign_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ai_studio.community_campaigns(id),
  post_id TEXT NOT NULL REFERENCES ai_studio.community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_usr.users(id) ON DELETE CASCADE,
  rules_version INTEGER NOT NULL,
  post_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,post_id)
);
CREATE TABLE ai_studio.community_campaign_awards (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ai_studio.community_campaigns(id),
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  main_user_id TEXT NOT NULL,
  prize_credits INTEGER NOT NULL CHECK(prize_credits>=0),
  rules_version INTEGER NOT NULL,
  judge_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','settled','review_required')),
  settlement_reference TEXT UNIQUE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,user_id,rules_version),
  UNIQUE(campaign_id,entry_id,rules_version)
);
CREATE TABLE ai_studio.community_campaign_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ai_studio.community_campaigns(id),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
