import { describe, it, expect } from 'vitest';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { buildReview } from '../src/app/review';
import { forExport } from '../src/sync/target';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);

describe('📝 振り返りの要約（AI に渡す読み物）', () => {
  it('直近7日を日ごと・種目ごとに。時刻・長さ・印・代わりに・メモが文章で入る', async () => {
    const r = await open();
    r.applySignal('散歩 8:00 開始'); r.applySignal('きれいな花'); r.applySignal('散歩 8:40 終了');
    const rv = buildReview(r, TODAY, 7);
    expect(rv.from).toBe('2026-09-11'); expect(rv.to).toBe(TODAY);
    expect(rv.text).toMatch(/## 2026-09-17\(木\)/);
    expect(rv.text).toMatch(/🏃 運動.*朝散歩 08:00〜08:40 ⏱40分.*きれいな花/);
    expect(rv.text).toMatch(/🚫 1テーマで考える （午後） →代わりに 映画の振り返り/);
    expect(rv.text).toMatch(/翌週の伝票づくり 予定 15:20〜15:45 ⏱25分 ❗/);
    expect(rv.text).toMatch(/🧘 座禅: 🚫 「寝坊」/);                 // 9/16。種目名と同じ題名は省く
    expect(rv.text).toMatch(/🍽 食事:.*うどん 08:00〜 🏠/);
    expect(rv.text).toMatch(/## 7日の合計/);
    expect(rv.text).toMatch(/🧘 座禅: ✅2 🚫1 まだ0 ／ 🔥連続2日 ／ ⏱合計20分/);
    expect(rv.text).toMatch(/🔁未確認: 夜ジム 19:00/);              // 9/16(水) の薄い回
  });
  it('AI に軽い＝id や内部名を出さず、写し（doc）よりずっと小さい', async () => {
    const r = await open();
    r.ensureAuto('2026-09-11', TODAY);
    const rv = buildReview(r, TODAY, 7);
    expect(rv.text).not.toMatch(/t-todo|tp-walk|r-today|createdAt|slotKey/);
    expect(rv.text.length).toBeLessThan(JSON.stringify(forExport(r.db, TODAY)).length / 5);
  });
  it('何も無い日は出さない。期間の外は入らない', async () => {
    const r = await open();
    const rv = buildReview(r, TODAY, 2);
    expect(rv.text).not.toMatch(/2026-09-14|2026-09-15/);
    expect(rv.text).toMatch(/## 2日の合計/);
  });
});
