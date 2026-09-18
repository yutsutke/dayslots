/* 見本のデータ＝初めて開いたときに入っているもの（⚙ から「見本に戻す」でも使う）。
 *  スクリーンショット（ライフログ 2026-09-13〜）の並びを少しだけ写した。実データではない。 */
import type { Db, Entry, Track, Template, Rule } from '../domain/types';
import { PRESETS } from '../domain/defaults';
import { todayYMD, addDays } from '../domain/dates';

export function seedDb(today = todayYMD()): Db {
  const iso = new Date().toISOString();
  const mk = (kind: keyof typeof PRESETS, id: string, order: number): Track => ({ ...structuredClone(PRESETS[kind]), id, sortOrder: order, archived: false });
  const tracks = [mk('todo', 't-todo', 0), mk('meal', 't-meal', 1), mk('activity', 't-act', 2), mk('habit', 't-zazen', 3), mk('receipt', 't-rcpt', 4)];
  const base: Omit<Entry, 'id' | 'trackId' | 'date' | 'title'> = {
    slotKey: null, planStart: null, planEnd: null, actualDate: null, actualStart: null, actualEnd: null,
    doneAt: null, skippedAt: null, insteadOfId: null, note: null, priority: 0, tag: null, templateId: null,
    ruleId: null, ruleDate: null, photos: [], payload: {}, calendar: false, sortOrder: 0, createdAt: iso, updatedAt: iso,
  };
  const y = addDays(today, -1);
  const e = (id: string, trackId: string, date: string, title: string, more: Partial<Entry> = {}): Entry => ({ ...base, id, trackId, date, title, ...more });
  const entries: Entry[] = [
    e('e1', 't-todo', y, '今日のこと', { planStart: 520, doneAt: iso, actualDate: y, actualStart: 522, ruleId: 'r-today', ruleDate: y }),
    e('e2', 't-todo', y, '洗車タオル', { slotKey: 'none', doneAt: iso, actualDate: y }),
    e('e3', 't-todo', today, '1テーマで考える', { slotKey: 'afternoon', skippedAt: iso }),
    e('e4', 't-todo', today, '映画の振り返り', { slotKey: 'afternoon', doneAt: iso, actualDate: today, insteadOfId: 'e3' }),
    e('e5', 't-todo', today, '翌週の伝票づくり', { planStart: 15 * 60 + 20, planEnd: 15 * 60 + 45, calendar: true, priority: 1 }),
    e('e6', 't-meal', y, 'いつもの（小松菜・にんじん・スープ）', { actualDate: y, actualStart: 7 * 60 + 30, payload: { origin: 'home' }, templateId: 'tp-bf' }),
    e('e7', 't-meal', y, '魚', { actualDate: y, actualStart: 12 * 60 + 30, payload: { origin: 'store' } }),
    e('e8', 't-meal', y, 'バナナ', { actualDate: y, actualStart: 15 * 60 + 30, payload: { origin: 'home' }, templateId: 'tp-banana' }),
    e('e9', 't-meal', today, 'うどん', { actualDate: today, actualStart: 8 * 60, payload: { origin: 'home' } }),
    e('e10', 't-act', today, '朝散歩', { planStart: 6 * 60 + 30, planEnd: 7 * 60, doneAt: iso, actualDate: today, actualStart: 6 * 60 + 35, actualEnd: 7 * 60 + 5, calendar: true, templateId: 'tp-walk' }),
    e('e11', 't-zazen', addDays(today, -3), '座禅', { doneAt: iso, actualDate: addDays(today, -3) }),
    e('e12', 't-zazen', addDays(today, -2), '座禅', { doneAt: iso, actualDate: addDays(today, -2), actualStart: 5 * 60 + 40, actualEnd: 6 * 60 }),
    e('e13', 't-zazen', y, '座禅', { skippedAt: iso, note: '寝坊' }),
  ];
  const t = (id: string, trackId: string, name: string, more: Partial<Template> = {}): Template => ({
    id, trackId, name, slotKey: null, title: name, note: null, payload: {}, photos: [], planStart: null, planEnd: null, calendar: false, sortOrder: 0, createdAt: iso, updatedAt: iso, ...more,
  });
  const templates: Template[] = [
    t('tp-bf', 't-meal', 'いつもの朝ごはん', { slotKey: 'breakfast', title: 'いつもの（小松菜・にんじん・スープ）', payload: { origin: 'home' } }),
    t('tp-banana', 't-meal', 'バナナ', { slotKey: 'snack', payload: { origin: 'home' } }),
    t('tp-walk', 't-act', '朝散歩', { planStart: 6 * 60 + 30, planEnd: 7 * 60, calendar: true }),
  ];
  const r = (id: string, trackId: string, title: string, more: Partial<Rule> = {}): Rule => ({
    id, trackId, title, note: null, payload: {}, templateId: null, freq: 'daily', byday: [], interval: null, half: null, dayFrom: null, dayTo: null,
    startDate: addDays(today, -30), endDate: null, slotKey: null, planStart: null, planEnd: null, priority: 0, tag: null,
    auto: false, active: true, calendar: false, exceptions: {}, sortOrder: 0, createdAt: iso, updatedAt: iso, ...more,
  });
  const rules: Rule[] = [
    r('r-today', 't-todo', '今日のこと', { planStart: 8 * 60 + 40, auto: true }),
    r('r-tomorrow', 't-todo', '明日のこと', { planStart: 20 * 60 + 40, auto: true }),
    r('r-slip', 't-todo', '週初 伝票提出', { freq: 'firstworkday', planStart: 8 * 60 + 30, auto: false }),
    r('r-review', 't-todo', '日 まとめて考える', { freq: 'weekly', byday: [0], slotKey: 'none', auto: false }),
    r('r-gym', 't-act', '夜ジム', { freq: 'weekly', byday: [1, 3, 5], planStart: 19 * 60, planEnd: 20 * 60, auto: false, calendar: true }),
  ];
  return { version: 1, tracks, entries, templates, rules, holidays: [], calendarMap: [], settings: { weekStart: 0, supabaseUrl: '', calendarSecret: '' } };
}
