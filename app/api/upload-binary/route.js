import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { validateUploadProxyTarget, isBlockedFileType } from '../../../src/lib/uploadProxyTarget';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '../../../lib/security/requestGuard';
import { publicErrorMessage } from '../../../lib/security/publicError';

export async function POST(request) {
    try {
        const guarded = guardMutation(request, { maxBytes: 25 * 1024 * 1024 });
        if (guarded) return guarded;
        const user = await getUserFromRequest(request);
        if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
        const uploadLimit = await consumeRateLimit({ scope: 'binary_upload_user', subject: user.id, limit: 20, windowMs: 60 * 60 * 1000 });
        if (!uploadLimit.allowed) return rateLimitResponse(uploadLimit);

        const formData = await request.formData();

        // Extract the original S3 target URL we injected earlier
        const targetUrl = formData.get('x-proxy-target-url');

        if (!targetUrl) {
            return NextResponse.json({ error: 'Missing proxy target URL' }, { status: 400 });
        }

        const validatedTarget = validateUploadProxyTarget(targetUrl);
        if (!validatedTarget.ok) {
            return NextResponse.json(
                { error: 'Invalid upload target', reason: validatedTarget.reason },
                { status: 400 }
            );
        }

        // Validate file content type and extension to prevent dangerous uploads (e.g. HTML, SVG, executables)
        const fileContentType = formData.get('Content-Type') || formData.get('content-type') || '';
        const keyName = formData.get('key') || '';
        
        for (const [key, value] of formData.entries()) {
            if (value && typeof value === 'object' && typeof value.name === 'string') {
                if (isBlockedFileType(value.name, value.type || fileContentType)) {
                    return NextResponse.json(
                        { error: 'Invalid file type', reason: 'blocked_file_type' },
                        { status: 400 }
                    );
                }
            }
        }

        if (isBlockedFileType(keyName, fileContentType)) {
            return NextResponse.json(
                { error: 'Invalid file type', reason: 'blocked_file_type' },
                { status: 400 }
            );
        }

        // Reconstruct the FormData for S3 (excluding our internal proxy marker)
        const proxyMethod = String(formData.get('x-proxy-method') || 'POST').toUpperCase();
    if (proxyMethod === 'PUT') {
      const file = formData.get('file');
      if (!file || typeof file.arrayBuffer !== 'function' || typeof file.name !== 'string') return NextResponse.json({ error: 'Missing upload file' }, { status: 400 });
      let requestedHeaders = {};
      try { requestedHeaders = JSON.parse(String(formData.get('x-proxy-headers') || '{}')); }
      catch { return NextResponse.json({ error: 'Invalid upload headers' }, { status: 400 }); }
      const headers = new Headers();
      for (const [name, value] of Object.entries(requestedHeaders)) {
        const lowerName = name.toLowerCase();
        if (/^(content-type|x-cos-[a-z0-9-]+)$/.test(lowerName) && value != null) headers.set(lowerName, String(value));
      }
      if (!headers.has('content-type')) headers.set('content-type', file.type || 'application/octet-stream');
      const response = await fetch(validatedTarget.url, { method: 'PUT', headers, body: Buffer.from(await file.arrayBuffer()) });
      if (response.ok || response.status === 204) return new Response(null, { status: 204 });
      await response.arrayBuffer().catch(() => {});
      console.error('S3 Proxy Error:', { status: response.status });
      return NextResponse.json({ error: 'Upload service unavailable' }, { status: 502 });
    }
    if (proxyMethod !== 'POST') return NextResponse.json({ error: 'Invalid upload method' }, { status: 400 });
    const s3FormData = new FormData();
        
        // S3 is very sensitive to field ordering. We must ensure 'file' is likely last
        // or at least that all signature fields come before what S3 expects.
        for (const [key, value] of formData.entries()) {
            if (key !== 'x-proxy-target-url') {
                s3FormData.append(key, value);
            }
        }

        // Perform the server-to-server POST to S3
        const s3Response = await fetch(validatedTarget.url, {
            method: 'POST',
            body: s3FormData,
        });

        if (s3Response.ok || s3Response.status === 204) {
            return new Response(null, { status: 204 });
        } else {
            await s3Response.arrayBuffer().catch(() => {});
            console.error('S3 Proxy Error:', { status: s3Response.status });
            return NextResponse.json({ error: '上传服务暂时不可用' }, { status: s3Response.status });
        }
    } catch (error) {
        console.error('Upload Proxy Exception:', error);
        return NextResponse.json({ error: publicErrorMessage(error, '上传服务暂时不可用') }, { status: 500 });
    }
}
