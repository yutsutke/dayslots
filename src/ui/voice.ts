/* 🎤 音声入力＝ブラウザの音声認識（Web Speech API・iPhone の Safari と Chrome で動く）。
 *  聞き取った文をそのまま合図の欄に入れて通す。認識はオンデバイス/OS 任せ＝このアプリは音声を保存しない。
 *  ⚠ 無い環境（古い WebView 等）では null を返す＝ボタンを出さない */
type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { [i: number]: { isFinal: boolean } & ArrayLike<{ transcript: string }> } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; };
type RecCtor = new () => Rec;

export function speechAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
/** 1回聞く。途中経過は onInterim、確定は onFinal。止めるには戻りの stop() */
export function listen(onInterim: (t: string) => void, onFinal: (t: string) => void, onError: (msg: string) => void): { stop: () => void } | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition; if (!C) return null;
  const r = new C(); r.lang = 'ja-JP'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
  let done = false;
  r.onresult = (e) => {
    let text = ''; let fin = false;
    for (let i = 0; i < e.results.length; i++) { const res = e.results[i]; text += res[0]?.transcript ?? ''; if (res.isFinal) fin = true; }
    if (fin) { done = true; onFinal(text.trim()); } else onInterim(text);
  };
  r.onerror = (e) => { if (!done) onError(e.error === 'not-allowed' ? 'マイクの許可がありません（ブラウザの設定で許可してください）' : e.error === 'no-speech' ? '声が聞こえませんでした' : `音声認識が止まりました（${e.error}）`); };
  r.onend = () => { if (!done) onInterim(''); };
  try { r.start(); } catch { onError('音声認識を始められませんでした'); return null; }
  return { stop: () => r.stop() };
}
