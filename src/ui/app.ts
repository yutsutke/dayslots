/* 画面の骨＝上の帯（種目タブ・週/1日/月・日送り・⭐🔁⚙）＋ 見直しの帯 ＋ 升目（週・月）か一覧（1日）
 *  一日一回の種目（features.daily）は、升目が「その日の印」1つになる（なし → ✅ → 🚫 → なし を1タップで回す） */
import { h, hint } from './dom';
import { Repo } from '../app/repo';
import { LocalStore } from '../store/store';
import { seedDb } from '../store/seed';
import { todayYMD, addDays, addMonths, weekStartOf, DOW_JA, dowOf } from '../domain/dates';
import { bucketOf, bucketOfOccurrence, fmtMin, fmtDur, durationOf, planDurationOf, actualDurationOf, primaryMinute, slotRange } from '../domain/slots';
import { openEntryForm, openTemplates, openRules } from './forms';
import { h as hh, modal } from './dom';
import { speechAvailable, listen } from './voice';
import { openSettings } from './settings';
import { pending } from '../sync/calendar';
import type { Entry, Track, YMD, ShowFlags } from '../domain/types';
import type { Occurrence } from '../domain/recur';

export const BUILD = 'v10';
/** 種目タブの「⊞ すべて」＝種目をまたいで見る（週＝日×種目／1日＝時刻順の一本の流れ／月＝升に種目ごとの印） */
const ALL = '*';
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
const SHOW_DEF: ShowFlags = { time: true, duration: true, note: false, photos: true };
const show = (): ShowFlags => ({ ...SHOW_DEF, ...(repo.db.settings.show ?? {}) });
/** 升目に出すもの（🕐 何時から／⏱ 何分／💬 コメント／📷 写真）＝押して切り替える。端末の設定として残る */
function viewToggles(): HTMLElement {
  const f = show();
  const b = (k: keyof ShowFlags, icon: string, title: string) =>
    h('button', { class: 'tg ' + (f[k] ? 'on' : 'off'), title: `${title}（押すと${f[k] ? '隠す' : '出す'}）`, onclick: () => { repo.db.settings.show = { ...f, [k]: !f[k] }; void repo.persist(); render(); } }, icon);
  return h('span', { class: 'toggles', title: '升目に出すもの' }, b('time', '🕐', '何時から'), b('duration', '⏱', '何分やった'), b('note', '💬', 'コメント'), b('photos', '📷', '写真'));
}
/** 記録の下に出す小さな行＝⏱ 何分／💬 コメント／📷 写真（表示の切替に従う） */
function extras(e: Entry, small = false): (HTMLElement | null)[] {
  const f = show(); const dur = durationOf(e);
  return [
    f.duration && dur != null && dur > 0 ? h('span', { class: 'dur' }, `⏱${fmtDur(dur)}`) : null,
    f.note && e.note ? h('small', { class: 'sub note' }, `💬 ${e.note}`) : null,
    f.photos && e.photos.length ? h('span', { class: 'thumbs' }, e.photos.slice(0, small ? 1 : 3).map((p) => h('img', { class: 'thumb', src: p.thumb ?? p.path, alt: '' }))) : null,
  ];
}

/** 見ている範囲。月＝月初を含む週の頭から6週（42日）＝升目と同じ */
function range(): [YMD, YMD] {
  if (state.view === 'day') return [state.anchor, state.anchor];
  if (state.view === 'month') { const a = weekStartOf(state.anchor.slice(0, 7) + '-01', repo.db.settings.weekStart); return [a, addDays(a, 41)]; }
  const a = weekStartOf(state.anchor, repo.db.settings.weekStart);
  return [a, addDays(a, 6)];
}

export function render(): void {
  if (state.trackId !== ALL && !repo.tracks.some((t) => t.id === state.trackId)) state.trackId = repo.tracks[0]?.id ?? repo.addTrackFromPreset('todo').id;
  if (state.trackId === ALL) {
    const [from, to] = range();
    repo.ensureAuto(from, to);
    const body = state.view === 'day' ? allDay(from) : state.view === 'month' ? allMonth(from) : allWeek(from, to);
    root.replaceChildren(header(null, from, to), body, footer());
    return;
  }
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

function header(track: Track | null, from: YMD, to: YMD): HTMLElement {
  const all = track == null;
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: all ? 'on' : '', title: '種目をまたいで見る（週＝日 × 種目）', onclick: () => { state.trackId = ALL; render(); } }, '⊞ すべて'),
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
    viewToggles(),
    h('span', { class: 'sp' }),
    track ? [
      h('button', { onclick: () => openTemplates(ctx(), track) }, '⭐ いつもの'),
      h('button', { onclick: () => openRules(ctx(), track) }, '🔁 繰り返し'),
      h('button', { class: 'primary', onclick: () => openEntryForm(ctx(), track, null, { date: state.anchor, title: isDaily(track) ? track.name : '' }) }, '＋ 足す'),
    ] : hint('足す・⭐・🔁 は種目のタブで'));
  return h('header', null, tabs, nav, signalBar(track), track ? reviewBar(track, from, to) : allReviewBar(from, to), track ? null : inboxBox());
}

/** 合図の入力欄＝全体（名前を解く）／種目（名前は省いてよい）。Enter か「入れる」で通す */
let lastToast = '';
function signalBar(track: Track | null): HTMLElement {
  const inp = h('input', { class: 'sig', placeholder: track ? `${track.name}への合図＝「開始」「終了」「30分」「やった」…` : '合図＝「座禅開始」「散歩終了」「散歩 30分」「昼ごはん やった」…', enterkeyhint: 'send' });
  const go = (text = inp.value.trim()) => {
    if (!text) return;
    const r = repo.applySignal(text, track?.id);
    lastToast = r.message; inp.value = '';
    render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  // 🎤 押す → 聞く（途中経過を欄に出す）→ 確定したらそのまま通す。もう一度押すと止める
  let rec: { stop: () => void } | null = null;
  const mic = speechAvailable() ? h('button', { class: 'mic', title: '音声で合図（日本語）', onclick: () => {
    if (rec) { rec.stop(); rec = null; mic!.classList.remove('on'); return; }
    mic!.classList.add('on'); inp.placeholder = '🎤 聞いています…';
    rec = listen((t) => { inp.value = t; }, (t) => { rec = null; mic!.classList.remove('on'); inp.value = t; go(t); }, (msg) => { rec = null; mic!.classList.remove('on'); lastToast = `⚠ ${msg}`; render(); });
  } }, '🎤') : null;
  const run = repo.running(track?.id);
  return h('div', { class: 'sigBar' },
    h('span', { class: 'inline grow' }, inp, mic, h('button', { class: 'primary', onclick: () => go() }, '入れる')),
    run.length ? h('button', { class: 'runBtn', title: '進行中の記録（押して終了）', onclick: () => openRunning() }, `⏵ 進行中 ${run.length}`) : null,
    lastToast ? h('span', { class: 'toast', onclick: () => { lastToast = ''; render(); } }, lastToast) : null);
}
function openRunning(): void {
  const body = hh('div');
  const m = modal('⏵ 進行中', body);
  const draw = () => {
    const run = repo.running();
    body.replaceChildren(...(run.length ? run.map((e) => { const t = repo.track(e.trackId); return hh('div', { class: 'item' },
      hh('div', { class: 'ttl' }, hh('b', null, `${t.icon} ${e.title}`), hh('small', { class: 'sub' }, `${e.date} ${fmtMin(e.actualStart as number)}〜`)),
      hh('div', { class: 'btns' }, hh('button', { class: 'primary', onclick: () => { repo.stop(e.id); lastToast = `⏹ ${t.icon} ${e.title} を終了`; draw(); render(); } }, '⏹ 今 終了'), hh('button', { onclick: () => { m.close(); openEntryForm(ctx(), t, e); } }, '…'))); })
      : [hh('p', { class: 'empty' }, '進行中のものはありません')]));
    if (!repo.running().length) m.close();
  };
  draw();
}
/** 未振り分け＝どの種目か解けなかった合図。種目を選んで振る／消す */
function inboxBox(): HTMLElement | null {
  const items = repo.db.inbox ?? []; if (!items.length) return null;
  return h('div', { class: 'inbox' }, h('b', null, `📥 未振り分け ${items.length}`), items.map((it) => {
    const sel = h('select', null, h('option', { value: '' }, '種目を選ぶ…'), repo.tracks.map((t) => h('option', { value: t.id }, `${t.icon} ${t.name}`)));
    return h('div', { class: 'inline' }, h('span', null, `「${it.text}」`, h('small', null, ` ${it.at.slice(5, 16).replace('T', ' ')}`)), sel,
      h('button', { onclick: () => { if (!sel.value) return; const r = repo.assignInbox(it.id, sel.value); lastToast = r.message; render(); } }, '振る'),
      h('button', { class: 'ghost', onclick: () => { repo.dropInbox(it.id); render(); } }, '✕'));
  }));
}

/** ⊞ すべて の帯＝種目ごとの数を横に並べる（押すとその種目へ） */
function allReviewBar(from: YMD, to: YMD): HTMLElement {
  const parts = repo.tracks.map((t) => {
    const s = repo.summary(t.id, from, to);
    const ds = repo.durationStats(t.id, from, to);
    const body = (isDaily(t) ? `✅${s.done} 🔥${repo.streak(t.id, todayYMD())}日` : t.features.done ? `✅${s.done}/${s.total}${s.skipped ? ` 🚫${s.skipped}` : ''}` : `${s.total}件`) + (ds.total ? ` ⏱${fmtDur(ds.total)}` : '');
    return h('span', { class: 'lnk', onclick: () => { state.trackId = t.id; render(); } }, `${t.icon} ${body}`);
  });
  const pend = pending(repo).length;
  const title = state.view === 'week' ? '🗓 週の見直し（すべて）' : state.view === 'month' ? '🗓 月の見直し（すべて）' : '📋 この日（すべて）';
  return h('div', { class: 'review' }, h('b', null, title), h('span', { class: 'sp' }), parts,
    pend ? h('span', { class: 'warn' }, `📅 未送信 ${pend}`) : null);
}

// ── ⊞ すべて（週＝縦7日 × 横＝種目） ─────────────────────────
function allWeek(from: YMD, to: YMD): HTMLElement {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const today = todayYMD();
  const go = (t: Track, d: YMD) => { state.trackId = t.id; state.view = 'day'; state.anchor = d; render(); };
  const cell = (t: Track, d: YMD): HTMLElement => {
    if (isDaily(t)) {
      const e = repo.dayEntry(t.id, d);
      return h('td', { class: `cell all ${e?.doneAt ? 'done' : e?.skippedAt ? 'skip' : ''}` },
        h('button', { class: 'box big', onclick: () => { repo.toggleDay(t.id, d); render(); } }, dayMark(e)),
        h('small', { class: 'sub lnk', onclick: () => go(t, d) }, dayDetail(e) || ' '));
    }
    const es = repo.entriesFor(t.id, d, d), gs = repo.ghostsFor(t.id, d, d);
    const done = es.filter((e) => e.doneAt).length, skip = es.filter((e) => e.skippedAt).length;
    const head = t.features.done ? (es.length ? `✅${done}/${es.length}${skip ? ` 🚫${skip}` : ''}` : '') : es.length ? `${t.icon}${es.length}` : '';
    return h('td', { class: 'cell all', onclick: () => go(t, d) },
      head ? h('div', { class: 'dn' }, head, gs.length ? h('small', { class: 'ghostTxt' }, ` 🔁${gs.length}`) : null) : gs.length ? h('div', { class: 'dn ghostTxt' }, `🔁${gs.length}`) : null,
      es.slice(0, 3).map((e) => { const m = primaryMinute(t, e); return h('div', { class: `mini ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}` },
        t.features.done ? (e.doneAt ? '✅' : e.skippedAt ? '🚫' : '◻️') : '', show().time && m != null ? h('span', { class: 't' }, fmtMin(m)) : null, e.title); }),
      es.length > 3 ? h('small', { class: 'sub' }, `＋${es.length - 3}`) : null);
  };
  return h('div', { class: 'gridWrap' }, h('table', { class: 'grid allgrid' },
    h('thead', null, h('tr', null, h('th', { class: 'dcol' }),
      repo.tracks.map((t) => h('th', { class: 'lnk', onclick: () => { state.trackId = t.id; render(); } }, h('div', null, `${t.icon} ${t.name}`), h('small', null, isDaily(t) ? '一日一回' : `${t.slots.length} 枡`))))),
    h('tbody', null, days.map((d) => h('tr', { class: d === today ? 'today' : '' },
      h('th', { class: 'dcol' }, h('b', null, d.slice(5)), h('small', null, DOW_JA[dowOf(d)])),
      repo.tracks.map((t) => cell(t, d)))))));
}


/** 見直しの帯（ライフログの緑の帯を写した）＝✅／🚫／まだ／🔁 の数。一日一回は 連続日数 も */
function reviewBar(track: Track, from: YMD, to: YMD): HTMLElement {
  const s = repo.summary(track.id, from, to);
  const parts = track.features.done
    ? [`✅ ${s.done}`, `🚫 ${s.skipped}`, ...(isDaily(track) ? [] : [`まだ ${s.open}`]), `🔁 ${s.ghosts}`]
    : [`${track.icon} ${s.total} 件`, `🔁 ${s.ghosts}`];
  if (isDaily(track)) parts.push(`🔥 連続 ${repo.streak(track.id, todayYMD())} 日`);
  const ds = repo.durationStats(track.id, from, to);
  if (ds.total > 0) parts.push(`⏱ 合計 ${fmtDur(ds.total)} · 平均 ${fmtDur(ds.avg)}/回（${ds.count}回）`);
  if (track.kind === 'receipt') { const yen = repo.entriesFor(track.id, from, to).reduce((a, e) => a + (Number((e.payload.receipt as { total?: number } | undefined)?.total) || 0), 0); if (yen) parts.push(`💴 ¥${yen.toLocaleString()}`); }
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
  const f = show(); const dur = durationOf(e);
  const start = e.actualStart ?? e.planStart;
  return [f.time && start != null ? `${fmtMin(start)}〜` : '', f.duration && dur ? `⏱${fmtDur(dur)}` : '', f.note && e.note ? `💬 ${e.note}` : ''].filter(Boolean).join(' · ');
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
        h('div', { class: 'ttl' }, dayDetail(e) || h('small', null, e ? '' : '—'), e?.calendar ? ' 📅' : '', e && show().photos && e.photos.length ? h('span', { class: 'thumbs' }, e.photos.slice(0, 3).map((p) => h('img', { class: 'thumb', src: p.thumb ?? p.path, alt: '' }))) : null),
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
      shown.map((e) => { const m = primaryMinute(track, e), dur = durationOf(e); return h('div', { class: `mini ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}` },
        show().time && m != null ? h('span', { class: 't' }, fmtMin(m)) : null, e.title, show().duration && dur ? h('span', { class: 'dur' }, ` ⏱${fmtDur(dur)}`) : null,
        show().photos && e.photos.length ? h('img', { class: 'thumb xs', src: e.photos[0].thumb ?? e.photos[0].path, alt: '' }) : null); }),
      list.length > 3 ? h('small', { class: 'sub' }, `＋${list.length - 3}`) : null,
      gl.length ? h('small', { class: 'sub ghostTxt' }, `🔁 ${gl.length}`) : null);
  };
  return h('div', { class: 'gridWrap' }, h('table', { class: 'month' },
    h('thead', null, h('tr', null, Array.from({ length: 7 }, (_, i) => h('th', null, DOW_JA[(ws + i) % 7])))),
    h('tbody', null, Array.from({ length: 6 }, (_, w) => h('tr', null, days.slice(w * 7, w * 7 + 7).map(cell))))));
}

// ── ⊞ すべて（1日＝種目をまたいだ時刻順の一本の流れ。時刻なしは上に種目ごとの束） ──
function allDay(d: YMD): HTMLElement {
  type Item = { min: number; track: Track; entry?: Entry; occ?: Occurrence };
  const timed: Item[] = []; const bundles: HTMLElement[] = [];
  for (const t of repo.tracks) {
    const es = repo.entriesFor(t.id, d, d), gs = repo.ghostsFor(t.id, d, d);
    const un: HTMLElement[] = [];
    if (isDaily(t)) {
      const e = repo.dayEntry(t.id, d);
      un.push(h('span', { class: `chip inline ${e?.doneAt ? 'done' : e?.skippedAt ? 'skip' : ''}` },
        h('button', { class: 'box', onclick: (ev: Event) => { ev.stopPropagation(); repo.toggleDay(t.id, d); render(); } }, dayMark(e)),
        h('span', { class: 'ttl lnk', onclick: () => openEntryForm(ctx(), t, e ?? null, { date: d, title: t.name }) }, dayDetail(e) || t.name)));
      for (const e of es.slice(1)) { const m = primaryMinute(t, e); if (m != null) timed.push({ min: m, track: t, entry: e }); }
    } else {
      for (const e of es) { const m = primaryMinute(t, e); if (m != null) timed.push({ min: m, track: t, entry: e }); else un.push(chip(t, e)); }
      for (const o of gs) { if (o.planStart != null) timed.push({ min: o.planStart, track: t, occ: o }); else un.push(ghost(t, o)); }
    }
    if (un.length) bundles.push(h('div', { class: 'bundle' }, h('b', { class: 'lnk', onclick: () => { state.trackId = t.id; render(); } }, `${t.icon} ${t.name}`), h('div', { class: 'chips' }, un)));
  }
  timed.sort((a, b) => a.min - b.min);
  const line = (it: Item): HTMLElement => {
    const t = it.track;
    if (it.occ) { const o = it.occ; return h('div', { class: 'row tl ghostTxt', onclick: () => { const e = repo.materialize(o); render(); openEntryForm(ctx(), t, e); } },
      h('div', { class: 'times' }, fmtMin(o.planStart as number)), h('div', { class: 'ttl' }, `${t.icon} ${o.title}`, h('small', { class: 'sub' }, '🔁 確認してから（押すと記録に）'))); }
    const e = it.entry as Entry;
    return h('div', { class: `row tl ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}`, onclick: () => openEntryForm(ctx(), t, e) },
      h('div', { class: 'times' }, fmtMin(it.min), h('small', null, e.actualStart != null && t.features.actualFirst === false && e.planStart != null && e.actualStart !== e.planStart ? ` 実際${fmtMin(e.actualStart)}` : '')),
      statusBox(t, e),
      h('div', { class: 'ttl' }, h('span', { class: 'tkicon lnk', title: t.name, onclick: (ev: Event) => { ev.stopPropagation(); state.trackId = t.id; render(); } }, t.icon), ' ', e.title, marks(e, it.min), ...extras(e)));
  };
  return h('div', { class: 'day alld' },
    bundles.length ? h('section', null, h('h3', null, '時刻なし ', h('small', null, '種目ごと')), bundles) : null,
    h('section', null, h('h3', null, '時刻順 ', h('small', null, `${timed.length} 件`)), timed.length ? timed.map(line) : h('p', { class: 'empty' }, '—')));
}

// ── ⊞ すべて（月＝升に種目ごとの印） ──────────────────────────
function allMonth(from: YMD): HTMLElement {
  const today = todayYMD(), ym = state.anchor.slice(0, 7);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const ws = repo.db.settings.weekStart;
  const cell = (d: YMD) => {
    const inMonth = d.startsWith(ym);
    const lines = repo.tracks.map((t) => {
      if (isDaily(t)) { const e = repo.dayEntry(t.id, d); return e ? h('div', { class: `mini ${e.doneAt ? 'done' : 'skip'}` }, `${t.icon} ${e.doneAt ? '✅' : '🚫'}`) : null; }
      const es = repo.entriesFor(t.id, d, d); if (!es.length) return null;
      const done = es.filter((e) => e.doneAt).length, skip = es.filter((e) => e.skippedAt).length;
      const cls = t.features.done ? (done === es.length ? 'done' : skip && done + skip === es.length ? 'skip' : '') : '';
      return h('div', { class: `mini ${cls}` }, `${t.icon} ${t.features.done ? `${done}/${es.length}` : es.length}`);
    }).filter(Boolean);
    return h('td', { class: `mcell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''}`, onclick: () => { state.view = 'day'; state.anchor = d; render(); } },
      h('div', { class: 'dn' }, String(Number(d.slice(8)))), lines.length ? lines : h('small', { class: 'sub' }, '·'));
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
    repo.isRunning(e) ? '⏵' : e.actualEnd != null && e.actualStart == null ? '⏹' : '',
    e.priority > 0 ? '❗' : '', e.ruleId ? '🔁' : '', e.templateId ? '⭐' : '', e.calendar && m != null ? '📅' : '',
    origin === 'home' ? '🏠' : origin === 'store' ? '🏪' : origin === 'out' ? '🍴' : '', e.photos.length && !show().photos ? `📷${e.photos.length}` : '',
    (e.payload.ai as { status?: string } | undefined)?.status === 'pending' ? '🤖…' : (e.payload.ai as { status?: string } | undefined)?.status === 'error' ? '🤖⚠' : '');
}

function chip(track: Track, e: Entry): HTMLElement {
  const st = e.doneAt ? 'done' : e.skippedAt ? 'skip' : '';
  const m = primaryMinute(track, e);
  const inst = repo.insteadFor(e.id);
  const of = e.insteadOfId ? repo.entry(e.insteadOfId) : undefined;
  return h('div', { class: `chip ${st}`, onclick: () => openEntryForm(ctx(), track, e) },
    statusBox(track, e),
    h('span', { class: 'ttl' }, show().time && m != null ? h('span', { class: 't' }, fmtMin(m)) : null, e.title || '(無題)'),
    marks(e, m),
    ...extras(e),
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
  // 時刻があれば「HH:MM–HH:MM」。時刻が無くて長さだけなら「⏱30分」。両方あれば時刻＋⏱
  const span = (a: number | null, b: number | null, dur: number | null) => (a == null ? (dur != null ? `⏱${fmtDur(dur)}` : '—') : `${fmtMin(a)}${b != null ? '–' + fmtMin(b) : ''}${dur != null && b == null ? ` ⏱${fmtDur(dur)}` : ''}`);
  return h('div', { class: `row ${e.doneAt ? 'done' : e.skippedAt ? 'skip' : ''}`, onclick: () => openEntryForm(ctx(), track, e) },
    statusBox(track, e),
    h('div', { class: 'times' },
      h('div', null, h('small', null, '予定 '), span(e.planStart, e.planEnd, planDurationOf(e))),
      h('div', null, h('small', null, '実際 '), (e.actualDate && e.actualDate !== e.date ? e.actualDate.slice(5) + ' ' : '') + span(e.actualStart, e.actualEnd, actualDurationOf(e)))),
    h('div', { class: 'ttl' }, e.title, marks(e, primaryMinute(track, e)), ...extras(e)));
}

function footer(): HTMLElement {
  return h('footer', null, `コマ（仮）${BUILD} · 記録はこの端末の中（⚙ → データ で書き出せます）`);
}
