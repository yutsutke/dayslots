/* 台帳（Repo）＝画面が呼ぶ操作を全部ここに置く（✅／🚫／🔀、⭐、🔁 の規則）。
 *  規則の出どころはライフログの Edge Function（todos / meals）。写した約束:
 *   ・✅ と 🚫 は1行で両立しない＝片方を立てるとき、もう片方を消す（戻すときは触らない）
 *   ・🔀 代わりに＝元は 🚫 で閉じ、代わりの側だけが元を指す（元の側に印を持たない）
 *   ・🔁 自動の規則は「今日まで」しか記録にしない（未来には作らない＝まだやっていない）
 *   ・(ruleId, ruleDate) は1組1行＝開くたびに増えない
 *   ・⭐ の「使った回数・最後に使った日」は保存せず記録から数える
 *   ・型（⭐）や規則（🔁）を消しても、そこから作った記録は残る
 */
import type { Db, Entry, Track, Template, Rule, YMD, TrackKind } from '../domain/types';
import type { Store } from '../store/store';
import { occurrences, type Occurrence } from '../domain/recur';
import { todayYMD, addDays } from '../domain/dates';
import { PRESETS } from '../domain/defaults';
import { durationOf } from '../domain/slots';
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
  persist(): Promise<void> { return this.store.save(this.db); }

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
  entriesFor(trackId: string, from: YMD, to: YMD): Entry[] {
    return this.db.entries.filter((e) => e.trackId === trackId && e.date >= from && e.date <= to).sort(byOrder);
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
  /** 連続 ✅ の日数（upTo から後ろへ数える。upTo 当日が未記録なら前日から数える＝今日まだやっていなくても途切れ扱いにしない） */
  streak(trackId: string, upTo: YMD): number {
    let d = upTo, n = 0;
    if (!this.dayEntry(trackId, d)?.doneAt) d = addDays(d, -1);
    while (this.dayEntry(trackId, d)?.doneAt) { n++; d = addDays(d, -1); }
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
    else { r.exceptions[date] = { ...(r.exceptions[date] ?? {}), del: true }; this.db.entries = this.db.entries.filter((e) => !(e.ruleId === ruleId && e.ruleDate === date)); }
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
        const e = fresh({ actualDate: today, actualStart: at, actualDur: sig.dur });
        return { kind: 'started', entry: e, message: `⏵ ${label} を ${fmt(at)} に開始` };
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
  /** 未振り分けを種目に振る（合図としてもう一度通す） */
  assignInbox(id: string, trackId: string): { kind: string; message: string } {
    const item = (this.db.inbox ?? []).find((x) => x.id === id); if (!item) throw new Error('その項目はありません');
    const r = this.applySignal(item.text, trackId);
    this.db.inbox = (this.db.inbox ?? []).filter((x) => x.id !== id); void this.persist();
    return r;
  }
  dropInbox(id: string): void { this.db.inbox = (this.db.inbox ?? []).filter((x) => x.id !== id); void this.persist(); }
  /** ⏵ を「今」で終了 */
  stop(entryId: string): Entry { const e = this.mustEntry(entryId); const t = this.track(e.trackId); return this.updateEntry(entryId, { actualEnd: Math.max(nowMinute(), (e.actualStart ?? 0) + 1), doneAt: t.features.done ? nowIso() : e.doneAt, payload: { ...e.payload, signal: 'pair' } }); }

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
    this.db = d; void this.persist();
  }
  reset(seed: () => Db): void { this.db = seed(); void this.persist(); }
}
