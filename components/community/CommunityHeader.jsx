'use client';

import Link from 'next/link';
import { localizedHref } from '@/lib/client/localeSwitch';
import BrandLogo from '@/components/site/BrandLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useBranding } from '@/lib/hooks/useBranding';
import { Button } from '@/components/ui/button';

const COPY = {
  en: ['Community', 'Open calls', 'My submissions', 'Account & credits', 'Create on main site', 'Your ONE assets', 'Historical ONE account'],
  'zh-CN': ['创作者社区', '征集活动', '我的投稿', '账户与积分', '回主站创作', '历史资产', '历史 ONE 账户'],
  'zh-TW': ['創作者社區', '徵集活動', '我的投稿', '帳戶與積分', '回主站創作', '歷史資產', '歷史 ONE 帳戶'],
  'ja-JP': ['コミュニティ', '作品募集', '自分の投稿', 'アカウントとポイント', 'メインで作成', 'ONE の作品', 'ONE の既存アカウント'],
  'ko-KR': ['커뮤니티', '공모 활동', '내 제출 작품', '계정 및 포인트', '메인에서 창작', 'ONE 기존 작품', 'ONE 기존 계정'],
  es: ['Comunidad', 'Convocatorias', 'Mis envíos', 'Cuenta y créditos', 'Crear en el sitio principal', 'Tus archivos de ONE', 'Cuenta anterior de ONE'],
};
export default function CommunityHeader({ locale = 'en' }) {
  const { brand } = useBranding();
  const labels = COPY[locale] || COPY.en;
  return <header className="fixed inset-x-0 top-0 z-header flex h-14 items-center gap-3 border-b border-line-subtle bg-base px-4 text-ink">
    <Link href={localizedHref('/community', { explicit: locale })} aria-label="SupDance ONE" className="shrink-0"><BrandLogo brand={brand} /></Link>
    <nav aria-label={labels[0]} className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
      {[['/community', labels[0]], ['/community/campaigns', labels[1]], ['/community/submit', labels[2]],
        ['/assets', labels[5]], ['/account/connected', labels[3]], ['/account', labels[6]], ['https://www.supdance.com/', labels[4]]].map(([href, label]) =>
        <Button key={href} asChild size="lg" variant={href.startsWith('https:') ? 'primary' : 'ghost'}><a href={href.startsWith('https:') ? href : localizedHref(href, { explicit: locale })}>{label}</a></Button>)}
    </nav>
    <LanguageSwitcher className="hidden shrink-0 sm:block" showLabel={false} />
  </header>;
}
