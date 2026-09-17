/* 枡（時間帯）の決まり＝ここ ただ1つ。
 *  ・境目は記録に焼き込まない＝**読むときに導く**（境目を動かせば過去の記録もその場で読み直る）
 *  ・人が選んだ枡（slotKey）が勝つ。無ければ時刻から。時刻も無ければ受け皿（fallbackKey）
 *  ・時刻がどの時間帯にも当たらない（隙間・始まりより前）ときも受け皿（食事の 15:00〜16:30 → 間食）
 *  ・記録の枡の値が種目に無くなっていても書き換えない＝読むときに落とすだけ
 */
import type { Track, SlotDef, Entry, Minute } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtMin = (m: Minute): string => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
export function parseHM(s: string): Minute | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]); return v >= 0 && v <= 1440 ? v : null;
}

/** 時刻で決まる枡だけを、始まりの早い順に */
export function timedSlots(t: Track): SlotDef[] {
  return t.slots.filter((s) => s.startMin != null).sort((a, b) => (a.startMin as number) - (b.startMin as number));
}
/** 枡の終わり＝自分の endMin か、次の枡の始まりか、24:00 */
export function slotEnd(t: Track, key: string): Minute | null {
  const ts = timedSlots(t); const i = ts.findIndex((s) => s.key === key); if (i < 0) return null;
  const next = i + 1 < ts.length ? (ts[i + 1].startMin as number) : 1440;
  const own = ts[i].endMin; return own != null && own < next ? own : next;
}
/** 分 → 枡の key。当たらなければ受け皿 */
export function slotOfMinute(t: Track, m: Minute): string {
  const ts = timedSlots(t);
  for (const s of ts) { const a = s.startMin as number, b = slotEnd(t, s.key) as number; if (m >= a && m < b) return s.key; }
  if (m >= 1440 && ts.length) { const last = ts[ts.length - 1]; if (slotEnd(t, last.key) === 1440) return last.key; } // 24:00 ちょうどは最後の枡へ
  return t.fallbackKey;
}
/** 見出しに出す時刻の範囲（「11:00〜14:00」）。⚠ 書かずに作る＝境目を動かしても説明が古くならない */
export function slotRange(t: Track, key: string): string {
  const s = t.slots.find((x) => x.key === key); if (!s || s.startMin == null) return '';
  const a = s.startMin, b = slotEnd(t, key) as number;
  return `${a ? fmtMin(a) : '0:00'}〜${b < 1440 ? fmtMin(b) : '24:00'}`;
}
/** その記録の「主な時刻」＝種目が実際を主にするなら実際（無ければ予定）、そうでなければ予定（無ければ実際） */
export function primaryMinute(t: Track, e: Pick<Entry, 'planStart' | 'actualStart'>): Minute | null {
  return t.features.actualFirst ? (e.actualStart ?? e.planStart) : (e.planStart ?? e.actualStart);
}
/** どの枡に置くかを決める**ただ1つの係** */
export function bucketOf(t: Track, e: Pick<Entry, 'slotKey' | 'planStart' | 'actualStart'>): string {
  if (e.slotKey && t.slots.some((s) => s.key === e.slotKey)) return e.slotKey;
  const m = primaryMinute(t, e);
  return m != null ? slotOfMinute(t, m) : t.fallbackKey;
}
export function bucketOfOccurrence(t: Track, o: { slotKey: string | null; planStart: Minute | null }): string {
  if (o.slotKey && t.slots.some((s) => s.key === o.slotKey)) return o.slotKey;
  return o.planStart != null ? slotOfMinute(t, o.planStart) : t.fallbackKey;
}

/** 設定を保存する前の検査。戻り＝日本語のエラー（空＝通る） */
export function validateSlots(slots: SlotDef[], fallbackKey: string): string[] {
  const errs: string[] = [];
  if (!slots.length) return ['枡が1つもありません'];
  const keys = new Set<string>();
  for (const s of slots) {
    if (!s.key) errs.push('枡の内部名（key）が空です');
    else if (keys.has(s.key)) errs.push(`枡の内部名が重なっています: ${s.key}`);
    keys.add(s.key);
    if (!s.label.trim()) errs.push(`枡の呼び名が空です（${s.key}）`);
    if (s.startMin != null && (!Number.isInteger(s.startMin) || s.startMin < 0 || s.startMin >= 1440)) errs.push(`始まりの時刻が 0:00〜23:59 の外です（${s.label}）`);
    if (s.endMin != null && s.startMin != null && (s.endMin <= s.startMin || s.endMin > 1440)) errs.push(`終わりの時刻が始まりより前です（${s.label}）`);
  }
  const timed = slots.filter((s) => s.startMin != null).sort((a, b) => (a.startMin as number) - (b.startMin as number));
  if (!timed.length) errs.push('時刻で決まる枡が1つもありません（時刻を入れた記録の置き場が無くなります）');
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].startMin === timed[i - 1].startMin) errs.push(`始まりが同じ時刻の枡が2つあります（${fmtMin(timed[i].startMin as number)}）`);
    const pe = timed[i - 1].endMin;
    if (pe != null && pe > (timed[i].startMin as number)) errs.push(`「${timed[i - 1].label}」の終わりが次の枡「${timed[i].label}」に食い込んでいます`);
  }
  if (!keys.has(fallbackKey)) errs.push('受け皿の枡が枡の中にありません');
  return errs;
}
