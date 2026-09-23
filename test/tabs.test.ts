import { describe, it, expect } from 'vitest';
import { msKey, msIdOf, splitTabs, toggleHidden } from '../src/domain/tabs';

const tabs = ['t-todo', 't-meal', msKey(1), msKey(2)].map((key) => ({ key }));
const keys = (xs: { key: string }[]) => xs.map((x) => x.key);

describe('タブ＝種目と 🗓 記念日を並べ、畳んだものは「ほか」へ', () => {
  it('記念日の鍵＝ms:<番号>。形が違えば記念日ではない', () => {
    expect(msIdOf(msKey(12))).toBe(12);
    expect(msIdOf('t-todo')).toBeNull();
    expect(msIdOf('ms:')).toBeNull();
    expect(msIdOf('ms:1a')).toBeNull();
  });
  it('畳んでいなければ全部見せる', () => {
    expect(keys(splitTabs(tabs, undefined, '*').shown)).toEqual(['t-todo', 't-meal', 'ms:1', 'ms:2']);
  });
  it('畳んだものは「ほか」へ・並びは保つ', () => {
    const r = splitTabs(tabs, ['t-meal', 'ms:2'], '*');
    expect(keys(r.shown)).toEqual(['t-todo', 'ms:1']);
    expect(keys(r.folded)).toEqual(['t-meal', 'ms:2']);
  });
  it('いま選んでいるタブは畳んでいても見せる（どこにも無い、を作らない）', () => {
    const r = splitTabs(tabs, ['ms:2'], 'ms:2');
    expect(keys(r.shown)).toContain('ms:2');
    expect(r.folded).toEqual([]);
  });
  it('切り替え＝畳む ⇄ 見せる', () => {
    expect(toggleHidden(undefined, 'ms:1')).toEqual(['ms:1']);
    expect(toggleHidden(['ms:1', 't-meal'], 'ms:1')).toEqual(['t-meal']);
  });
});
