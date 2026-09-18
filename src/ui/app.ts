/* 画面の骨＝上の帯（種目タブ・週/1日/月・日送り・⭐🔁⚙）＋ 見直しの帯 ＋ 升目（週・月）か一覧（1日）
 *  一日一回の種目（features.daily）は、升目が「その日の印」1つになる（なし → ✅ → 🚫 → なし を1タップで回す） */
import { h } from './dom';
import { Repo } from '../app/repo';
import { LocalStore } from '../store/store';
import { seedDb } from '../store/seed';
import { todayYMD, addDays, addMonths, weekStartOf, DOW_JA, dowOf } from '../domain/dates';
import { bucketOf, bucketOfOccurrence, fmtMin, primaryMinute, slotRange } from '../domain/slots';
import { openEntryForm, openTemplates, openRules } from './forms';
import { openSettings } from './settings';
import { pending } from '../sync/calendar';
import type { Entry, Track, YMD } from '../domain/types';
import type { Occurrence } from '../domain/recur';

export const BUILD = 'v3';
export interface Ctx { repo: Repo; render: () => void; anchor: () => YMD; }

type View = 'week' | 'day' | 'month';
let repo: Repo;
let root: HTMLElement;
const state: { trackId: string; view: View; anchor: YMD } = { trackId: '', view: 'week', anchor: todayYMD() };

export async function boot(el: HTMLElement): Promise<void> {
  root = el;
  repo = await Repo.open(new LocalStore(), () => seedDb());
  state.trackId = repo.tracks[0]?.id ?? repo.addTrackFromPreset('todo').id;
  render();
}
const ctx = (): Ctx => ({ repo, render, anchor: () => state.anchor });
const isDaily = (t: Track) => Boolean(t.features.daily);

/** 見ている範囲。月＝月初を含む週の頭から6週（42日）＝升目と同じ */
function range(): [YMD, YMD] {
  if (state.view === 'day') return [state.anchor, state.anchor];
  if (state.view === 'month') { const a = weekStartOf(state.anchor.slice(0, 7) + '-01', repo.db.settings.weekStart); return [a, addDays(a, 41)]; }
  const a = weekStartOf(state.anchor, repo.db.settings.weekStart);
  return [a, addDays(a, 6)];
}

export function render(): void {
  if (!repo.tracks.some((t) => t.id === state.trackId)) state.trackId = repo.tracks[0]?.id ?? repo.addTrackFromPreset('todo').id;
  const track = repo.track(state.trackId);
  const [from, to] = range();
  repo.ensureAuto(from, to); // 🔁 自動の回を今日まで記録にする（未来には作らない）
  const body = state.view === 'day' ? dayList(track, from)
    : state.view === 'month' ? monthGrid(track, from)
    : isDaily(track) ? dailyWeek(track, from) : weekGrid(track, from, to);
  root.replaceChildren(header(track, from, to), body, footer());
}

function move(dir: 1 | -1): void {
  state.anchor = state.view === 'day' ? addDays(state.anchor, dir) : state.view === 'month' ? addMonths(state.anchor, dir) : addDays(state.anchor, 7 * dir);
  render();
}

function header(track: Track, from: YMD, to: YMD): HTMLElement {
  const tabs = h('div', { class: 'tabs' },
    repo.tracks.map((t) => h('button', { class: t.id === state.trackId ? 'on' : '', onclick: () => { state.trackId = t.id; render(); } }, `${t.icon} ${t.name}`)),
    h('button', { class: 'ghost', title: '種目を足す・枡（時間帯）の境目を変える', onclick: () => openSettings(ctx()) }, '⚙'));
  const label = state.view === 'day' ? `${from}（${DOW_JA[dowOf(from)]}）` : state.view === 'month' ? state.anchor.slice(0, 7) : `${from} 〜 ${to.slice(5)}`;
  const seg = (v: View, l: string) => h('button', { class: state.view === v ? 'on' : '', onclick: () => { state.view = v; render(); } }, l);
  const nav = h('div', { class: 'nav' },
    h('span', { class: 'seg' }, seg('day', '1日'), seg('week', '週'), seg('month', '月')),
    h('button', { onclick: () => move(-1) }, '◀'),
    h('b', { class: 'range' }, label),
    h('button', { onclick: () => move(1) }, '▶'),
    h('button', { onclick: () => { state.anchor = todayYMD(); render(); } }, '今日'),
    h('span', { class: 'sp' }),
    h('button', { onclick: () => openTemplates(ctx(), track) }, '⭐ いつもの'),
    h('button', { onclick: () => openRules(ctx(), track) }, '🔁 繰り返し'),
    h('button', { class: 'primary', onclick: () => openEntryForm(ctx(), track, null, { date: state.anchor, title: isDaily(track) ? track.name : '' }) }, '＋ 足す'));
  return h('header', null, tabs, nav, reviewBar(track, from, to));
}

/** 見直しの帯（ライフログの緑の帯を写した）＝✅／🚫／まだ／🔁 の数。一日一回は 連続日数 も */
function reviewBar(track: Track, from: YMD, to: YMD): HTMLElement {
  const s = repo.summary(track.id, from, to);
  const parts = track.features.done
    ? [`✅ ${s.done}`, `🚫 ${s.skipped}`, ...(isDaily(track) ? [] : [`まだ ${s.open}`]), `🔁 ${s.ghosts}`]
    : [`${track.icon} ${s.total} 件`, `🔁 ${s.ghosts}`];
  if (isDaily(track)) parts.push(`🔥 連続 ${repo.streak(track.id, todayYMD())} 日`);
  if (track.kind === 'meal') {
    const es = repo.entriesFor(track.id, from, to);
    const c = (o: string) => es.filter((e) => e.payload.origin === o).length;
    parts.push(`🏠 ${c('home')} 🏪 ${c('store')} 🍴 ${c('out')}`);
  }
  const pend = pending(repo).length;
  const title = state.view === 'week' ? '🗓 週の見直し' : state.view === 'month' ? '🗓 月の見直し' : '📋 この日';
  return h('div', { class: 'review' },
    h('b', null, title), h('span', { class: 'sp' }),
    parts.map((p) => h('span', null, p)),
    pend ? h('span', { class: 'warn', title: 'Google カレンダーに出す予定で、まだ出ていない記録の数（⚙ で接続）' }, `📅 未送信 ${pend}`) : null);
}

// ── 週（枡の升目） ─────────────────────────────────────────
function weekGrid(track: Track, from: YMD, to: YMD): HTMLElement {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const today = todayYMD();
  const es = repo.entriesFor(track.id, from, to);
  const gs = repo.ghostsFor(track.id, from, to);
  return h('div', { class: 'gridWrap' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null, h('th', { class: 'dcol' }),
      track.slots.map((s) => h('th', null, h('div', null, `${s.icon} ${s.label}`),
        h('small', null, s.startMin == null ? (s.key === track.fallbackKey ? '受け皿' : '選んだ時だけ') : slotRange(track, s.key)))))),
    h('tbody', null, days.map((d) => h('tr', { class: d === today ? 'today' : '' },
      h('th', { class: 'dcol', onclick: () => { state.view = 'day'; state.anchor = d; render(); } }, h('b', null, d.slice(5)), h('small', null, DOW_JA[dowOf(d)])),
      track.slots.map((s) => h('td', { class: 'cell' },
        es.filter((e) => e.date === d && bucketOf(track, e) === s.key).map((e) => chip(track, e)),
        gs.filter((o) => o.date === d && bucketOfOccurrence(track, o) === s.key).map((o) => ghost(track, o)),
        h('button', { class: 'add', title: 'ここに足す', onclick: () => openEntryForm(ctx(), track, null, { date: d, slotKey: s.key }) }, '＋'))))))));
}

// ── 週（一日一回＝1日1行・1タップ） ───────────────────────────
function dayMark(e: Entry | undefined): string { return e?.doneAt ? '✅' : e?.skippedAt ? '🚫' : '◻️'; }
function dayDetail(e: Entry | undefined): string {
  if (!e) return '';
  const span = (a: number | null, b: number | null) => (a == null ? '' : `${fmtMin(a)}${b != null ? '–' + fmtMin(b) : ''}`);
  return [span(e.actualStart, e.actualEnd) || span(e.planStart, e.planEnd), e.note ?? ''].filter(Boolean).join(' · ');
}
function dailyWeek(track: Track, from: YMD): HTMLElement {
  const today = todayYMD();
  return h('div', { class: 'day daily' },
    h('p', { class: 'hint' }, `印を押すと なし → ✅ → 🚫 → なし。時刻やメモは「…」から。`),
    Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
      const e = repo.dayEntry(track.id, d);
      return h('div', { class: `row ${e?.doneAt ? 'done' : e?.skippedAt ? 'skip' : ''} ${d === today ? 'today' : ''}` },
        h('button', { class: 'box big', onclick: () => { repo.toggleDay(track.id, d); render(); } }, dayMark(e)),
        h('div', { class: 'times' }, h('b', null, d.slice(5)), ' ', h('small', null, DOW_JA[dowOf(d)])),
        h('div', { class: 'ttl' }, dayDetail(e) || h('small', null, e ? '' : '—'), e?.calendar ? ' 📅' : ''),
        h('button', { class: 'ghost', title: '時刻・メモなどの詳細', onclick: () => openEntryForm(ctx(), track, e ?? null, { date: d, title: track.name }) }, '…'));
    }));
}

// ── 月 ───────────────────────────────────────────────────
function monthGrid(track: Track, from: YMD): HTMLElement {
  const today = todayYMD(), ym = state.anchor.slice(0, 7);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const es = repo.entriesFor(track.id, from, days[41]);
  const gs = repo.ghostsFor(track.id, from, days[41]);
  const ws = repo.db.settings.weekStart;
  const cell = (d: YMD) => {
    const inMonth = d.startsWith(ym);
    const list = es.filter((e) => e.date === d), gl = gs.filter((o) => o.date === d);
    const goDay = () => { state.view = 'day'; state.anchor = d; render(); };
    if (isDaily(track)) {
      const e = repo.dayEntry(track.id, d);
      return h('td', { class: `mcell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''} ${e?.doneAt ? 'done' : e?.skippedAt ? 'skip' : ''}` },
        h('div', { class: 'dn', onclick: goDay }, String(Number(d.slice(8)))),
        h('button', { class: 'box big', onclick: () => { repo.toggleDay(track.id, d); render(); } }, dayMark(e)),
        e && dayDetail(e) ? h('small', { class: 'sub' }, dayDetail(e)) : null);
    }
    const shown = list.slice(0, 3);
    return h('td', { class: `mcell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''}`, onclick: goDay },
      h('div', { class: 'dn' }, String(Number(d.slice(8))), list.length ? h('small', null, ` ${track.features.done ? `✅${list.filter((e) => e.doneAt).length}/${list.length}` : list.length}`) : null),
      shown.map((e) => h('div', { class: `mini ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}` }, primaryMinute(track, e) != null ? h('span', { class: 't' }, fmtMin(primaryMinute(track, e) as number)) : null, e.title)),
      list.length > 3 ? h('small', { class: 'sub' }, `＋${list.length - 3}`) : null,
      gl.length ? h('small', { class: 'sub ghostTxt' }, `🔁 ${gl.length}`) : null);
  };
  return h('div', { class: 'gridWrap' }, h('table', { class: 'month' },
    h('thead', null, h('tr', null, Array.from({ length: 7 }, (_, i) => h('th', null, DOW_JA[(ws + i) % 7])))),
    h('tbody', null, Array.from({ length: 6 }, (_, w) => h('tr', null, days.slice(w * 7, w * 7 + 7).map(cell))))));
}

// ── 部品 ─────────────────────────────────────────────────
function statusBox(track: Track, e: Entry): HTMLElement | null {
  if (!track.features.done) return null;
  return h('button', { class: 'box', title: e.doneAt ? '✅ 済（押すと戻す）' : '押すと ✅', onclick: (ev: Event) => { ev.stopPropagation(); repo.setDone(e.id, !e.doneAt); render(); } },
    e.doneAt ? '✅' : e.skippedAt ? '🚫' : '◻️');
}
function marks(e: Entry, m: number | null): HTMLElement {
  const origin = e.payload.origin as string | undefined;
  return h('span', { class: 'marks' },
    e.priority > 0 ? '❗' : '', e.ruleId ? '🔁' : '', e.templateId ? '⭐' : '', e.calendar && m != null ? '📅' : '',
    origin === 'home' ? '🏠' : origin === 'store' ? '🏪' : origin === 'out' ? '🍴' : '', e.photos.length ? `📷${e.photos.length}` : '');
}

function chip(track: Track, e: Entry): HTMLElement {
  const st = e.doneAt ? 'done' : e.skippedAt ? 'skip' : '';
  const m = primaryMinute(track, e);
  const inst = repo.insteadFor(e.id);
  const of = e.insteadOfId ? repo.entry(e.insteadOfId) : undefined;
  return h('div', { class: `chip ${st}`, onclick: () => openEntryForm(ctx(), track, e) },
    statusBox(track, e),
    h('span', { class: 'ttl' }, m != null ? h('span', { class: 't' }, fmtMin(m)) : null, e.title || '(無題)'),
    marks(e, m),
    of ? h('small', { class: 'sub' }, `${of.title} の代わり`) : null,
    inst ? h('small', { class: 'sub' }, `代わりに ${inst.title}`) : null);
}

/** 薄い回＝🔁「確認してから」の回。押すと記録になる／✕ でその回だけなし */
function ghost(track: Track, o: Occurrence): HTMLElement {
  return h('div', { class: 'chip ghost', title: '🔁 確認してから入れる回（押すと記録になります）', onclick: () => { const e = repo.materialize(o); render(); openEntryForm(ctx(), track, e); } },
    h('span', { class: 'ttl' }, o.planStart != null ? h('span', { class: 't' }, fmtMin(o.planStart)) : null, o.title, o.multi ? ` 〜${o.end.slice(5)}` : ''),
    h('button', { class: 'x', title: 'この回はなし（🔁 の例外に入れる）', onclick: (ev: Event) => { ev.stopPropagation(); repo.skipOccurrence(o.ruleId, o.date); render(); } }, '✕'));
}

// ── 1日 ──────────────────────────────────────────────────
function dayList(track: Track, d: YMD): HTMLElement {
  const es = repo.entriesFor(track.id, d, d), gs = repo.ghostsFor(track.id, d, d);
  if (isDaily(track)) {
    const e = repo.dayEntry(track.id, d);
    return h('div', { class: 'day daily' }, h('section', null,
      h('div', { class: 'row big' },
        h('button', { class: 'box big', onclick: () => { repo.toggleDay(track.id, d); render(); } }, dayMark(e)),
        h('div', { class: 'ttl' }, e ? (e.doneAt ? 'やった' : e.skippedAt ? 'やらなかった' : 'まだ') : 'まだ印なし', h('small', { class: 'sub' }, dayDetail(e))),
        h('button', { onclick: () => openEntryForm(ctx(), track, e ?? null, { date: d, title: track.name }) }, '… 詳細')),
      es.slice(1).map((x) => row(track, x)), gs.map((o) => ghost(track, o))));
  }
  return h('div', { class: 'day' }, track.slots.map((s) => {
    const list = es.filter((e) => bucketOf(track, e) === s.key), gl = gs.filter((o) => bucketOfOccurrence(track, o) === s.key);
    return h('section', null,
      h('h3', null, `${s.icon} ${s.label} `, h('small', null, s.startMin == null ? '' : slotRange(track, s.key))),
      list.length || gl.length ? [list.map((e) => row(track, e)), gl.map((o) => ghost(track, o))] : h('p', { class: 'empty' }, '—'),
      h('button', { class: 'add', onclick: () => openEntryForm(ctx(), track, null, { date: d, slotKey: s.key }) }, '＋'));
  }));
}
function row(track: Track, e: Entry): HTMLElement {
  const span = (a: number | null, b: number | null) => (a == null ? '—' : `${fmtMin(a)}${b != null ? '–' + fmtMin(b) : ''}`);
  return h('div', { class: `row ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}`, onclick: () => openEntryForm(ctx(), track, e) },
    statusBox(track, e),
    h('div', { class: 'times' },
      h('div', null, h('small', null, '予定 '), span(e.planStart, e.planEnd)),
      h('div', null, h('small', null, '実際 '), (e.actualDate && e.actualDate !== e.date ? e.actualDate.slice(5) + ' ' : '') + span(e.actualStart, e.actualEnd))),
    h('div', { class: 'ttl' }, e.title, marks(e, primaryMinute(track, e)), e.note ? h('small', { class: 'sub' }, e.note) : null));
}

function footer(): HTMLElement {
  return h('footer', null, `コマ（仮）${BUILD} · 記録はこの端末の中（⚙ → データ で書き出せます）`);
}
