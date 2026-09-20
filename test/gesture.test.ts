import { describe, it, expect } from 'vitest';
import { GESTURES, GESTURE_DEF, GESTURE_LABEL, sayFor, checkGesture, validateGestures, type GestureRule } from '../src/domain/gesture';
import { parseSignal } from '../src/domain/signal';

describe('📷 手の形 → 合図の対応表', () => {
  it('初めのうちの表＝ゆうの例そのまま（人差し指1本＝開始／2本＝終了）', () => {
    expect(sayFor(GESTURE_DEF, 'one')).toBe('開始');
    expect(sayFor(GESTURE_DEF, 'two')).toBe('終了');
  });

  it('入れる文は、そのまま今までの合図として読める（新しい命令を作っていない）', () => {
    for (const r of GESTURE_DEF) expect(parseSignal(r.say)).toBeTruthy();
  });

  it('決めていない手の形は null＝勝手に何かを入れない', () => {
    expect(sayFor(GESTURE_DEF, 'fist')).toBeNull();
    expect(sayFor(GESTURE_DEF, 'unknown')).toBeNull();
    expect(sayFor([{ gesture: 'fist', say: '  ' }], 'fist')).toBeNull(); // 空白だけも「決めていない」
  });

  it('自分の表に差し替えられる', () => {
    const mine: GestureRule[] = [{ gesture: 'fist', say: '座禅開始' }, { gesture: 'open', say: '座禅終了' }];
    expect(sayFor(mine, 'fist')).toBe('座禅開始');
    expect(sayFor(mine, 'one')).toBeNull();
  });

  it('顔ぶれは全部に呼び名がある', () => {
    for (const g of GESTURES) expect(GESTURE_LABEL[g]).toBeTruthy();
    expect(GESTURE_LABEL.unknown).toBeTruthy();
  });
});

describe('AI の返事の検査（顔ぶれに無い言葉を受け取らない）', () => {
  it('顔ぶれの言葉はそのまま通る', () => {
    expect(checkGesture({ gesture: 'two', sure: true, reason: '2本立っている' }))
      .toEqual({ gesture: 'two', sure: true, reason: '2本立っている' });
  });

  it('大文字・前後の空白は均す', () => {
    expect(checkGesture({ gesture: ' FIST ' }).gesture).toBe('fist');
  });

  it('sure を書いていなければ「迷っていない」とみなす', () => {
    expect(checkGesture({ gesture: 'one' }).sure).toBe(true);
  });

  // ── 負のテスト＝分からない側に倒す ──
  it('顔ぶれに無い言葉は unknown に落ちる（AI に言葉を作らせない）', () => {
    for (const bad of [{ gesture: 'peace' }, { gesture: 'ピース' }, { gesture: 'four' }, { gesture: '' }]) {
      expect(checkGesture(bad).gesture).toBe('unknown');
    }
  });

  it('形が壊れている返事も unknown', () => {
    for (const bad of [null, undefined, 'two', 42, [], {}]) expect(checkGesture(bad).gesture).toBe('unknown');
  });

  it('unknown のときは「迷っていない」にしない＝入れない側へ', () => {
    expect(checkGesture({ gesture: 'nope', sure: true }).sure).toBe(false);
  });

  it('AI 自身が迷っていれば sure は false', () => {
    expect(checkGesture({ gesture: 'one', sure: false }).sure).toBe(false);
  });

  it('理由は 120 文字まで・空なら null', () => {
    expect(checkGesture({ gesture: 'one', reason: '  ' }).reason).toBeNull();
    expect(checkGesture({ gesture: 'one', reason: 'あ'.repeat(200) }).reason).toHaveLength(120);
  });
});

describe('対応表の検査', () => {
  it('通る表はエラーが空', () => {
    expect(validateGestures(GESTURE_DEF)).toEqual([]);
    expect(validateGestures([])).toEqual([]);
  });

  it('同じ手の形が2つ・空の文・知らない形は断る', () => {
    expect(validateGestures([{ gesture: 'one', say: 'a' }, { gesture: 'one', say: 'b' }])).toHaveLength(1);
    expect(validateGestures([{ gesture: 'one', say: '   ' }])).toHaveLength(1);
    expect(validateGestures([{ gesture: 'peace' as never, say: 'a' }])).toHaveLength(1);
  });
});
