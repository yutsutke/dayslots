/* タブの並び＝種目と 🗓 記念日を同じ列に並べ、本人が「ふだんは畳んでおく」と決めたものだけ「ほか」に入れる（v31）。
 *  鍵＝種目は id そのまま、記念日は 'ms:<ライフログの番号>'（記念日の正本はライフログ＝種目の表には入れない）。
 */
export const msKey = (id: number): string => `ms:${id}`;
export const msIdOf = (key: string): number | null => (key.startsWith('ms:') && /^\d+$/.test(key.slice(3)) ? Number(key.slice(3)) : null);

/** 見せるタブと畳むタブに分ける。いま選んでいるタブは畳んでいても見せる（選んだのにどこにも無い、を作らない） */
export function splitTabs<T extends { key: string }>(tabs: T[], hidden: string[] | undefined, current: string): { shown: T[]; folded: T[] } {
  const hid = new Set(hidden ?? []);
  return { shown: tabs.filter((t) => !hid.has(t.key) || t.key === current), folded: tabs.filter((t) => hid.has(t.key) && t.key !== current) };
}
/** 畳む／見せるを切り替えた後の一覧（消えたタブの鍵は掃除しない＝ライフログで一時的に読めないだけのこともある） */
export const toggleHidden = (hidden: string[] | undefined, key: string): string[] =>
  (hidden ?? []).includes(key) ? (hidden ?? []).filter((k) => k !== key) : [...(hidden ?? []), key];
