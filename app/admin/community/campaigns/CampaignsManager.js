'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Button, StatusBadge } from '@/components/admin/AdminUi';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const LABELS = { draft: '草稿', open: '开放投稿', judging: '评审中', closed: '已结束' };
const AWARDS = { approved: '已批准，待入账', settled: '已入账', review_required: '需核对' };
const EMPTY = { title: '', rules: '', startsAt: '', endsAt: '', prizeCredits: '0', maxWinners: '1' };
async function request(body, id) {
  const response = await fetch(`/api/admin/community/campaigns${id ? `?id=${encodeURIComponent(id)}` : ''}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || '活动操作失败');
  return payload.data;
}
export default function CampaignsManager({ canWrite }) {
  const [rows, setRows] = useState([]); const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]); const [reasons, setReasons] = useState({});
  const [form, setForm] = useState(EMPTY); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const active = useRef(null);
  const refresh = useCallback(async () => { const data = await request(); setRows(data.campaigns); }, []);
  useEffect(() => { let mounted = true; request().then(data => { if (mounted) setRows(data.campaigns); })
    .catch(reason => { if (mounted) setError(reason.message); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; active.current = null; }; }, []);
  async function select(row) {
    active.current = row.id; setSelected(row); setEntries([]); setError(''); setNotice('');
    try { const data = await request(null, row.id); if (active.current === row.id) setEntries(data.entries); }
    catch (reason) { if (active.current === row.id) setError(reason.message); }
  }
  async function mutate(body) {
    if (busy || !canWrite) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(body); await refresh();
      if (body.action === 'create') { setForm(EMPTY); await select(result); }
      else if (body.action === 'transition') await select(result);
      else if (body.action === 'award' && active.current === body.campaignId) {
        const data = await request(null, body.campaignId);
        if (active.current === body.campaignId) setEntries(data.entries);
      }
      setNotice(body.action === 'award' ? '获奖记录已批准，尚未完成积分入账。' : '活动已保存。');
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  const field = (key) => ({ value: form[key], onChange: (event) => setForm(previous => ({ ...previous, [key]: event.target.value })) });
  return <div className="space-y-6">
    {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status">{notice}</p>}
    <Card><p className="text-sm text-ink-muted">当前支持获奖批准；主站积分入账尚未开放。待入账奖励会阻止活动结束。</p></Card>
    {canWrite && <Card><h2 className="mb-4 text-lg font-semibold">新建征集草稿</h2>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void mutate({ action: 'create', ...form,
        startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), prizeCredits: Number(form.prizeCredits), maxWinners: Number(form.maxWinners) }); }}>
        <label className="space-y-2 sm:col-span-2">活动名称<Input required maxLength={200} {...field('title')} /></label>
        <label className="space-y-2 sm:col-span-2">公开规则<Textarea required minLength={10} maxLength={10000} {...field('rules')} /></label>
        <label className="space-y-2">开始时间（本地时区）<Input type="datetime-local" required {...field('startsAt')} /></label>
        <label className="space-y-2">截止时间（本地时区）<Input type="datetime-local" required min={form.startsAt} {...field('endsAt')} /></label>
        <label className="space-y-2">每人奖励积分<Input type="number" required min="0" max="1000000" step="1" {...field('prizeCredits')} /></label>
        <label className="space-y-2">获奖人数上限<Input type="number" required min="1" max="100" step="1" {...field('maxWinners')} /></label>
        <Button type="submit" disabled={busy}>保存草稿</Button>
      </form></Card>}
    <Card><h2 className="mb-4 text-lg font-semibold">活动列表</h2>{loading && <p role="status">正在读取…</p>}
      <div className="space-y-3">{rows.map(row => <button type="button" key={row.id} onClick={() => void select(row)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4 text-left">
        <span>{row.title} · {row.entries_count} 份投稿</span><StatusBadge>{LABELS[row.status]}</StatusBadge>
      </button>)}</div>{!loading && !rows.length && <p>暂无征集活动。</p>}</Card>
    {selected && <Card><h2 className="text-lg font-semibold">{selected.title}</h2>
      <p className="my-3 whitespace-pre-wrap">{selected.rules}</p>
      <p className="text-sm text-ink-muted">规则版本 {selected.rules_version} · 每人 {selected.prize_credits} 积分 · 最多 {selected.max_winners} 人</p>
      <p className="my-3 text-sm">{new Date(selected.starts_at).toLocaleString()} — {new Date(selected.ends_at).toLocaleString()}</p>
      {canWrite && selected.status !== 'closed' && <Button disabled={busy || (selected.status === 'open' && new Date(selected.ends_at) > new Date())}
        onClick={() => void mutate({ action: 'transition', campaignId: selected.id, status: { draft: 'open', open: 'judging', judging: 'closed' }[selected.status] })}>
        {{ draft: '确认规则并开放投稿', open: '截止后进入评审', judging: '完成入账后结束活动' }[selected.status]}</Button>}
      <h3 className="mb-3 mt-6 font-semibold">投稿与评奖</h3>
      <div className="space-y-4">{entries.map(entry => <div key={entry.id} className="space-y-3 rounded-xl border border-line p-4">
        <p>{entry.post_snapshot.title} · 作者 {entry.user_id}</p><p className="text-sm text-ink-muted">参赛快照 · 规则版本 {entry.rules_version}</p>
        {entry.award_status ? <StatusBadge>{AWARDS[entry.award_status] || entry.award_status}</StatusBadge> : canWrite && selected.status === 'judging' && <>
          <Textarea aria-label="评奖原因" placeholder="填写至少 5 字的评奖原因" maxLength={1000} value={reasons[entry.id] || ''} onChange={event => setReasons(previous => ({ ...previous, [entry.id]: event.target.value }))} />
          <Button disabled={busy || (reasons[entry.id] || '').trim().length < 5} onClick={() => void mutate({ action: 'award', campaignId: selected.id, entryId: entry.id, reason: reasons[entry.id] })}>批准获奖（待入账）</Button>
        </>}
      </div>)}</div>{!entries.length && <p className="mt-3 text-ink-muted">暂无投稿。</p>}
    </Card>}
  </div>;
}
