import { describe, it, expect } from 'vitest';
import { parseSignal, resolve } from '../src/domain/signal';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);

describe('合図を解く（parseSignal）', () => {
  it('動詞＝開始／終了／やった／やらなかった を末尾から拾い、残りが名前', () => {
    expect(parseSignal('座禅開始')).toMatchObject({ name: '座禅', verb: 'start' });
    expect(parseSignal('散歩 終了')).toMatchObject({ name: '散歩', verb: 'end' });
    expect(parseSignal('昼ごはん やった')).toMatchObject({ name: '昼ごはん', verb: 'done' });
    expect(parseSignal('座禅やらなかった')).toMatchObject({ name: '座禅', verb: 'skip' });
    expect(parseSignal('散歩')).toMatchObject({ name: '散歩', verb: 'add' });
    expect(parseSignal('開始')).toMatchObject({ name: '', verb: 'start' });
  });
  it('長さ＝30分／1時間半／1時間30分。時刻＝8時から／8:05／20時半', () => {
    expect(parseSignal('散歩 30分')).toMatchObject({ name: '散歩', dur: 30, time: null });
    expect(parseSignal('散歩 1時間半')).toMatchObject({ name: '散歩', dur: 90 });
    expect(parseSignal('座禅 1時間30分やった')).toMatchObject({ name: '座禅', dur: 90, verb: 'done' });
    expect(parseSignal('散歩 8時から開始')).toMatchObject({ name: '散歩', verb: 'start', time: 8 * 60 });
    expect(parseSignal('散歩 8:05 終了')).toMatchObject({ name: '散歩', verb: 'end', time: 8 * 60 + 5 });
    expect(parseSignal('20時半 散歩')).toMatchObject({ name: '散歩', time: 20 * 60 + 30 });
    expect(parseSignal('散歩 ３０分')).toMatchObject({ dur: 30 }); // 全角
  });
  it('「8時」を長さと取り違えない', () => {
    expect(parseSignal('散歩 8時')).toMatchObject({ name: '散歩', time: 8 * 60, dur: null });
  });
});

describe('名前を解く（resolve）', () => {
  it('種目名 → 種目。⭐ の呼び名・別名 → その種目と型', async () => {
    const r = await open();
    expect(resolve('座禅', r.tracks, r.db.templates)?.track.id).toBe('t-zazen');
    const w = resolve('散歩', r.tracks, r.db.templates);
    expect(w?.track.id).toBe('t-act'); expect(w?.template?.id).toBe('tp-walk'); expect(w?.title).toBe('朝散歩');
    expect(resolve('ウォーキング', r.tracks, r.db.templates)?.template?.id).toBe('tp-walk');
    expect(resolve('筋トレ', r.tracks, r.db.templates)?.template?.id).toBe('tp-gym');
  });
  it('種目の別名でも当たる。当たらなければ null', async () => {
    const r = await open();
    r.track('t-zazen').aliases = ['ざぜん'];
    expect(resolve('ざぜん', r.tracks, r.db.templates)?.track.id).toBe('t-zazen');
    expect(resolve('ピアノ', r.tracks, r.db.templates)).toBeNull();
    expect(resolve('', r.tracks, r.db.templates)).toBeNull();
  });
});

describe('合図 → 記録（applySignal）', () => {
  it('開始 → ⏵ 進行中。終了 → 同じ名前の進行中に終わりが入り、長さが出る。✅ も立つ', async () => {
    const r = await open();
    const a = r.applySignal('散歩 8時から開始');
    expect(a.kind).toBe('started'); expect(a.entry).toMatchObject({ trackId: 't-act', title: '朝散歩', templateId: 'tp-walk', actualStart: 480, actualEnd: null });
    expect(r.running()).toHaveLength(1);
    const b = r.applySignal('散歩 8:40 終了');
    expect(b.kind).toBe('ended'); expect(b.entry?.id).toBe(a.entry?.id);
    expect(b.entry).toMatchObject({ actualStart: 480, actualEnd: 520 }); expect(b.entry?.doneAt).not.toBeNull();
    expect(r.running()).toHaveLength(0);
  });
  it('片方だけ＝終了だけ来たら「終わりだけ」の行を作る', async () => {
    const r = await open();
    const e = r.applySignal('座禅 6:00 終了');
    expect(e.kind).toBe('ended'); expect(e.entry).toMatchObject({ trackId: 't-zazen', actualStart: null, actualEnd: 360 });
  });
  it('「次を開始すると前が止まる」＝別のものを開始したら、走っていたものはその時刻で終了（⚙ で切ると並行して走る）', async () => {
    const r = await open();
    const a = r.applySignal('座禅 7:00 開始');
    const b = r.applySignal('散歩 7:30 開始');
    expect(b.message).toMatch(/座禅 を終了/);
    expect(a.entry).toMatchObject({ actualStart: 420, actualEnd: 450 }); expect(a.entry?.doneAt).not.toBeNull();
    expect(r.running().map((x) => x.title)).toEqual(['朝散歩']);
    r.db.settings.autoStop = false;
    r.applySignal('座禅 8:00 開始');
    expect(r.running()).toHaveLength(2);                // 並行
    r.applySignal('座禅 8:30 開始');                    // 同じものの二重開始＝そのまま（前は止めない・新しい行が増える）
    expect(r.running('t-zazen')).toHaveLength(2);
  });
  it('長すぎる進行中＝種目の上限（既定 180 分）を超えたら「まだ続いていますか？」の対象。上限の分で終わったことにできる', async () => {
    const r = await open();
    const a = r.applySignal('散歩 6:00 開始');
    expect(r.overdue(8 * 60)).toHaveLength(0);          // 120 分
    expect(r.overdue(9 * 60 + 1)).toHaveLength(1);      // 181 分
    r.track('t-act').features.maxRunMin = 60;
    expect(r.overdue(7 * 60 + 1).map((e) => e.id)).toEqual([a.entry?.id]);
    r.track('t-act').features.maxRunMin = null;         // 聞かない
    expect(r.overdue(23 * 60)).toHaveLength(0);
    r.stop(a.entry!.id, 6 * 60 + 60);
    expect(a.entry?.actualEnd).toBe(7 * 60);
  });
  it('解けない名前は未振り分けへ。あとで種目に振れる', async () => {
    const r = await open();
    const u = r.applySignal('ピアノ開始');
    expect(u.kind).toBe('unresolved'); expect(r.db.inbox).toHaveLength(1);
    const v = r.assignInbox(r.db.inbox![0].id, 't-act');
    expect(v.kind).toBe('started'); expect(r.db.inbox).toHaveLength(0);
    expect(r.running('t-act')[0]).toMatchObject({ title: 'ピアノ' });
  });
  it('種目の欄からは名前を省ける＝「開始」「30分」だけで通る。やった／やらなかった／長さだけ', async () => {
    const r = await open();
    expect(r.applySignal('開始', 't-zazen').entry).toMatchObject({ title: '座禅', trackId: 't-zazen' });
    const d = r.applySignal('30分', 't-zazen');       // 動詞なし＋長さ＝やった扱い
    expect(d.kind).toBe('added'); expect(d.entry).toMatchObject({ actualDur: 30 }); expect(d.entry?.doneAt).not.toBeNull();
    const s = r.applySignal('やらなかった', 't-zazen');
    expect(s.kind).toBe('skipped');
    const done = r.applySignal('座禅 20分 やった');
    expect(done.kind).toBe('done'); expect(done.entry?.actualDur).toBe(20);
  });
  it('⏵ 進行中に話しかけると、メモに時刻つきで積もる（種目名が入っていれば合図として扱う）', async () => {
    const r = await open();
    const a = r.applySignal('散歩 8:00 開始');
    const n1 = r.applySignal('きれいな花が咲いていた');
    expect(n1.kind).toBe('noted'); expect(n1.entry?.id).toBe(a.entry?.id);
    r.applySignal('鳥の声', 't-act');                         // 種目の欄からでも同じ
    expect(a.entry?.note?.split('\n')).toHaveLength(2);
    expect(a.entry?.note).toMatch(/きれいな花が咲いていた/); expect(a.entry?.note).toMatch(/鳥の声/);
    expect(r.db.inbox ?? []).toHaveLength(0);                 // 未振り分けには行かない
    expect(r.applySignal('座禅開始').kind).toBe('started');   // 種目名つきの合図はメモにしない
    r.applySignal('散歩 8:40 終了'); r.applySignal('座禅終了');
    expect(r.running()).toHaveLength(0);
    expect(r.applySignal('ピアノ').kind).toBe('unresolved');  // 進行中が無ければ今までどおり未振り分け
  });
  it('進行中を「今」で止める（stop）', async () => {
    const r = await open();
    const a = r.applySignal('座禅 5:00 開始');
    const e = r.stop(a.entry!.id);
    expect(e.actualEnd).not.toBeNull(); expect(r.running()).toHaveLength(0); expect(e.doneAt).not.toBeNull();
  });
});
