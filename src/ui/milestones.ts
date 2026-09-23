/* 🗓 記念日の画面＝一覧（N日たった／あとN日・次の周年）と、1件の板（直す・🔔・記録ログ）。升目の日の見出しに節目と 🔔 の印。
 *  読み書きの先はライフログの表（src/sync/milestones.ts）。決まりは src/domain/milestones.ts＝画面には書かない。
 */
import { h, fill, modal, field, hint, type Child } from './dom';
import type { YMD } from '../domain/types';
import { todayYMD, addDays } from '../domain/dates';
import { marksOn, rowsOf, logDay, reminderLabel, checkMilestone, type Milestone, type MilestoneLog, type Reminder } from '../domain/milestones';
import { connected, fetchMilestones, cachedMilestones, saveMilestone, saveLog, deleteMilestone, deleteLog, type MilestoneConn, type MilestoneData } from '../sync/milestones';

let data: MilestoneData | null = cachedMilestones();
let lastError = '';
let conn: () => MilestoneConn | undefined = () => undefined;
let onChange: () => void = () => {};

/** 起動時に1回＝控えをすぐ出し、裏で読み直す（つながっていなければ何もしない） */
export function initMilestones(getConn: () => MilestoneConn | undefined, rerender: () => void): void {
  conn = getConn; onChange = rerender;
  void reload();
}
export async function reload(): Promise<void> {
  const c = conn(); if (!connected(c)) return;
  try { data = await fetchMilestones(c!); lastError = ''; } catch (e) { lastError = (e as Error).message; }
  onChange();
}

/** その日の見出しに添える印（🗓 節目・🔔 リマインダー）。押すとその記念日の板 */
export function msChips(d: YMD): Child {
  if (!data?.milestones.length) return null;
  const ms = marksOn(d, data.milestones);
  if (!ms.length) return null;
  return h('span', { class: 'msMarks' }, ms.map((x) => h('span', {
    class: `msChip ${x.kind}`, title: x.kind === 'remind' ? '🔔 リマインダー（ライフログの記念日）' : '記念日の節目（ライフログの記念日）',
    onclick: (e: Event) => { e.stopPropagation(); const m = data?.milestones.find((y) => y.id === x.id); if (m) openMilestone(m); },
  }, `${x.kind === 'remind' ? '🔔' : '🗓'} ${x.title} ${x.label}`)));
}

/** 消す（v32）＝ライフログからも消える＝戻せないので、何が一緒に消えるかを言ってから。消せたら手元の一覧からも外す */
async function removeMilestone(m: Milestone): Promise<boolean> {
  const logs = (data?.logs ?? []).filter((l) => l.milestoneId === m.id);
  const photos = m.photoCount + logs.reduce((n, l) => n + l.photoCount, 0);
  if (!confirm(`「${m.title}」を消しますか？\nライフログからも消えます（戻せません）。\n記録ログ ${logs.length} 件${photos ? `・写真 ${photos} 枚` : ''}も一緒に消えます。`)) return false;
  try { await deleteMilestone(conn()!, m.id); } catch (e) { alert((e as Error).message); return false; }
  if (data) { data.milestones = data.milestones.filter((x) => x.id !== m.id); data.logs = data.logs.filter((l) => l.milestoneId !== m.id); }
  onChange(); return true;
}
async function removeLog(m: Milestone, l: MilestoneLog): Promise<boolean> {
  if (!confirm(`${l.date} の記録ログを消しますか？\nライフログからも消えます（戻せません）。${l.photoCount ? `\n写真 ${l.photoCount} 枚も一緒に消えます。` : ''}`)) return false;
  try { await deleteLog(conn()!, l.id); } catch (e) { alert((e as Error).message); return false; }
  if (data) data.logs = data.logs.filter((x) => x.id !== l.id);
  onChange(); void m; return true;
}

// ── 一覧 ────────────────────────────────────────────────
export function openMilestones(): void {
  const body = h('div');
  const m = modal('🗓 記念日', body, { wide: true });
  const draw = () => {
    const today = todayYMD();
    const c = conn();
    if (!connected(c)) { fill(body, h('p', null, 'ライフログの記念日を読むには、⚙ → ② 残す の「保存場所」を Supabase にして、関数の場所と合言葉を入れてください（外の写しと同じもの）。')); return; }
    const logsOf = (id: number) => data?.logs.filter((l) => l.milestoneId === id).length ?? 0;
    fill(body,
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => openMilestone(null, draw) }, '＋ 足す'),
        h('button', { onclick: async () => { await reload(); draw(); } }, '↻ 読み直す'),
        h('span', { class: 'sp' }),
        h('small', { class: 'hint' }, data ? `ライフログから ${data.readAt.slice(5, 16).replace('T', ' ')} に読んだ・${data.milestones.length} 件` : 'まだ読めていません')),
      lastError ? h('p', { class: 'warn' }, `⚠ ${lastError}`) : null,
      data ? h('div', { class: 'msList' }, rowsOf(data.milestones, today).map((r) => h('div', { class: 'msRow', onclick: () => openMilestone(r.m, draw) },
        h('div', { class: 'msTtl' }, h('b', null, r.m.title), r.m.label ? h('small', { class: 'tag' }, r.m.label) : null,
          r.m.reminders.length ? h('small', null, ` 🔔${r.m.reminders.map(reminderLabel).join('・')}`) : null,
          logsOf(r.m.id) ? h('small', null, ` 📝${logsOf(r.m.id)}`) : null, r.m.photoCount ? h('small', null, ` 📷${r.m.photoCount}`) : null),
        h('div', { class: 'msNum' },
          h('span', null, r.days >= 0 ? `${r.days.toLocaleString()}日目` : `あと ${(-r.days).toLocaleString()}日`, h('small', null, `（${r.cal}）`)),
          h('small', null, ` ${r.m.date}`),
          r.days >= 0 && r.years > 0 ? h('small', { class: 'next' }, r.untilNext === 0 ? ` 🎉 今日で ${r.years}年` : ` 次の ${r.years}年まで あと${r.untilNext}日`) : null)))) : null,
      hint('正本はライフログの記念日です。ここで足す・直す・消すと、ライフログにもそのまま効きます。写真を付けるのはライフログから。'));
  };
  draw();
  void m;
}

// ── 1件の板 ─────────────────────────────────────────────
export function openMilestone(src: Milestone | null, onSaved?: () => void): void {
  const d = src ? structuredClone(src) : { id: undefined as number | undefined, title: '', date: todayYMD(), time: null as string | null, note: null as string | null, label: null as string | null, reminders: [] as Reminder[], photoCount: 0 };
  const body = h('div');
  const m = modal(src ? `🗓 ${src.title}` : '🗓 記念日を足す', body);
  let busy = false;
  const draw = () => {
    const logs = src ? (data?.logs ?? []).filter((l) => l.milestoneId === src.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
    fill(body,
      field('名前', h('input', { value: d.title, placeholder: '入籍・引っ越し・〇〇さんの誕生日', oninput: (e: Event) => { d.title = (e.target as HTMLInputElement).value; } })),
      field('日付', h('div', { class: 'inline' },
        h('input', { type: 'date', value: d.date, onchange: (e: Event) => { d.date = (e.target as HTMLInputElement).value; } }),
        h('input', { type: 'time', value: d.time ?? '', onchange: (e: Event) => { d.time = (e.target as HTMLInputElement).value || null; } })), hint('時刻は記録のため（日数には使わない）')),
      field('ラベル', h('input', { value: d.label ?? '', placeholder: '旅行・仕事 など（任意）', oninput: (e: Event) => { d.label = (e.target as HTMLInputElement).value.trim() || null; } })),
      field('メモ', h('textarea', { rows: 2, value: d.note ?? '', oninput: (e: Event) => { d.note = (e.target as HTMLTextAreaElement).value || null; } })),
      field('🔔 リマインダー', h('div', null,
        d.reminders.map((r, i) => h('div', { class: 'inline' },
          h('input', { type: 'number', min: 1, max: 366, value: r.n, style: { width: '5em' }, oninput: (e: Event) => { r.n = Number((e.target as HTMLInputElement).value); } }),
          h('select', { onchange: (e: Event) => { r.u = (e.target as HTMLSelectElement).value as Reminder['u']; } },
            (['m', 'w', 'd'] as const).map((u) => h('option', { value: u, selected: r.u === u }, u === 'm' ? 'ヶ月前' : u === 'w' ? '週間前' : '日前'))),
          h('button', { class: 'ghost sm', onclick: () => { d.reminders.splice(i, 1); draw(); } }, '✕'))),
        h('button', { class: 'sm', onclick: () => { d.reminders.push({ u: 'w', n: 1 }); draw(); } }, '＋ リマインダー')),
        hint('毎年、記念日のこの日数前に 🔔 を升目に出す（他人の誕生日の準備に）')),
      src && src.photoCount ? hint(`📷 写真 ${src.photoCount} 枚はライフログで見られます`) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'primary', disabled: busy, onclick: async () => {
          const err = checkMilestone(d); if (err) { alert(err); return; }
          busy = true; draw();
          try {
            const saved = await saveMilestone(conn()!, { id: d.id, title: d.title.trim(), date: d.date, time: d.time, note: d.note, label: d.label, reminders: d.reminders });
            if (data) { const i = data.milestones.findIndex((x) => x.id === saved.id); if (i < 0) data.milestones.push(saved); else data.milestones[i] = saved; }
            m.close(); onSaved?.(); onChange();
          } catch (e) { alert((e as Error).message); busy = false; draw(); }
        } }, busy ? '送っています…' : '保存（ライフログへ）'),
        h('span', { class: 'sp' }),
        src ? h('button', { class: 'danger', title: 'ライフログからも消える', onclick: async () => { if (await removeMilestone(src)) { m.close(); onSaved?.(); } } }, '🗑 消す') : null,
        h('button', { onclick: m.close }, '閉じる')),
      src ? h('div', { class: 'msLogs' },
        h('h3', null, `📝 記録ログ（${logs.length}）`),
        logs.map((l) => logRow(src, l, draw)),
        logRow(src, null, draw)) : hint('記録ログは、保存したあとで足せます'));
  };
  draw();
}

/** 記録ログの1行（null＝新しく足す行）。押すと直せる */
function logRow(m: Milestone, l: MilestoneLog | null, redraw: () => void): HTMLElement {
  const x = { date: l?.date ?? todayYMD(), note: l?.note ?? '' };
  const wrap = h('div', { class: 'msLog' });
  const show = (editing: boolean) => {
    if (!editing && l) {
      fill(wrap, h('span', { class: 'd' }, l.date, h('small', null, ` ${logDay(m, l).toLocaleString()}日目`)), h('span', { class: 'n' }, l.note ?? ''), l.photoCount ? h('small', null, ` 📷${l.photoCount}`) : null,
        h('button', { class: 'ghost sm', onclick: () => show(true) }, '直す'));
      return;
    }
    fill(wrap,
      h('input', { type: 'date', value: x.date, onchange: (e: Event) => { x.date = (e.target as HTMLInputElement).value; } }),
      h('input', { value: x.note, placeholder: l ? '' : 'この日のこと（新しく足す）', oninput: (e: Event) => { x.note = (e.target as HTMLInputElement).value; } }),
      h('button', { class: 'sm', onclick: async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) { alert('日付を入れてください'); return; }
        if (!l && !x.note.trim()) { alert('なにを残すか書いてください'); return; }
        try {
          const saved = await saveLog(conn()!, { id: l?.id, milestoneId: m.id, date: x.date, note: x.note.trim() || null });
          if (data) { const i = data.logs.findIndex((y) => y.id === saved.id); if (i < 0) data.logs.push(saved); else data.logs[i] = saved; }
          redraw();
        } catch (e) { alert((e as Error).message); }
      } }, l ? '保存' : '＋ 足す'),
      l ? h('button', { class: 'ghost sm', onclick: () => show(false) }, 'やめる') : null,
      l ? h('button', { class: 'ghost sm danger', title: 'ライフログからも消える', onclick: async () => { if (await removeLog(m, l)) redraw(); } }, '🗑') : null);
  };
  show(false);
  return wrap;
}

// ── 🗓 記念日のタブ（v31）＝その記念日を1つの種目のように見る。中身はライフログの記録ログ ──────────
export const milestonesNow = (): Milestone[] => data?.milestones ?? [];
export const findMilestone = (id: number): Milestone | null => data?.milestones.find((m) => m.id === id) ?? null;
const logsIn = (m: Milestone, from: YMD, to: YMD): MilestoneLog[] =>
  (data?.logs ?? []).filter((l) => l.milestoneId === m.id && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

/** 記録ログを1件足す／直す板（升目の ＋ や行から） */
export function openLogForm(m: Milestone, date: YMD, log: MilestoneLog | null = null): void {
  const x = { date: log?.date ?? date, note: log?.note ?? '' };
  const body = h('div');
  const md = modal(`🗓 ${m.title}${log ? '（記録ログを直す）' : 'に記録ログを足す'}`, body);
  fill(body,
    field('日付', h('input', { type: 'date', value: x.date, onchange: (e: Event) => { x.date = (e.target as HTMLInputElement).value; } })),
    field('メモ', h('textarea', { rows: 3, value: x.note, placeholder: 'この日のこと', oninput: (e: Event) => { x.note = (e.target as HTMLTextAreaElement).value; } })),
    log?.photoCount ? hint(`📷 写真 ${log.photoCount} 枚はライフログで見られます`) : null,
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) { alert('日付を入れてください'); return; }
        if (!log && !x.note.trim()) { alert('なにを残すか書いてください'); return; }
        try {
          const saved = await saveLog(conn()!, { id: log?.id, milestoneId: m.id, date: x.date, note: x.note.trim() || null });
          if (data) { const i = data.logs.findIndex((y) => y.id === saved.id); if (i < 0) data.logs.push(saved); else data.logs[i] = saved; }
          md.close(); onChange();
        } catch (e) { alert((e as Error).message); }
      } }, '保存（ライフログへ）'),
      h('span', { class: 'sp' }),
      log ? h('button', { class: 'danger', title: 'ライフログからも消える', onclick: async () => { if (await removeLog(m, log)) md.close(); } }, '🗑 消す') : null,
      h('button', { onclick: md.close }, '閉じる')));
}

/** 見直しの帯に出す一言＝何日目・この範囲の記録ログ・次の周年 */
export function msSummary(m: Milestone, from: YMD, to: YMD, today: YMD): string {
  const r = rowsOf([m], today)[0];
  return [r.days >= 0 ? `${r.days.toLocaleString()}日目（${r.cal}）` : `あと ${(-r.days).toLocaleString()}日`,
    `📝 この範囲 ${logsIn(m, from, to).length} 件／全部 ${(data?.logs ?? []).filter((l) => l.milestoneId === m.id).length} 件`,
    r.days >= 0 && r.years > 0 ? (r.untilNext === 0 ? `🎉 今日で ${r.years}年` : `次の ${r.years}年まで あと${r.untilNext}日`) : ''].filter(Boolean).join(' · ');
}

/** その日の添え書き＝当日・周年（N年）と、節目・🔔 */
function dayNote(m: Milestone, d: YMD): Child {
  const out: Child[] = [];
  if (d === m.date) out.push(h('span', { class: 'msChip' }, '🗓 当日'));
  else if (d.slice(5) === m.date.slice(5) && d > m.date) out.push(h('span', { class: 'msChip' }, `🎉 ${+d.slice(0, 4) - +m.date.slice(0, 4)}年`));
  for (const x of marksOn(d, [m])) out.push(h('span', { class: `msChip ${x.kind}` }, `${x.kind === 'remind' ? '🔔' : '🗓'} ${x.label}`));
  return out.length ? h('span', { class: 'msMarks' }, out) : null;
}
const logLine = (m: Milestone, l: MilestoneLog): HTMLElement =>
  h('div', { class: 'mini msLogMini', title: '押すと直す', onclick: (e: Event) => { e.stopPropagation(); openLogForm(m, l.date, l); } },
    l.note ?? '（メモなし）', l.photoCount ? h('small', null, ` 📷${l.photoCount}`) : null);

export interface MsViewOpts { view: 'week' | 'day' | 'month' | 'list' | 'cycle' | 'span'; from: YMD; to: YMD; today: YMD; weekStart: 0 | 1; month: string; dow: (d: YMD) => string; goDay: (d: YMD) => void; }
/** 記念日のタブの中身。週・N日＝1日1行／1日＝その日／月＝升目／リスト・長い期間＝記録ログの並び */
export function msTabBody(m: Milestone, o: MsViewOpts): HTMLElement {
  const days = (a: YMD, b: YMD): YMD[] => { const out: YMD[] = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
  const addBtn = (d: YMD) => h('button', { class: 'add', title: 'この日に記録ログを足す', onclick: (e: Event) => { e.stopPropagation(); openLogForm(m, d); } }, '＋');
  if (o.view === 'list' || o.view === 'span') {
    const from = o.view === 'list' ? '0000-01-01' : o.from, to = o.view === 'list' ? '9999-12-31' : o.to; // 文字の比べだけ＝日を1つずつ数えない
    const ls = logsIn(m, from, to);
    return h('div', { class: 'day msTab' },
      h('section', null, h('h3', null, `📝 記録ログ `, h('small', null, `${ls.length} 件${o.view === 'span' ? '（この期間）' : ''}`)),
        ls.length ? ls.map((l) => h('div', { class: 'row lnk', onclick: () => openLogForm(m, l.date, l) },
          h('div', { class: 'times' }, h('b', null, l.date), ' ', h('small', null, `${o.dow(l.date)}・${logDay(m, l).toLocaleString()}日目`)),
          h('div', { class: 'ttl' }, l.note ?? '（メモなし）', l.photoCount ? h('small', null, ` 📷${l.photoCount}`) : null))) : h('p', { class: 'empty' }, '—'),
        h('button', { class: 'add', onclick: () => openLogForm(m, o.today) }, '＋ 今日に足す')));
  }
  if (o.view === 'month') {
    const ds = days(o.from, addDays(o.from, 41));
    const ls = logsIn(m, ds[0], ds[41]);
    return h('div', { class: 'gridWrap' }, h('table', { class: 'month' },
      h('thead', null, h('tr', null, Array.from({ length: 7 }, (_, i) => h('th', null, o.dow(ds[i]))))),
      h('tbody', null, Array.from({ length: 6 }, (_, w) => h('tr', null, ds.slice(w * 7, w * 7 + 7).map((d) =>
        h('td', { class: `mcell ${d.slice(0, 7) === o.month ? '' : 'out'} ${d === o.today ? 'today' : ''}`, onclick: () => o.goDay(d) },
          h('div', { class: 'dn' }, String(Number(d.slice(8)))), dayNote(m, d), ls.filter((l) => l.date === d).map((l) => logLine(m, l)))))))));
  }
  // 週・N日・1日＝1日1行
  const ds = o.view === 'day' ? [o.from] : days(o.from, o.to);
  const ls = logsIn(m, ds[0], ds[ds.length - 1]);
  return h('div', { class: 'day msTab' }, ds.map((d) => h('div', { class: `row ${d === o.today ? 'today' : ''}` },
    h('div', { class: 'times lnk', onclick: () => o.goDay(d) }, h('b', null, d.slice(5)), ' ', h('small', null, o.dow(d)), dayNote(m, d)),
    h('div', { class: 'ttl' }, ls.filter((l) => l.date === d).map((l) => logLine(m, l))),
    addBtn(d))));
}
