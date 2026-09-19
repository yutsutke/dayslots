/* 枡（時間帯）の決まり＝ここ ただ1つ。
 *  ・境目は記録に焼き込まない＝**読むときに導く**（境目を動かせば過去の記録もその場で読み直る）
 *  ・人が選んだ枡（slotKey）が勝つ。無ければ時刻から。時刻も無ければ受け皿（fallbackKey）
 *  ・時刻がどの時間帯にも当たらない（隙間・始まりより前）ときも受け皿（食事の 15:00〜16:30 → 間食）
 *  ・記録の枡の値が種目に無くなっていても書き換えない＝読むときに落とすだけ
 *  ・☀ 境目を日の出・日の入りで決める枡（SlotDef.sun）は**その記録の日**の太陽で決まる＝同じ 5:10 でも夏は「朝」、冬は「夜明け前」
 */
import type { Track, SlotDef, Entry, Minute, YMD } from './types';
import { sunMinute, TOKYO, type SunPlace } from './sun';
import { todayYMD } from './dates';

const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtMin = (m: Minute): string => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
export function parseHM(s: string): Minute | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]); return v >= 0 && v <= 1440 ? v : null;
}

/** ☀ の計算に使う場所（⚙ で決める。無ければ東京）。画面が描く前に差し込む */
let place: SunPlace = TOKYO;
export function setSunPlace(p: SunPlace | null | undefined): void { place = p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : TOKYO; }
export function getSunPlace(): SunPlace { return place; }

/** その日のその枡の始まり（分）。☀ の枡は太陽から、白夜などで決まらなければ素の時刻に戻る。時刻で決まらない枡は null */
export function startOf(s: SlotDef, date: YMD = todayYMD()): Minute | null {
  if (s.startMin == null) return null;
  if (s.sun) return sunMinute(s.sun, date, place) ?? s.startMin;
  return s.startMin;
}

/** 時刻で決まる枡だけを、**その日の**始まりの早い順に（☀ の枡は季節で順が入れ替わることがある） */
export function timedSlots(t: Track, date: YMD = todayYMD()): SlotDef[] {
  return t.slots.filter((s) => s.startMin != null).sort((a, b) => (startOf(a, date) as number) - (startOf(b, date) as number));
}
/** 枡の終わり＝自分の endMin か、次の枡の始まりか、24:00 */
export function slotEnd(t: Track, key: string, date: YMD = todayYMD()): Minute | null {
  const ts = timedSlots(t, date); const i = ts.findIndex((s) => s.key === key); if (i < 0) return null;
  const next = i + 1 < ts.length ? (startOf(ts[i + 1], date) as number) : 1440;
  const own = ts[i].endMin; return own != null && own < next && own > (startOf(ts[i], date) as number) ? own : next;
}
/** 分 → 枡の key。当たらなければ受け皿 */
export function slotOfMinute(t: Track, m: Minute, date: YMD = todayYMD()): string {
  const ts = timedSlots(t, date);
  for (const s of ts) { const a = startOf(s, date) as number, b = slotEnd(t, s.key, date) as number; if (m >= a && m < b) return s.key; }
  if (m >= 1440 && ts.length) { const last = ts[ts.length - 1]; if (slotEnd(t, last.key, date) === 1440) return last.key; } // 24:00 ちょうどは最後の枡へ
  return t.fallbackKey;
}
/** 見出しに出す時刻の範囲（「11:00〜14:00」）。⚠ 書かずに作る＝境目を動かしても説明が古くならない。☀ の枡は日で変わるので「≈」を付ける */
export function slotRange(t: Track, key: string, date: YMD = todayYMD()): string {
  const s = t.slots.find((x) => x.key === key); if (!s || s.startMin == null) return '';
  const a = startOf(s, date) as number, b = slotEnd(t, key, date) as number;
  const sunny = Boolean(s.sun) || timedSlots(t, date).some((x, i, arr) => arr[i - 1]?.key === key && x.sun);
  return `${sunny ? '≈' : ''}${a ? fmtMin(a) : '0:00'}〜${b < 1440 ? fmtMin(b) : '24:00'}`;
}

/** 実際の長さ＝書いた「何分」が勝つ。無ければ 始まり〜終わり から。どちらも無ければ null */
export function actualDurationOf(e: Pick<Entry, 'actualStart' | 'actualEnd' | 'actualDur'>): Minute | null {
  if (e.actualDur != null) return e.actualDur;
  if (e.actualStart != null && e.actualEnd != null) return e.actualEnd - e.actualStart;
  return null;
}
/** 予定の長さ＝同じ決め方 */
export function planDurationOf(e: Pick<Entry, 'planStart' | 'planEnd' | 'planDur'>): Minute | null {
  if (e.planDur != null) return e.planDur;
  if (e.planStart != null && e.planEnd != null) return e.planEnd - e.planStart;
  return null;
}
/** 何分やったか（升目に出す1つの数）＝実際があれば実際、無ければ予定 */
export function durationOf(e: Pick<Entry, 'planStart' | 'planEnd' | 'planDur' | 'actualStart' | 'actualEnd' | 'actualDur'>): Minute | null {
  return actualDurationOf(e) ?? planDurationOf(e);
}
export const fmtDur = (m: Minute): string => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);

/** その記録の「主な時刻」＝種目が実際を主にするなら実際（無ければ予定）、そうでなければ予定（無ければ実際） */
export function primaryMinute(t: Track, e: Pick<Entry, 'planStart' | 'actualStart'>): Minute | null {
  return t.features.actualFirst ? (e.actualStart ?? e.planStart) : (e.planStart ?? e.actualStart);
}
/** どの枡に置くかを決める**ただ1つの係**。☀ の枡のために、その記録の日（date）の太陽で境目を決める */
export function bucketOf(t: Track, e: Pick<Entry, 'slotKey' | 'planStart' | 'actualStart'> & { date?: YMD }): string {
  if (e.slotKey && t.slots.some((s) => s.key === e.slotKey)) return e.slotKey;
  const m = primaryMinute(t, e);
  return m != null ? slotOfMinute(t, m, e.date ?? todayYMD()) : t.fallbackKey;
}
export function bucketOfOccurrence(t: Track, o: { slotKey: string | null; planStart: Minute | null; date?: YMD }): string {
  if (o.slotKey && t.slots.some((s) => s.key === o.slotKey)) return o.slotKey;
  return o.planStart != null ? slotOfMinute(t, o.planStart, o.date ?? todayYMD()) : t.fallbackKey;
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
    if (s.endMin != null && s.startMin != null && !s.sun && (s.endMin <= s.startMin || s.endMin > 1440)) errs.push(`終わりの時刻が始まりより前です（${s.label}）`);
    if (s.sun && s.sun.base === 'daylight' && !(s.sun.den >= 2 && s.sun.den <= 12 && s.sun.num >= 0 && s.sun.num <= s.sun.den)) errs.push(`昼の等分の数が変です（${s.label}：2〜12 等分の 0〜N 番目）`);
    if (s.sun && s.sun.base !== 'daylight' && Math.abs(s.sun.offsetMin) > 360) errs.push(`日の出・日の入りからのずらしは 6 時間まで（${s.label}）`);
  }
  // 時刻で決まる枡が1つも無いのは通す（一日一回の種目＝「その日」だけ）。時刻を入れた記録は受け皿に落ちる
  // ⚠ ☀ の枡は日によって始まりが動くので、「同じ時刻」「食い込み」の検査は ☀ でない枡どうしだけ
  const timed = slots.filter((s) => s.startMin != null && !s.sun).sort((a, b) => (a.startMin as number) - (b.startMin as number));
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].startMin === timed[i - 1].startMin) errs.push(`始まりが同じ時刻の枡が2つあります（${fmtMin(timed[i].startMin as number)}）`);
    const pe = timed[i - 1].endMin;
    if (pe != null && pe > (timed[i].startMin as number)) errs.push(`「${timed[i - 1].label}」の終わりが次の枡「${timed[i].label}」に食い込んでいます`);
  }
  if (!keys.has(fallbackKey)) errs.push('受け皿の枡が枡の中にありません');
  return errs;
}
