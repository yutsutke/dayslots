/* 📷 写真＝選ぶ／撮る → 縮小 → 端末に置く
 *  ・サムネ（長辺 320・data URL）は記録の photos[].thumb に直接入れる＝升目に出すのはこれだけ（軽い）
 *  ・本体（長辺 1568・JPEG）は IndexedDB（ブラウザの大きめの保存箱）に置き、photos[].path = 'idb:<id>' で指す
 *    （localStorage は 5MB ほどしか無く、本体を入れると数枚で溢れる）
 *  ・寸法はライフログの meals と同じ（1568／320）
 */
import type { Photo } from '../domain/types';
import type { ImageIn } from '../ai/byok';

const DB = 'dayslots.photos', STORE = 'blobs';
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
}
export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await idb();
  await new Promise<void>((ok, ng) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => ok(); tx.onerror = () => ng(tx.error); });
}
export async function getBlob(id: string): Promise<Blob | null> {
  const db = await idb();
  return new Promise((ok, ng) => { const r = db.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => ok((r.result as Blob) ?? null); r.onerror = () => ng(r.error); });
}
export async function delBlob(id: string): Promise<void> {
  const db = await idb();
  await new Promise<void>((ok) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => ok(); tx.onerror = () => ok(); });
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
  await putBlob(id, full.blob);
  return { photo: { path: `idb:${id}`, thumb: thumb.dataUrl }, image: { mime: 'image/jpeg', b64: full.dataUrl.split(',')[1] } };
}
/** 記録の写真を AI に渡せる形にする（本体が無ければサムネで） */
export async function imageOf(p: Photo): Promise<ImageIn | null> {
  if (p.path.startsWith('idb:')) {
    const b = await getBlob(p.path.slice(4));
    if (b) { const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return { mime: 'image/jpeg', b64: btoa(s) }; }
  }
  if (p.thumb?.startsWith('data:')) return { mime: 'image/jpeg', b64: p.thumb.split(',')[1] };
  return null;
}
/** 本体を開く（拡大表示用）。無ければサムネ */
export async function urlOf(p: Photo): Promise<string> {
  if (p.path.startsWith('idb:')) { const b = await getBlob(p.path.slice(4)); if (b) return URL.createObjectURL(b); }
  return p.thumb ?? p.path;
}
