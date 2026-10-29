import test from 'node:test';
import assert from 'node:assert/strict';
import {NextResponse} from 'next/server.js';
import {clearSessionCookie} from '../../lib/services/auth.js';

test('logout expires both the shared domain and host cookies in actual response headers',()=>{
  const previous=process.env.COOKIE_DOMAIN;
  process.env.COOKIE_DOMAIN='.supdance.com';
  try{
    const response=NextResponse.json({ok:true});
    clearSessionCookie(response,new Request('https://canvas.supdance.com/api/canvas/session'));
    const cookies=response.headers.getSetCookie();
    assert.equal(cookies.length,2);
    assert.equal(cookies.filter(cookie=>/Domain=\.supdance\.com/i.test(cookie)).length,1);
    assert.equal(cookies.filter(cookie=>!/Domain=/i.test(cookie)).length,1);
    assert.ok(cookies.every(cookie=>/Max-Age=0/i.test(cookie) && /HttpOnly/i.test(cookie)));
  }finally{if(previous===undefined)delete process.env.COOKIE_DOMAIN;else process.env.COOKIE_DOMAIN=previous;}
});
