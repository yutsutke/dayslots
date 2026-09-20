/* 🤖 BYOK（Bring Your Own Key＝本人の API キーを端末に置き、端末から直接 AI を呼ぶ）
 *  ・鍵は端末の設定（localStorage）だけに置く。サーバに送らない・ログに出さない・**エラー文にも出さない**（redact で伏せる）
 *  ・使うのは「写真 → 文字起こし」だけ。数値（カロリー等）は作らせない（レシートの金額は写っている数字なので可）
 *  ・返事は JSON だけを求め、こちらで検査してから使う（AI の出力を信用しない）
 *
 *  呼び先ごとの違いは **PROVIDERS の1枚** に閉じ込める（声で入れるカレンダー engine/ai.js の作りを写した）:
 *    endpoint（どこへ）／headers（どう名乗る）／body（どう包む）／extract（どこから取り出す）／models（一覧の取り方）
 *  足すときはこの表に1行増やすだけ＝呼ぶ側は何も変わらない。
 *
 *  ⚠ **モデルの一覧を決め打ちで持たない**＝表に書いた日から古くなり始める。先方に聞けば常に今の一覧が返る。
 *     聞きに行くのは**人が押した時だけ**（起動時に勝手に外へ行かない）。
 *  ⚠ OpenAI へ**直接**はつなげない＝ブラウザからの呼び出しを CORS で断られる（一覧は取れるのに生成だけ弾かれる）。
 *     GPT を使いたいときは **OpenRouter** を選び、モデルに `openai/…` を指定する＝それがこの答え。
 *  ⚠ このファイルが素の fetch なのは、呼び先が3つ（Anthropic／Google／OpenRouter）だから＝
 *     どれか1社の SDK では他の2つを呼べない。鍵も端末から出さない。
 */
import { checkGesture, type GestureRead } from '../domain/gesture';

export type AiProvider = 'anthropic' | 'gemini' | 'openrouter';
export interface AiSettings { provider: AiProvider; key: string; model: string; }

export interface ImageIn { mime: string; b64: string; }   // b64＝data: の頭を外した本体
export interface ModelChoice { id: string; label: string; }

const MAX_TOKENS = 2000;      // レシートの品目が多くても切れない余裕。切れたら extract が名指しで教える
const TIMEOUT_MS = 60_000;    // 写真の読み取りは時間がかかる。待てない長さではないが、無限には待たない

interface ProviderDef {
  label: string;
  defaultModel: string;
  keyHint: string;
  endpoint: (model: string) => string;
  headers: (key: string) => Record<string, string>;
  /** 写真＋言い聞かせ を、その呼び先の形に包む。⚠ 画像の書き方は3社とも違う */
  body: (prompt: string, images: ImageIn[], model: string) => unknown;
  extract: (res: unknown) => string;
  models: { needsKey: boolean; url: () => string; extract: (j: unknown) => ModelChoice[] };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export const PROVIDERS: Record<AiProvider, ProviderDef> = {
  anthropic: {
    label: 'Anthropic（Claude）',
    // ⚠ 日付の接尾辞は付けない（`claude-sonnet-5` がそのまま今の ID）。写真を読む仕事なので Haiku より上を既定に
    defaultModel: 'claude-sonnet-5',
    keyHint: 'sk-ant-…',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // 公式のブラウザ直叩きフラグ。名前は物々しいが BYOK（本人の鍵）は想定内の用途
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    body: (prompt, images, model) => ({
      model, max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: [
        ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } })),
        { type: 'text', text: prompt },
      ] }],
    }),
    extract: (res) => {
      const o = rec(res);
      // ⚠ content[0] の決め打ちにしない（先頭が text 以外のことがある）
      const texts = arr(o.content).map((b) => rec(b)).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string);
      if (!texts.length) throw new Error('AI の返事に文字がありませんでした');
      if (o.stop_reason === 'max_tokens') throw new Error('AI の返事が長さの上限で切れました（写真を分けて試してください）');
      return texts.join('');
    },
    models: {
      needsKey: true,
      url: () => 'https://api.anthropic.com/v1/models?limit=100',
      extract: (j) => arr(rec(j).data).map(rec).filter((m) => typeof m.id === 'string')
        .map((m) => ({ id: m.id as string, label: (m.display_name as string) || (m.id as string) })),
    },
  },
  gemini: {
    label: 'Google（Gemini）',
    defaultModel: 'gemini-2.5-flash',
    keyHint: 'AIza…',
    endpoint: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    // ⚠ 鍵は URL ではなくヘッダで渡す（URL に入れると履歴・ログ・Referer に残りうる）
    headers: (key) => ({ 'content-type': 'application/json', 'x-goog-api-key': key }),
    body: (prompt, images, _model) => ({
      contents: [{ role: 'user', parts: [
        ...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.b64 } })),
        { text: prompt },
      ] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: MAX_TOKENS, responseMimeType: 'application/json' },
    }),
    extract: (res) => {
      const cand = rec(arr(rec(res).candidates)[0]);
      const parts = arr(rec(cand.content).parts).map(rec).filter((p) => typeof p.text === 'string');
      if (!parts.length) throw new Error('AI の返事に文字がありませんでした');
      if (cand.finishReason === 'MAX_TOKENS') throw new Error('AI の返事が長さの上限で切れました（写真を分けて試してください）');
      return parts.map((p) => p.text as string).join('');
    },
    models: {
      needsKey: true,
      url: () => 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      extract: (j) => arr(rec(j).models).map(rec)
        // 文章を作れるものだけ（埋め込み専用などを混ぜない＝選べるのに動かないを作らない）
        .filter((m) => typeof m.name === 'string' && (!Array.isArray(m.supportedGenerationMethods) || (m.supportedGenerationMethods as string[]).includes('generateContent')))
        .map((m) => { const id = (m.name as string).replace(/^models\//, ''); return { id, label: (m.displayName as string) || id }; }),
    },
  },
  openrouter: {
    // 1つの鍵で GPT・Claude・Gemini などを叩ける中継所。API は OpenAI 互換。
    // 🔑 **これが「GPT を使いたい」への答え**＝OpenAI 直は CORS で塞がれているが、ここ経由なら `openai/…` が使える
    label: 'OpenRouter（GPT・Claude・Gemini などを1つの鍵で）',
    defaultModel: 'openai/gpt-5-nano',
    keyHint: 'sk-or-…',
    endpoint: () => 'https://openrouter.ai/api/v1/chat/completions',
    headers: (key) => ({
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      // 🚫 HTTP-Referer / X-Title（OpenRouter の順位づけ用）は送らない＝どのアプリから来たかを渡す必要が無い
    }),
    body: (prompt, images, model) => ({
      model, max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: [
        // ⚠ OpenAI 互換の画像は data: の頭を付けた丸ごとの URL（Anthropic・Gemini と書き方が違う）
        ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.b64}` } })),
        { type: 'text', text: prompt },
      ] }],
    }),
    extract: (res) => {
      const choice = rec(arr(rec(res).choices)[0]);
      const content = rec(choice.message).content;
      if (typeof content !== 'string' || !content) throw new Error('AI の返事に文字がありませんでした');
      if (choice.finish_reason === 'length') throw new Error('AI の返事が長さの上限で切れました（写真を分けて試してください）');
      return content;
    },
    // 一覧は鍵なしで取れる（誰でも見られる口）
    models: {
      needsKey: false,
      url: () => 'https://openrouter.ai/api/v1/models',
      extract: (j) => arr(rec(j).data).map(rec)
        // `:batch` はまとめ処理専用＝その場で返事を待つ使い方には合わない（選べるのに動かないを作らない）
        .filter((m) => typeof m.id === 'string' && !(m.id as string).endsWith(':batch'))
        .map((m) => ({ id: m.id as string, label: (m.name as string) || (m.id as string) })),
    },
  },
};

export const AI_DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: PROVIDERS.anthropic.defaultModel, gemini: PROVIDERS.gemini.defaultModel, openrouter: PROVIDERS.openrouter.defaultModel,
};
export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: PROVIDERS.anthropic.label, gemini: PROVIDERS.gemini.label, openrouter: PROVIDERS.openrouter.label,
};

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

export function aiConfigured(a?: AiSettings | null): boolean { return Boolean(a && a.key && PROVIDERS[a.provider]); }
export function modelFor(a: AiSettings): string { return (a.model || '').trim() || PROVIDERS[a.provider].defaultModel; }

// ── 失敗の言い方（鍵は絶対に混ぜない） ────────────────────────────
/** 返事の中に鍵がそのまま反射していても伏せる */
export function redact(msg: string, key: string): string { return key ? String(msg).split(key).join('***') : String(msg); }

/** 呼び先が本文に書いている理由を**捨てない**。status だけでは次の一手が打てない
 *  （400＝残高不足／404＝モデル名が無い、はどちらも本文にしか書いていない） */
function providerDetail(bodyText: string, key: string): string {
  if (!bodyText) return '';
  let msg = '';
  try { const e = rec(rec(JSON.parse(bodyText)).error); if (typeof e.message === 'string') msg = e.message; } catch { /* JSON でない＝生のまま短く出す */ }
  msg = redact((msg || bodyText).replace(/\s+/g, ' ').trim(), key);
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
export function honestHttpError(status: number, detail = ''): string {
  const tail = detail ? `: ${detail}` : '';
  if (status === 401 || status === 403) return `API キーが違うか、権限がありません（${status}）。⚙ の鍵を確かめてください${tail}`;
  if (status === 404) return `モデル名が見つかりません（404）。モデル欄を空にすると既定に戻ります${tail}`;
  if (status === 429) return `呼びすぎです（429）。しばらく待つか、呼び先の利用状況を確かめてください${tail}`;
  if (status >= 500) return `AI 側のサーバの不調です（${status}）。しばらくして試し直してください${tail}`;
  return `AI の呼び出しに失敗しました（HTTP ${status}）${tail}`;
}

/** 写真 → JSON 文字列（生）。呼び先ごとの差は PROVIDERS の1枚だけ */
async function callRaw(a: AiSettings, prompt: string, images: ImageIn[]): Promise<string> {
  const p = PROVIDERS[a.provider];
  if (!p) throw new Error('対応していない呼び先です');
  if (!a.key) throw new Error('API キーが設定されていません（⚙ → 🤖 で入れてください）');
  const model = modelFor(a);
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  let r: Response;
  try {
    r = await fetch(p.endpoint(model), { method: 'POST', headers: p.headers(a.key), body: JSON.stringify(p.body(prompt, images, model)), signal: ctrl?.signal });
  } catch {
    // ⚠ fetch が投げた中身にはキーや URL の断片が混じりうるので、そのまま外に出さない
    if (ctrl?.signal.aborted) throw new Error(`時間切れです（${TIMEOUT_MS / 1000}秒以内に ${model} の返事がありませんでした）。速いモデルに変えると通ることがあります`);
    throw new Error('ネットワークにつながりませんでした（圏外か、通信が塞がれています）');
  } finally { if (timer) clearTimeout(timer); }
  if (!r.ok) {
    let body = ''; try { body = await r.text(); } catch { /* 本文が読めなくても status は伝える */ }
    throw new Error(honestHttpError(r.status, providerDetail(body, a.key)));
  }
  let j: unknown;
  try { j = await r.json(); } catch { throw new Error('AI の返事を読めませんでした（JSON ではない返事）'); }
  return p.extract(j);
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
  const o = rec(raw);
  const date = str(o.date); const time = str(o.time);
  const items = arr(o.items).map((it) => { const x = rec(it); return { name: str(x.name) ?? '(不明)', price: num(x.price), qty: num(x.qty) }; }).filter((x) => x.name !== '(不明)' || x.price != null);
  return {
    store: str(o.store), date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null,
    total: num(o.total), items, payment: str(o.payment), note: str(o.note),
  };
}
export function checkMeal(raw: unknown): MealRead {
  const o = rec(raw);
  const origin = o.origin === 'home' || o.origin === 'store' || o.origin === 'out' ? o.origin : null;
  const items = arr(o.items).map((it) => { const x = rec(it); return { name: str(x.name) ?? '(不明)', kind: str(x.kind), amount: str(x.amount) }; });
  return { summary: str(o.summary), detail: str(o.detail), items, origin, origin_reason: str(o.origin_reason), note: str(o.note) };
}

export async function readReceipt(a: AiSettings, images: ImageIn[], hint = ''): Promise<ReceiptRead> {
  return checkReceipt(extractJson(await callRaw(a, hint ? `${PROMPTS.receipt}\n\n本人からの手がかり: ${hint}` : PROMPTS.receipt, images)));
}
export async function readMeal(a: AiSettings, images: ImageIn[], hint = ''): Promise<MealRead> {
  return checkMeal(extractJson(await callRaw(a, hint ? `${PROMPTS.meal}\n\n本人からの手がかり: ${hint}` : PROMPTS.meal, images)));
}
/** 📷 手の形を読む＝決まった顔ぶれから1つ選ばせる。顔ぶれに無い返事は unknown に落ちる（domain/gesture.ts が見張る） */
export async function readGesture(a: AiSettings, images: ImageIn[]): Promise<{ gesture: GestureRead; sure: boolean; reason: string | null }> {
  return checkGesture(extractJson(await callRaw(a, PROMPTS.gesture, images)));
}

/** モデルの一覧を先方に聞く。⚠ 決め打ちの表を持たない＝書いた日から古くなり始めるから。
 *  聞くのは**人が押した時だけ**（起動時に勝手に外へ行かない） */
export async function listModels(a: AiSettings): Promise<ModelChoice[]> {
  const p = PROVIDERS[a.provider];
  if (!p) throw new Error('対応していない呼び先です');
  if (p.models.needsKey && !a.key) throw new Error('先に API キーを入れてください（この呼び先は一覧にも鍵が要ります）');
  let r: Response;
  try {
    // 鍵の要らない先には認証ヘッダを送らない＝要らないものを渡さない
    r = await fetch(p.models.url(), { method: 'GET', headers: p.models.needsKey ? p.headers(a.key) : { 'content-type': 'application/json' } });
  } catch { throw new Error('モデルの一覧を取れませんでした（通信）'); }
  const body = await r.text().catch(() => '');
  if (!r.ok) throw new Error(honestHttpError(r.status, providerDetail(body, a.key)));
  let j: unknown;
  try { j = JSON.parse(body); } catch { throw new Error('モデルの一覧を読めませんでした（JSON ではない返事）'); }
  const list = p.models.extract(j);
  if (!list.length) throw new Error('モデルの一覧が空でした');
  // id の順に並べる＝提供元でまとまる（openai/… が並ぶ）＝目で探せる
  return list.slice().sort((x, y) => x.id.localeCompare(y.id));
}

/** 接続確認＝小さな返事を1回もらう（鍵・モデル・CORS がまとめて確かめられる最小の呼び出し） */
export async function pingAi(a: AiSettings): Promise<string> {
  const t = await callRaw(a, '「OK」とだけ返してください。', []);
  return t.trim().slice(0, 20) || '(空の返事)';
}
