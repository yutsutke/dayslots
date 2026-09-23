/* 🗓 記念日の画面＝一覧（N日たった／あとN日・次の周年）と、1件の板（直す・🔔・記録ログ）。升目の日の見出しに節目と 🔔 の印。
 *  読み書きの先はライフログの表（src/sync/milestones.ts）。決まりは src/domain/milestones.ts＝画面には書かない。
 */
import { h, fill, modal, field, hint, type Child } from './dom';
import type { YMD } from '../domain/types';
import { todayYMD } from '../domain/dates';
import { marksOn, rowsOf, logDay, reminderLabel, checkMilestone, type Milestone, type MilestoneLog, type Reminder } from '../domain/milestones';
import { connected, fetchMilestones, cachedMilestones, saveMilestone, saveLog, type MilestoneConn, type MilestoneData } from '../sync/milestones';

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
      hint('正本はライフログの記念日です。ここで足す・直すと、ライフログにもそのまま出ます。消す・写真を付けるのはライフログから。'));
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
        h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')),
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
      l ? h('button', { class: 'ghost sm', onclick: () => show(false) }, 'やめる') : null);
  };
  show(false);
  return wrap;
}
