/* 🤖 BYOK（Bring Your Own Key＝本人の API キーを端末に置き、端末から直接 AI を呼ぶ）
 *  ・鍵は端末の設定（localStorage）だけに置く。サーバに送らない・ログに出さない・エラー文にも出さない
 *  ・使うのは「写真 → 文字起こし」だけ。数値（カロリー等）は作らせない（レシートの金額は写っている数字なので可）
 *  ・返事は JSON だけを求め、こちらで検査してから使う（AI の出力を信用しない＝声で入れるカレンダー engine/batch.js と同じ）
 *  ・呼び先は2つ: Anthropic（ブラウザからの直接呼び出しには専用ヘッダが要る）／Google Gemini
 */
import { GESTURES, checkGesture, type GestureRead } from '../domain/gesture';

export type AiProvider = 'anthropic' | 'gemini';
export interface AiSettings { provider: AiProvider; key: string; model: string; }
export const AI_DEFAULT_MODEL: Record<AiProvider, string> = { anthropic: 'claude-sonnet-5', gemini: 'gemini-2.5-flash' };
export const AI_PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: 'Anthropic（Claude）', gemini: 'Google（Gemini）' };

export interface ImageIn { mime: string; b64: string; }   // b64＝data: の頭を外した本体

/** 🧾 レシートの読み取り結果（AI に求める形。無い項目は null） */
export interface ReceiptRead {
  store: string | null;          // 店の名前
  date: string | null;           // 'YYYY-MM-DD'（レシートに印字されている日）
  time: string | null;           // 'HH:MM'
  total: number | null;          // 合計（円・税込）
  items: { name: string; price: number | null; qty: number | null }[];
  payment: string | null;        // 支払い方法（現金／クレジット／…）
  note: string | null;           // 読み取れなかった所・不確かな所
}
/** 🍽 食事の読み取り結果（Phase 2 で使う。形だけ先に置く） */
export interface MealRead {
  summary: string | null; detail: string | null;
  items: { name: string; kind: string | null; amount: string | null }[];
  origin: 'home' | 'store' | 'out' | null; origin_reason: string | null; note: string | null;
}

const PROMPTS = {
  receipt: `これはレシートの写真です。写っている内容を読み取り、次の JSON だけを返してください（説明文・コードフェンス不要）。
{"store": 店名 or null, "date": "YYYY-MM-DD" or null, "time": "HH:MM" or null, "total": 合計金額(数値・円) or null,
 "items": [{"name": 品名, "price": 金額(数値) or null, "qty": 個数(数値) or null}], "payment": 支払い方法 or null, "note": 読めなかった所・不確かな所 or null}
⚠ 写っていない数字を推測で作らない。読めない所は null にして note に書く。品名はレシートの表記のまま。`,
  meal: `これは食事の写真です。何を食べたかを読み取り、次の JSON だけを返してください（説明文・コードフェンス不要）。
{"summary": 何を食べたかの1行, "detail": 料理ごとの説明, "items": [{"name": 料理名, "kind": 主食/主菜/副菜/汁/飲み物/デザート or null, "amount": 量の見た目 or null}],
 "origin": "home"(手作り)|"store"(中食)|"out"(外食)|null, "origin_reason": そう判断した理由, "note": 不確かな所 or null}
⚠ カロリー・栄養素・グラムなどの数値は絶対に書かない（写真からは分からない）。`,
  gesture: `これは手の形（ハンドサイン）の写真です。次の顔ぶれのどれに当たるかを選び、JSON だけを返してください（説明文・コードフェンス不要）。
one=人差し指を1本だけ立てている／two=人差し指と中指の2本（ピース）／three=指を3本立てている／fist=すべて握っている（グー）／open=すべて開いている（パー）／thumb=親指だけを立てている（いいね）／unknown=手が写っていない・どれとも言えない
{"gesture": 上のどれか, "sure": true|false, "reason": そう見た理由 or null}
⚠ 上の顔ぶれに無い言葉を作らない。迷ったら unknown にするか sure を false に。
⚠ 手の形だけを見る。誰が写っているか・年齢・性別・背景など、人の特徴は一切書かない。`,
} as const;
export type ReadKind = keyof typeof PROMPTS;

export function aiConfigured(a?: AiSettings | null): boolean { return Boolean(a && a.key && a.provider); }

/** 写真 → JSON 文字列（生）。呼び先ごとの差はここだけ */
async function callRaw(a: AiSettings, prompt: string, images: ImageIn[], hint: string): Promise<string> {
  const text = hint ? `${prompt}\n\n本人からの手がかり: ${hint}` : prompt;
  const model = a.model || AI_DEFAULT_MODEL[a.provider];
  if (a.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': a.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: [
        ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } })), { type: 'text', text }] }] }),
    });
    if (!r.ok) throw new Error(`AI が返事をしませんでした（Anthropic HTTP ${r.status}${r.status === 401 ? '＝鍵が違う' : r.status === 429 ? '＝呼びすぎ' : ''}）`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).map((c) => c.text ?? '').join('');
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(a.key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.b64 } })), { text }] }], generationConfig: { temperature: 0.1 } }),
  });
  if (!r.ok) throw new Error(`AI が返事をしませんでした（Gemini HTTP ${r.status}${r.status === 400 || r.status === 403 ? '＝鍵かモデル名が違う' : ''}）`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

/** 返事の文字列から JSON を取り出す（コードフェンスや前置きが付いていても拾う） */
export function extractJson(s: string): unknown {
  const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* 下で範囲を探す */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('AI の返事が JSON ではありませんでした');
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^[\d,.]+$/.test(v.trim()) ? Number(v.replace(/,/g, '')) : null);

/** 検査＝形を整え、変な値は null に落とす（AI の出力を信用しない） */
export function checkReceipt(raw: unknown): ReceiptRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = str(o.date); const time = str(o.time);
  const items = Array.isArray(o.items) ? o.items.map((it) => { const x = (it ?? {}) as Record<string, unknown>; return { name: str(x.name) ?? '(不明)', price: num(x.price), qty: num(x.qty) }; }).filter((x) => x.name !== '(不明)' || x.price != null) : [];
  return {
    store: str(o.store), date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null,
    total: num(o.total), items, payment: str(o.payment), note: str(o.note),
  };
}
export function checkMeal(raw: unknown): MealRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const origin = o.origin === 'home' || o.origin === 'store' || o.origin === 'out' ? o.origin : null;
  const items = Array.isArray(o.items) ? o.items.map((it) => { const x = (it ?? {}) as Record<string, unknown>; return { name: str(x.name) ?? '(不明)', kind: str(x.kind), amount: str(x.amount) }; }) : [];
  return { summary: str(o.summary), detail: str(o.detail), items, origin, origin_reason: str(o.origin_reason), note: str(o.note) };
}

export async function readReceipt(a: AiSettings, images: ImageIn[], hint = ''): Promise<ReceiptRead> {
  return checkReceipt(extractJson(await callRaw(a, PROMPTS.receipt, images, hint)));
}
export async function readMeal(a: AiSettings, images: ImageIn[], hint = ''): Promise<MealRead> {
  return checkMeal(extractJson(await callRaw(a, PROMPTS.meal, images, hint)));
}
/** 📷 手の形を読む＝決まった顔ぶれから1つ選ばせる。顔ぶれに無い返事は unknown に落ちる（domain/gesture.ts が見張る） */
export async function readGesture(a: AiSettings, images: ImageIn[]): Promise<{ gesture: GestureRead; sure: boolean; reason: string | null }> {
  return checkGesture(extractJson(await callRaw(a, PROMPTS.gesture, images, '')));
}

/** 接続確認＝小さな返事を1回もらう */
export async function pingAi(a: AiSettings): Promise<string> {
  const t = await callRaw(a, '「OK」とだけ返してください。', [], '');
  return t.trim().slice(0, 20) || '(空の返事)';
}
