/* Google ドライブに丸ごと1つの文書（JSON）を置く／読む。
 *  ・ログイン＝Google Identity Services（ブラウザで Google のログイン窓を開き、短命のトークンをもらう仕組み）。
 *    トークンは端末の中だけ・約1時間で切れる＝切れたらもう一度窓が開く。refresh token は持たない（サーバが無いため）
 *  ・権限は drive.file（＝このアプリが作ったファイルだけ触れる）。他のファイルは見えない
 *  ・置き場は本人が指定したフォルダ（URL か ID）。ファイル名 koma.json（SQLite は koma.sqlite）
 *  ⚠ Capacitor（iOS の殻）の中ではこのログイン窓が開かないことがある＝TODO（ネイティブのログインに替える）
 */
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GIS = { accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }) => TokenClient } } };

let token: { value: string; exp: number } | null = null;

function loadGis(): Promise<GIS> {
  return new Promise((ok, ng) => {
    const w = window as unknown as { google?: GIS };
    if (w.google?.accounts) { ok(w.google); return; }
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => (w.google ? ok(w.google) : ng(new Error('Google のログイン部品が読めませんでした'))); s.onerror = () => ng(new Error('Google のログイン部品が読めませんでした（ネット？）'));
    document.head.append(s);
  });
}
/** トークンを得る（生きていればそのまま） */
export async function driveToken(clientId: string): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  if (!clientId) throw new Error('Google の Client ID が入っていません（⚙ → 保存場所）');
  const g = await loadGis();
  return new Promise((ok, ng) => {
    const c = g.accounts.oauth2.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: (r) => {
      if (r.access_token) { token = { value: r.access_token, exp: Date.now() + 55 * 60_000 }; ok(r.access_token); } else ng(new Error(`Google にログインできませんでした（${r.error ?? '不明'}）`));
    } });
    c.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}
export function driveSignOut(): void { token = null; }

/** フォルダの URL か ID → ID */
export function folderIdOf(s: string): string {
  const m = /folders\/([\w-]+)/.exec(s); return (m ? m[1] : s).trim();
}
const API = 'https://www.googleapis.com/drive/v3';
async function call(tok: string, url: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> ?? {}), Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`Google ドライブが返事をしませんでした（HTTP ${r.status}${r.status === 404 ? '＝フォルダが見つからない／権限がない' : ''}）`);
  return r;
}
/** フォルダ内の名前でファイルを探す（無ければ null） */
export async function findFile(tok: string, folderId: string, name: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`);
  const j = (await (await call(tok, `${API}/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive`)).json()) as { files: { id: string; modifiedTime: string }[] };
  return j.files[0] ?? null;
}
/** 作る／上書きする。戻り＝ファイル ID */
export async function putFile(tok: string, folderId: string, name: string, body: Blob, mime: string): Promise<string> {
  const hit = await findFile(tok, folderId, name);
  if (hit) { await call(tok, `https://www.googleapis.com/upload/drive/v3/files/${hit.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': mime }, body }); return hit.id; }
  const meta = new Blob([JSON.stringify({ name, parents: [folderId], mimeType: mime })], { type: 'application/json' });
  const form = new FormData(); form.append('metadata', meta); form.append('file', body);
  const j = (await (await call(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form })).json()) as { id: string };
  return j.id;
}
export async function getFileText(tok: string, fileId: string): Promise<string> {
  return (await call(tok, `${API}/files/${fileId}?alt=media`)).text();
}
