/* 🔁 繰り返しの展開＝ライフログ（owntracks-supabase-notion/web/recur.js の recurOccurrences）を写した。
 *  規則を2か所に置かない＝画面もサーバ（将来）もこの1つを使う。
 *  ⚠ 「休日」＝土日＋日本の祝日＋本人が足した休み（有給）の3つを isHoliday ただ1つで見る。
 */
import type { Rule, YMD, Minute, Priority, RuleException, Freq } from './types';
import { addDays, dowOf, daysBetween, lastDayOfMonth, p2 } from './dates';

export interface Occurrence {
  ruleId: string; date: YMD; end: YMD; multi: boolean;   // multi＝帯（月の前半など・end > date）
  title: string; note: string | null; slotKey: string | null;
  planStart: Minute | null; planEnd: Minute | null; priority: Priority; tag: string | null;
}

export const FREQ_LABEL: Record<Freq, string> = {
  daily: '毎日', weekly: '毎週（曜日）', everyN: 'N日ごと', monthly: '毎月（同じ日）', monthhalf: '月の前半／後半',
  monthfull: '毎月（月いっぱい）', monthrange: '毎月（N日〜M日）', weekday: '平日', holiday: '休日',
  beforeoff: '休日の前日', notbeforeoff: '休日前でない平日', firstworkday: '週の最初の平日', lastworkday: '週の最後の平日',
  runstart: '連休の初日', runend: '連休の最終日',
};

const jpCache = new Map<number, Set<YMD>>();
/** 日本の祝日（1980〜2099 の近似式＝固定＋ハッピーマンデー＋春分/秋分＋国民の休日＋振替休日） */
export function jpHolidays(year: number): Set<YMD> {
  const hit = jpCache.get(year); if (hit) return hit;
  const set = new Set<YMD>();
  const add = (m: number, d: number) => set.add(`${year}-${p2(m)}-${p2(d)}`);
  const nthMon = (m: number, nth: number) => { const d1 = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); return 1 + ((1 - d1 + 7) % 7) + 7 * (nth - 1); };
  add(1, 1); add(2, 11); add(2, 23); add(4, 29); add(5, 3); add(5, 4); add(5, 5); add(8, 11); add(11, 3); add(11, 23);
  add(1, nthMon(1, 2)); add(7, nthMon(7, 3)); add(9, nthMon(9, 3)); add(10, nthMon(10, 2));
  add(3, Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)));
  add(9, Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)));
  [...set].sort().forEach((d) => { const mid = addDays(d, 1); if (!set.has(mid) && set.has(addDays(d, 2))) set.add(mid); });
  [...set].sort().forEach((d) => { if (dowOf(d) === 0) { let n = addDays(d, 1); while (set.has(n)) n = addDays(n, 1); set.add(n); } });
  jpCache.set(year, set); return set;
}
export function isHoliday(d: YMD, custom: Set<YMD>): boolean {
  const dw = dowOf(d);
  return dw === 0 || dw === 6 || jpHolidays(Number(d.slice(0, 4))).has(d) || custom.has(d);
}

/** 窓 [from, to] に入る回を全部返す（止めている規則・例外で消した回は出ない） */
export function occurrences(rules: Rule[], from: YMD, to: YMD, customHolidays: Iterable<YMD> = []): Occurrence[] {
  const cs = customHolidays instanceof Set ? customHolidays : new Set(customHolidays);
  const out: Occurrence[] = [];
  // 最後の砦＝窓は3年まで。遠すぎる端（9999年など）を渡されても1日ずつ数え続けて画面を固めない（2026-09-20 にリストで実際に踏んだ）
  if (daysBetween(from, to) > 1100) to = addDays(from, 1100);
  for (const r of rules) {
    if (!r.active || !r.startDate || !r.freq) continue;
    const push = (start: YMD, end: YMD, multi: boolean) => {
      const ov: RuleException | undefined = r.exceptions?.[start];
      if (ov?.del) return;
      out.push({
        ruleId: r.id, date: start, end, multi,
        title: ov?.title ?? r.title, note: ov?.note ?? r.note, slotKey: r.slotKey,
        planStart: ov && 'planStart' in ov ? (ov.planStart ?? null) : r.planStart,
        planEnd: ov && 'planEnd' in ov ? (ov.planEnd ?? null) : r.planEnd,
        priority: r.priority, tag: r.tag,
      });
    };
    const lo = r.startDate > from ? r.startDate : from;
    const hi = r.endDate && r.endDate < to ? r.endDate : to;
    const months = (fn: (y: number, m: number, last: number) => void) => {
      let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
      const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
      while (y < ey || (y === ey && m <= em)) { fn(y, m, lastDayOfMonth(y, m)); m++; if (m > 12) { m = 1; y++; } }
    };
    const band = (bs: YMD, be: YMD) => {
      if (bs < r.startDate) bs = r.startDate;
      if (r.endDate && be > r.endDate) be = r.endDate;
      if (bs <= be && be >= from && bs <= to) push(bs, be, be > bs);
    };
    switch (r.freq) {
      case 'daily': case 'weekly': {
        const by = new Set(r.freq === 'weekly' ? r.byday : [0, 1, 2, 3, 4, 5, 6]);
        for (let d = lo; d <= hi; d = addDays(d, 1)) if (by.has(dowOf(d))) push(d, d, false);
        break;
      }
      case 'everyN': {
        const n = Math.max(1, r.interval ?? 1);
        const skip = Math.max(0, Math.ceil(daysBetween(r.startDate, lo) / n));
        for (let d = addDays(r.startDate, skip * n); d <= hi; d = addDays(d, n)) if (d >= r.startDate) push(d, d, false);
        break;
      }
      case 'monthly': {
        const dom = Number(r.startDate.slice(8, 10));
        months((y, m, last) => { const d = `${y}-${p2(m)}-${p2(Math.min(dom, last))}`; if (d >= r.startDate && (!r.endDate || d <= r.endDate) && d >= from && d <= to) push(d, d, false); });
        break;
      }
      case 'monthhalf':
        months((y, m, last) => { const ym = `${y}-${p2(m)}`; band(r.half === 'second' ? `${ym}-16` : `${ym}-01`, r.half === 'second' ? `${ym}-${p2(last)}` : `${ym}-15`); });
        break;
      case 'monthrange': {
        const df = r.dayFrom ?? 0, dt = r.dayTo ?? 0;
        if (!(df >= 1 && df <= 31 && dt >= df && dt <= 31)) break;
        months((y, m, last) => { const ym = `${y}-${p2(m)}`; band(`${ym}-${p2(Math.min(df, last))}`, `${ym}-${p2(Math.min(dt, last))}`); });
        break;
      }
      case 'monthfull':
        months((y, m, last) => { const ym = `${y}-${p2(m)}`; band(`${ym}-01`, `${ym}-${p2(last)}`); });
        break;
      case 'runstart': case 'runend': {
        const wantEnd = r.freq === 'runend';
        for (let d = lo; d <= hi; d = addDays(d, 1)) { if (!isHoliday(d, cs)) continue; if (!isHoliday(addDays(d, wantEnd ? 1 : -1), cs)) push(d, d, false); }
        break;
      }
      case 'weekday': case 'holiday': case 'beforeoff': case 'notbeforeoff': {
        for (let d = lo; d <= hi; d = addDays(d, 1)) {
          const off = isHoliday(d, cs);
          if (r.freq === 'holiday') { if (off) push(d, d, false); continue; }
          if (off) continue;
          if (r.freq === 'weekday') { push(d, d, false); continue; }
          if ((r.freq === 'beforeoff') === isHoliday(addDays(d, 1), cs)) push(d, d, false);
        }
        break;
      }
      case 'firstworkday': case 'lastworkday': {
        const wantLast = r.freq === 'lastworkday';
        const monStart = (d: YMD) => addDays(d, -((dowOf(d) + 6) % 7));
        for (let wk = monStart(lo); wk <= hi; wk = addDays(wk, 7)) {
          let pick: YMD | null = null;
          for (let k = 0; k < 7; k++) { const d = addDays(wk, k); if (!isHoliday(d, cs)) { pick = d; if (!wantLast) break; } }
          if (pick && pick >= lo && pick <= hi) push(pick, pick, false);
        }
        break;
      }
    }
  }
  return out;
}

/** 規則を一言で（一覧の説明に） */
export function describeRule(r: Rule): string {
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  let s = FREQ_LABEL[r.freq];
  if (r.freq === 'weekly') s = `毎週 ${r.byday.map((d) => dows[d]).join('')}`;
  if (r.freq === 'everyN') s = `${r.interval ?? 1}日ごと`;
  if (r.freq === 'monthly') s = `毎月 ${Number(r.startDate.slice(8, 10))}日`;
  if (r.freq === 'monthhalf') s = r.half === 'second' ? '毎月 後半（16日〜）' : '毎月 前半（〜15日）';
  if (r.freq === 'monthrange') s = `毎月 ${r.dayFrom}〜${r.dayTo}日`;
  return s + (r.endDate ? `（〜${r.endDate}）` : '');
}
