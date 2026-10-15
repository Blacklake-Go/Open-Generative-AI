'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[GlobalError caught]', error);

    const msg = String(error?.message || error?.digest || error || '');

    // 全面检测是否为版本更新、静态 Chunk 缺失、RSC 失步或组件渲染缺失等暂时性错误
    const isChunkOrSyncIssue =
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('CSS_CHUNK_LOAD_FAILED') ||
      msg.includes('Failed to fetch RSC payload') ||
      msg.includes('NEXT_RSC_ERR') ||
      msg.includes('Unexpected token') ||
      msg.includes('Element type is invalid') ||
      msg.includes('Minified React error') ||
      msg.includes('Failed to fetch');

    if (isChunkOrSyncIssue && typeof window !== 'undefined') {
      const lastReload = sessionStorage.getItem('supdance_ge_reload');
      const now = Date.now();
      // 10 秒防抖，避免死循环重载
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem('supdance_ge_reload', String(now));
        // 平滑刷新当前页面，自动获取最新静态资源与组件版本
        window.location.reload();
        return;
      }
    }
  }, [error]);

  const handleHardRefresh = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch {}
      // 通过追加随机时间戳强刷，绕过浏览器客户端可能残留的协商缓存
      const url = new URL(window.location.href);
      url.searchParams.set('_r', Date.now().toString());
      window.location.href = url.toString();
    } else {
      reset();
    }
  };

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-[#050505] p-6 text-white font-sans antialiased selection:bg-cyan-300 selection:text-black">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300 shadow-lg shadow-cyan-500/10">
            <svg className="h-7 w-7 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            SupDance AI Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            页面运行遇到异常
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            系统检测到组件加载波动或会话中断。您可以尝试刷新页面恢复运行，或返回工作台首页。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleHardRefresh}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-2.5 text-xs font-bold text-black transition hover:bg-cyan-200 active:scale-95 shadow-md shadow-cyan-300/20"
            >
              <span>清除缓存并同步</span>
              <span>↻</span>
            </button>
            <a
              href="/studio"
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              返回 Studio 首页
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
