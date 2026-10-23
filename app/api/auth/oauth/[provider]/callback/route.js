import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/services/oauthCallback.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const provider = String((await params).provider || "").toLowerCase();
  return handleOAuthCallback(request, provider);
}

export async function POST(request, { params }) {
  const provider = String((await params).provider || "").toLowerCase();

  // 容错处理：若在开放平台把此地址误填为 Webhook / 事件推送 URL
  try {
    const rawText = await request.text();
    let body = {};
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        const urlParams = new URLSearchParams(rawText);
        body = Object.fromEntries(urlParams.entries());
      }
    }

    if (body?.event === 'verify_webhook' || body?.content?.challenge !== undefined) {
      const challenge = body?.content?.challenge !== undefined ? body.content.challenge : body?.challenge;
      return NextResponse.json({ challenge }, { status: 200 });
    }
  } catch (err) {
    console.warn(`[oauth/${provider}/callback] POST 容错解析异常:`, err.message);
  }

  return NextResponse.json({ ok: true, provider }, { status: 200 });
}

