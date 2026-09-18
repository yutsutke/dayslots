/* ⚙ 設定＝種目と枡（境目・数・並び）、週の始まり、📅 の接続、休み、データ */
import { h, modal, timeInput, field, hint, fill } from './dom';
import type { Ctx } from './app';
import type { Track, TrackKind, SlotDef } from '../domain/types';
import { KIND_LABEL } from '../domain/defaults';
import { validateSlots, slotRange } from '../domain/slots';
import { GoogleViaEdgeFunction, pending, syncAll } from '../sync/calendar';
import { seedDb } from '../store/seed';

export function openSettings(ctx: Ctx): void {
  const { repo } = ctx;
  const body = h('div');
  const m = modal('⚙ 設定', body, { wide: true, onClose: ctx.render });
  const draw = () => {
    const st = repo.db.settings;
    const kindSel = h('select', null, (Object.keys(KIND_LABEL) as TrackKind[]).map((k) => h('option', { value: k }, KIND_LABEL[k])));
    const pend = pending(repo).length;
    fill(body, 
      h('h3', null, '種目と枡（時間帯）'),
      h('p', { class: 'hint' }, '種目＝記録の種類（やること／食事／運動…）。枡＝1日を切った時間帯。境目は記録に焼き込まず読むときに当てるので、変えると過去の記録もその場で並び直ります。'),
      [...repo.db.tracks].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => h('div', { class: 'item' + (t.archived ? ' dim' : '') },
        h('div', { class: 'ttl' }, h('b', null, `${t.icon} ${t.name}`), h('small', { class: 'sub' }, `${KIND_LABEL[t.kind]} · 枡 ${t.slots.length}：${t.slots.map((s) => s.label + (s.startMin != null ? `(${slotRange(t, s.key)})` : '')).join('／')}`)),
        h('div', { class: 'btns' },
          h('button', { onclick: () => openTrackEditor(ctx, t, draw) }, '✏️ 枡を直す'),
          h('button', { title: t.archived ? '畳んだ種目を戻す' : '消さずに畳む（記録は残る）', onclick: () => { t.archived = !t.archived; repo.saveTrack(t); draw(); } }, t.archived ? '▶ 戻す' : '⏸ 畳む')))),
      h('div', { class: 'inline' }, kindSel, h('button', { onclick: () => { const t = repo.addTrackFromPreset(kindSel.value as TrackKind); openTrackEditor(ctx, t, draw); } }, '＋ 種目を足す'),
        hint('例＝「運動型」で 朝散歩／夜ジム。枡はあとから自由に変えられます')),

      h('h3', null, '週の始まり'),
      h('div', { class: 'btns' },
        h('button', { class: st.weekStart === 0 ? 'on' : '', onclick: () => { st.weekStart = 0; void repo.persist(); draw(); } }, '日曜'),
        h('button', { class: st.weekStart === 1 ? 'on' : '', onclick: () => { st.weekStart = 1; void repo.persist(); draw(); } }, '月曜')),

      h('h3', null, '📅 Google カレンダー'),
      h('p', { class: 'hint' }, '時刻つきの記録だけを出します（枡だけの記録は出しません）。つなぎ方は ライフログと同じ Edge Function 方式（SPEC.md §7）。関数 koma-gcal はまだ作っていません（Phase 4）＝ここは入れ物だけ。'),
      field('関数の場所', h('input', { value: st.supabaseUrl, placeholder: 'https://xxxx.supabase.co', oninput: (e: Event) => { st.supabaseUrl = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } })),
      field('合言葉', h('input', { type: 'password', value: st.calendarSecret, oninput: (e: Event) => { st.calendarSecret = (e.target as HTMLInputElement).value; void repo.persist(); } })),
      h('div', { class: 'inline' },
        h('span', null, `未送信 ${pend} 件`),
        h('button', { onclick: async () => { const r = await syncAll(repo, new GoogleViaEdgeFunction(st.supabaseUrl, st.calendarSecret)); alert(`送った ${r.sent} · 消した ${r.removed}` + (r.errors.length ? `\n⚠ ${r.errors.join('\n')}` : '')); draw(); } }, 'いま送る')),

      h('h3', null, '🗓 休み（有給・夏休みなど）'),
      h('p', { class: 'hint' }, '🔁 の「平日」「休日」「週の最初の平日」の判定に効きます（土日と日本の祝日は入れなくてよい）。1行に1日 YYYY-MM-DD。'),
      h('textarea', { rows: 3, value: repo.db.holidays.join('\n'), onchange: (e: Event) => { repo.db.holidays = (e.target as HTMLTextAreaElement).value.split(/\s+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)); void repo.persist(); } }),

      h('h3', null, 'データ'),
      h('div', { class: 'btns' },
        h('button', { onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([repo.exportJson()], { type: 'application/json' })); a.download = `koma-${new Date().toISOString().slice(0, 10)}.json`; a.click(); } }, '⬇ JSON で書き出す'),
        h('button', { onclick: () => { const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => { const f = inp.files?.[0]; if (!f) return; try { repo.importJson(await f.text()); alert('読み込みました'); m.close(); ctx.render(); } catch (e) { alert(`読めませんでした: ${(e as Error).message}`); } } }); inp.click(); } }, '⬆ JSON を読み込む'),
        h('button', { class: 'danger', onclick: () => { if (confirm('記録・種目・⭐・🔁 を全部消して、見本に戻します。よいですか？')) { repo.reset(() => seedDb()); m.close(); ctx.render(); } } }, '見本に戻す')),
      h('p', { class: 'hint' }, `記録 ${repo.db.entries.length} 件 · ⭐ ${repo.db.templates.length} · 🔁 ${repo.db.rules.length}（この端末の中だけ。Supabase への置き場は Phase 3）`));
  };
  draw();
}

/** 種目の編集＝名前・絵・使うもの・枡の並び（足す／減らす／境目／並べ替え）・受け皿 */
function openTrackEditor(ctx: Ctx, track: Track, onSaved: () => void): void {
  const { repo } = ctx;
  const d: Track = structuredClone(track);
  let errs: string[] = [];
  const body = h('div');
  const m = modal(`✏️ ${d.icon} ${d.name}`, body, { wide: true });
  const newKey = () => { let k = 's' + Date.now().toString(36); while (d.slots.some((s) => s.key === k)) k += 'x'; return k; };
  const chk = (label: string, get: () => boolean, set: (v: boolean) => void, why: string) =>
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: get(), onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); } }), ` ${label}`, hint(why));
  const draw = () => {
    const rows = d.slots.map((s, i) => slotRow(s, i));
    fill(body, 
      field('名前', h('input', { value: d.name, oninput: (e: Event) => { d.name = (e.target as HTMLInputElement).value; } })),
      field('絵', h('input', { value: d.icon, style: { width: '4em' }, oninput: (e: Event) => { d.icon = (e.target as HTMLInputElement).value; } })),
      field('使うもの',
        chk('✅ やった／🚫 やらなかった／🔀 代わりに', () => d.features.done, (v) => { d.features.done = v; }, 'やること・運動のように「やる／やらない」がある種目'),
        chk('📷 写真を付ける', () => d.features.photos, (v) => { d.features.photos = v; }, '食事のように写真そのものが記録になる種目'),
        chk('📅 時刻つきの記録を Google カレンダーに出せる', () => d.features.calendar, (v) => { d.features.calendar = v; }, '記録ごとに出す／出さないを選べる'),
        chk('「実際」を主にする', () => d.features.actualFirst, (v) => { d.features.actualFirst = v; }, '食事のように、食べた時刻で枡を決める（外すと予定の時刻で決める）'),
        chk('一日一回（1タップで ✅／🚫）', () => Boolean(d.features.daily), (v) => { d.features.daily = v; }, '座禅・薬のように「その日やったか」だけを付ける種目。週・月の升目が1タップの印になる。時刻やメモは「…」から足せる')),
      h('h4', null, '枡（時間帯）'),
      h('p', { class: 'hint' }, '時刻で決まる枡＝「始まり」を入れる（終わりは次の枡の始まりまで。終わりを早めて隙間を作ると、その時刻の記録は受け皿へ）。時刻で決まらない枡（時間帯なし・間食）＝始まりを空にする＝選んだときだけ入る。'),
      h('table', { class: 'slotsEd' },
        h('thead', null, h('tr', null, h('th', null, '絵'), h('th', null, '呼び名'), h('th', null, '始まり'), h('th', null, '終わり'), h('th', null, '並び'), h('th'))),
        h('tbody', null, rows)),
      h('div', { class: 'btns' },
        h('button', { onclick: () => { d.slots.push({ key: newKey(), label: '新しい枡', icon: '⬜', startMin: 12 * 60 }); draw(); } }, '＋ 時刻で決まる枡'),
        h('button', { onclick: () => { d.slots.push({ key: newKey(), label: '新しい枡', icon: '⬜', startMin: null }); draw(); } }, '＋ 選んだ時だけの枡')),
      field('受け皿', h('select', { onchange: (e: Event) => { d.fallbackKey = (e.target as HTMLSelectElement).value; } },
        d.slots.map((s) => h('option', { value: s.key, selected: s.key === d.fallbackKey }, `${s.icon} ${s.label}`))),
        hint('時刻も選択も無い記録、どの時間帯にも当たらない時刻の記録、消した枡に入っていた記録が落ちる所')),
      errs.length ? h('ul', { class: 'errs' }, errs.map((x) => h('li', null, x))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => { errs = validateSlots(d.slots, d.fallbackKey); if (!d.name.trim()) errs.unshift('名前を入れてください'); if (errs.length) { draw(); return; } repo.saveTrack(d); m.close(); onSaved(); } }, '保存'),
        h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')));
  };
  const slotRow = (s: SlotDef, i: number) => {
    const timed = s.startMin != null;
    return h('tr', null,
      h('td', null, h('input', { value: s.icon, style: { width: '2.5em' }, oninput: (e: Event) => { s.icon = (e.target as HTMLInputElement).value; } })),
      h('td', null, h('input', { value: s.label, oninput: (e: Event) => { s.label = (e.target as HTMLInputElement).value; } }), h('small', { class: 'sub' }, s.key)),
      h('td', null, timed ? timeInput(s.startMin, (v) => { s.startMin = v ?? 0; }) : h('button', { class: 'ghost', title: '時刻で決まる枡にする', onclick: () => { s.startMin = 12 * 60; draw(); } }, '選んだ時だけ')),
      h('td', null, timed ? [timeInput(s.endMin ?? null, (v) => { s.endMin = v; }), hint('空＝次の枡まで')] : h('button', { class: 'ghost', onclick: () => { s.startMin = null; s.endMin = null; draw(); } }, '時刻なしに戻す')),
      h('td', null, h('button', { disabled: i === 0, onclick: () => { [d.slots[i - 1], d.slots[i]] = [d.slots[i], d.slots[i - 1]]; draw(); } }, '↑'), h('button', { disabled: i === d.slots.length - 1, onclick: () => { [d.slots[i + 1], d.slots[i]] = [d.slots[i], d.slots[i + 1]]; draw(); } }, '↓')),
      h('td', null, h('button', { class: 'danger', title: 'この枡を消す（入っていた記録は受け皿に読み直る・記録は消えない）', onclick: () => { if (confirm(`「${s.label}」を消しますか？入っていた記録は消えず、受け皿の枡に読み直ります。`)) { d.slots.splice(i, 1); if (d.fallbackKey === s.key) d.fallbackKey = d.slots[0]?.key ?? ''; draw(); } } }, '🗑')));
  };
  draw();
}
