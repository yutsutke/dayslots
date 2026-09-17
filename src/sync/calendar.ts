/* 📅 外のカレンダー（Google）に出す。
 *  何を出すか＝**時刻がある記録**で、本人が「出す」を立てたものだけ。枡（時間帯）だけの記録は出さない
 *   （「午後にやる」は自分の帳面の話で、カレンダーに 14:00 と嘘の時刻を作らない）。
 *  どう出すか＝ライフログの `gcal` Edge Function と同じ形（サーバが refresh token を持ち、画面は合図だけ）。
 *   記録 ⇔ Google の予定 の対応は calendarMap に1行（中身の指紋つき＝同じ中身なら書かない）。
 *  ⚠ ここは口（ポート）と規則。Google に実際に話す部分（Edge Function `koma-gcal`）は Phase 4。
 */
import type { Entry, Track, YMD, Minute, CalendarMapRow } from '../domain/types';
import { bucketOf } from '../domain/slots';
import type { Repo } from '../app/repo';

/** allDay＝終日（時刻が無い記録＝「時間帯なし」など）。時刻ありなら startMin/endMin が入る */
export interface CalendarEvent { entryId: string; title: string; date: YMD; allDay: boolean; startMin: Minute | null; endMin: Minute | null; description: string; }

export interface CalendarPort {
  readonly name: string;
  configured(): boolean;
  upsert(ev: CalendarEvent, existingEventId: string | null): Promise<string>; // 戻り＝Google 側の id
  remove(eventId: string): Promise<void>;
}

/** 記録 → 出す予定。出さないなら null。
 *  時刻が無い記録（「時間帯なし」・枡だけ）は**終日**で出す（ゆう 2026-09-18「だしてください」）＝嘘の時刻は作らない代わりに、日は伝える */
export function eventFor(track: Track, e: Entry): CalendarEvent | null {
  if (!track.features.calendar || !e.calendar) return null;
  const useActual = track.features.actualFirst || (e.doneAt != null && e.actualStart != null);
  const date = useActual && e.actualDate ? e.actualDate : e.date;
  const start = useActual ? (e.actualStart ?? e.planStart) : e.planStart;
  const slotOf = track.slots.find((s) => s.key === bucketOf(track, e));
  if (start == null) {
    const desc = [slotOf ? `${slotOf.icon} ${slotOf.label}` : '', e.doneAt ? '✅ 済' : '', e.note ?? ''].filter(Boolean).join('\n');
    return { entryId: e.id, title: `${track.icon} ${e.title}`, date, allDay: true, startMin: null, endMin: null, description: desc };
  }
  // 終わり＝実際の終わり／予定の終わり。実際で出すのに実際の終わりが無ければ、予定の長さを写す（無ければ30分）
  const planLen = e.planStart != null && e.planEnd != null ? e.planEnd - e.planStart : 30;
  const rawEnd = useActual ? (e.actualEnd ?? start + planLen) : (e.planEnd ?? start + 30);
  const end = Math.min(1440, Math.max(rawEnd, start + 5));
  const desc = [slotOf ? `${slotOf.icon} ${slotOf.label}` : '', e.doneAt ? '✅ 済' : '', e.note ?? ''].filter(Boolean).join('\n');
  return { entryId: e.id, title: `${track.icon} ${e.title}`, date, allDay: false, startMin: start, endMin: end, description: desc };
}

/** 中身の指紋（同じなら書かない＝往復のこだまを止める）。暗号ではないので短い djb2 で足りる */
export function contentHash(ev: CalendarEvent): string {
  const s = JSON.stringify([ev.title, ev.date, ev.allDay, ev.startMin, ev.endMin, ev.description]);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export interface PendingItem { entry: Entry; ev: CalendarEvent | null; map: CalendarMapRow | undefined; }
/** まだ Google と合っていない記録＝①出す予定なのに未送信／中身が変わった ②出さなくなったのに Google に残っている */
export function pending(repo: Repo): PendingItem[] {
  const out: PendingItem[] = [];
  const maps = new Map(repo.db.calendarMap.map((m) => [m.entryId, m]));
  for (const e of repo.db.entries) {
    const track = repo.db.tracks.find((t) => t.id === e.trackId); if (!track) continue;
    const ev = eventFor(track, e); const map = maps.get(e.id);
    if (ev && (!map || map.contentHash !== contentHash(ev))) out.push({ entry: e, ev, map });
    else if (!ev && map) out.push({ entry: e, ev: null, map });
  }
  return out;
}

export async function syncAll(repo: Repo, port: CalendarPort): Promise<{ sent: number; removed: number; errors: string[] }> {
  const res = { sent: 0, removed: 0, errors: [] as string[] };
  if (!port.configured()) { res.errors.push(`カレンダーが未接続です（${port.name}）`); return res; }
  for (const p of pending(repo)) {
    try {
      if (p.ev) {
        const id = await port.upsert(p.ev, p.map?.eventId ?? null);
        repo.db.calendarMap = repo.db.calendarMap.filter((m) => m.entryId !== p.entry.id);
        repo.db.calendarMap.push({ entryId: p.entry.id, provider: 'google', eventId: id, contentHash: contentHash(p.ev), syncedAt: new Date().toISOString() });
        res.sent++;
      } else if (p.map) {
        await port.remove(p.map.eventId);
        repo.db.calendarMap = repo.db.calendarMap.filter((m) => m.entryId !== p.entry.id);
        res.removed++;
      }
    } catch (e) { res.errors.push(`${p.entry.title}: ${(e as Error).message}`); }
  }
  await repo.persist();
  return res;
}

export class NotConfiguredCalendar implements CalendarPort {
  readonly name = '未接続';
  configured(): boolean { return false; }
  async upsert(): Promise<string> { throw new Error('カレンダーが未接続です（SPEC.md §7）'); }
  async remove(): Promise<void> { throw new Error('カレンダーが未接続です（SPEC.md §7）'); }
}

/** Google（Edge Function `koma-gcal` 経由）。関数は Phase 4 で作る＝この口が呼ぶ形を先に決めておく */
export class GoogleViaEdgeFunction implements CalendarPort {
  readonly name = 'Google（Edge Function 経由）';
  constructor(private baseUrl: string, private secret: string) {}
  configured(): boolean { return Boolean(this.baseUrl && this.secret); }
  private async call(body: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/functions/v1/koma-gcal`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-koma-secret': this.secret }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Google に出せませんでした: HTTP ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  }
  async upsert(ev: CalendarEvent, existingEventId: string | null): Promise<string> {
    const j = await this.call({ op: 'upsert', event: ev, eventId: existingEventId });
    return String(j.eventId ?? '');
  }
  async remove(eventId: string): Promise<void> { await this.call({ op: 'remove', eventId }); }
}
