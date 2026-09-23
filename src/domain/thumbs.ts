/* 📷 サムネを記録の外へ（憲法8条「大きいものは記録に埋めない」の最初の宿題）
 *  v28 までは サムネ（長辺 320 の画像を文字にしたもの＝1枚 2〜4万文字）を記録の photos[].thumb に直接入れていた。
 *  端末の保存箱（localStorage＝約500万文字）が2か月ほどで溢れ、外の写しも太る。
 *  いまは本体と同じく IndexedDB（ブラウザの大きめの保存箱）に置き、記録には path＝'idb:<id>' の指だけを残す。
 *  ここは古い記録から移す段取り（置く先は外から渡す＝ここはブラウザを知らない・検査できる）。
 */
import type { Db, Photo } from './types';

/** 写真の id（IndexedDB の鍵）。'idb:' で指していない写真は移せない（null） */
export const photoId = (p: Photo): string | null => (p.path.startsWith('idb:') ? p.path.slice(4) : null);

/** 型と記録の写真を全部（型と記録は同じ写真を共有する＝id で1つに数える側が気にする） */
const allPhotos = (db: Db): Photo[] => [...db.entries.flatMap((e) => e.photos), ...db.templates.flatMap((t) => t.photos)];

/** 記録に埋まったままのサムネ＝id → 画像の文字。同じ写真は1つにまとめる */
export function inlineThumbs(db: Db): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of allPhotos(db)) { const id = photoId(p); if (id && p.thumb && !out.has(id)) out.set(id, p.thumb); }
  return out;
}

/** 外に置けた id のサムネだけ記録から外す。戻り＝外した写真の数（共有しているぶんも数える） */
export function dropThumbs(db: Db, moved: Set<string>): number {
  let n = 0;
  for (const p of allPhotos(db)) { const id = photoId(p); if (id && p.thumb && moved.has(id)) { delete p.thumb; n++; } }
  return n;
}

/** 移す＝先に外へ置き、置けたものだけ記録から外す（置けなかったものは記録に残す＝消えない）。
 *  戻り＝記録から外した数（0 なら保存し直さなくてよい） */
export async function moveThumbsOut(db: Db, put: (id: string, dataUrl: string) => Promise<void>): Promise<number> {
  const moved = new Set<string>();
  for (const [id, url] of inlineThumbs(db)) { try { await put(id, url); moved.add(id); } catch { /* 次に開いたときにまた試す */ } }
  return dropThumbs(db, moved);
}
