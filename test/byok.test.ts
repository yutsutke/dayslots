import { describe, it, expect } from 'vitest';
import { PROVIDERS, AI_DEFAULT_MODEL, AI_PROVIDER_LABEL, aiConfigured, modelFor, redact, honestHttpError, extractJson, checkReceipt, checkMeal, type AiProvider, type AiSettings } from '../src/ai/byok';

const KEYS = Object.keys(PROVIDERS) as AiProvider[];
const IMG = [{ mime: 'image/jpeg', b64: 'AAAA' }];
const cfg = (p: AiProvider, model = ''): AiSettings => ({ provider: p, key: 'SECRET-KEY-123', model });

describe('呼び先の表（足すのは1行・呼ぶ側は変わらない）', () => {
  it('3つそろっている＝Anthropic／Google／OpenRouter', () => {
    expect(KEYS.sort()).toEqual(['anthropic', 'gemini', 'openrouter']);
  });

  it('どの呼び先にも 既定のモデル・呼び名・鍵の見本がある', () => {
    for (const k of KEYS) {
      expect(AI_DEFAULT_MODEL[k]).toBeTruthy();
      expect(AI_PROVIDER_LABEL[k]).toBeTruthy();
      expect(PROVIDERS[k].keyHint).toBeTruthy();
    }
  });

  it('OpenRouter の既定は openai 系＝「GPT を使いたい」への答えになっている', () => {
    expect(PROVIDERS.openrouter.defaultModel).toMatch(/^openai\//);
  });

  it('モデル名は空なら既定・書いてあればそれ（前後の空白は落とす）', () => {
    expect(modelFor(cfg('anthropic'))).toBe(PROVIDERS.anthropic.defaultModel);
    expect(modelFor(cfg('anthropic', '  '))).toBe(PROVIDERS.anthropic.defaultModel);
    expect(modelFor(cfg('openrouter', ' anthropic/claude-sonnet-5 '))).toBe('anthropic/claude-sonnet-5');
  });

  it('鍵が無い・知らない呼び先は「使える」と言わない', () => {
    expect(aiConfigured({ provider: 'anthropic', key: '', model: '' })).toBe(false);
    expect(aiConfigured({ provider: 'nope' as AiProvider, key: 'k', model: '' })).toBe(false);
    expect(aiConfigured(cfg('openrouter'))).toBe(true);
    expect(aiConfigured(null)).toBe(false);
  });
});

describe('写真の包み方は呼び先ごとに違う（同じ形で送らない）', () => {
  it('Anthropic＝image / base64 の source', () => {
    const b = PROVIDERS.anthropic.body('と', IMG, 'm') as { messages: { content: { type: string; source?: { data: string } }[] }[] };
    const im = b.messages[0].content[0];
    expect(im.type).toBe('image');
    expect(im.source?.data).toBe('AAAA');
  });

  it('Gemini＝inline_data（鍵は URL ではなくヘッダで渡す）', () => {
    const b = PROVIDERS.gemini.body('と', IMG, 'm') as { contents: { parts: { inline_data?: { data: string } }[] }[] };
    expect(b.contents[0].parts[0].inline_data?.data).toBe('AAAA');
    expect(PROVIDERS.gemini.headers('K')['x-goog-api-key']).toBe('K');
    expect(PROVIDERS.gemini.endpoint('m')).not.toContain('key=');
  });

  it('OpenRouter＝OpenAI 互換の image_url（data: の頭が要る）', () => {
    const b = PROVIDERS.openrouter.body('と', IMG, 'm') as { messages: { content: { type: string; image_url?: { url: string } }[] }[] };
    const im = b.messages[0].content[0];
    expect(im.type).toBe('image_url');
    expect(im.image_url?.url).toBe('data:image/jpeg;base64,AAAA');
    expect(PROVIDERS.openrouter.headers('K').authorization).toBe('Bearer K');
  });

  it('OpenRouter に順位づけ用の見出し（HTTP-Referer / X-Title）は送らない', () => {
    const hs = Object.keys(PROVIDERS.openrouter.headers('K')).map((x) => x.toLowerCase());
    expect(hs).not.toContain('http-referer');
    expect(hs).not.toContain('x-title');
  });
});

describe('返事の取り出し方', () => {
  it('Anthropic＝先頭が text でないブロックがあっても拾う', () => {
    expect(PROVIDERS.anthropic.extract({ content: [{ type: 'thinking' }, { type: 'text', text: '{}' }] })).toBe('{}');
  });
  it('Gemini／OpenRouter も同じく文字を取り出す', () => {
    expect(PROVIDERS.gemini.extract({ candidates: [{ content: { parts: [{ text: 'あ' }] } }] })).toBe('あ');
    expect(PROVIDERS.openrouter.extract({ choices: [{ message: { content: 'あ' } }] })).toBe('あ');
  });

  // ── 負のテスト ──
  it('文字が無い返事は、黙って空を返さず名指しで断る', () => {
    expect(() => PROVIDERS.anthropic.extract({ content: [] })).toThrow(/文字/);
    expect(() => PROVIDERS.gemini.extract({})).toThrow(/文字/);
    expect(() => PROVIDERS.openrouter.extract({ choices: [{ message: {} }] })).toThrow(/文字/);
  });

  it('長さの上限で切れた返事は「切れた」と言う（半端な JSON を通さない）', () => {
    expect(() => PROVIDERS.anthropic.extract({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] })).toThrow(/切れ/);
    expect(() => PROVIDERS.gemini.extract({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] })).toThrow(/切れ/);
    expect(() => PROVIDERS.openrouter.extract({ choices: [{ finish_reason: 'length', message: { content: '{' } }] })).toThrow(/切れ/);
  });
});

describe('モデルの一覧（決め打ちの表を持たない）', () => {
  it('OpenRouter は鍵なしで聞ける・他の2つは鍵が要る', () => {
    expect(PROVIDERS.openrouter.models.needsKey).toBe(false);
    expect(PROVIDERS.anthropic.models.needsKey).toBe(true);
    expect(PROVIDERS.gemini.models.needsKey).toBe(true);
  });

  it('それぞれの返事から id と呼び名を取り出す', () => {
    expect(PROVIDERS.anthropic.models.extract({ data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }] }))
      .toEqual([{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }]);
    expect(PROVIDERS.gemini.models.extract({ models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] }] }))
      .toEqual([{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]);
    expect(PROVIDERS.openrouter.models.extract({ data: [{ id: 'openai/gpt-5-nano', name: 'GPT-5 Nano' }] }))
      .toEqual([{ id: 'openai/gpt-5-nano', label: 'GPT-5 Nano' }]);
  });

  it('使えないものは一覧に混ぜない（選べるのに動かないを作らない）', () => {
    // Gemini: 文章を作れないもの（埋め込み専用）は外す
    expect(PROVIDERS.gemini.models.extract({ models: [{ name: 'models/embed-1', supportedGenerationMethods: ['embedContent'] }] })).toEqual([]);
    // OpenRouter: :batch はまとめ処理専用＝その場で返事を待てない
    expect(PROVIDERS.openrouter.models.extract({ data: [{ id: 'openai/gpt-5-nano:batch' }] })).toEqual([]);
  });

  it('形が壊れた返事でも落ちずに空を返す', () => {
    for (const k of KEYS) for (const bad of [null, {}, { data: 'x' }, { models: 3 }]) {
      expect(PROVIDERS[k].models.extract(bad)).toEqual([]);
    }
  });
});

describe('失敗の言い方＝鍵を絶対に出さない・理由は捨てない', () => {
  it('返事が鍵を反射してきても伏せる', () => {
    expect(redact('bad key SECRET-KEY-123 here', 'SECRET-KEY-123')).toBe('bad key *** here');
    expect(redact('なにも無い', '')).toBe('なにも無い');
  });

  it('status ごとに、原因と次の一手を日本語で言う', () => {
    expect(honestHttpError(401)).toMatch(/キー/);
    expect(honestHttpError(404)).toMatch(/モデル名/);
    expect(honestHttpError(429)).toMatch(/呼びすぎ/);
    expect(honestHttpError(503)).toMatch(/サーバ/);
    expect(honestHttpError(418)).toMatch(/HTTP 418/);
  });

  it('呼び先が本文に書いた理由を添える（status だけでは次の一手が打てない）', () => {
    expect(honestHttpError(400, 'credit balance is too low')).toContain('credit balance is too low');
  });
});

describe('返事の検査（AI の出力を信用しない）', () => {
  it('コードフェンスや前置きが付いていても JSON を拾う', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('はい、これです {"a":1} 以上')).toEqual({ a: 1 });
    expect(() => extractJson('ぜんぜん JSON でない')).toThrow(/JSON/);
  });

  it('レシート＝変な値は null に落とす・日付と時刻は形を見る', () => {
    const r = checkReceipt({ store: ' 店 ', date: '2026/09/20', time: '9:05', total: '1,200', items: [{ name: 'パン', price: 200 }], note: '' });
    expect(r).toMatchObject({ store: '店', date: null, time: '09:05', total: 1200, note: null });
    expect(r.items).toEqual([{ name: 'パン', price: 200, qty: null }]);
  });

  it('食事＝出どころは決まった3つだけ・数値は持たない形のまま', () => {
    expect(checkMeal({ origin: 'restaurant' }).origin).toBeNull();
    expect(checkMeal({ origin: 'out' }).origin).toBe('out');
    expect(checkMeal(null).items).toEqual([]);
  });
});
