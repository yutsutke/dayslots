/* 台帳（Repo）＝画面が呼ぶ操作を全部ここに置く（✅／🚫／🔀、⭐、🔁 の規則）。
 *  規則の出どころはライフログの Edge Function（todos / meals）。写した約束:
 *   ・✅ と 🚫 は1行で両立しない＝片方を立てるとき、もう片方を消す（戻すときは触らない）
 *   ・🔀 代わりに＝元は 🚫 で閉じ、代わりの側だけが元を指す（元の側に印を持たない）
 *   ・🔁 自動の規則は「今日まで」しか記録にしない（未来には作らない＝まだやっていない）
 *   ・(ruleId, ruleDate) は1組1行＝開くたびに増えない
 *   ・⭐ の「使った回数・最後に使った日」は保存せず記録から数える
 *   ・型（⭐）や規則（🔁）を消しても、そこから作った記録は残る
 */
import type { Db, Entry, Track, Template, Rule, YMD, TrackKind, Timer } from '../domain/types';
import type { Store } from '../store/store';
import { occurrences, type Occurrence } from '../domain/recur';
import { todayYMD, addDays } from '../domain/dates';
import { PRESETS } from '../domain/defaults';
import { durationOf, primaryMinute, getSunPlace } from '../domain/slots';
import { viewDateOf, viewToday, MIDNIGHT, type DayStart } from '../domain/viewday';
import { parseSignal, resolve, type Signal } from '../domain/signal';
import { nowMinute } from '../domain/dates';

const nowIso = () => new Date().toISOString();
export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const byOrder = (a: Entry, b: Entry) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

export class Repo {
  constructor(public db: Db, private store: Store, private today: () => YMD = todayYMD) {}
  static async open(store: Store, seed: () => Db, today?: () => YMD): Promise<Repo> {
    const db = (await store.load()) ?? seed();
    return new Repo(db, store, today);
  }
  /** 保存のたびに呼ばれる係（同期の予約など）。画面の起動時に差し込む */
  onPersist: (() => void) | null = null;
  persist(): Promise<void> { this.db.savedAt = nowIso(); const p = this.store.save(this.db); this.onPersist?.(); return p; }
  /** 端末にだけ書く（savedAt を進めない・同期も予約しない）＝同期の係が「送れた」印を残すとき用 */
  persistQuiet(): Promise<void> { return this.store.save(this.db); }
  /** 消した記録の id を控える（差分で「消した」を外に伝えるため。送れたら同期の係が空にする） */
  private tomb(ids: string[]): void { if (ids.length) this.db.deleted = [...(this.db.deleted ?? []), ...ids]; }
  /** 種目の並べ替え＝前後と入れ替える（畳んだものは飛ばさない＝⚙ の一覧の並びそのまま） */
  moveTrack(id: string, dir: -1 | 1): void {
    const list = [...this.db.tracks].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((t) => t.id === id); const k = i + dir;
    if (i < 0 || k < 0 || k >= list.length) return;
    [list[i], list[k]] = [list[k], list[i]];
    list.forEach((t, n) => { t.sortOrder = n; });
    void this.persist();
  }
  /** 種目を消す（畳んだものだけ・記録も消える＝画面で数を言ってから） */
  deleteTrack(id: string): void {
    this.tomb(this.db.entries.filter((e) => e.trackId === id).map((e) => e.id));
    this.db.tracks = this.db.tracks.filter((t) => t.id !== id);
    this.db.entries = this.db.entries.filter((e) => e.trackId !== id);
    this.db.templates = this.db.templates.filter((t) => t.trackId !== id);
    this.db.rules = this.db.rules.filter((r) => r.trackId !== id);
    void this.persist();
  }

  // ── 種目 ──────────────────────────────────────────────
  get tracks(): Track[] { return this.db.tracks.filter((t) => !t.archived).sort((a, b) => a.sortOrder - b.sortOrder); }
  track(id: string): Track { const t = this.db.tracks.find((x) => x.id === id); if (!t) throw new Error(`種目がありません: ${id}`); return t; }
  saveTrack(t: Track): void { const i = this.db.tracks.findIndex((x) => x.id === t.id); if (i < 0) this.db.tracks.push(t); else this.db.tracks[i] = t; void this.persist(); }
  addTrackFromPreset(kind: TrackKind, name?: string): Track {
    const p = structuredClone(PRESETS[kind]);
    const t: Track = { ...p, id: uid(), name: name ?? p.name, sortOrder: this.db.tracks.length, archived: false };
    this.db.tracks.push(t); void this.persist(); return t;
  }

  // ── 記録 ──────────────────────────────────────────────
  entry(id: string): Entry | undefined { return this.db.entries.find((e) => e.id === id); }
  private mustEntry(id: string): Entry { const e = this.entry(id); if (!e) throw new Error(`記録がありません: ${id}`); return e; }
  /** 1日の始まり（⚙）。0:00／日の出／日の入り */
  get dayStart(): DayStart { return this.db.settings.dayStart ?? MIDNIGHT; }
  /** その記録を**どの日に見せるか**＝暦の日付と主な時刻から、1日の始まりの設定で決める（記録は書き換えない）。0:00 始まりなら date そのまま */
  viewDate(e: Entry): YMD {
    const ds = this.dayStart; if (ds.base === 'midnight') return e.date;
    const t = this.db.tracks.find((x) => x.id === e.trackId); if (!t) return e.date;
    return viewDateOf(e.date, primaryMinute(t, e), ds, getSunPlace());
  }
  /** いまは「どの日」か（日の出始まりで未明なら、まだ前の日） */
  viewToday(): YMD { const ds = this.dayStart; return ds.base === 'midnight' ? this.today() : viewToday(ds, getSunPlace()); }
  /** 期間の記録。⚠ 期間は「見せる日」で切る＝1日の始まりが日の出なら、未明の記録は前の日のぶんとして返る */
  entriesFor(trackId: string, from: YMD, to: YMD): Entry[] {
    if (this.dayStart.base === 'midnight') return this.db.entries.filter((e) => e.trackId === trackId && e.date >= from && e.date <= to).sort(byOrder);
    const lo = addDays(from, -1), hi = addDays(to, 1); // 見せる日は暦の日から高々1日しかずれない
    return this.db.entries.filter((e) => { if (e.trackId !== trackId || e.date < lo || e.date > hi) return false; const v = this.viewDate(e); return v >= from && v <= to; }).sort(byOrder);
  }
  blankEntry(trackId: string, init: Partial<Entry> = {}): Entry {
    const t = nowIso();
    return {
      id: uid(), trackId, date: this.today(), slotKey: null, planStart: null, planEnd: null,
      actualDate: null, actualStart: null, actualEnd: null, doneAt: null, skippedAt: null, insteadOfId: null,
      title: '', note: null, priority: 0, tag: null, templateId: null, ruleId: null, ruleDate: null,
      photos: [], payload: {}, calendar: false, sortOrder: 0, createdAt: t, updatedAt: t, ...init,
    };
  }
  addEntry(trackId: string, init: Partial<Entry> = {}): Entry {
    const e = this.blankEntry(trackId, init);
    e.sortOrder = this.db.entries.filter((x) => x.trackId === trackId && x.date === e.date).length;
    this.db.entries.push(e); void this.persist(); return e;
  }
  updateEntry(id: string, patch: Partial<Entry>): Entry {
    const e = this.mustEntry(id); Object.assign(e, patch, { id: e.id, updatedAt: nowIso() }); void this.persist(); return e;
  }
  upsertEntry(e: Entry): Entry { if (this.entry(e.id)) return this.updateEntry(e.id, e); this.db.entries.push({ ...e }); void this.persist(); return e; }
  deleteEntry(id: string): void {
    this.tomb([id]);
    this.db.entries = this.db.entries.filter((e) => e.id !== id);
    for (const e of this.db.entries) if (e.insteadOfId === id) e.insteadOfId = null;
    this.db.calendarMap = this.db.calendarMap.filter((m) => m.entryId !== id);
    void this.persist();
  }
  /** ✅ やった。立てるときは 🚫 を消す。実際の日が空なら「その日」を入れる（時刻は入れない＝分からないものを作らない） */
  setDone(id: string, on: boolean): Entry {
    const e = this.mustEntry(id);
    const patch: Partial<Entry> = { doneAt: on ? nowIso() : null };
    if (on) { patch.skippedAt = null; if (!e.actualDate) patch.actualDate = e.date; }
    return this.updateEntry(id, patch);
  }
  /** 🚫 やらないと決めた（薄く残す）。立てるときは ✅ を消す */
  setSkipped(id: string, on: boolean): Entry {
    const patch: Partial<Entry> = { skippedAt: on ? nowIso() : null };
    if (on) patch.doneAt = null;
    return this.updateEntry(id, patch);
  }
  /** 🔀 代わりにこれをやった */
  doInstead(ofId: string, title: string): Entry {
    const src = this.mustEntry(ofId);
    this.setSkipped(ofId, true);
    return this.addEntry(src.trackId, {
      date: src.date, slotKey: src.slotKey, planStart: src.planStart, planEnd: src.planEnd, planDur: src.planDur ?? null, title,
      insteadOfId: ofId, doneAt: nowIso(), actualDate: src.date, calendar: src.calendar,
    });
  }
  insteadFor(id: string): Entry | undefined { return this.db.entries.find((e) => e.insteadOfId === id); }

  // ── 一日一回（座禅など）＝その日の1件を ✅ → 🚫 → なし と1タップで回す ──
  dayEntry(trackId: string, date: YMD): Entry | undefined { return this.entriesFor(trackId, date, date)[0]; }
  /** 詳細（時刻・メモ・写真・名前の変更）が入っているか＝入っていれば「なし」に戻しても行を消さない */
  hasDetails(e: Entry): boolean {
    const t = this.track(e.trackId);
    return Boolean(e.note) || e.planStart != null || e.actualStart != null || e.planDur != null || e.actualDur != null || e.photos.length > 0 || e.title !== t.name;
  }
  /** なし → ✅ → 🚫 → なし。戻り＝いまの行（消したら null） */
  toggleDay(trackId: string, date: YMD): Entry | null {
    const t = this.track(trackId); const e = this.dayEntry(trackId, date);
    if (!e) return this.addEntry(trackId, { date, title: t.name, doneAt: nowIso(), actualDate: date, calendar: false });
    if (e.doneAt) return this.setSkipped(e.id, true);
    if (e.skippedAt) { if (this.hasDetails(e)) return this.setSkipped(e.id, false); this.deleteEntry(e.id); return null; }
    return this.setDone(e.id, true);
  }
  /** 連続 ✅ の日数（upTo から後ろへ数える）。
   *  ・upTo 当日が未記録なら前日から数える（今日まだやっていなくても途切れ扱いにしない）
   *  ・🚫「やらなかった」は既定で**飛ばす**（連続を切らない第3の状態＝Way of Life の Skip／Loop の Skip）。⚙ で「切る」にもできる */
  streak(trackId: string, upTo: YMD): number {
    const breaks = this.db.settings.skipBreaksStreak ?? false;
    let d = upTo, n = 0;
    const e0 = this.dayEntry(trackId, d);
    if (!e0?.doneAt && !(e0?.skippedAt && !breaks)) d = addDays(d, -1);
    for (let guard = 0; guard < 3660; guard++) {
      const e = this.dayEntry(trackId, d);
      if (e?.doneAt) n++;
      else if (e?.skippedAt && !breaks) { /* 飛ばす */ }
      else break;
      d = addDays(d, -1);
    }
    return n;
  }

  // ── ⭐ いつもの ────────────────────────────────────────
  templatesFor(trackId: string): Template[] {
    const key = (t: Template) => this.templateUsage(t.id).last ?? t.createdAt.slice(0, 10);
    return this.db.templates.filter((t) => t.trackId === trackId).sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }
  templateUsage(id: string): { count: number; last: YMD | null } {
    const es = this.db.entries.filter((e) => e.templateId === id);
    return { count: es.length, last: es.reduce<YMD | null>((m, e) => (!m || e.date > m ? e.date : m), null) };
  }
  templateFromEntry(e: Entry, name?: string): Template {
    const t = nowIso();
    const tpl: Template = {
      id: uid(), trackId: e.trackId, name: name ?? e.title, slotKey: e.slotKey, title: e.title, note: e.note,
      payload: structuredClone(e.payload), photos: [...e.photos], planStart: e.planStart, planEnd: e.planEnd, planDur: e.planDur ?? null,
      calendar: e.calendar, sortOrder: this.db.templates.length, createdAt: t, updatedAt: t,
    };
    this.db.templates.push(tpl); void this.persist(); return tpl;
  }
  saveTemplate(tpl: Template): void {
    const i = this.db.templates.findIndex((x) => x.id === tpl.id); tpl.updatedAt = nowIso();
    if (i < 0) this.db.templates.push(tpl); else this.db.templates[i] = tpl; void this.persist();
  }
  deleteTemplate(id: string): void {
    this.db.templates = this.db.templates.filter((t) => t.id !== id);
    for (const e of this.db.entries) if (e.templateId === id) e.templateId = null;
    void this.persist();
  }
  /** ⭐ を記録に写す。呼んだ先の枡（slotKey 引数）が勝つ。写真は共有 */
  applyTemplate(tpl: Template, into: Entry, slotKey?: string | null): Entry {
    into.title = tpl.title; into.note = tpl.note; into.payload = structuredClone(tpl.payload); into.photos = [...tpl.photos];
    into.templateId = tpl.id;
    if (slotKey !== undefined) into.slotKey = slotKey; else if (into.slotKey == null) into.slotKey = tpl.slotKey;
    if (into.planStart == null) { into.planStart = tpl.planStart; into.planEnd = tpl.planEnd; }
    if (into.planDur == null && tpl.planDur != null) into.planDur = tpl.planDur;
    if (tpl.calendar) into.calendar = true;
    return into;
  }
  entryFromTemplate(tpl: Template, date: YMD, slotKey?: string | null): Entry {
    const e = this.blankEntry(tpl.trackId, { date });
    this.applyTemplate(tpl, e, slotKey);
    this.db.entries.push(e); void this.persist(); return e;
  }

  // ── 🔁 繰り返し ────────────────────────────────────────
  rulesFor(trackId: string): Rule[] { return this.db.rules.filter((r) => r.trackId === trackId).sort((a, b) => a.sortOrder - b.sortOrder); }
  blankRule(trackId: string, init: Partial<Rule> = {}): Rule {
    const t = nowIso();
    return {
      id: uid(), trackId, title: '', note: null, payload: {}, templateId: null, freq: 'daily', byday: [], interval: null, half: null,
      dayFrom: null, dayTo: null, startDate: this.today(), endDate: null, slotKey: null, planStart: null, planEnd: null,
      priority: 0, tag: null, auto: false, active: true, calendar: false, exceptions: {}, sortOrder: this.db.rules.length, createdAt: t, updatedAt: t, ...init,
    };
  }
  saveRule(r: Rule): void {
    const i = this.db.rules.findIndex((x) => x.id === r.id); r.updatedAt = nowIso();
    if (i < 0) this.db.rules.push(r); else this.db.rules[i] = r; void this.persist();
  }
  deleteRule(id: string): void {
    this.db.rules = this.db.rules.filter((r) => r.id !== id);
    for (const e of this.db.entries) if (e.ruleId === id) e.ruleId = null;
    void this.persist();
  }
  occurrencesFor(trackId: string, from: YMD, to: YMD): Occurrence[] { return occurrences(this.rulesFor(trackId), from, to, this.db.holidays); }
  entryOfOccurrence(o: Occurrence): Entry | undefined { return this.db.entries.find((e) => e.ruleId === o.ruleId && e.ruleDate === o.date); }
  /** 薄く出す回＝「確認してから」の規則で、まだ記録になっていない回 */
  ghostsFor(trackId: string, from: YMD, to: YMD): Occurrence[] {
    const rules = new Map(this.rulesFor(trackId).map((r) => [r.id, r]));
    return this.occurrencesFor(trackId, from, to).filter((o) => !rules.get(o.ruleId)?.auto && !this.entryOfOccurrence(o));
  }
  /** 回を記録にする（既にあればそれを返す＝二重に作らない） */
  materialize(o: Occurrence): Entry {
    const hit = this.entryOfOccurrence(o); if (hit) return hit;
    const r = this.db.rules.find((x) => x.id === o.ruleId); if (!r) throw new Error('その繰り返しはありません');
    return this.addEntry(r.trackId, {
      date: o.date, title: o.title, note: o.note, slotKey: o.slotKey, planStart: o.planStart, planEnd: o.planEnd, planDur: r.planDur ?? null,
      priority: o.priority, tag: o.tag, ruleId: o.ruleId, ruleDate: o.date, templateId: r.templateId,
      payload: structuredClone(r.payload), calendar: r.calendar,
    });
  }
  /** 自動の規則を「今日まで」記録にする。戻り＝作った数 */
  ensureAuto(from: YMD, to: YMD): number {
    const today = this.today(); const hi = to < today ? to : today;
    if (from > hi) return 0;
    let n = 0;
    for (const r of this.db.rules) {
      if (!r.auto || !r.active) continue;
      for (const o of occurrences([r], from, hi, this.db.holidays)) if (!this.entryOfOccurrence(o)) { this.materialize(o); n++; }
    }
    return n;
  }
  /** この回だけ「なし」＝例外に入れ、その回の記録があれば消す（記録が残らない＝🚫 未実行とは別物）。undo で戻す */
  skipOccurrence(ruleId: string, date: YMD, undo = false): void {
    const r = this.db.rules.find((x) => x.id === ruleId); if (!r) throw new Error('その繰り返しはありません');
    if (undo) delete r.exceptions[date];
    else { r.exceptions[date] = { ...(r.exceptions[date] ?? {}), del: true }; this.tomb(this.db.entries.filter((e) => e.ruleId === ruleId && e.ruleDate === date).map((e) => e.id)); this.db.entries = this.db.entries.filter((e) => !(e.ruleId === ruleId && e.ruleDate === date)); }
    r.updatedAt = nowIso(); void this.persist();
  }

  // ── 合図（全体入力／種目入力） ────────────────────────────
  /** ⏵ 進行中＝「開始」の合図で入って、まだ終わりも長さも無い記録。⚠ 手で「食べた時刻」だけ入れた食事などは進行中ではない＝合図の印（payload.signal='start'）で見分ける */
  isRunning(e: Entry): boolean { return e.payload.signal === 'start' && e.actualStart != null && e.actualEnd == null && e.actualDur == null && !e.skippedAt; }
  running(trackId?: string): Entry[] { return this.db.entries.filter((e) => this.isRunning(e) && (!trackId || e.trackId === trackId)).sort((a, b) => (a.date + String(a.actualStart).padStart(4, '0') < b.date + String(b.actualStart).padStart(4, '0') ? 1 : -1)); }
  /** 「終了」の相手＝同じ種目・同じ名前で進行中のもの（今日か昨夜）。無ければ undefined */
  openFor(trackId: string, title: string, today: YMD): Entry | undefined {
    const y = addDays(today, -1);
    return this.running(trackId).find((e) => e.title === title && (e.date === today || e.date === y));
  }
  /** 合図 → 記録。trackId を渡すと名前を解かない（種目の欄から）。戻り＝何が起きたか（画面の一言） */
  applySignal(text: string, trackId?: string): { kind: 'started' | 'ended' | 'done' | 'skipped' | 'added' | 'noted' | 'unresolved'; entry?: Entry; message: string } {
    const sig: Signal = parseSignal(text);
    const today = this.today(); const at = sig.time ?? nowMinute();
    // ⏵ 進行中があるとき、動詞も時刻も長さも無い言葉は**その記録のメモに積む**（「散歩開始」→「きれいな花」「鳥の声」→「散歩終了」）
    if (sig.verb === 'add' && sig.dur == null && sig.time == null) {
      const tmr = !trackId && !this.running()[0] ? this.runningTimers()[0] : undefined;
      if (tmr && !resolve(sig.name, this.tracks, this.db.templates)) { this.noteTimer(tmr.id, `${fmt(at)} ${sig.name || text.trim()}`); return { kind: 'noted', message: `📝 ⏵ なに未定の計測 にメモ「${sig.name || text.trim()}」` }; }
      const run = this.running(trackId)[0];
      if (run && (trackId || !resolve(sig.name, this.tracks, this.db.templates))) {
        const line = `${fmt(at)} ${sig.name || text.trim()}`;
        this.updateEntry(run.id, { note: [run.note, line].filter(Boolean).join('\n') });
        return { kind: 'noted', entry: run, message: `📝 ⏵ ${this.track(run.trackId).icon} ${run.title} にメモ「${sig.name || text.trim()}」` };
      }
    }
    let track: Track | undefined, title = sig.name, templateId: string | null = null;
    if (trackId) { track = this.track(trackId); if (!title) title = track.name; const r = sig.name ? resolve(sig.name, [track], this.db.templates.filter((t) => t.trackId === trackId)) : null; if (r?.template) { templateId = r.template.id; title = r.title; } }
    else {
      const r = resolve(sig.name, this.tracks, this.db.templates);
      if (!r) { const item = { id: uid(), text, at: nowIso(), date: today }; (this.db.inbox ??= []).push(item); void this.persist(); return { kind: 'unresolved', message: `「${sig.name || text}」がどの種目か分かりませんでした → 未振り分けに置きました` }; }
      track = r.track; title = r.title; templateId = r.template?.id ?? null;
    }
    const t = track;
    const fresh = (more: Partial<Entry>): Entry => {
      const e = this.blankEntry(t.id, { date: today, title, templateId, payload: { signal: sig.verb }, ...more });
      const tpl = templateId ? this.db.templates.find((x) => x.id === templateId) : null;
      if (tpl) { e.note ??= tpl.note; e.payload = { ...structuredClone(tpl.payload), signal: sig.verb }; if (tpl.calendar) e.calendar = true; }
      this.db.entries.push(e); void this.persist(); return e;
    };
    const sameDay = () => this.entriesFor(t.id, today, today).find((e) => e.title === title && !this.isRunning(e)) ?? this.entriesFor(t.id, today, today).find((e) => e.title === title);
    const label = `${t.icon} ${title}`;
    switch (sig.verb) {
      case 'start': {
        // 「次を開始すると前が止まる」（Now Then）＝同じものが走っていれば二重に始めず、他の進行中は自動で終了（⚙ で切れる）
        const stopped = this.stopOthers(t.id, title, at);
        const e = fresh({ actualDate: today, actualStart: at, actualDur: sig.dur });
        return { kind: 'started', entry: e, message: `⏵ ${label} を ${fmt(at)} に開始${stopped.length ? `（${stopped.join('・')} を終了）` : ''}` };
      }
      case 'end': {
        const open = this.openFor(t.id, title, today);
        if (open) {
          const patch: Partial<Entry> = { actualEnd: at, payload: { ...open.payload, signal: 'pair' } };
          if (at < (open.actualStart as number)) { patch.actualEnd = 1440; patch.note = [open.note, `日をまたいだ終了 ${fmt(at)}`].filter(Boolean).join(' / '); }
          if (t.features.done) patch.doneAt = nowIso();
          this.updateEntry(open.id, patch);
          const dur = durationOf(open);
          return { kind: 'ended', entry: open, message: `⏹ ${label} を ${fmt(at)} に終了${dur ? `（${dur}分）` : ''}` };
        }
        const e = fresh({ actualDate: today, actualEnd: at, doneAt: t.features.done ? nowIso() : null });
        return { kind: 'ended', entry: e, message: `⏹ ${label} 終了 ${fmt(at)}（開始の合図が無かったので終わりだけ入れました）` };
      }
      case 'done': {
        const e = sameDay() ?? fresh({});
        this.updateEntry(e.id, { doneAt: nowIso(), skippedAt: null, actualDate: e.actualDate ?? today, actualDur: sig.dur ?? e.actualDur ?? null, actualStart: sig.time ?? e.actualStart, payload: { ...e.payload, signal: 'done' } });
        return { kind: 'done', entry: e, message: `✅ ${label}${sig.dur ? ` ${sig.dur}分` : ''}` };
      }
      case 'skip': {
        const e = sameDay() ?? fresh({});
        this.updateEntry(e.id, { skippedAt: nowIso(), doneAt: null, payload: { ...e.payload, signal: 'skip' } });
        return { kind: 'skipped', entry: e, message: `🚫 ${label} やらなかった` };
      }
      default: {
        // 動詞なし＝「散歩 30分」「散歩 8時から」「散歩」。長さか時刻があれば実際に入れる（言った＝やった）、無ければ予定として置く
        const e = fresh(sig.dur != null || sig.time != null
          ? { actualDate: today, actualStart: sig.time, actualDur: sig.dur, doneAt: t.features.done ? nowIso() : null }
          : {});
        return { kind: 'added', entry: e, message: `${label} を${sig.dur != null ? ` ${sig.dur}分で` : ''}${sig.time != null ? ` ${fmt(sig.time)} に` : ''} 入れました` };
      }
    }
  }
  /** 「次を開始すると前が止まる」＝他の進行中（記録も、なに未定の計測も）をその時刻で終了。⚙ で切ってあれば何もしない。戻り＝止めたものの名前 */
  private stopOthers(trackId: string | null, title: string | null, at: number): string[] {
    if (!(this.db.settings.autoStop ?? true)) return [];
    const stopped: string[] = [];
    for (const run of this.running()) {
      if (run.trackId === trackId && run.title === title) continue;
      this.stop(run.id, at); stopped.push(`${this.track(run.trackId).icon} ${run.title}`);
    }
    for (const tm of this.runningTimers()) { this.stopTimer(tm.id, at); stopped.push('⏱ なに未定'); }
    return stopped;
  }
  /** ▶ の候補＝その種目の ⭐ いつもの。無ければ種目の名前そのもの（座禅など）。1つなら選ばずに始められる */
  candidates(trackId: string): { title: string; templateId: string | null }[] {
    const t = this.track(trackId); const tpls = this.templatesFor(trackId);
    if (t.features.daily || !tpls.length) return [{ title: t.name, templateId: null }];
    return tpls.map((x) => ({ title: x.title || x.name, templateId: x.id }));
  }
  /** ▶ いまの時刻から始める（合図の「開始」と同じ結果。名前に「30分」などが入っていても解釈し直さない） */
  startNow(trackId: string, title: string, templateId: string | null = null, at: number = nowMinute()): { entry: Entry; message: string } {
    const t = this.track(trackId); const stopped = this.stopOthers(trackId, title, at);
    const tpl = templateId ? this.db.templates.find((x) => x.id === templateId) : null;
    const e = this.addEntry(trackId, { date: this.today(), title, templateId, actualDate: this.today(), actualStart: at, note: tpl?.note ?? null,
      payload: { ...(tpl ? structuredClone(tpl.payload) : {}), signal: 'start' }, calendar: Boolean(tpl?.calendar) });
    return { entry: e, message: `⏵ ${t.icon} ${title} を ${fmt(at)} に開始${stopped.length ? `（${stopped.join('・')} を終了）` : ''}` };
  }
  // ── ⏱ なに未定の計測（「⊞ すべて」の ▶）。最中でも、終わってからでも「なに」を決められる ──
  runningTimers(): Timer[] { return (this.db.timers ?? []).filter((x) => x.endMin == null); }
  finishedTimers(): Timer[] { return (this.db.timers ?? []).filter((x) => x.endMin != null); }
  startTimer(at: number = nowMinute()): { timer: Timer; message: string } {
    const stopped = this.stopOthers(null, null, at);
    const tm: Timer = { id: uid(), date: this.today(), startMin: at, endMin: null, note: null, createdAt: nowIso() };
    (this.db.timers ??= []).push(tm); void this.persist();
    return { timer: tm, message: `⏵ ${fmt(at)} に計り始めました（なに は後で決められます）${stopped.length ? `（${stopped.join('・')} を終了）` : ''}` };
  }
  stopTimer(id: string, at: number = nowMinute()): Timer {
    const tm = (this.db.timers ?? []).find((x) => x.id === id); if (!tm) throw new Error('その計測はありません');
    tm.endMin = Math.min(1440, Math.max(at, tm.startMin + 1)); void this.persist(); return tm;
  }
  noteTimer(id: string, line: string): void { const tm = (this.db.timers ?? []).find((x) => x.id === id); if (tm) { tm.note = [tm.note, line].filter(Boolean).join('\n'); void this.persist(); } }
  dropTimer(id: string): void { this.db.timers = (this.db.timers ?? []).filter((x) => x.id !== id); void this.persist(); }
  /** 「なに」を決める＝計測を記録にする。計っている最中なら ⏵ 進行中の記録に、終わっていれば 始まり〜終わり の入った記録（✅ を使う種目は ✅）に */
  assignTimer(id: string, trackId: string, title: string, templateId: string | null = null): Entry {
    const tm = (this.db.timers ?? []).find((x) => x.id === id); if (!tm) throw new Error('その計測はありません');
    const t = this.track(trackId); const tpl = templateId ? this.db.templates.find((x) => x.id === templateId) : null;
    const running = tm.endMin == null;
    const e = this.addEntry(trackId, { date: tm.date, title, templateId, actualDate: tm.date, actualStart: tm.startMin, actualEnd: tm.endMin,
      note: [tpl?.note, tm.note].filter(Boolean).join('\n') || null, doneAt: !running && t.features.done ? nowIso() : null,
      payload: { ...(tpl ? structuredClone(tpl.payload) : {}), signal: running ? 'start' : 'pair' }, calendar: Boolean(tpl?.calendar) });
    this.dropTimer(id); return e;
  }
  /** ⏹ いちばん新しい進行中を今で止める（種目を渡せばその種目の中だけ。すべて なら、なに未定の計測も含めて新しい方） */
  stopLatest(trackId?: string, at: number = nowMinute()): string | null {
    const e = this.running(trackId)[0]; const tm = trackId ? undefined : [...this.runningTimers()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (tm && (!e || tm.createdAt > e.createdAt)) { this.stopTimer(tm.id, at); return `⏹ なに未定の計測を ${fmt(at)} に終了（なに を決めてください）`; }
    if (e) { this.stop(e.id, at); return `⏹ ${this.track(e.trackId).icon} ${e.title} を ${fmt(at)} に終了`; }
    return null;
  }

  /** 未振り分けを種目に振る（合図としてもう一度通す） */
  assignInbox(id: string, trackId: string): { kind: string; message: string } {
    const item = (this.db.inbox ?? []).find((x) => x.id === id); if (!item) throw new Error('その項目はありません');
    const r = this.applySignal(item.text, trackId);
    this.db.inbox = (this.db.inbox ?? []).filter((x) => x.id !== id); void this.persist();
    return r;
  }
  dropInbox(id: string): void { this.db.inbox = (this.db.inbox ?? []).filter((x) => x.id !== id); void this.persist(); }
  /** ⏵ を終了（既定＝今。at を渡せばその時刻＝「開始から N 分で終了」にも使う） */
  stop(entryId: string, at: number = nowMinute()): Entry {
    const e = this.mustEntry(entryId); const t = this.track(e.trackId);
    const end = Math.min(1440, Math.max(at, (e.actualStart ?? 0) + 1));
    return this.updateEntry(entryId, { actualEnd: end, doneAt: t.features.done ? nowIso() : e.doneAt, payload: { ...e.payload, signal: 'pair' } });
  }
  /** 経過分（今日の記録だけ。昨夜からのものは 24:00 をまたいだ分を足す） */
  elapsed(e: Entry, now: number = nowMinute()): number {
    const start = e.actualStart ?? 0; const days = Math.max(0, this.daysAgo(e.date));
    return days * 1440 + now - start;
  }
  private daysAgo(d: YMD): number { const a = new Date(`${d}T00:00:00Z`).getTime(), b = new Date(`${this.today()}T00:00:00Z`).getTime(); return Math.round((b - a) / 86400000); }
  /** 長すぎる進行中＝種目の上限（既定 180 分・null＝聞かない）を超えたもの */
  overdue(now: number = nowMinute()): Entry[] {
    return this.running().filter((e) => { const lim = this.track(e.trackId).features.maxRunMin; if (lim === null) return false; return this.elapsed(e, now) > (lim ?? 180); });
  }

  // ── 見渡す・データ ─────────────────────────────────────
  summary(trackId: string, from: YMD, to: YMD): { total: number; done: number; skipped: number; open: number; ghosts: number } {
    const es = this.entriesFor(trackId, from, to);
    const done = es.filter((e) => e.doneAt).length, skipped = es.filter((e) => e.skippedAt).length;
    return { total: es.length, done, skipped, open: es.length - done - skipped, ghosts: this.ghostsFor(trackId, from, to).length };
  }
  /** ⏱ 合計と平均＝長さのある記録（🚫 は除く）。平均は「回」あたり */
  durationStats(trackId: string, from: YMD, to: YMD): { total: number; count: number; avg: number } {
    const ds = this.entriesFor(trackId, from, to).filter((e) => !e.skippedAt).map((e) => durationOf(e)).filter((d): d is number => d != null && d > 0);
    const total = ds.reduce((a, b) => a + b, 0);
    return { total, count: ds.length, avg: ds.length ? Math.round(total / ds.length) : 0 };
  }
  exportJson(): string { return JSON.stringify(this.db, null, 1); }
  importJson(s: string): void {
    const d = JSON.parse(s) as Db;
    if (d?.version !== 1 || !Array.isArray(d.tracks) || !Array.isArray(d.entries)) throw new Error('この形の JSON は読めません');
    const keep = this.db.settings.storage; // 保存場所の設定は端末のものを残す。丸ごと入れ替わったので次は差分でなく丸ごと送る
    this.db = d; if (keep) this.db.settings.storage = { ...keep, lastPushedAt: undefined, remoteSavedAt: undefined }; void this.persist();
  }
  reset(seed: () => Db): void { const keep = this.db.settings.storage; this.db = seed(); if (keep) this.db.settings.storage = { ...keep, lastPushedAt: undefined, remoteSavedAt: undefined }; void this.persist(); }
}
