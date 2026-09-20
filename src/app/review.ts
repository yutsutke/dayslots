/* 📝 振り返りの要約＝AI（や人）が読むための、直近 N 日ぶんの短い文章。
 *  ・写し（doc）は1件 約600文字で id や空の欄だらけ＝AI には重い。こちらは1週間で 2〜3 千文字
 *  ・**枡・何分・連続日数などの計算はここ（アプリの決まり）で済ませてから渡す**＝AI や SQL に同じ規則をもう一度書かせない
 *  ・これは写しの一部（外に置く読み物）であって、元の記録には何も足さない（導出値は保存しない、の約束のまま）
 *  ・id・作成時刻・内部名は出さない。メモは先頭 60 文字まで
 */
import type { Entry, Track, YMD } from '../domain/types';
import type { Repo } from './repo';
import { addDays, dowOf, DOW_JA } from '../domain/dates';
import { bucketOf, durationOf, fmtDur, fmtMin } from '../domain/slots';
import { gapLine, fmtGapStats } from '../domain/gap';
import { postponeCount, fmtPostpone } from '../domain/postpone';

export interface Review { generatedAt: string; from: YMD; to: YMD; days: number; text: string; }

const clip = (s: string, n = 60) => { const t = s.replace(/\s*\n\s*/g, ' / ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

function itemText(repo: Repo, t: Track, e: Entry): string {
  const mark = t.features.done ? (e.doneAt ? '✅' : e.skippedAt ? '🚫' : '◻️') : '';
  const span = (a: number | null, b: number | null) => (a == null ? '' : `${fmtMin(a)}〜${b != null ? fmtMin(b) : ''}`);
  let when = span(e.actualStart, e.actualEnd);
  if (!when && e.actualEnd != null) when = `〜${fmtMin(e.actualEnd)}`;
  if (!when && e.planStart != null) when = `予定 ${span(e.planStart, e.planEnd).replace(/〜$/, '')}`;
  if (!when) { const b = bucketOf(t, e); const s = t.slots.find((x) => x.key === b); if (s && b !== t.fallbackKey) when = `（${s.label}）`; }
  const dur = durationOf(e);
  const origin = e.payload.origin === 'home' ? '🏠' : e.payload.origin === 'store' ? '🏪' : e.payload.origin === 'out' ? '🍴' : '';
  const yen = Number((e.payload.receipt as { total?: number } | undefined)?.total) || 0;
  const inst = repo.insteadFor(e.id); const of = e.insteadOfId ? repo.entry(e.insteadOfId) : undefined;
  return [
    mark, repo.isRunning(e) ? '⏵進行中' : '', e.title === t.name ? '' : e.title, when, dur ? `⏱${fmtDur(dur)}` : '', origin, yen ? `¥${yen.toLocaleString()}` : '',
    e.priority > 0 ? '❗' : '', e.ruleId ? '🔁' : '', e.photos.length ? `📷${e.photos.length}` : '', gapLine(e), fmtPostpone(e) ? `⏭ ${fmtPostpone(e)}` : '',
    inst ? `→代わりに ${inst.title}` : '', of ? `（${of.title} の代わり）` : '', e.note ? `「${clip(e.note)}」` : '',
  ].filter(Boolean).join(' ');
}

export function buildReview(repo: Repo, today: YMD, days = 7): Review {
  const from = addDays(today, -(days - 1)); const tracks = repo.tracks; const out: string[] = [];
  out.push(`# コマ 振り返り ${from}〜${today}（${days}日・作成 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z）`);
  out.push('印: ✅やった 🚫今日は無し（連続は切れない） ◻️まだ ⏵進行中 🔁繰り返しから ❗重要 ⏱長さ 🏠手作り 🏪中食 🍴外食。時刻は 実際（無ければ「予定」）。');
  out.push('ズレ＝予定と実際の差。予定と実際の**両方がある記録だけ**を比べた（片方しか無い記録は数に入っていない）。');
  out.push('⏭ 先送り＝やる日を後ろへ動かした記録。「もともとの日 から N回先送り（M日）」＝いま出ている日ではなく、最初はその日のつもりだった。');
  for (let d = today; d >= from; d = addDays(d, -1)) {
    const lines: string[] = [];
    for (const t of tracks) {
      const es = repo.entriesFor(t.id, d, d); const gs = d <= today ? repo.ghostsFor(t.id, d, d) : [];
      if (!es.length && !gs.length) continue;
      const head = t.features.done && es.length > 1 ? ` ✅${es.filter((e) => e.doneAt).length}/${es.length}` : '';
      const items = es.map((e) => itemText(repo, t, e)).filter(Boolean);
      if (gs.length) items.push(`🔁未確認: ${gs.map((o) => o.title + (o.planStart != null ? ' ' + fmtMin(o.planStart) : '')).join('・')}`);
      lines.push(` ${t.icon} ${t.name}${head}: ${items.join(' ／ ') || (t.features.done ? '' : `${es.length}件`)}`);
    }
    if (lines.length) { out.push(`## ${d}(${DOW_JA[dowOf(d)]})`); out.push(...lines); }
  }
  out.push(`## ${days}日の合計`);
  for (const t of tracks) {
    const s = repo.summary(t.id, from, today); if (!s.total && !s.ghosts) continue;
    const ds = repo.durationStats(t.id, from, today);
    const parts = [t.features.done ? `✅${s.done} 🚫${s.skipped} まだ${s.open}` : `${s.total}件`];
    if (t.features.daily) parts.push(`🔥連続${repo.streak(t.id, today)}日`);
    if (ds.total) parts.push(`⏱合計${fmtDur(ds.total)}・平均${fmtDur(ds.avg)}/回`);
    if (t.kind === 'meal') { const es = repo.entriesFor(t.id, from, today); const c = (o: string) => es.filter((e) => e.payload.origin === o).length; parts.push(`🏠${c('home')} 🏪${c('store')} 🍴${c('out')}`); }
    if (t.kind === 'receipt') { const yen = repo.entriesFor(t.id, from, today).reduce((a, e) => a + (Number((e.payload.receipt as { total?: number } | undefined)?.total) || 0), 0); if (yen) parts.push(`💴¥${yen.toLocaleString()}`); }
    if (s.ghosts) parts.push(`🔁未確認${s.ghosts}`);
    const pp = repo.entriesFor(t.id, from, today).filter((e) => postponeCount(e) > 0);
    if (pp.length) parts.push(`⏭先送り${pp.length}件（のべ${pp.reduce((a, e) => a + postponeCount(e), 0)}回）`);
    const gp = repo.gapStats(t.id, from, today);
    const gparts = [
      gp.start.count ? `始まり ${fmtGapStats(gp.start, 'start')}` : '',
      gp.dur.count ? `長さ ${fmtGapStats(gp.dur, 'dur')}` : '',
      gp.days.count ? `日 ${fmtGapStats(gp.days, 'days')}` : '',
    ].filter(Boolean);
    if (gparts.length) parts.push(`予定とのズレ＝${gparts.join('／')}`);
    out.push(` ${t.icon} ${t.name}: ${parts.join(' ／ ')}`);
  }
  const inbox = repo.db.inbox ?? []; if (inbox.length) out.push(`📥 未振り分け: ${inbox.map((i) => `「${clip(i.text, 30)}」`).join(' ')}`);
  return { generatedAt: new Date().toISOString(), from, to: today, days, text: out.join('\n') };
}
