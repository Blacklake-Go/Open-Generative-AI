import test from 'node:test';
import assert from 'node:assert/strict';
import { getSocialLoginRegion } from '../../lib/auth/socialRegion.js';

test('getSocialLoginRegion respects query override parameter', () => {
  const headers = { 'x-forwarded-for': '116.148.99.110' }; // China IP
  assert.equal(getSocialLoginRegion(headers, 'international'), 'international');
});

test('getSocialLoginRegion ignores cookie override and strictly detects by IP', () => {
  // China IP, even with cookie set to international
  const headers = {
    'x-forwarded-for': '116.148.99.110',
    cookie: 'session_id=abc; ko_social_region=international; theme=dark',
  };
  assert.equal(getSocialLoginRegion(headers), 'mainland_china');

  // Overseas IP (Korea), even with cookie set to mainland_china
  const headersKr = {
    'x-forwarded-for': '138.2.120.119',
    cookie: 'session_id=xyz; ko_social_region=mainland_china',
  };
  assert.equal(getSocialLoginRegion(headersKr), 'international');
});

test('getSocialLoginRegion respects x-social-region header', () => {
  const headers = {
    'x-forwarded-for': '116.148.99.110',
    'x-social-region': 'international',
  };
  assert.equal(getSocialLoginRegion(headers), 'international');
});

test('getSocialLoginRegion falls back to IP geo detection when no override is present', () => {
  // China IP (Hangzhou Unicom)
  const headersCn = { 'x-forwarded-for': '116.148.99.110' };
  assert.equal(getSocialLoginRegion(headersCn), 'mainland_china');

  // South Korea IP (Oracle Chuncheon)
  const headersKr = { 'x-forwarded-for': '138.2.120.119' };
  assert.equal(getSocialLoginRegion(headersKr), 'international');

  // United States IP (Google Cloud)
  const headersUs = { 'x-forwarded-for': '34.64.0.1' };
  assert.equal(getSocialLoginRegion(headersUs), 'international');
});
