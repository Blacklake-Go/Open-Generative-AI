'use client';

import Link from 'next/link';
import BrandLogo from '@/components/site/BrandLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useBranding } from '@/lib/hooks/useBranding';
import { Button } from '@/components/ui/button';

const COPY = {
  en: ['Community', 'Open calls', 'My submissions', 'Account & credits', 'Create on main site'],
  'zh-CN': ['创作者社区', '征集活动', '我的投稿', '账户与积分', '回主站创作'],
  'zh-TW': ['創作者社區', '徵集活動', '我的投稿', '帳戶與積分', '回主站創作'],
  'ja-JP': ['コミュニティ', '作品募集', '自分の投稿', 'アカウントとポイント', 'メインで作成'],
  'ko-KR': ['커뮤니티', '공모 활동', '내 제출 작품', '계정 및 포인트', '메인에서 창작'],
  es: ['Comunidad', 'Convocatorias', 'Mis envíos', 'Cuenta y créditos', 'Crear en el sitio principal'],
};
export default function CommunityHeader({ locale = 'en' }) {
  const { brand } = useBranding();
  const labels = COPY[locale] || COPY.en;
  return <header className="fixed inset-x-0 top-0 z-header flex h-14 items-center gap-3 border-b border-line-subtle bg-base px-4 text-ink">
    <Link href="/community" aria-label="SupDance ONE" className="shrink-0"><BrandLogo brand={brand} /></Link>
    <nav aria-label={labels[0]} className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
      {['/community', '/community/campaigns', '/community/submit', '/account/connected', 'https://www.supdance.com/'].map((href, index) =>
        <Button key={href} asChild size="lg" variant={index === 4 ? 'primary' : 'ghost'}><a href={href}>{labels[index]}</a></Button>)}
    </nav>
    <LanguageSwitcher className="hidden shrink-0 sm:block" showLabel={false} />
  </header>;
}
