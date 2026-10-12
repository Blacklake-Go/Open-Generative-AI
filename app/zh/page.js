import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'KOYO Studio 创作中心 — 释放无限创意',
  description: 'AI 生图、AI 视频、AI 音乐与多智能体工作流。',
};

export default function ZhHome() {
  permanentRedirect('/');
}
