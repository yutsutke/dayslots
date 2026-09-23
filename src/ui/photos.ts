/* 📷 写真＝選ぶ／撮る → 縮小 → 端末に置く
 *  ・本体（長辺 1568・JPEG）もサムネ（長辺 320）も IndexedDB（ブラウザの大きめの保存箱）に置き、記録は photos[].path = 'idb:<id>' で指すだけ
 *    （localStorage は 5MB ほどしか無い。v28 まではサムネを記録に埋めていて、2か月ほどで溢れる勘定だった＝憲法8条）
 *  ・古い記録に残る photos[].thumb は起動時に移す（src/domain/thumbs.ts）。移すまでの間は thumb をそのまま出す
 *  ・寸法はライフログの meals と同じ（1568／320）
 */
import type { Photo } from '../domain/types';
import { photoId } from '../domain/thumbs';
import { h } from './dom';
import type { ImageIn } from '../ai/byok';

// 棚は2つ＝本体（blobs）とサムネ（thumbs）。鍵はどちらも同じ写真の id
const DB = 'dayslots.photos', FULL = 'blobs', THUMB = 'thumbs';
type Shelf = typeof FULL | typeof THUMB;
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 2); // 2＝サムネの棚を足した（v29）
    r.onupgradeneeded = () => { for (const s of [FULL, THUMB]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
}
async function put(shelf: Shelf, id: string, blob: Blob): Promise<void> {
  const db = await idb();
  await new Promise<void>((ok, ng) => { const tx = db.transaction(shelf, 'readwrite'); tx.objectStore(shelf).put(blob, id); tx.oncomplete = () => ok(); tx.onerror = () => ng(tx.error); });
}
async function get(shelf: Shelf, id: string): Promise<Blob | null> {
  const db = await idb();
  return new Promise((ok, ng) => { const r = db.transaction(shelf).objectStore(shelf).get(id); r.onsuccess = () => ok((r.result as Blob) ?? null); r.onerror = () => ng(r.error); });
}
export const putBlob = (id: string, blob: Blob): Promise<void> => put(FULL, id, blob);
export const getBlob = (id: string): Promise<Blob | null> => get(FULL, id);
/** 写真を消す＝本体もサムネも */
export async function delBlob(id: string): Promise<void> {
  const db = await idb();
  await new Promise<void>((ok) => { const tx = db.transaction([FULL, THUMB], 'readwrite'); tx.objectStore(FULL).delete(id); tx.objectStore(THUMB).delete(id); tx.oncomplete = () => ok(); tx.onerror = () => ok(); });
  const u = thumbUrls.get(id); if (u) URL.revokeObjectURL(u); thumbUrls.delete(id);
}
/** 古い記録に埋まっていたサムネ（画像の文字）を棚へ移す（src/domain/thumbs.ts の moveThumbsOut に渡す） */
export async function putThumbDataUrl(id: string, dataUrl: string): Promise<void> {
  await put(THUMB, id, await (await fetch(dataUrl)).blob());
}

// サムネの表示用 URL の控え＝描き直しのたびに IndexedDB を開かない（null＝この端末には無い）
const thumbUrls = new Map<string, string | null>();
const thumbLoads = new Map<string, Promise<string | null>>();
function thumbUrl(id: string): Promise<string | null> {
  let p = thumbLoads.get(id);
  if (!p) {
    p = get(THUMB, id).then((b) => (b ? URL.createObjectURL(b) : null), () => null).then((u) => { thumbUrls.set(id, u); thumbLoads.delete(id); return u; });
    thumbLoads.set(id, p);
  }
  return p;
}
/** この端末に写真が無い（別の端末で撮った写真＝写しには指しか入らない）ときの代わり */
const noPhoto = (cls: string): HTMLElement => h('span', { class: `${cls} none`, title: 'この端末には写真がありません（撮った端末にあります）' }, '📷');
/** サムネを出す <img>。棚から読むのは後から（描き直しを待たせない） */
export function thumbImg(p: Photo, cls = 'thumb'): HTMLElement {
  const img = h('img', { class: cls, alt: '' });
  if (p.thumb) { img.src = p.thumb; return img; } // まだ移していない古い記録
  const id = photoId(p);
  if (!id) { img.src = p.path; return img; }
  const hit = thumbUrls.get(id);
  if (hit) { img.src = hit; return img; }
  if (hit === null) return noPhoto(cls);
  void thumbUrl(id).then((u) => { if (u) img.src = u; else img.replaceWith(noPhoto(cls)); });
  return img;
}

/** ファイルを選ぶ（iPhone では「写真を撮る／ライブラリ」の選択肢が出る） */
export function pickImages(multiple = false): Promise<File[]> {
  return new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    inp.onchange = () => ok(Array.from(inp.files ?? []));
    inp.click();
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, ng) => { const url = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); ok(im); }; im.onerror = () => ng(new Error('画像を開けませんでした')); im.src = url; });
}
async function shrink(im: HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; dataUrl: string }> {
  const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  const blob = await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error('縮小できませんでした'))), 'image/jpeg', quality));
  return { blob, dataUrl };
}

/** 1枚を取り込む＝本体を IndexedDB へ、サムネを Photo に。戻り＝記録に入れる Photo と、AI に渡す本体 */
export async function importPhoto(file: File): Promise<{ photo: Photo; image: ImageIn }> {
  const im = await loadImage(file);
  const full = await shrink(im, 1568, 0.85);
  const thumb = await shrink(im, 320, 0.8);
  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()));
  await putBlob(id, full.blob); await put(THUMB, id, thumb.blob);
  thumbUrls.set(id, URL.createObjectURL(thumb.blob));
  return { photo: { path: `idb:${id}` }, image: { mime: 'image/jpeg', b64: full.dataUrl.split(',')[1] } };
}
/** 読むだけの写真＝📷 手の形の合図など。**どこにも保存しない**（記録にも IndexedDB にも置かない＝憲法8条）。
 *  手の形が分かれば足りるので、長辺 768 まで小さくして送る（速く・安く） */
export async function readOnlyImage(file: File): Promise<ImageIn> {
  const im = await loadImage(file);
  const small = await shrink(im, 768, 0.8);
  return { mime: 'image/jpeg', b64: small.dataUrl.split(',')[1] };
}

async function b64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
/** 記録の写真を AI に渡せる形にする（本体が無ければサムネで） */
export async function imageOf(p: Photo): Promise<ImageIn | null> {
  const id = photoId(p);
  if (id) { const b = (await getBlob(id)) ?? (await get(THUMB, id)); if (b) return { mime: 'image/jpeg', b64: await b64(b) }; }
  if (p.thumb?.startsWith('data:')) return { mime: 'image/jpeg', b64: p.thumb.split(',')[1] };
  return null;
}
/** 本体を開く（拡大表示用）。無ければサムネ */
export async function urlOf(p: Photo): Promise<string> {
  const id = photoId(p);
  if (id) { const b = await getBlob(id); if (b) return URL.createObjectURL(b); const t = await thumbUrl(id); if (t) return t; }
  return p.thumb ?? p.path;
}
