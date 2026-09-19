/* 入力の板＝記録／⭐ いつもの／🔁 繰り返し */
import { h, modal, timeInput, field, hint, fill, type Child } from './dom';
import type { Ctx } from './app';
import type { Entry, Track, Template, Rule, Freq, Priority } from '../domain/types';
import { bucketOf, fmtMin, fmtDur } from '../domain/slots';
import { FREQ_LABEL, describeRule } from '../domain/recur';
import { DOW_JA } from '../domain/dates';
import { eventFor } from '../sync/calendar';
import { uid } from '../app/repo';
import { nowMinute } from '../domain/dates';
import { aiConfigured, readReceipt, readMeal, type ReceiptRead } from '../ai/byok';
import { pickImages, importPhoto, imageOf, delBlob, urlOf } from './photos';

const slotButtons = (track: Track, get: () => string | null, set: (k: string | null) => void, autoLabel: string) =>
  h('div', { class: 'btns' },
    h('button', { class: get() == null ? 'on' : '', onclick: () => set(null) }, autoLabel),
    track.slots.map((s) => h('button', { class: get() === s.key ? 'on' : '', onclick: () => set(s.key) }, `${s.icon} ${s.label}`)));

const originButtons = (get: () => unknown, set: (v: string | undefined) => void) =>
  h('div', { class: 'btns' }, ([['home', '🏠 手作り'], ['store', '🏪 中食'], ['out', '🍴 外食']] as const).map(([k, l]) =>
    h('button', { class: get() === k ? 'on' : '', onclick: () => set(get() === k ? undefined : k) }, l)));

/** ⏱ 何分＝始まり・終わりと無関係に長さだけ入れる欄。0 から5分刻み（▲▼）。＋30分／＋1時間／＋3時間 の押しボタンで足す。両方入っていれば「計算だと N分」を添える */
const durInput = (get: () => number | null | undefined, set: (v: number | null) => void, computed: number | null) =>
  h('span', { class: 'inline durIn' }, '⏱',
    h('input', { type: 'number', min: 0, step: 5, placeholder: '分', value: get() ?? '', style: { width: '4.5em' }, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); set(v > 0 ? v : null); } }), '分',
    ([[30, '＋30分'], [60, '＋1時間'], [180, '＋3時間']] as const).map(([n, l]) => h('button', { class: 'ghost sm', onclick: () => set((get() ?? 0) + n) }, l)),
    get() != null ? h('button', { class: 'ghost sm', title: '空にする', onclick: () => set(null) }, '✕') : null,
    computed != null && get() == null ? hint(`（始まり〜終わりだと ${fmtDur(computed)}）`) : null);
/** 「今」＝いまの時刻を入れる（分まで） */
const nowBtn = (set: (m: number) => void) => h('button', { class: 'ghost sm', title: 'いまの時刻を入れる', onclick: () => set(nowMinute()) }, '今');
const spanDur = (a: number | null, b: number | null) => (a != null && b != null && b > a ? b - a : null);

const priorityButtons = (get: () => Priority, set: (p: Priority) => void) =>
  h('div', { class: 'btns' }, ([[1, '❗ 高'], [0, 'ふつう'], [-1, '低']] as const).map(([p, l]) =>
    h('button', { class: get() === p ? 'on' : '', onclick: () => set(p) }, l)));

// ── 記録 ────────────────────────────────────────────────
export function openEntryForm(ctx: Ctx, track: Track, entry: Entry | null, init: Partial<Entry> = {}): void {
  const { repo } = ctx;
  const d: Entry = entry ? structuredClone(entry) : repo.blankEntry(track.id, init);
  const isNew = !entry;
  const body = h('div');
  const m = modal(isNew ? `${track.icon} 足す` : `${track.icon} 直す`, body);
  const draw = () => { fill(body, ...form()); };
  const form = (): HTMLElement[] => {
    const landing = track.slots.find((s) => s.key === bucketOf(track, d));
    const ev = eventFor(track, d);
    const tpls = repo.templatesFor(track.id);
    const out: HTMLElement[] = [
      field('なに', h('input', { value: d.title, placeholder: track.kind === 'meal' ? '何を食べたか' : 'やること', autofocus: isNew, oninput: (e: Event) => { d.title = (e.target as HTMLInputElement).value; } })),
      field('枡（時間帯）', slotButtons(track, () => d.slotKey, (k) => { d.slotKey = k; draw(); }, '時刻から自動'),
        hint(`→ 置き場: ${landing ? landing.icon + ' ' + landing.label : '?'}${d.slotKey == null ? '（時刻から。時刻が無ければ受け皿）' : '（選んだ枡が勝つ）'}`)),
      repo.viewDate(d) !== d.date ? field('☀ 見せる日', hint(`1日の始まりの設定（⚙）により、この記録は ${repo.viewDate(d)} の日に出ます（暦の日付 ${d.date} は書き換えません）`)) : h('span'),
      field(track.features.actualFirst ? '予定（決めていれば）' : '予定', h('div', { class: 'inline' },
        h('input', { type: 'date', value: d.date, oninput: (e: Event) => { d.date = (e.target as HTMLInputElement).value || d.date; } }),
        timeInput(d.planStart, (v) => { d.planStart = v; draw(); }), nowBtn((m) => { d.planStart = m; draw(); }), '〜', timeInput(d.planEnd, (v) => { d.planEnd = v; draw(); }), nowBtn((m) => { d.planEnd = m; draw(); }),
        durInput(() => d.planDur, (v) => { d.planDur = v; draw(); }, spanDur(d.planStart, d.planEnd))),
        hint('時刻は無くてもよい＝「30分やる」だけでも書ける')),
      field(track.features.actualFirst ? '実際（食べた・やった）' : '実際', h('div', { class: 'inline' },
        h('input', { type: 'date', value: d.actualDate ?? '', oninput: (e: Event) => { d.actualDate = (e.target as HTMLInputElement).value || null; } }),
        timeInput(d.actualStart, (v) => { d.actualStart = v; if (v != null && !d.actualDate) d.actualDate = d.date; draw(); }), nowBtn((m) => { d.actualStart = m; d.actualDate ??= d.date; draw(); }), '〜', timeInput(d.actualEnd, (v) => { d.actualEnd = v; draw(); }), nowBtn((m) => { d.actualEnd = m; d.actualDate ??= d.date; draw(); }),
        durInput(() => d.actualDur, (v) => { d.actualDur = v; if (v != null && !d.actualDate) d.actualDate = d.date; draw(); }, spanDur(d.actualStart, d.actualEnd)))),
    ];
    if (track.features.done) {
      out.push(field('状態', h('div', { class: 'btns' },
        h('button', { class: d.doneAt ? 'on' : '', onclick: () => { d.doneAt = d.doneAt ? null : new Date().toISOString(); if (d.doneAt) { d.skippedAt = null; d.actualDate ??= d.date; } draw(); } }, '✅ やった'),
        h('button', { class: d.skippedAt ? 'on' : '', title: '今日は無し（🔥 連続日数は切れない・第3の状態）', onclick: () => { d.skippedAt = d.skippedAt ? null : new Date().toISOString(); if (d.skippedAt) d.doneAt = null; draw(); } }, '🚫 今日は無し'),
        !isNew ? h('button', { title: '元は 🚫 で閉じ、代わりにやったことを ✅ で足す', onclick: () => { const t = prompt('代わりに何をやりましたか？'); if (!t) return; repo.upsertEntry(d); repo.doInstead(d.id, t); m.close(); ctx.render(); } }, '🔀 代わりに…') : null),
        priorityButtons(() => d.priority, (p) => { d.priority = p; draw(); })));
    }
    if (track.kind === 'meal') out.push(field('出どころ', originButtons(() => d.payload.origin, (v) => { d.payload = { ...d.payload, origin: v }; draw(); })));
    if (track.features.photos) out.push(photoField(ctx, track, d, draw));
    if (track.kind === 'receipt') out.push(receiptField(d));
    out.push(field('メモ', h('textarea', { rows: 2, value: d.note ?? '', oninput: (e: Event) => { d.note = (e.target as HTMLTextAreaElement).value || null; } })));
    if (track.features.calendar) {
      out.push(field('📅 Google カレンダー',
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: d.calendar, onchange: (e: Event) => { d.calendar = (e.target as HTMLInputElement).checked; draw(); } }), ' 出す'),
        hint(ev ? `出る予定: ${ev.date} ${ev.allDay ? '終日' : `${fmtMin(ev.startMin as number)}–${fmtMin(ev.endMin as number)}`}「${ev.title}」${ev.allDay ? '（時刻が無いので終日）' : ''}` : '')));
    }
    out.push(field('⭐ いつもの', h('div', { class: 'inline' },
      h('select', { onchange: (e: Event) => { const t = tpls.find((x) => x.id === (e.target as HTMLSelectElement).value); if (t) { repo.applyTemplate(t, d, d.slotKey); draw(); } } },
        h('option', { value: '' }, tpls.length ? 'いつものから選ぶ…' : '（まだありません）'),
        tpls.map((t) => h('option', { value: t.id, selected: t.id === d.templateId }, t.name))),
      h('button', { onclick: () => { const n = prompt('いつものの名前', d.title); if (!n) return; repo.templateFromEntry(d, n); alert('⭐ に登録しました'); draw(); } }, '⭐ これをいつものに'))));
    out.push(field('🔁 繰り返し',
      h('button', { onclick: () => openRuleForm(ctx, track, repo.blankRule(track.id, { title: d.title, note: d.note, slotKey: d.slotKey, planStart: d.planStart, planEnd: d.planEnd, planDur: d.planDur ?? null, payload: structuredClone(d.payload), calendar: d.calendar, priority: d.priority, startDate: d.date })) }, '🔁 これを繰り返しにする'),
      d.ruleId ? hint(`この記録は 🔁 から入りました（${d.ruleDate}）`) : null));
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => { if (!d.title.trim()) { alert('「なに」を入れてください'); return; } repo.upsertEntry(d); m.close(); ctx.render(); } }, '保存'),
      !isNew ? h('button', { class: 'danger', onclick: () => { if (confirm('この記録を消しますか？（🔁 の規則・⭐ いつものは残ります）')) { repo.deleteEntry(d.id); m.close(); ctx.render(); } } }, '🗑 消す') : null,
      h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')));
    return out;
  };
  draw();
}

// ── 📷 写真 ＋ 🤖 読み取り ─────────────────────────────────
type AiState = { status: 'pending' | 'done' | 'error'; at?: string; error?: string; model?: string };
const aiState = (d: Entry): AiState | undefined => d.payload.ai as AiState | undefined;

/** 写真を AI に読ませ、結果を記録に写す。⚠ 人が直した題名・メモは上書きしない（空のときだけ入れる） */
async function runAi(ctx: Ctx, track: Track, d: Entry, draw: () => void): Promise<void> {
  const a = ctx.repo.db.settings.ai;
  if (!aiConfigured(a) || !a) { alert('🤖 AI の鍵がまだ入っていません（⚙ → 🤖 AI）'); return; }
  const imgs = (await Promise.all(d.photos.map(imageOf))).filter((x): x is NonNullable<typeof x> => x != null);
  if (!imgs.length) { alert('写真がありません'); return; }
  d.payload = { ...d.payload, ai: { status: 'pending' } as AiState }; draw();
  try {
    if (track.features.ai === 'receipt') {
      const r = await readReceipt(a, imgs, d.note ?? '');
      d.payload = { ...d.payload, receipt: r, ai: { status: 'done', at: new Date().toISOString(), model: a.model } as AiState };
      if (!d.title.trim() || d.title === track.name) d.title = [r.store, r.total != null ? `¥${r.total.toLocaleString()}` : ''].filter(Boolean).join(' ') || 'レシート';
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) { d.actualDate = r.date; d.date = r.date; }
      if (r.time) { const [hh, mm] = r.time.split(':').map(Number); if (hh < 24) { d.actualStart = hh * 60 + mm; d.actualDate ??= d.date; } }
    } else {
      const r = await readMeal(a, imgs, d.note ?? '');
      d.payload = { ...d.payload, meal: r, ai: { status: 'done', at: new Date().toISOString(), model: a.model } as AiState };
      if (!d.title.trim()) d.title = r.summary ?? '';
      if (!d.payload.origin && r.origin) d.payload = { ...d.payload, origin: r.origin };
    }
  } catch (e) {
    d.payload = { ...d.payload, ai: { status: 'error', at: new Date().toISOString(), error: (e as Error).message } as AiState };
  }
  draw();
}

function photoField(ctx: Ctx, track: Track, d: Entry, draw: () => void): HTMLElement {
  const st = aiState(d);
  const add = async () => {
    const files = await pickImages(true); if (!files.length) return;
    for (const f of files) { try { const { photo } = await importPhoto(f); d.photos = [...d.photos, photo]; } catch (e) { alert((e as Error).message); } }
    draw();
    if (track.features.ai && aiConfigured(ctx.repo.db.settings.ai)) void runAi(ctx, track, d, draw); // 鍵があれば、上げたらすぐ読む
  };
  return field('📷 写真', h('div', { class: 'thumbs' },
      d.photos.map((p, i) => h('span', { class: 'thumbWrap' },
        h('img', { class: 'thumb lg', src: p.thumb ?? p.path, alt: '', onclick: async () => { window.open(await urlOf(p), '_blank'); } }),
        h('button', { class: 'x', title: 'この写真を外す', onclick: () => { if (!confirm('この写真を外しますか？')) return; const [gone] = d.photos.splice(i, 1); if (gone.path.startsWith('idb:')) void delBlob(gone.path.slice(4)); d.photos = [...d.photos]; draw(); } }, '✕')))),
    h('div', { class: 'btns' },
      h('button', { onclick: add }, '📷 撮る／選ぶ'),
      track.features.ai ? h('button', { disabled: !d.photos.length || st?.status === 'pending', onclick: () => void runAi(ctx, track, d, draw) }, st?.status === 'pending' ? '🤖 読んでいます…' : '🤖 読み取る') : null),
    st?.status === 'error' ? hint(`⚠ ${st.error ?? '読めませんでした'}`) : st?.status === 'done' ? hint(`🤖 読み取り済（${(st.at ?? '').slice(0, 16).replace('T', ' ')}・${st.model ?? ''}）`) : track.features.ai && !aiConfigured(ctx.repo.db.settings.ai) ? hint('🤖 読ませるには ⚙ → 🤖 AI に本人の鍵を入れる（BYOK）') : null);
}

/** 🧾 読み取った中身（店・日時・合計・品目）。直すのは ここでは題名とメモ＝品目の手直しは Phase 2 */
function receiptField(d: Entry): HTMLElement {
  const r = d.payload.receipt as ReceiptRead | undefined;
  if (!r) return field('🧾 中身', hint('写真を上げて 🤖 読み取る と、店・日時・合計・品目がここに出ます'));
  return field('🧾 中身', h('div', { class: 'rcpt' },
    h('div', null, h('b', null, r.store ?? '(店名 不明)'), ' ', h('small', null, [r.date, r.time, r.payment].filter(Boolean).join(' ')), ' ', h('b', { class: 'yen' }, r.total != null ? `¥${r.total.toLocaleString()}` : '')),
    r.items.length ? h('table', { class: 'items' }, r.items.map((it) => h('tr', null, h('td', null, it.name), h('td', { class: 'n' }, it.qty != null && it.qty !== 1 ? `×${it.qty}` : ''), h('td', { class: 'n' }, it.price != null ? `¥${it.price.toLocaleString()}` : '')))) : hint('品目は読めませんでした'),
    r.note ? hint(`🤖 ${r.note}`) : null));
}

// ── ⭐ いつもの ───────────────────────────────────────────
export function openTemplates(ctx: Ctx, track: Track): void {
  const { repo } = ctx;
  const body = h('div');
  const m = modal(`⭐ いつもの — ${track.icon} ${track.name}`, body);
  const draw = () => {
    const list = repo.templatesFor(track.id);
    fill(body, 
      h('p', { class: 'hint' }, '型＝食べた・やった事実ではないので、升目や数には出ません。「この日に入れる」で記録になります。並びは最後に使った日の新しい順。'),
      list.length ? list.map((t) => {
        const u = repo.templateUsage(t.id); const slot = track.slots.find((s) => s.key === t.slotKey);
        return h('div', { class: 'item' },
          h('div', { class: 'ttl' }, h('b', null, t.name), h('small', { class: 'sub' }, [slot ? `${slot.icon} ${slot.label}` : 'どの枡でも', t.planStart != null ? fmtMin(t.planStart) : '', `使った ${u.count} 回`, u.last ? `最後 ${u.last}` : ''].filter(Boolean).join(' · '))),
          h('div', { class: 'btns' },
            h('button', { class: 'primary', onclick: () => { repo.entryFromTemplate(t, ctx.anchor()); m.close(); ctx.render(); } }, `${ctx.anchor().slice(5)} に入れる`),
            h('button', { onclick: () => openTemplateForm(ctx, track, t, draw) }, '✏️'),
            h('button', { class: 'danger', onclick: () => { if (confirm(`「${t.name}」を消しますか？（作った記録は残ります）`)) { repo.deleteTemplate(t.id); draw(); } } }, '🗑')));
      }) : h('p', { class: 'empty' }, 'まだありません。記録の板の「⭐ これをいつものに」か、下の「＋」で作れます。'),
      h('div', { class: 'actions' }, h('button', { onclick: () => openTemplateForm(ctx, track, null, draw) }, '＋ 手で作る')));
  };
  draw();
}

function openTemplateForm(ctx: Ctx, track: Track, tpl: Template | null, onSaved: () => void): void {
  const { repo } = ctx; const iso = new Date().toISOString();
  const d: Template = tpl ? structuredClone(tpl) : { id: uid(), trackId: track.id, name: '', slotKey: null, title: '', note: null, payload: {}, photos: [], planStart: null, planEnd: null, calendar: false, sortOrder: 0, createdAt: iso, updatedAt: iso };
  const body = h('div');
  const m = modal(tpl ? '⭐ いつものを直す' : '⭐ いつものを作る', body);
  const draw = () => {
    const out: Child[] = [
      field('呼び名', h('input', { value: d.name, placeholder: 'いつもの朝ごはん', oninput: (e: Event) => { d.name = (e.target as HTMLInputElement).value; } })),
      field('なに（記録に入る文）', h('input', { value: d.title, oninput: (e: Event) => { d.title = (e.target as HTMLInputElement).value; } })),
      field('既定の枡', slotButtons(track, () => d.slotKey, (k) => { d.slotKey = k; draw(); }, 'どの枡でも'), hint('縛りではない＝呼んだ先の枡が勝つ（朝食のメニューを昼にも使える）')),
      field('合図の別名', h('input', { value: (d.aliases ?? []).join('、'), placeholder: 'ウォーキング、walk', oninput: (e: Event) => { d.aliases = (e.target as HTMLInputElement).value.split(/[、,\s]+/).map((x) => x.trim()).filter(Boolean); } }), hint('「散歩開始」のように呼び名でも、この別名でも、この型のある種目に入る')),
      field('既定の時刻', h('div', { class: 'inline' }, timeInput(d.planStart, (v) => { d.planStart = v; }), '〜', timeInput(d.planEnd, (v) => { d.planEnd = v; }),
        durInput(() => d.planDur, (v) => { d.planDur = v; draw(); }, null))),
    ];
    if (track.kind === 'meal') out.push(field('出どころ', originButtons(() => d.payload.origin, (v) => { d.payload = { ...d.payload, origin: v }; draw(); })));
    out.push(field('メモ', h('textarea', { rows: 2, value: d.note ?? '', oninput: (e: Event) => { d.note = (e.target as HTMLTextAreaElement).value || null; } })));
    if (track.features.calendar) out.push(field('📅', h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: d.calendar, onchange: (e: Event) => { d.calendar = (e.target as HTMLInputElement).checked; } }), ' この型から作った記録は Google に出す')));
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => { if (!d.name.trim()) { alert('呼び名を入れてください'); return; } if (!d.title.trim()) d.title = d.name; repo.saveTemplate(d); m.close(); onSaved(); } }, '保存'),
      h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')));
    fill(body, ...out);
  };
  draw();
}

// ── 🔁 繰り返し ───────────────────────────────────────────
export function openRules(ctx: Ctx, track: Track): void {
  const { repo } = ctx;
  const body = h('div');
  const m = modal(`🔁 繰り返し — ${track.icon} ${track.name}`, body);
  const draw = () => {
    const list = repo.rulesFor(track.id);
    fill(body, 
      h('p', { class: 'hint' }, '自動＝その日が来たら記録が入る（毎朝の青汁のように必ずやるもの）。確認してから＝升目に薄く出て、押した日だけ記録になる（やらなかった日の未完了が溜まらない）。未来の日には作らない。'),
      list.length ? list.map((r) => {
        const slot = track.slots.find((s) => s.key === r.slotKey);
        const exc = Object.entries(r.exceptions).filter(([, v]) => v.del).map(([k]) => k).sort();
        return h('div', { class: 'item' + (r.active ? '' : ' dim') },
          h('div', { class: 'ttl' }, h('b', null, r.title), h('small', { class: 'sub' }, [describeRule(r), slot ? `${slot.icon} ${slot.label}` : '', r.planStart != null ? fmtMin(r.planStart) + (r.planEnd != null ? '–' + fmtMin(r.planEnd) : '') : '', r.auto ? '自動' : '確認してから', r.calendar ? '📅' : '', exc.length ? `なしの回 ${exc.length}` : ''].filter(Boolean).join(' · '))),
          h('div', { class: 'btns' },
            h('button', { onclick: () => { r.active = !r.active; repo.saveRule(r); draw(); } }, r.active ? '⏸ 止める' : '▶ 再開'),
            h('button', { onclick: () => openRuleForm(ctx, track, r, draw) }, '✏️'),
            h('button', { class: 'danger', onclick: () => { if (confirm(`「${r.title}」の繰り返しを消しますか？（入った記録は残ります）`)) { repo.deleteRule(r.id); draw(); ctx.render(); } } }, '🗑')));
      }) : h('p', { class: 'empty' }, 'まだありません。記録の板の「🔁 これを繰り返しにする」か、下の「＋」で作れます。'),
      h('div', { class: 'actions' }, h('button', { onclick: () => openRuleForm(ctx, track, repo.blankRule(track.id), draw) }, '＋ 足す')));
  };
  draw();
}

const HOLIDAY_FREQS: Freq[] = ['weekday', 'holiday', 'beforeoff', 'notbeforeoff', 'firstworkday', 'lastworkday', 'runstart', 'runend'];

export function openRuleForm(ctx: Ctx, track: Track, rule: Rule, onSaved?: () => void): void {
  const { repo } = ctx;
  const isNew = !repo.db.rules.some((r) => r.id === rule.id);
  const d: Rule = structuredClone(rule);
  const body = h('div');
  const m = modal(isNew ? '🔁 繰り返しを作る' : '🔁 繰り返しを直す', body);
  const numIn = (get: () => number | null, set: (v: number | null) => void) =>
    h('input', { type: 'number', min: 1, max: 31, value: get() ?? '', style: { width: '4em' }, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); set(v >= 1 ? v : null); } });
  const draw = () => {
    const extra: Child[] = [];
    if (d.freq === 'weekly') extra.push(h('div', { class: 'btns' }, DOW_JA.map((l, i) => h('button', { class: d.byday.includes(i) ? 'on' : '', onclick: () => { d.byday = d.byday.includes(i) ? d.byday.filter((x) => x !== i) : [...d.byday, i].sort(); draw(); } }, l))));
    if (d.freq === 'everyN') extra.push(h('div', { class: 'inline' }, h('input', { type: 'number', min: 1, max: 365, value: d.interval ?? 1, style: { width: '4em' }, oninput: (e: Event) => { d.interval = Number((e.target as HTMLInputElement).value) || 1; } }), ' 日ごと（「始まり」の日から数える）'));
    if (d.freq === 'monthhalf') extra.push(h('div', { class: 'btns' }, h('button', { class: d.half !== 'second' ? 'on' : '', onclick: () => { d.half = 'first'; draw(); } }, '前半（1〜15日）'), h('button', { class: d.half === 'second' ? 'on' : '', onclick: () => { d.half = 'second'; draw(); } }, '後半（16日〜）')));
    if (d.freq === 'monthrange') extra.push(h('div', { class: 'inline' }, '毎月 ', numIn(() => d.dayFrom, (v) => { d.dayFrom = v; }), ' 日 〜 ', numIn(() => d.dayTo, (v) => { d.dayTo = v; }), ' 日（月末を超える月は月末）'));
    if (d.freq === 'monthly') extra.push(hint(`「始まり」の日＝毎月 ${Number(d.startDate.slice(8, 10))} 日（無い月は月末）`));
    if (HOLIDAY_FREQS.includes(d.freq)) extra.push(hint('休日＝土日＋日本の祝日＋⚙ で足した休み（有給など）'));
    const out: Child[] = [
      field('なに', h('input', { value: d.title, oninput: (e: Event) => { d.title = (e.target as HTMLInputElement).value; } })),
      field('いつ', h('select', { onchange: (e: Event) => { d.freq = (e.target as HTMLSelectElement).value as Freq; draw(); } },
        (Object.keys(FREQ_LABEL) as Freq[]).map((f) => h('option', { value: f, selected: f === d.freq }, FREQ_LABEL[f]))), ...extra),
      field('始まり〜終わり', h('div', { class: 'inline' },
        h('input', { type: 'date', value: d.startDate, oninput: (e: Event) => { d.startDate = (e.target as HTMLInputElement).value || d.startDate; } }), '〜',
        h('input', { type: 'date', value: d.endDate ?? '', oninput: (e: Event) => { d.endDate = (e.target as HTMLInputElement).value || null; } }), hint('終わりが空＝ずっと'))),
      field('枡（時間帯）', slotButtons(track, () => d.slotKey, (k) => { d.slotKey = k; draw(); }, '時刻から自動')),
      field('時刻', h('div', { class: 'inline' }, timeInput(d.planStart, (v) => { d.planStart = v; }), '〜', timeInput(d.planEnd, (v) => { d.planEnd = v; }),
        durInput(() => d.planDur, (v) => { d.planDur = v; draw(); }, null))),
      field('入り方', h('div', { class: 'btns' },
        h('button', { class: !d.auto ? 'on' : '', onclick: () => { d.auto = false; draw(); } }, '確認してから（薄く出す）'),
        h('button', { class: d.auto ? 'on' : '', onclick: () => { d.auto = true; draw(); } }, '自動で入る'))),
    ];
    if (track.features.done) out.push(field('重要度', priorityButtons(() => d.priority, (p) => { d.priority = p; draw(); })));
    if (track.kind === 'meal') out.push(field('出どころ', originButtons(() => d.payload.origin, (v) => { d.payload = { ...d.payload, origin: v }; draw(); })));
    if (track.features.calendar) out.push(field('📅', h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: d.calendar, onchange: (e: Event) => { d.calendar = (e.target as HTMLInputElement).checked; } }), ' 入った記録を Google に出す（時刻があるとき）')));
    out.push(field('メモ', h('textarea', { rows: 2, value: d.note ?? '', oninput: (e: Event) => { d.note = (e.target as HTMLTextAreaElement).value || null; } })));
    const exc = Object.entries(d.exceptions).filter(([, v]) => v.del).map(([k]) => k).sort();
    if (exc.length) out.push(field('なしにした回', h('div', { class: 'btns' }, exc.map((k) => h('button', { title: '戻す', onclick: () => { delete d.exceptions[k]; draw(); } }, `${k} ✕`)))));
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => {
        if (!d.title.trim()) { alert('「なに」を入れてください'); return; }
        if (d.freq === 'weekly' && !d.byday.length) { alert('曜日を1つ以上選んでください'); return; }
        if (d.freq === 'monthrange' && !(d.dayFrom && d.dayTo && d.dayFrom <= d.dayTo)) { alert('N日〜M日を入れてください（N ≤ M）'); return; }
        if (d.endDate && d.endDate < d.startDate) { alert('終わりが始まりより前です'); return; }
        repo.saveRule(d); m.close(); onSaved?.(); ctx.render();
      } }, '保存'),
      !isNew ? h('button', { class: 'danger', onclick: () => { if (confirm('この繰り返しを消しますか？（入った記録は残ります）')) { repo.deleteRule(d.id); m.close(); onSaved?.(); ctx.render(); } } }, '🗑 消す') : null,
      h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')));
    fill(body, ...out);
  };
  draw();
}
