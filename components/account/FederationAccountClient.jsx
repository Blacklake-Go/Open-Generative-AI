'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { localizedHref } from '@/lib/client/localeSwitch';
import StudioHeader from '@/components/site/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useUserSession } from '@/lib/hooks/useUserSession';

const LOGIN_COPY = {
  'zh-CN': ['使用主站账户登录 ONE', '已有 ONE 账户？使用原登录方式后连接，保留旧资产'],
  'zh-TW': ['使用主站帳戶登入 ONE', '已有 ONE 帳戶？使用原登入方式後連接，保留舊資產'],
  'ja-JP': ['メインアカウントで ONE にログイン', '既存の ONE アカウントでログインして連携'],
  'ko-KR': ['메인 계정으로 ONE에 로그인', '기존 ONE 계정으로 로그인한 후 연결'],
  es: ['Acceder a ONE con la cuenta principal', '¿Ya tienes una cuenta ONE? Accede primero para conservar tus archivos'],
  en: ['Sign in to ONE with your main account', 'Already have a ONE account? Use your original sign-in, then connect it to keep your assets'],
};

const LEGACY_SPEND_COPY = { 'zh-CN':'使用历史 ONE 积分创作', 'zh-TW':'使用歷史 ONE 積分創作', 'ja-JP':'ONE の過去のポイントを使う', 'ko-KR':'ONE 기존 포인트 사용', es:'Usar créditos anteriores de ONE', en:'Use historical ONE credits' };

const COPY = {
  'zh-CN': { title: '连接 SupDance 主站账户', intro: '核对并连接你拥有的两个账户。主站创作使用主站钱包；ONE 历史积分保留原值、有效期与原有使用路径。', password: '当前 ONE 密码', connect: '验证并前往主站', loading: '正在读取账户…', mainWallet: '主站创作钱包', available: '可用积分', reserved: '预留积分', legacy: 'ONE 历史积分', legacyNote: '历史积分继续保留原有规则，尚未兑换或重复发放到主站。', daily: '每日积分', subscription: '订阅积分', perpetual: '永久积分', frozen: '冻结积分', create: '回主站创作', recharge: '主站账户与充值', community: '返回社区', failure: '读取失败，请稍后重试', retry: '重新读取', expiry: '有效期', none: '无到期时间' },
  'zh-TW': { title: '連接 SupDance 主站帳戶', intro: '核對並連接你擁有的兩個帳戶。主站創作使用主站錢包；ONE 歷史積分保留原值、有效期與原有使用路徑。', password: '目前 ONE 密碼', connect: '驗證並前往主站', loading: '正在讀取帳戶…', mainWallet: '主站創作錢包', available: '可用積分', reserved: '預留積分', legacy: 'ONE 歷史積分', legacyNote: '歷史積分繼續保留原有規則，尚未兌換或重複發放到主站。', daily: '每日積分', subscription: '訂閱積分', perpetual: '永久積分', frozen: '凍結積分', create: '回主站創作', recharge: '主站帳戶與儲值', community: '返回社區', failure: '讀取失敗，請稍後重試', retry: '重新讀取', expiry: '有效期', none: '無到期時間' },
  'en-US': { title: 'Connect your SupDance main account', intro: 'Check and connect two accounts you own. Main-site creations use the main wallet; historical ONE credits keep their value, expiry and original spending path.', password: 'Current ONE password', connect: 'Verify and continue to main site', loading: 'Loading account…', mainWallet: 'Main creation wallet', available: 'Available credits', reserved: 'Reserved credits', legacy: 'Historical ONE credits', legacyNote: 'Historical credits keep their original rules. They have not been converted or issued again on the main site.', daily: 'Daily credits', subscription: 'Subscription credits', perpetual: 'Permanent credits', frozen: 'Frozen credits', create: 'Create on main site', recharge: 'Main account and recharge', community: 'Back to community', failure: 'Unable to load. Please try again later.', retry: 'Reload', expiry: 'Expires', none: 'No expiry' },
  'ja-JP': { title: 'SupDance メインアカウントを連携', intro: 'ご自身が所有する二つのアカウントを確認して連携します。メインでの作成はメインウォレットを使用し、ONE の過去のポイント、有効期限と利用経路は維持します。', password: 'ONE の現在のパスワード', connect: '確認してメインサイトへ', loading: 'アカウントを読み込み中…', mainWallet: 'メイン作成ウォレット', available: '利用可能ポイント', reserved: '予約済みポイント', legacy: 'ONE の過去のポイント', legacyNote: '元のルールを維持しています。メインサイトでの変換や二重付与は行われていません。', daily: 'デイリーポイント', subscription: '購読ポイント', perpetual: '永久ポイント', frozen: '凍結ポイント', create: 'メインサイトで作成', recharge: 'メインアカウントとチャージ', community: 'コミュニティへ戻る', failure: '読み込めません。後でお試しください。', retry: '再読み込み', expiry: '有効期限', none: '期限なし' },
  'ko-KR': { title: 'SupDance 메인 계정 연결', intro: '본인 소유의 두 계정을 확인하고 연결하세요. 메인 창작에는 메인 지갑을 사용하며 ONE의 기존 포인트, 유효기간과 사용 경로는 유지됩니다.', password: '현재 ONE 비밀번호', connect: '확인 후 메인 사이트로', loading: '계정을 불러오는 중…', mainWallet: '메인 창작 지갑', available: '사용 가능 포인트', reserved: '예약 포인트', legacy: 'ONE 기존 포인트', legacyNote: '기존 규칙을 유지합니다. 메인 사이트로 변환하거나 중복 지급하지 않았습니다.', daily: '일일 포인트', subscription: '구독 포인트', perpetual: '영구 포인트', frozen: '동결 포인트', create: '메인 사이트에서 창작', recharge: '메인 계정 및 충전', community: '커뮤니티로 돌아가기', failure: '불러올 수 없습니다. 나중에 다시 시도하세요.', retry: '다시 불러오기', expiry: '유효기간', none: '만료 없음' },
};

export default function FederationAccountClient({ locale = 'en-US' }) {
  const copy = COPY[locale] || COPY['en-US'];
  const loginCopy = LOGIN_COPY[locale] || LOGIN_COPY.en;
  const { user } = useUserSession();
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const [storedWallet, setWallet] = useState(null);
  const wallet = storedWallet?.oneUserId === user?.id ? storedWallet : null;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const ownerId = user?.id;
    if (!ownerId) { setWallet(null); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/federation/wallet', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || copy.failure);
      if (owner.current !== ownerId) return;
      if (data.oneUserId !== ownerId) throw new Error(copy.failure);
      setWallet(data);
    } catch (reason) { if (owner.current === ownerId) setError(reason.message || copy.failure); }
    finally { if (owner.current === ownerId) setLoading(false); }
  }, [user?.id, copy.failure]);
  useEffect(() => { setWallet(null); setPassword(''); void load(); }, [load]);
  async function connect(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/federation/link/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setPassword('');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || copy.failure);
      const target = new URL(result.authorizeUrl);
      if (target.origin !== 'https://www.supdance.com' || target.pathname !== '/connect-one') throw new Error(copy.failure);
      window.location.assign(target.href);
    } catch (reason) { setError(reason.message || copy.failure); setBusy(false); }
  }
  async function mainLogin() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/federation/login/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || copy.failure);
      const target = new URL(result.authorizeUrl);
      if (target.origin !== 'https://www.supdance.com' || target.pathname !== '/connect-one') throw new Error(copy.failure);
      window.location.assign(target.href);
    } catch (reason) { setError(reason.message || copy.failure); setBusy(false); }
  }
  const credits = (amount) => (Number(amount) / 1000000).toLocaleString(locale, { maximumFractionDigits: 6 });
  const legacy = wallet?.legacy?.wallet;
  return <>
    <StudioHeader locale={locale} title={copy.title} />
    <main className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-24 text-ink">
      <Card><CardHeader><CardTitle>{copy.title}</CardTitle><CardDescription>{copy.intro}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {loading && <p role="status">{copy.loading}</p>}
          {!user && <div className="space-y-4"><Button size="lg" variant="primary" onClick={mainLogin} disabled={busy}>{loginCopy[0]}</Button><p><Link href={localizedHref('/login', { explicit: locale })} className="text-brand underline">{loginCopy[1]}</Link></p></div>}
          {error && <div className="space-y-3" role="alert"><p className="text-danger">{error}</p><Button size="lg" onClick={load}>{copy.retry}</Button></div>}
          {!loading && wallet && !wallet.linked && <form onSubmit={connect} className="space-y-4">
            <label className="block space-y-2"><span>{copy.password}</span><Input type="password" autoComplete="current-password" maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} required size="lg" /></label>
            <Button variant="primary" size="lg" type="submit" disabled={busy || !password}>{copy.connect}</Button>
          </form>}
          {wallet?.linked && <>
            <h2 className="text-section-title">{copy.mainWallet}</h2>
            <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-ink-muted">{copy.available}</dt><dd className="text-card-title">{credits(wallet.canonical.account.availableMicrocredits)}</dd></div><div><dt className="text-ink-muted">{copy.reserved}</dt><dd className="text-card-title">{credits(wallet.canonical.account.reservedMicrocredits)}</dd></div></dl>
            <div className="flex flex-wrap gap-3"><Button asChild size="lg" variant="primary"><a href={wallet.createUrl}>{copy.create}</a></Button><Button asChild size="lg"><a href={wallet.rechargeUrl}>{copy.recharge}</a></Button></div>
          </>}
        </CardContent>
      </Card>
      {wallet?.linked && <Card><CardHeader><CardTitle>{copy.legacy}</CardTitle><CardDescription>{copy.legacyNote}</CardDescription></CardHeader>
        <CardContent><dl className="grid gap-4 sm:grid-cols-2">{[['daily', 'daily_free_credits', 'daily_expires_at'], ['subscription', 'subscription_credits', 'subscription_expires_at'], ['perpetual', 'perpetual_credits'], ['frozen', 'frozen_credits']].map(([label, column, expiry]) => <div key={label}><dt className="text-ink-muted">{copy[label]}</dt><dd>{legacy?.[column] ?? 0}</dd>{expiry && <dd className="text-body-sm text-ink-subtle">{copy.expiry}: {legacy?.[expiry] ? new Date(legacy[expiry]).toLocaleString(locale) : copy.none}</dd>}</div>)}</dl>{wallet.legacyCreateUrl && <Button asChild size="lg" className="mt-4"><Link href={localizedHref(wallet.legacyCreateUrl, { explicit: locale })}>{LEGACY_SPEND_COPY[locale] || LEGACY_SPEND_COPY.en}</Link></Button>}</CardContent>
      </Card>}
      <Button asChild size="lg" variant="ghost"><Link href={localizedHref('/community', { explicit: locale })}>{copy.community}</Link></Button>
    </main>
  </>;
}
