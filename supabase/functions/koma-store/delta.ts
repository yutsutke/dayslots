/* 差分（delta）＝「前回送ってから変わったぶんだけ」を作る／当てる。
 *  ・作るのは端末（buildDelta）、当てるのは Supabase の関数 koma-store（applyDelta）。**同じこのファイル**を両方で使う
 *    （supabase/functions/koma-store/delta.ts はこのファイルの写し＝test/sync.test.ts が「1文字も違わない」ことを検査する）
 *  ・だから他のファイルを import しない（Deno でもそのまま動くように、型もここに小さく持つ）
 *  ・記録（entries）だけが差分。種目・⭐・🔁・設定などの「芯（core）」は小さいので毎回丸ごと
 *  ・消した記録は id の一覧（deletes）で伝える。期間つき（window.from）なら、当てたあと期間より前を落とす＝外の写しが太らない
 */
export interface DeltaEntry { id: string; date: string; actualDate?: string | null; updatedAt: string; [k: string]: unknown }
export interface DocLike { version: 1; savedAt?: string; window?: { from: string } | null; entries: DeltaEntry[]; [k: string]: unknown }
export interface Delta {
  savedAt: string;                    // 端末が保存した時刻（当てたあとの写しの savedAt になる）
  baseSavedAt: string;                // 端末が知っている「外の写しの savedAt」。外と食い違えば当てない（409 → 丸ごと送り直す）
  window: { from: string } | null;
  core: Record<string, unknown>;      // entries / window / savedAt / version 以外の全部
  upserts: DeltaEntry[];              // 前回送ってから変わった・増えた記録
  deletes: string[];                  // 消した記録の id
}

const NOT_CORE = new Set(['entries', 'window', 'savedAt', 'version']);

/** doc＝外に出す形（鍵抜き・期間で切ったあと）。since＝前回送った時刻。それより後に変わった記録だけを拾う */
export function buildDelta(doc: DocLike, since: string, baseSavedAt: string, deletes: string[]): Delta {
  const core: Record<string, unknown> = {};
  for (const k of Object.keys(doc)) if (!NOT_CORE.has(k)) core[k] = doc[k];
  return { savedAt: doc.savedAt ?? '', baseSavedAt, window: doc.window ?? null, core, upserts: doc.entries.filter((e) => e.updatedAt > since), deletes: [...deletes] };
}

/** 持っている写しに差分を当てる。戻り＝新しい写し（元は触らない） */
export function applyDelta(base: DocLike, d: Delta): DocLike {
  const byId = new Map(base.entries.map((e) => [e.id, e]));
  for (const e of d.upserts) byId.set(e.id, e);
  for (const id of d.deletes) byId.delete(id);
  const from = d.window?.from;
  const entries = [...byId.values()].filter((e) => !from || e.date >= from || (e.actualDate ?? '') >= from);
  return { ...base, ...d.core, version: 1, savedAt: d.savedAt, window: d.window, entries };
}
