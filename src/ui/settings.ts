/* ⚙ 設定＝種目と枡（境目・数・並び）、週の始まり、📅 の接続、休み、データ */
import { h, modal, timeInput, field, hint, fill } from './dom';
import type { Ctx } from './app';
import type { Track, TrackKind, SlotDef } from '../domain/types';
import { KIND_LABEL } from '../domain/defaults';
import { validateSlots, slotRange, startOf, fmtMin, setSunPlace } from '../domain/slots';
import { sunTimes, describeSun, TOKYO } from '../domain/sun';
import { cycleStart, cycleEnd, cycleIndex, validateCycle, MIN_CYCLE, MAX_CYCLE } from '../domain/cycle';
import { GESTURES, GESTURE_LABEL, GESTURE_DEF, sayFor, validateGestures, type GestureRule } from '../domain/gesture';
import { GoogleViaEdgeFunction, pending, syncAll } from '../sync/calendar';
import { seedDb } from '../store/seed';
import { AI_DEFAULT_MODEL, AI_PROVIDER_LABEL, pingAi, type AiProvider } from '../ai/byok';
import { DriveTarget, type StorageKind } from '../sync/target';
import { exportSqlite } from '../export/sqlite';
import { syncer } from './app';
import { buildReview } from '../app/review';
import { todayYMD } from '../domain/dates';

/** N日のひと区切り＝日数と数え始める日。いま見ている日がどの区切りに入るかを、その場で見せる */
function cycleBlock(ctx: Ctx, draw: () => void): HTMLElement {
  const { repo } = ctx;
  const c = repo.db.settings.cycle ?? { days: 3, from: repo.viewToday() };
  const save = (days: number, from: string) => {
    const errs = validateCycle(days, from);
    if (errs.length) { alert(errs.join('\n')); return; }
    repo.db.settings.cycle = { days, from };
    void repo.persist(); draw(); ctx.render();
  };
  const today = repo.viewToday();
  return h('div', null,
    field('ひと区切りの日数', h('div', { class: 'inline' },
      h('div', { class: 'btns' }, [3, 5, 10].map((n) => h('button', { class: c.days === n ? 'on' : '', onclick: () => save(n, c.from) }, `${n}日`))),
      h('input', { type: 'number', min: MIN_CYCLE, max: MAX_CYCLE, value: c.days, style: { width: '5em' }, onchange: (e: Event) => save(Number((e.target as HTMLInputElement).value), c.from) }), '日')),
    field('数え始める日', h('input', { type: 'date', value: c.from, onchange: (e: Event) => save(c.days, (e.target as HTMLInputElement).value) }),
      hint('この日を含む区切りが「1周目」。前の日も同じ幅で切ります（0周目・-1周目…）＝途中から数え始めても、それ以前が崩れません')),
    hint(`今日（${today}）は ${cycleIndex(today, c.from, c.days)}周目＝${cycleStart(today, c.from, c.days)} 〜 ${cycleEnd(today, c.from, c.days).slice(5)}`));
}

/** 📷 手の形 → 合図の文 の対応表。顔ぶれは決まっていて（AI に言葉を作らせない）、何の合図にするかだけを人が決める */
function gestureBlock(ctx: Ctx, draw: () => void): HTMLElement {
  const { repo } = ctx;
  const rules = (repo.db.settings.gestures as GestureRule[] | undefined) ?? GESTURE_DEF;
  const save = (g: (typeof GESTURES)[number], say: string) => {
    const next = rules.filter((r) => r.gesture !== g);
    if (say.trim()) next.push({ gesture: g, say: say.trim() });
    const errs = validateGestures(next);
    if (errs.length) { alert(errs.join('\n')); return; }
    repo.db.settings.gestures = next.sort((a, b) => GESTURES.indexOf(a.gesture) - GESTURES.indexOf(b.gesture));
    void repo.persist(); draw();
  };
  return h('div', null,
    ...GESTURES.map((g) => field(GESTURE_LABEL[g],
      h('input', { value: sayFor(rules, g) ?? '', placeholder: '（この形は使わない）', onchange: (e: Event) => save(g, (e.target as HTMLInputElement).value) }))),
    hint('入れる文は、合図の欄に打つのと同じもの＝「開始」「終了」「30分」「座禅開始」など。種目タブを開いていれば名前は省けます'));
}

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
          h('button', { class: 'sm', title: '上へ', onclick: () => { repo.moveTrack(t.id, -1); draw(); } }, '↑'),
          h('button', { class: 'sm', title: '下へ', onclick: () => { repo.moveTrack(t.id, 1); draw(); } }, '↓'),
          h('button', { onclick: () => openTrackEditor(ctx, t, draw) }, '✏️ 枡を直す'),
          h('button', { title: t.archived ? '畳んだ種目を戻す' : '消さずに畳む（記録は残る）', onclick: () => { t.archived = !t.archived; repo.saveTrack(t); draw(); } }, t.archived ? '▶ 戻す' : '⏸ 畳む'),
          t.archived ? h('button', { class: 'danger', title: '種目を消す（記録も消える）', onclick: () => { const n = repo.db.entries.filter((e) => e.trackId === t.id).length; if (confirm(`「${t.name}」を消しますか？ 記録 ${n} 件・⭐・🔁 も一緒に消えます（戻せません）`)) { repo.deleteTrack(t.id); draw(); } } }, '🗑') : null))),
      h('div', { class: 'inline' }, kindSel, h('button', { onclick: () => { const t = repo.addTrackFromPreset(kindSel.value as TrackKind); openTrackEditor(ctx, t, draw); } }, '＋ 種目を足す'),
        hint('例＝「運動型」で 朝散歩／夜ジム。枡はあとから自由に変えられます')),

      h('h3', null, '週の始まり'),
      h('div', { class: 'btns' },
        h('button', { class: st.weekStart === 0 ? 'on' : '', onclick: () => { st.weekStart = 0; void repo.persist(); draw(); } }, '日曜'),
        h('button', { class: st.weekStart === 1 ? 'on' : '', onclick: () => { st.weekStart = 1; void repo.persist(); draw(); } }, '月曜')),

      h('h3', null, 'N日のひと区切り（サイクル）'),
      h('p', { class: 'hint' }, '週（曜日で切る暦の区切り）とは別に、3日・10日 のような幅で切って見ます。切るのは**読むとき**だけなので、日数や数え始める日を変えても記録は書き換わりません。'),
      cycleBlock(ctx, draw),

      h('h3', null, '📷 手の形で合図'),
      h('p', { class: 'hint' }, '写真を1枚えらぶと、手の形を見て、ここで決めた合図の文を入れます（🤖 本人の鍵が要ります）。写真は**残しません**＝手の形は命令であって記録ではないので。分からなかったときは何も入れません。'),
      gestureBlock(ctx, draw),

      h('h3', null, '📅 Google カレンダー'),
      h('p', { class: 'hint' }, '時刻つきの記録だけを出します（枡だけの記録は出しません）。つなぎ方は ライフログと同じ Edge Function 方式（SPEC.md §7）。関数 koma-gcal はまだ作っていません（Phase 4）＝ここは入れ物だけ。'),
      field('関数の場所', h('input', { value: st.supabaseUrl, placeholder: 'https://xxxx.supabase.co', oninput: (e: Event) => { st.supabaseUrl = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } })),
      field('合言葉', h('input', { type: 'password', value: st.calendarSecret, oninput: (e: Event) => { st.calendarSecret = (e.target as HTMLInputElement).value; void repo.persist(); } })),
      h('div', { class: 'inline' },
        h('span', null, `未送信 ${pend} 件`),
        h('button', { onclick: async () => { const r = await syncAll(repo, new GoogleViaEdgeFunction(st.supabaseUrl, st.calendarSecret)); alert(`送った ${r.sent} · 消した ${r.removed}` + (r.errors.length ? `\n⚠ ${r.errors.join('\n')}` : '')); draw(); } }, 'いま送る')),

      h('h3', null, '☀ 日の出・日の入りの場所'),
      h('p', { class: 'hint' }, (() => { const p = st.sunPlace ?? TOKYO; const t = sunTimes(todayYMD(), p); return `枡の境目を「日の出の30分前」「昼を3等分」のように決めるときに使います（種目の ✏️ → 始まり）。通信せず端末で計算・5分刻み。いま＝${p.name ?? `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`}：今日の日の出 ${t ? fmtMin(t.rise) : '—'}・日の入り ${t ? fmtMin(t.set) : '—'}`; })()),
      h('div', { class: 'inline' },
        '緯度', h('input', { type: 'number', step: 0.01, value: (st.sunPlace ?? TOKYO).lat, style: { width: '6em' }, onchange: (e: Event) => { st.sunPlace = { ...(st.sunPlace ?? TOKYO), lat: Number((e.target as HTMLInputElement).value), name: undefined }; setSunPlace(st.sunPlace); void repo.persist(); draw(); } }),
        '経度', h('input', { type: 'number', step: 0.01, value: (st.sunPlace ?? TOKYO).lon, style: { width: '6em' }, onchange: (e: Event) => { st.sunPlace = { ...(st.sunPlace ?? TOKYO), lon: Number((e.target as HTMLInputElement).value), name: undefined }; setSunPlace(st.sunPlace); void repo.persist(); draw(); } }),
        h('button', { onclick: () => { if (!navigator.geolocation) { alert('この端末では現在地が使えません'); return; } navigator.geolocation.getCurrentPosition((pos) => { st.sunPlace = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100, name: '現在地' }; setSunPlace(st.sunPlace); void repo.persist(); draw(); }, () => alert('現在地を取れませんでした（許可を確かめてください）')); } }, '📍 現在地を使う'),
        h('button', { class: 'ghost sm', onclick: () => { st.sunPlace = undefined; setSunPlace(null); void repo.persist(); draw(); } }, '東京に戻す')),
      field('1日の始まり', h('div', { class: 'btns' }, ([['midnight', '🕛 0:00'], ['sunrise', '🌅 日の出'], ['sunset', '🌇 日の入り']] as const).map(([k, l]) =>
        h('button', { class: (st.dayStart?.base ?? 'midnight') === k ? 'on' : '', onclick: () => { st.dayStart = k === 'midnight' ? { base: 'midnight' } : { base: k, offsetMin: st.dayStart && st.dayStart.base !== 'midnight' ? st.dayStart.offsetMin : 0 }; void repo.persist(); draw(); } }, l))),
        st.dayStart && st.dayStart.base !== 'midnight' ? h('div', { class: 'inline' }, 'ずらし', h('input', { type: 'number', step: 5, min: -180, max: 180, value: st.dayStart.offsetMin, style: { width: '5em' }, onchange: (e: Event) => { if (st.dayStart && st.dayStart.base !== 'midnight') { st.dayStart.offsetMin = Number((e.target as HTMLInputElement).value) || 0; void repo.persist(); draw(); } } }), '分（−30＝30分前から新しい日）') : null,
        hint('どの日に見せるか、だけが変わります（記録の日付と時刻は書き換えません・0:00 に戻せば元どおり）。🌅 日の出＝未明の記録は前の日の続き（江戸の明け六つ始まり）。🌇 日の入り＝日没以後の記録は次の日のぶん。時刻の無い記録は暦の日のまま。')),

      h('h3', null, '⏵ 進行中（合図の「開始」「終了」）'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.autoStop ?? true, onchange: (e: Event) => { st.autoStop = (e.target as HTMLInputElement).checked; void repo.persist(); } }), ' 「開始」で他の進行中を自動で終了する', hint('一度に走るのは1つ（Now Then の「次をタップで前が止まる」）。外すと並行して走れる')),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.skipBreaksStreak ?? false, onchange: (e: Event) => { st.skipBreaksStreak = (e.target as HTMLInputElement).checked; void repo.persist(); } }), ' 🚫「今日は無し」で 🔥 連続日数を切る', hint('既定は切らない＝🚫 は「やった／やっていない」とは別の第3の状態（Way of Life・Loop）')),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.notify ?? false, onchange: async (e: Event) => { const on = (e.target as HTMLInputElement).checked; if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { (e.target as HTMLInputElement).checked = false; alert('通知が許可されませんでした'); return; } } st.notify = on; void repo.persist(); } }), ' 長く走りすぎたら OS の通知でも知らせる', hint('上限は種目ごと（✏️ の「進行中の上限」・既定 180 分）。画面の上の1行には設定に関係なく出る')),

      h('h3', null, '🤖 AI（BYOK＝本人の鍵）'),
      h('p', { class: 'hint' }, '🧾 レシート・🍽 食事の写真を読ませるための鍵。鍵は**この端末の中だけ**に置き、AI の会社（Anthropic か Google）へ端末から直接送ります。このアプリのサーバは無い＝どこにも保存されません。数値（カロリー等）は作らせません。'),
      field('呼び先', h('select', { onchange: (e: Event) => { const p = (e.target as HTMLSelectElement).value as AiProvider; st.ai = { provider: p, key: st.ai?.key ?? '', model: AI_DEFAULT_MODEL[p] }; void repo.persist(); draw(); } },
        (Object.keys(AI_PROVIDER_LABEL) as AiProvider[]).map((p) => h('option', { value: p, selected: (st.ai?.provider ?? 'anthropic') === p }, AI_PROVIDER_LABEL[p])))),
      field('API キー', h('input', { type: 'password', value: st.ai?.key ?? '', placeholder: 'sk-ant-… / AIza…', oninput: (e: Event) => { st.ai = { provider: st.ai?.provider ?? 'anthropic', model: st.ai?.model ?? AI_DEFAULT_MODEL.anthropic, key: (e.target as HTMLInputElement).value.trim() }; void repo.persist(); } })),
      field('モデル', h('input', { value: st.ai?.model ?? AI_DEFAULT_MODEL.anthropic, oninput: (e: Event) => { if (st.ai) { st.ai.model = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } } }), hint('空なら既定（Anthropic: claude-sonnet-5 ／ Gemini: gemini-2.5-flash）')),
      h('div', { class: 'btns' }, h('button', { onclick: async () => { if (!st.ai?.key) { alert('鍵を入れてください'); return; } try { alert(`接続 OK: ${await pingAi(st.ai)}`); } catch (e) { alert(`⚠ ${(e as Error).message}`); } } }, '接続確認'),
        st.ai?.key ? h('button', { class: 'danger', onclick: () => { if (confirm('鍵をこの端末から消しますか？')) { st.ai = undefined; void repo.persist(); draw(); } } }, '鍵を消す') : null),

      h('h3', null, '🗓 休み（有給・夏休みなど）'),
      h('p', { class: 'hint' }, '🔁 の「平日」「休日」「週の最初の平日」の判定に効きます（土日と日本の祝日は入れなくてよい）。1行に1日 YYYY-MM-DD。'),
      h('textarea', { rows: 3, value: repo.db.holidays.join('\n'), onchange: (e: Event) => { repo.db.holidays = (e.target as HTMLTextAreaElement).value.split(/\s+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)); void repo.persist(); } }),

      h('h3', null, '☁ 保存場所（外の写し）'),
      h('p', { class: 'hint' }, '記録はいつも端末の中にあり、ここで選んだ所に**写し**を置きます。開いたときに外の方が新しければ取り込み、保存のたびに数秒後に押し出します（新しい方が勝つ）。'),
      h('div', { class: 'btns' }, ([['local', '端末のみ'], ['drive', 'Google ドライブ'], ['supabase', 'Supabase']] as [StorageKind, string][]).map(([k, l]) =>
        h('button', { class: (st.storage?.kind ?? 'local') === k ? 'on' : '', onclick: () => { st.storage = { ...(st.storage ?? { kind: 'local' }), kind: k }; void repo.persist(); draw(); } }, l))),
      (st.storage?.kind === 'drive') ? [
        field('Client ID', h('input', { value: st.storage.driveClientId ?? '', placeholder: '….apps.googleusercontent.com', oninput: (e: Event) => { st.storage!.driveClientId = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } }),
          hint('Google Cloud → 認証情報 → OAuth クライアント ID（ウェブ）。承認済み JavaScript 生成元に このページの https://…（Pages と localhost）を足す。権限は drive.file（このアプリが作ったファイルだけ）')),
        field('フォルダ', h('input', { value: st.storage.driveFolder ?? '', placeholder: 'https://drive.google.com/drive/folders/…（URL か ID）', oninput: (e: Event) => { st.storage!.driveFolder = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } }),
          hint('ここに koma.json（と SQLite）を置く。ドキュメント（文書）ではなくフォルダを指定する')),
      ] : null,
      (st.storage?.kind === 'supabase') ? [
        field('関数の場所', h('input', { value: st.storage.supabaseUrl ?? '', placeholder: 'https://xxxx.supabase.co', oninput: (e: Event) => { st.storage!.supabaseUrl = (e.target as HTMLInputElement).value.trim(); void repo.persist(); } })),
        field('合言葉', h('input', { type: 'password', value: st.storage.supabaseSecret ?? '', oninput: (e: Event) => { st.storage!.supabaseSecret = (e.target as HTMLInputElement).value; void repo.persist(); } }),
          hint('Edge Function koma-store の Secret KOMA_SECRET と同じ文字列。送るのは「何かを保存した3秒後」「開いたとき」「今 合わせる を押したとき」')),
      ] : null,
      (st.storage?.kind ?? 'local') !== 'local' ? field('送る期間', h('div', { class: 'btns' }, ([[31, '直近1か月'], [92, '3か月'], [366, '1年'], [null, 'すべて']] as [number | null, string][]).map(([d, l]) =>
        h('button', { class: (st.storage?.windowDays ?? null) === d ? 'on' : '', onclick: () => { st.storage!.windowDays = d; void repo.persist(); draw(); } }, l))),
        hint(`記録のうち、外に送るのはこの期間のぶんだけ（種目・⭐・🔁・設定はいつも全部）。それより前の記録は端末に残り、取り込みでも消えません。まとめて分析したいときだけ「1年」や「すべて」にして送り、終わったら戻す。Supabase には**前回送ってから変わった記録だけ**（差分）を送り、開いたときも外が新しいときだけ落とす。いま送る記録＝${(() => { const d = st.storage?.windowDays; if (!d) return repo.db.entries.length; const from = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); return repo.db.entries.filter((e) => e.date >= from || (e.actualDate ?? '') >= from).length; })()} / ${repo.db.entries.length} 件`)) : null,
      (st.storage?.kind ?? 'local') !== 'local' ? h('div', { class: 'inline' },
        h('button', { class: 'primary', onclick: async () => { const r = await syncer.pullIfNewer(true); alert(r === 'pulled' ? '外の写しを取り込みました' : r === 'pushed' ? '端末の内容を外へ保存しました' : r === 'same' ? '同じでした' : st.storage?.lastError ? '接続できませんでした（下の赤い文字を見てください）' : '何もしませんでした'); m.close(); ctx.render(); } }, '☁ 今 合わせる'),
        h('small', null, st.storage?.lastSync ? `最後 ${st.storage.lastSync.slice(5, 16).replace('T', ' ')}` : 'まだ合わせていない'),
        st.storage?.lastError ? h('small', { class: 'errs' }, `⚠ ${st.storage.lastError}`) : null) : null,

      h('h3', null, '📝 振り返りの要約（AI に渡す読み物）'),
      h('p', { class: 'hint' }, '直近7日ぶんを、種目ごと・時刻と長さと印つきの短い文章にしたもの。送るたびに作り直して、Supabase の koma_docs.review（Google ドライブなら koma-review.md）に置きます。AI はこれだけ読めば足ります。'),
      h('div', { class: 'btns' }, ([7, 14, 31] as const).map((n) => h('button', { onclick: () => {
        const r = buildReview(repo, todayYMD(), n); const ta = h('textarea', { rows: 18, value: r.text, readOnly: true, style: { fontFamily: 'ui-monospace, monospace', fontSize: '12px' } });
        modal(`📝 振り返りの要約（${n}日・${r.text.length.toLocaleString()} 文字）`, h('div', null, ta, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => { try { await navigator.clipboard.writeText(r.text); alert('コピーしました'); } catch { ta.select(); } } }, '📋 コピー'))), { wide: true });
      } }, `${n}日ぶんを見る`))),

      h('h3', null, 'データ'),
      h('div', { class: 'btns' },
        h('button', { onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([repo.exportJson()], { type: 'application/json' })); a.download = `koma-${new Date().toISOString().slice(0, 10)}.json`; a.click(); } }, '⬇ JSON で書き出す'),
        h('button', { title: 'SQLite のファイル（DB Browser や Python で読める）。写真の中身は入らない', onclick: async () => { try { const u8 = await exportSqlite(repo.db); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8.buffer as ArrayBuffer], { type: 'application/x-sqlite3' })); a.download = `koma-${new Date().toISOString().slice(0, 10)}.sqlite`; a.click(); } catch (e) { alert(`⚠ ${(e as Error).message}`); } } }, '⬇ SQLite で書き出す'),
        st.storage?.kind === 'drive' ? h('button', { title: '選んだフォルダに koma.sqlite を置く', onclick: async () => { try { const u8 = await exportSqlite(repo.db); await new DriveTarget(st.storage!).putExtra('koma.sqlite', new Blob([u8.buffer as ArrayBuffer], { type: 'application/x-sqlite3' }), 'application/x-sqlite3'); alert('Google ドライブに koma.sqlite を置きました'); } catch (e) { alert(`⚠ ${(e as Error).message}`); } } }, '☁ SQLite を Drive へ') : null,
        h('button', { onclick: () => { const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => { const f = inp.files?.[0]; if (!f) return; try { repo.importJson(await f.text()); alert('読み込みました'); m.close(); ctx.render(); } catch (e) { alert(`読めませんでした: ${(e as Error).message}`); } } }); inp.click(); } }, '⬆ JSON を読み込む'),
        h('button', { class: 'danger', onclick: () => { if (confirm('記録・種目・⭐・🔁 を全部消して、見本に戻します。よいですか？')) { repo.reset(() => seedDb()); m.close(); ctx.render(); } } }, '見本に戻す')),
      h('p', { class: 'hint' }, `記録 ${repo.db.entries.length} 件 · ⭐ ${repo.db.templates.length} · 🔁 ${repo.db.rules.length}（本体はこの端末の中。外の写しは上の ☁ 保存場所）`));
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
      field('合図の別名', h('input', { value: (d.aliases ?? []).join('、'), placeholder: 'ざぜん、meditation', oninput: (e: Event) => { d.aliases = (e.target as HTMLInputElement).value.split(/[、,\s]+/).map((x) => x.trim()).filter(Boolean); } }), hint('全体入力で「ざぜん開始」と言ったときにこの種目に入る')),
      field('使うもの',
        chk('✅ やった／🚫 やらなかった／🔀 代わりに', () => d.features.done, (v) => { d.features.done = v; }, 'やること・運動のように「やる／やらない」がある種目'),
        chk('📷 写真を付ける', () => d.features.photos, (v) => { d.features.photos = v; }, '食事のように写真そのものが記録になる種目'),
        chk('📅 時刻つきの記録を Google カレンダーに出せる', () => d.features.calendar, (v) => { d.features.calendar = v; }, '記録ごとに出す／出さないを選べる'),
        chk('「実際」を主にする', () => d.features.actualFirst, (v) => { d.features.actualFirst = v; }, '食事のように、食べた時刻で枡を決める（外すと予定の時刻で決める）'),
        chk('一日一回（1タップで ✅／🚫）', () => Boolean(d.features.daily), (v) => { d.features.daily = v; }, '座禅・薬のように「その日やったか」だけを付ける種目。週・月の升目が1タップの印になる。時刻やメモは「…」から足せる'),
        field('⏵ 進行中の上限', h('div', { class: 'inline' }, h('input', { type: 'number', min: 0, step: 30, value: d.features.maxRunMin === null ? '' : (d.features.maxRunMin ?? 180), placeholder: '聞かない', style: { width: '5em' }, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); d.features.maxRunMin = (e.target as HTMLInputElement).value === '' || v <= 0 ? null : v; } }), '分', hint('これを超えて走っていたら「まだ続いていますか？」と聞く。空＝聞かない'))),
        field('🤖 写真を AI に読ませる', h('select', { onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; d.features.ai = v === '' ? null : (v as 'receipt' | 'meal'); } },
          [['', '読ませない'], ['receipt', '🧾 レシートとして（店・日時・合計・品目）'], ['meal', '🍽 食事として（要約・料理・出どころ）']].map(([v, l]) => h('option', { value: v, selected: (d.features.ai ?? '') === v }, l))))),
      h('h4', null, '枡（時間帯）'),
      h('p', { class: 'hint' }, '時刻で決まる枡＝「始まり」を入れる（終わりは次の枡の始まりまで。終わりを早めて隙間を作ると、その時刻の記録は受け皿へ）。時刻で決まらない枡（時間帯なし・間食）＝始まりを空にする＝選んだときだけ入る。'),
      h('table', { class: 'slotsEd' },
        h('thead', null, h('tr', null, h('th', null, '絵'), h('th', null, '呼び名'), h('th', null, '始まり'), h('th', null, '終わり'), h('th', null, '並び'), h('th'))),
        h('tbody', null, rows)),
      h('div', { class: 'btns' },
        h('button', { onclick: () => { d.slots.push({ key: newKey(), label: '新しい枡', icon: '⬜', startMin: 12 * 60 }); draw(); } }, '＋ 時刻で決まる枡'),
        h('button', { onclick: () => { d.slots.push({ key: newKey(), label: '新しい枡', icon: '⬜', startMin: null }); draw(); } }, '＋ 選んだ時だけの枡'),
        h('button', { title: '朝（日の出の30分前）／昼・午後（昼を3等分）／夜（日の入り）／深夜（夜を2等分・0:00 をまたいで朝まで）に置き換える', onclick: () => { if (!confirm('いまの「時刻で決まる枡」を、☀ で決まる5つの枡（朝／昼／午後／夜／深夜）に置き換えますか？\n記録は消えません（読むときに並び直るだけ）。「選んだ時だけ」の枡は残します。')) return; const keep = d.slots.filter((s) => s.startMin == null); d.slots = [...keep, { key: newKey() + 'a', label: '朝', icon: '🌅', startMin: 300, sun: { base: 'sunrise', offsetMin: -30 } }, { key: newKey() + 'b', label: '昼', icon: '☀️', startMin: 600, sun: { base: 'daylight', num: 1, den: 3 } }, { key: newKey() + 'c', label: '午後', icon: '🌇', startMin: 840, sun: { base: 'daylight', num: 2, den: 3 } }, { key: newKey() + 'd', label: '夜', icon: '🌙', startMin: 1080, sun: { base: 'sunset', offsetMin: 0 } }, { key: newKey() + 'e', label: '深夜', icon: '🌌', startMin: 1410, sun: { base: 'night', num: 1, den: 2 } }]; draw(); } }, '☀ 太陽で切る枡にする')),
      field('受け皿', h('select', { onchange: (e: Event) => { d.fallbackKey = (e.target as HTMLSelectElement).value; } },
        d.slots.map((s) => h('option', { value: s.key, selected: s.key === d.fallbackKey }, `${s.icon} ${s.label}`))),
        hint('時刻も選択も無い記録、どの時間帯にも当たらない時刻の記録、消した枡に入っていた記録が落ちる所')),
      errs.length ? h('ul', { class: 'errs' }, errs.map((x) => h('li', null, x))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => { errs = validateSlots(d.slots, d.fallbackKey); if (!d.name.trim()) errs.unshift('名前を入れてください'); if (errs.length) { draw(); return; } for (const s of d.slots) if (s.sun) s.startMin = startOf(s) ?? s.startMin; repo.saveTrack(d); m.close(); onSaved(); } }, '保存'),
        h('span', { class: 'sp' }), h('button', { onclick: m.close }, '閉じる')));
  };
  /** 始まりの決め方＝時刻／☀ 日の出・日の入り（±分）／☀ 昼を N 等分した何番目。☀ は今日の時刻を横に出す */
  const startCell = (s: SlotDef) => {
    const mode = !s.sun ? 'time' : s.sun.base;
    const sel = h('select', { onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      s.sun = v === 'time' ? null : v === 'daylight' || v === 'night' ? { base: v, num: 1, den: v === 'night' ? 2 : 3 } : { base: v as 'sunrise' | 'sunset', offsetMin: 0 };
      draw();
    } }, ([['time', '🕐 時刻'], ['sunrise', '🌅 日の出'], ['sunset', '🌇 日の入り'], ['daylight', '☀ 昼を等分'], ['night', '🌙 夜を等分']] as const).map(([v, l]) => h('option', { value: v, selected: v === mode }, l)));
    const num = (val: number, set: (n: number) => void, attrs: Record<string, unknown>) => h('input', { type: 'number', value: val, style: { width: '4.5em' }, ...attrs, onchange: (e: Event) => { set(Number((e.target as HTMLInputElement).value) || 0); draw(); } });
    const today = s.sun ? startOf(s) : null;
    return [sel,
      !s.sun ? timeInput(s.startMin, (v) => { s.startMin = v ?? 0; })
        : 'num' in s.sun ? h('span', { class: 'inline' }, num(s.sun.den, (n) => { if (s.sun && 'den' in s.sun) s.sun.den = n; }, { min: 2, max: 12 }), '等分の', num(s.sun.num, (n) => { if (s.sun && 'num' in s.sun) s.sun.num = n; }, { min: 0, max: 12 }), 'つ目')
        : h('span', { class: 'inline' }, num(s.sun.offsetMin, (n) => { if (s.sun && 'offsetMin' in s.sun) s.sun.offsetMin = n; }, { step: 5, min: -360, max: 360 }), '分（−＝前）'),
      s.sun ? hint(`${describeSun(s.sun)}＝今日は ${today != null ? fmtMin(today) : '—'}（日で変わる・5分刻み）`) : null];
  };
  const slotRow = (s: SlotDef, i: number) => {
    const timed = s.startMin != null;
    return h('tr', null,
      h('td', null, h('input', { value: s.icon, style: { width: '2.5em' }, oninput: (e: Event) => { s.icon = (e.target as HTMLInputElement).value; } })),
      h('td', null, h('input', { value: s.label, oninput: (e: Event) => { s.label = (e.target as HTMLInputElement).value; } }), h('small', { class: 'sub' }, s.key)),
      h('td', null, timed ? startCell(s) : h('button', { class: 'ghost', title: '時刻で決まる枡にする', onclick: () => { s.startMin = 12 * 60; draw(); } }, '選んだ時だけ')),
      h('td', null, timed ? [timeInput(s.endMin ?? null, (v) => { s.endMin = v; }), hint('空＝次の枡まで')] : h('button', { class: 'ghost', onclick: () => { s.startMin = null; s.endMin = null; draw(); } }, '時刻なしに戻す')),
      h('td', null, h('button', { disabled: i === 0, onclick: () => { [d.slots[i - 1], d.slots[i]] = [d.slots[i], d.slots[i - 1]]; draw(); } }, '↑'), h('button', { disabled: i === d.slots.length - 1, onclick: () => { [d.slots[i + 1], d.slots[i]] = [d.slots[i], d.slots[i + 1]]; draw(); } }, '↓')),
      h('td', null, h('button', { class: 'danger', title: 'この枡を消す（入っていた記録は受け皿に読み直る・記録は消えない）', onclick: () => { if (confirm(`「${s.label}」を消しますか？入っていた記録は消えず、受け皿の枡に読み直ります。`)) { d.slots.splice(i, 1); if (d.fallbackKey === s.key) d.fallbackKey = d.slots[0]?.key ?? ''; draw(); } } }, '🗑')));
  };
  draw();
}
