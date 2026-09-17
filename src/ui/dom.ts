/* 画面の小道具＝要素を作る h()、下から出る板（modal）、時刻の入力欄。枠組み（React 等）は使わない */
import { fmtMin, parseHM } from '../domain/slots';

export type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v as Record<string, string>);
      else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  add(el, children);
  return el;
}
function add(el: Element, cs: Child[]): void {
  for (const c of cs) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** 中身を丸ごと入れ替える（配列・null を含む Child をそのまま渡せる） */
export function fill(el: Element, ...cs: Child[]): void { el.replaceChildren(); add(el, cs); }

export function modal(title: string, body: Child, opts: { onClose?: () => void; wide?: boolean } = {}): { close: () => void; el: HTMLElement } {
  const close = () => { wrap.remove(); opts.onClose?.(); };
  const wrap = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet' + (opts.wide ? ' wide' : '') },
      h('div', { class: 'sheetHead' }, h('b', null, title), h('button', { class: 'ghost', onclick: close }, '✕')),
      h('div', { class: 'sheetBody' }, body)));
  document.body.append(wrap);
  return { close, el: wrap };
}

export const timeInput = (value: number | null, onChange: (m: number | null) => void, attrs: Record<string, unknown> = {}) =>
  h('input', { type: 'time', value: value == null || value >= 1440 ? '' : fmtMin(value), oninput: (e: Event) => onChange(parseHM((e.target as HTMLInputElement).value)), ...attrs });

export const field = (label: string, ...ctl: Child[]) => h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctl' }, ...ctl));

export const hint = (text: string) => h('small', { class: 'hint' }, text);
