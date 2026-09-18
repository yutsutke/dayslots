import { describe, it, expect } from 'vitest';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { eventFor, pending, contentHash } from '../src/sync/calendar';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);

describe('✅ 🚫 🔀（1行で両立しない）', () => {
  it('✅ を立てると 🚫 が消える／🚫 を立てると ✅ が消える', async () => {
    const r = await open();
    const e = r.addEntry('t-todo', { title: 'x', date: TODAY });
    r.setSkipped(e.id, true); expect(e.skippedAt).not.toBeNull(); expect(e.doneAt).toBeNull();
    r.setDone(e.id, true); expect(e.doneAt).not.toBeNull(); expect(e.skippedAt).toBeNull();
    expect(e.actualDate).toBe(TODAY); // 実際の日が空なら「その日」を入れる
    r.setSkipped(e.id, true); expect(e.doneAt).toBeNull();
  });
  it('✅ を戻しても 🚫 には触らない', async () => {
    const r = await open();
    const e = r.addEntry('t-todo', { title: 'x', date: TODAY });
    r.setDone(e.id, true); r.setDone(e.id, false);
    expect(e.doneAt).toBeNull(); expect(e.skippedAt).toBeNull();
  });
  it('🔀 代わりに＝元は 🚫 で閉じ、代わりの側だけが元を指す', async () => {
    const r = await open();
    const src = r.addEntry('t-todo', { title: '元', date: TODAY, slotKey: 'afternoon' });
    const alt = r.doInstead(src.id, '代わり');
    expect(src.skippedAt).not.toBeNull(); expect(src.doneAt).toBeNull();
    expect(alt.insteadOfId).toBe(src.id); expect(alt.doneAt).not.toBeNull(); expect(alt.slotKey).toBe('afternoon');
    expect(r.insteadFor(src.id)?.id).toBe(alt.id);
    r.deleteEntry(src.id); expect(alt.insteadOfId).toBeNull(); // 元を消したら指す先を外す
  });
});

describe('🔁 繰り返し → 記録', () => {
  it('自動の規則は今日まで記録になり、未来には作らない。二度呼んでも増えない', async () => {
    const r = await open();
    const before = r.db.entries.length;
    const n1 = r.ensureAuto('2026-09-13', '2026-09-19');
    // 今日のこと・明日のこと × 9/13〜9/17（5日）− 既に見本で入っている 9/16 の「今日のこと」1件 ＝ 9
    expect(n1).toBe(9);
    expect(r.db.entries.filter((e) => e.ruleId && e.date > TODAY)).toHaveLength(0);
    const n2 = r.ensureAuto('2026-09-13', '2026-09-19');
    expect(n2).toBe(0); expect(r.db.entries.length).toBe(before + 9);
  });
  it('確認してからの規則は薄く出る（ghost）。押すと記録になり、ghost から消える', async () => {
    const r = await open();
    const g = r.ghostsFor('t-act', '2026-09-13', '2026-09-19'); // 夜ジム 月水金
    expect(g.map((o) => o.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
    const e = r.materialize(g[0]);
    expect(e.ruleId).toBe('r-gym'); expect(e.ruleDate).toBe('2026-09-14'); expect(e.calendar).toBe(true);
    expect(r.materialize(g[0]).id).toBe(e.id); // 二重に作らない
    expect(r.ghostsFor('t-act', '2026-09-13', '2026-09-19').map((o) => o.date)).toEqual(['2026-09-16', '2026-09-18']);
  });
  it('この回はなし（例外）＝ghost からも記録からも消える。戻せる', async () => {
    const r = await open();
    const g = r.ghostsFor('t-act', '2026-09-13', '2026-09-19');
    r.materialize(g[1]);
    r.skipOccurrence('r-gym', '2026-09-16');
    expect(r.db.entries.some((e) => e.ruleId === 'r-gym' && e.ruleDate === '2026-09-16')).toBe(false);
    expect(r.ghostsFor('t-act', '2026-09-13', '2026-09-19').map((o) => o.date)).toEqual(['2026-09-14', '2026-09-18']);
    r.skipOccurrence('r-gym', '2026-09-16', true);
    expect(r.ghostsFor('t-act', '2026-09-13', '2026-09-19').map((o) => o.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
  });
  it('規則を消しても、そこから入った記録は残る', async () => {
    const r = await open();
    r.ensureAuto('2026-09-17', '2026-09-17');
    const n = r.db.entries.filter((e) => e.ruleId === 'r-today').length; expect(n).toBeGreaterThan(0);
    r.deleteRule('r-today');
    expect(r.db.entries.filter((e) => e.title === '今日のこと').length).toBe(n);
    expect(r.db.entries.some((e) => e.ruleId === 'r-today')).toBe(false);
  });
});

describe('⭐ いつもの', () => {
  it('使った回数・最後の日は記録から数える（保存しない）', async () => {
    const r = await open();
    expect(r.templateUsage('tp-bf')).toEqual({ count: 1, last: '2026-09-16' });
    r.entryFromTemplate(r.db.templates.find((t) => t.id === 'tp-bf')!, TODAY);
    expect(r.templateUsage('tp-bf')).toEqual({ count: 2, last: TODAY });
  });
  it('呼んだ先の枡が勝つ（朝食の型を間食に使える）', async () => {
    const r = await open();
    const e = r.entryFromTemplate(r.db.templates.find((t) => t.id === 'tp-bf')!, TODAY, 'snack');
    expect(e.slotKey).toBe('snack'); expect(e.title).toMatch(/小松菜/); expect(e.payload.origin).toBe('home');
  });
  it('型を消しても記録は残る（templateId だけ外れる）', async () => {
    const r = await open();
    r.deleteTemplate('tp-bf');
    const e = r.entry('e6')!; expect(e.templateId).toBeNull(); expect(e.title).toMatch(/小松菜/);
  });
  it('並びは最後に使った日の新しい順', async () => {
    const r = await open();
    expect(r.templatesFor('t-meal').map((t) => t.id)).toEqual(['tp-bf', 'tp-banana']); // 同じ日＝作った順は保たれない前提で、両方 9/16
    r.entryFromTemplate(r.db.templates.find((t) => t.id === 'tp-banana')!, TODAY);
    expect(r.templatesFor('t-meal')[0].id).toBe('tp-banana');
  });
});

describe('一日一回（座禅）＝1タップで なし → ✅ → 🚫 → なし', () => {
  it('印が回る。詳細が無ければ「なし」で行が消える', async () => {
    const r = await open();
    const d = '2026-09-10';
    const e1 = r.toggleDay('t-zazen', d)!;
    expect(e1.doneAt).not.toBeNull(); expect(e1.title).toBe('座禅'); expect(e1.actualDate).toBe(d);
    const e2 = r.toggleDay('t-zazen', d)!;
    expect(e2.id).toBe(e1.id); expect(e2.skippedAt).not.toBeNull(); expect(e2.doneAt).toBeNull();
    expect(r.toggleDay('t-zazen', d)).toBeNull();
    expect(r.dayEntry('t-zazen', d)).toBeUndefined();
  });
  it('詳細（時刻・メモ）があれば「なし」にしても行は残る（入れた詳細を黙って捨てない）', async () => {
    const r = await open();
    const e = r.dayEntry('t-zazen', '2026-09-16')!; // 見本＝🚫・メモ「寝坊」
    expect(e.skippedAt).not.toBeNull();
    const back = r.toggleDay('t-zazen', '2026-09-16')!;
    expect(back.id).toBe(e.id); expect(back.skippedAt).toBeNull(); expect(back.doneAt).toBeNull(); expect(back.note).toBe('寝坊');
    expect(r.toggleDay('t-zazen', '2026-09-16')!.doneAt).not.toBeNull();
  });
  it('連続日数＝今日が未記録なら前日から数える。🚫 で途切れる', async () => {
    const r = await open();
    expect(r.streak('t-zazen', TODAY)).toBe(0);       // 9/16 が 🚫
    r.toggleDay('t-zazen', '2026-09-16');              // 🚫 → なし（メモありで行は残る・✅ではない）
    r.toggleDay('t-zazen', '2026-09-16');              // → ✅
    expect(r.streak('t-zazen', TODAY)).toBe(3);        // 9/14, 15, 16
    r.toggleDay('t-zazen', TODAY);
    expect(r.streak('t-zazen', TODAY)).toBe(4);
  });
});

describe('📅 カレンダーに出すもの', () => {
  it('時刻が無い記録（枡だけ・時間帯なし）は終日で出す。「出す」を立てていない記録は出さない', async () => {
    const r = await open();
    const t = r.track('t-todo');
    const ev = eventFor(t, r.addEntry('t-todo', { title: 'x', date: TODAY, slotKey: 'afternoon', calendar: true }));
    expect(ev).toMatchObject({ date: TODAY, allDay: true, startMin: null, endMin: null });
    expect(ev?.description).toMatch(/午後/);
    expect(eventFor(t, r.addEntry('t-todo', { title: 'x', date: TODAY, planStart: 600, calendar: false }))).toBeNull();
    expect(eventFor(r.track('t-meal'), r.addEntry('t-meal', { title: 'x', date: TODAY, calendar: true }))).toBeNull(); // 種目が 📅 を使わない
  });
  it('予定の時刻で出る。✅ 済で実際の時刻があれば実際で出る', async () => {
    const r = await open();
    const t = r.track('t-todo');
    const e = r.addEntry('t-todo', { title: 'x', date: TODAY, planStart: 600, planEnd: 630, calendar: true });
    expect(eventFor(t, e)).toMatchObject({ date: TODAY, allDay: false, startMin: 600, endMin: 630, title: '◻️ x' });
    r.updateEntry(e.id, { doneAt: 'now', actualDate: '2026-09-18', actualStart: 700, actualEnd: null });
    expect(eventFor(t, e)).toMatchObject({ date: '2026-09-18', startMin: 700, endMin: 730 });
  });
  it('未送信＝対応表に無い／中身が変わった。送ったつもりの行があれば消える', async () => {
    const r = await open();
    const t = r.track('t-todo');
    const e = r.addEntry('t-todo', { title: 'x', date: TODAY, planStart: 600, calendar: true });
    const ev = eventFor(t, e)!;
    r.db.calendarMap = [{ entryId: e.id, provider: 'google', eventId: 'g1', contentHash: contentHash(ev), syncedAt: '' }];
    expect(pending(r).some((p) => p.entry.id === e.id)).toBe(false);
    r.updateEntry(e.id, { title: 'y' });
    expect(pending(r).some((p) => p.entry.id === e.id)).toBe(true);
    r.updateEntry(e.id, { calendar: false });
    expect(pending(r).find((p) => p.entry.id === e.id)?.ev).toBeNull(); // 出さなくなった＝Google 側を消す番
  });
});
