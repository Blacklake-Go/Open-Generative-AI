import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../packages/studio/src/messages/en/audioStudio.json' with { type: 'json' };
import zh from '../packages/studio/src/messages/zh/audioStudio.json' with { type: 'json' };
import ja from '../packages/studio/src/messages/ja-JP/audioStudio.json' with { type: 'json' };
import ko from '../packages/studio/src/messages/ko-KR/audioStudio.json' with { type: 'json' };
import zhTw from '../packages/studio/src/messages/zh-TW/audioStudio.json' with { type: 'json' };
import es from '../packages/studio/src/messages/es/audioStudio.json' with { type: 'json' };
import esEs from '../packages/studio/src/messages/es-ES/audioStudio.json' with { type: 'json' };
import { resolveCopy } from '../packages/studio/src/i18nUtils.js';

const bundleMap = {
  zh,
  'zh-CN': zh,
  'zh-TW': zhTw,
  'zh-HK': zhTw,
  'zh-Hant': zhTw,
  'zh-Hans': zh,
  ja,
  'ja-JP': ja,
  ko,
  'ko-KR': ko,
  es,
  'es-ES': esEs,
  en,
};

test('Audio Studio messages provide full model translations across all locales', () => {
  const modelIds = [
    'suno-create-music',
    'suno-remix-music',
    'suno-extend-music',
    'suno-generate-sounds',
    'suno-add-vocals',
    'suno-generate-mashup',
    'suno-add-instrumental',
    'suno-voice-clone',
    'minimax-voice-clone',
    'minimax-speech-2.6-hd',
    'minimax-speech-2.6-turbo',
    'mmaudio-v2-text-to-audio',
    'elevenlabs-text-to-dialogue-v3',
    'suno-convert-to-wav',
    'gemini-3-1-flash-tts',
    'gemini-2-5-pro-tts',
    'elevenlabs-tts-turbo-2-5',
    'minimax-music-3.0',
  ];

  const locales = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'es', 'en'];

  for (const locale of locales) {
    const copy = resolveCopy(en, bundleMap, locale);
    assert.ok(copy.models, `Locale ${locale} must have models dictionary`);
    for (const id of modelIds) {
      assert.ok(copy.models[id], `Locale ${locale} must have model ${id}`);
      assert.ok(copy.models[id].name, `Locale ${locale} model ${id} must have name`);
      assert.ok(copy.models[id].description, `Locale ${locale} model ${id} must have description`);
    }
  }
});

test('Audio Studio messages provide full input fields localization across all locales', () => {
  const requiredFields = [
    'prompt',
    'style',
    'model',
    'custom_mode',
    'title',
    'persona_id',
    'persona_model',
    'instrumental',
    'negative_tags',
    'vocal_gender',
    'style_weight',
    'weirdness_constraint',
    'audio_weight',
    'audio_url',
    'continue_at',
  ];

  const locales = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'es', 'en'];

  for (const locale of locales) {
    const copy = resolveCopy(en, bundleMap, locale);
    assert.ok(copy.fields, `Locale ${locale} must have fields dictionary`);
    for (const field of requiredFields) {
      assert.ok(copy.fields[field], `Locale ${locale} must have field ${field}`);
      assert.ok(copy.fields[field].title, `Locale ${locale} field ${field} must have title`);
    }

    assert.ok(copy.fields.prompt.example, `Locale ${locale} must have prompt example`);
    assert.ok(copy.fields.style.placeholder, `Locale ${locale} must have style placeholder`);
  }
});

test('Audio Studio Chinese translations match expected localized terms', () => {
  const copyZh = resolveCopy(en, bundleMap, 'zh-CN');
  assert.equal(copyZh.sidebar.modelLabel, '音频模型');
  assert.equal(copyZh.sidebar.modelVersionLabel, '模型版本');
  assert.equal(copyZh.models['suno-create-music'].name, 'Suno 音乐创作');
  assert.equal(copyZh.fields.prompt.title, '歌词 / 提示词');
  assert.equal(copyZh.fields.style.title, '音乐风格');
  assert.equal(copyZh.fields.custom_mode.title, '自定义模式');
  assert.equal(copyZh.fields.model.title, '模型版本');
  assert.equal(copyZh.fields.instrumental.title, '纯音乐伴奏');
  assert.equal(copyZh.fields.vocal_gender.options.male, '男声');
  assert.equal(copyZh.fields.vocal_gender.options.female, '女声');
});
