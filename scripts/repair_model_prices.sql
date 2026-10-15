BEGIN;

-- 1. Veo 3 Image to Video: was 5660, fix to 48 credits
UPDATE ai_studio.model_pricing
SET base_credits = 48, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'veo3-image-to-video';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.07, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'veo3-image-to-video';

-- 2. Seedance 2.5 Motion Control: was 3395, fix to 35 credits
UPDATE ai_studio.model_pricing
SET base_credits = 35, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedance-2.5-motion-control';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.05, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedance-2.5-motion-control';

-- 3. Seedance 2.0 Motion Control: was 2265, fix to 30 credits
UPDATE ai_studio.model_pricing
SET base_credits = 30, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedance-2-motion-control';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.04, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedance-2-motion-control';

-- 4. Seedance 1.5 Pro: was 770, fix to 25 credits
UPDATE ai_studio.model_pricing
SET base_credits = 25, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedance-v1.5-pro-t2v';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.035, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedance-v1.5-pro-t2v';

-- 5. Seedance 1.0 Pro: was 410, fix to 25 credits
UPDATE ai_studio.model_pricing
SET base_credits = 25, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedance-pro-t2v';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.035, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedance-pro-t2v';

-- 6. Seedance 1.0 Lite: was 230, fix to 20 credits
UPDATE ai_studio.model_pricing
SET base_credits = 20, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedance-lite-t2v';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.025, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedance-lite-t2v';

-- 7. Video Effects: was 680, fix to 35 credits
UPDATE ai_studio.model_pricing
SET base_credits = 35, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id IN ('ai-video-effects', 'ai-dance-effects', 'motion-controls', 'vfx', 'ai-video-face-swap');

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.04, 'currency', 'USD'), updated_at = now()
WHERE model_id IN ('ai-video-effects', 'ai-dance-effects', 'motion-controls', 'vfx', 'ai-video-face-swap');

-- 8. LTX 2.3 Lipsync: was 590, fix to 30 credits
UPDATE ai_studio.model_pricing
SET base_credits = 30, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'ltx-2.3-lipsync';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.035, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'ltx-2.3-lipsync';

-- 9. HeyGen Video Translate: was 570, fix to 45 credits
UPDATE ai_studio.model_pricing
SET base_credits = 45, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'heygen-video-translate';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.06, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'heygen-video-translate';

-- 10. Wan 2.2 Speech to Video: was 455, fix to 30 credits
UPDATE ai_studio.model_pricing
SET base_credits = 30, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'wan2.2-speech-to-video';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.035, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'wan2.2-speech-to-video';

-- 11. AI Clipping: was 230, fix to 10 credits
UPDATE ai_studio.model_pricing
SET base_credits = 10, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'ai-clipping';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.015, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'ai-clipping';

-- 12. Topaz Video Upscale: was 185, fix to 30 credits
UPDATE ai_studio.model_pricing
SET base_credits = 30, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'topaz-video-upscale';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.035, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'topaz-video-upscale';

-- 13. Video Watermark Remover: was 150, fix to 20 credits
UPDATE ai_studio.model_pricing
SET base_credits = 20, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'video-watermark-remover';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.025, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'video-watermark-remover';

-- 14. AI Video Upscaler: was 70, fix to 45 credits
UPDATE ai_studio.model_pricing
SET base_credits = 45, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'ai-video-upscaler';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.05, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'ai-video-upscaler';

-- 15. Sync Lipsync & Latent Sync: was 95, fix to 35 credits
UPDATE ai_studio.model_pricing
SET base_credits = 35, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id IN ('sync-lipsync', 'latent-sync');

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.04, 'currency', 'USD'), updated_at = now()
WHERE model_id IN ('sync-lipsync', 'latent-sync');

-- 16. Wan2.2 Animate Recast: was 65, fix to 35 credits
UPDATE ai_studio.model_pricing
SET base_credits = 35, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'wan2.2-animate-recast';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.04, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'wan2.2-animate-recast';

-- 17. Seedream 3.0: was 8, fix to 10 credits (policy minimum)
UPDATE ai_studio.model_pricing
SET base_credits = 10, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id = 'seedream-3.0';

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.015, 'currency', 'USD'), updated_at = now()
WHERE model_id = 'seedream-3.0';

-- 18. Kling 3.0 Pro variants: was 30, fix to 45 credits (to match Kling 3.0 Pro)
UPDATE ai_studio.model_pricing
SET base_credits = 45, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id IN ('kling-v3.0-pro-text-to-video', 'kling-v3.0-pro-image-to-video');

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.06, 'currency', 'USD'), updated_at = now()
WHERE model_id IN ('kling-v3.0-pro-text-to-video', 'kling-v3.0-pro-image-to-video');

-- 19. Ideogram v3 variants: was 10, fix to 16 credits (to match Ideogram v3 in pricing sheet)
UPDATE ai_studio.model_pricing
SET base_credits = 16, min_credits = 10, pricing_type = 'fixed', updated_at = now()
WHERE model_id IN ('ideogram-v3-t2i', 'ideogram-character', 'ideogram-v3-reframe');

UPDATE ai_studio.provider_models
SET cost_config = jsonb_build_object('base_cost', 0.025, 'currency', 'USD'), updated_at = now()
WHERE model_id IN ('ideogram-v3-t2i', 'ideogram-character', 'ideogram-v3-reframe');

-- 20. Insert the 6 missing audio models if not exists
INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, status, sort, capabilities, created_at, updated_at)
VALUES
  ('elevenlabs-text-to-dialogue-v3', 'elevenlabs-text-to-dialogue-v3', 'ElevenLabs Text to Dialogue V3', 'ElevenLabs 对话语音 V3', 'audio', 'active', 50, '{"audio": true}'::jsonb, now(), now()),
  ('suno-convert-to-wav', 'suno-convert-to-wav', 'Suno Convert to WAV', 'Suno 无损音频转换 (WAV)', 'audio', 'active', 51, '{"audio": true}'::jsonb, now(), now()),
  ('gemini-3-1-flash-tts', 'gemini-3-1-flash-tts', 'Gemini 3.1 Flash TTS', 'Google Gemini 3.1 Flash 极速语音', 'audio', 'active', 52, '{"audio": true}'::jsonb, now(), now()),
  ('gemini-2-5-pro-tts', 'gemini-2-5-pro-tts', 'Gemini 2.5 Pro TTS', 'Google Gemini 2.5 Pro 高保真语音', 'audio', 'active', 53, '{"audio": true}'::jsonb, now(), now()),
  ('elevenlabs-tts-turbo-2-5', 'elevenlabs-tts-turbo-2-5', 'ElevenLabs TTS Turbo 2.5', 'ElevenLabs 极速语音 Turbo 2.5', 'audio', 'active', 54, '{"audio": true}'::jsonb, now(), now()),
  ('minimax-music-3.0', 'minimax-music-3.0', 'MiniMax Music 3.0', 'MiniMax 音乐创作 3.0', 'audio', 'active', 55, '{"audio": true}'::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, status = 'active', category = 'audio', updated_at = now();

INSERT INTO ai_studio.model_pricing (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
VALUES
  ('prc_elevenlabs_text_to_dialogue_v3', 'elevenlabs-text-to-dialogue-v3', 'fixed', 15, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now()),
  ('prc_suno_convert_to_wav', 'suno-convert-to-wav', 'fixed', 10, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now()),
  ('prc_gemini_3_1_flash_tts', 'gemini-3-1-flash-tts', 'fixed', 10, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now()),
  ('prc_gemini_2_5_pro_tts', 'gemini-2-5-pro-tts', 'fixed', 15, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now()),
  ('prc_elevenlabs_tts_turbo_2_5', 'elevenlabs-tts-turbo-2-5', 'fixed', 12, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now()),
  ('prc_minimax_music_3_0', 'minimax-music-3.0', 'fixed', 20, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
ON CONFLICT (model_id) DO UPDATE SET base_credits = EXCLUDED.base_credits, is_active = true, updated_at = now();

INSERT INTO ai_studio.provider_models (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config, metadata, created_at, updated_at)
VALUES
  ('pm_elevenlabs_text_to_dialogue_v3_muapi', 'elevenlabs-text-to-dialogue-v3', 'muapi', 'elevenlabs-text-to-dialogue-v3', true, 100, '{"base_cost": 0.02, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now()),
  ('pm_suno_convert_to_wav_muapi', 'suno-convert-to-wav', 'muapi', 'suno-convert-to-wav', true, 100, '{"base_cost": 0.015, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now()),
  ('pm_gemini_3_1_flash_tts_muapi', 'gemini-3-1-flash-tts', 'muapi', 'gemini-3-1-flash-tts', true, 100, '{"base_cost": 0.015, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now()),
  ('pm_gemini_2_5_pro_tts_muapi', 'gemini-2-5-pro-tts', 'muapi', 'gemini-2-5-pro-tts', true, 100, '{"base_cost": 0.02, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now()),
  ('pm_elevenlabs_tts_turbo_2_5_muapi', 'elevenlabs-tts-turbo-2-5', 'muapi', 'elevenlabs-tts-turbo-2-5', true, 100, '{"base_cost": 0.018, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now()),
  ('pm_minimax_music_3_0_muapi', 'minimax-music-3.0', 'muapi', 'minimax-music-3.0', true, 100, '{"base_cost": 0.025, "currency": "USD"}'::jsonb, '{"primary": true}'::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET enabled = true, cost_config = EXCLUDED.cost_config, updated_at = now();

INSERT INTO ai_studio.routing_policies (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
VALUES
  ('rp_elevenlabs_text_to_dialogue_v3', 'elevenlabs-text-to-dialogue-v3', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now()),
  ('rp_suno_convert_to_wav', 'suno-convert-to-wav', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now()),
  ('rp_gemini_3_1_flash_tts', 'gemini-3-1-flash-tts', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now()),
  ('rp_gemini_2_5_pro_tts', 'gemini-2-5-pro-tts', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now()),
  ('rp_elevenlabs_tts_turbo_2_5', 'elevenlabs-tts-turbo-2-5', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now()),
  ('rp_minimax_music_3_0', 'minimax-music-3.0', 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb, '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now();

COMMIT;
