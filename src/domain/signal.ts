/* 合図（signal）＝「座禅開始」「散歩終了」「散歩 30分」のような短い言葉を解く。
 *  ①動詞を末尾から拾う（開始／終了／やった／やらなかった）②時刻（8時から・8:05）と長さ（30分・1時間半）を拾う ③残りが名前
 *  名前の解き方は resolve()＝種目の名前 → 種目の別名 → ⭐ いつもの の呼び名・別名 の順。当たらなければ null（未振り分け）。
 *  ⚠ ここは純粋な関数だけ（画面も置き場も知らない）＝検査しやすく、あとで Siri のショートカットからも同じ口を使える。
 */
import type { Track, Template, Minute } from './types';

export type Verb = 'start' | 'end' | 'done' | 'skip' | 'add';
export interface Signal { name: string; verb: Verb; time: Minute | null; dur: Minute | null; raw: string; }

const VERBS: [RegExp, Verb][] = [
  [/(開始|スタート|始め(た|る|ます)?|はじめ(た|る|ます)?|始まり|スタ)$/, 'start'],
  [/(終了|終わ(り|った|る|ります)|おわ(り|った|る)|終え(た|る)|おしまい|ストップ|止め(た|る))$/, 'end'],
  [/(やった|やりました|した|しました|済み|すみ|完了|できた|済んだ|すんだ)$/, 'done'],
  [/(やらなかった|やらない|しなかった|しない|やめた|やめる|スキップ|なし|未実行)$/, 'skip'],
];
const zen2han = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/：/g, ':');

/** 文 → 合図。名前が空なら name は ''（種目の欄で「開始」だけ言ったとき） */
export function parseSignal(text: string): Signal {
  let s = zen2han(text).trim().replace(/[、。,.!！]+$/g, '').replace(/\s+/g, ' ');
  const raw = text;
  let verb: Verb = 'add';
  for (const [re, v] of VERBS) { const m = re.exec(s); if (m) { verb = v; s = s.slice(0, m.index).trim(); break; } }
  // 長さ＝「1時間半」「1時間30分」「45分」「90分」。⚠ 「8時」「8時から」は時刻なので、分・半・時間 の語で見分ける
  let dur: Minute | null = null;
  const dm = /(?:(\d+)\s*時間\s*(半|(\d+)\s*分?)?|(\d+)\s*分(?:間)?)(?:やった|した|くらい|ぐらい|ほど)?$/.exec(s);
  if (dm) {
    if (dm[1]) dur = Number(dm[1]) * 60 + (dm[2] === '半' ? 30 : dm[3] ? Number(dm[3]) : 0);
    else dur = Number(dm[4]);
    s = s.slice(0, dm.index).trim();
  }
  // 時刻＝「8時から」「8時5分」「8:05」「20時半」。末尾でも先頭でもよい
  let time: Minute | null = null;
  const tm = /(?:^|\s)(\d{1,2})(?::(\d{2})|時\s*(半|(\d{1,2})\s*分?)?)\s*(から|に|より|〜|~)?(?=\s|$)/.exec(' ' + s);
  if (tm) {
    const hh = Number(tm[1]); const mm = tm[2] != null ? Number(tm[2]) : tm[3] === '半' ? 30 : tm[4] ? Number(tm[4]) : 0;
    if (hh <= 24 && mm < 60) { time = hh * 60 + mm; s = (' ' + s).replace(tm[0], ' ').trim(); }
  }
  return { name: s.replace(/^(を|の)/, '').replace(/(を|の)$/, '').trim(), verb, time, dur, raw };
}

const norm = (s: string) => zen2han(s).toLowerCase().replace(/[\s　・･]/g, '');
export interface Resolved { track: Track; template: Template | null; title: string; }

/** 名前 → 種目（＋⭐）。①種目名・種目の別名 ②⭐ の呼び名・別名。完全一致を先に、次に部分一致（長い名前から） */
export function resolve(name: string, tracks: Track[], templates: Template[]): Resolved | null {
  const n = norm(name); if (!n) return null;
  const cand: { key: string; r: Resolved }[] = [];
  for (const t of tracks) for (const k of [t.name, ...(t.aliases ?? [])]) cand.push({ key: norm(k), r: { track: t, template: null, title: t.name } });
  for (const tp of templates) { const t = tracks.find((x) => x.id === tp.trackId); if (!t) continue; for (const k of [tp.name, tp.title, ...(tp.aliases ?? [])]) cand.push({ key: norm(k), r: { track: t, template: tp, title: tp.title || tp.name } }); }
  const exact = cand.find((c) => c.key && c.key === n); if (exact) return exact.r;
  const parts = cand.filter((c) => c.key.length >= 2 && (n.includes(c.key) || c.key.includes(n))).sort((a, b) => b.key.length - a.key.length);
  return parts[0]?.r ?? null;
}
