/* 種目の型（プリセット）＝ライフログの「やること」「食事」の枡をそのまま既定にした。
 *  やること: 境目 11:00 / 14:00 / 17:00（ライフログ ST_TOD の既定＝支出の実データの谷）＋「時間帯なし」
 *  食事    : 朝食 4:00〜10:30／昼食 10:30〜15:00／夕食 16:30〜24:00（ライフログ MEAL_SLOT_DEF）。隙間と 0〜4時は受け皿の「間食」へ
 */
import type { Track, TrackKind } from './types';

export type TrackPreset = Omit<Track, 'id' | 'sortOrder' | 'archived'>;

export const PRESETS: Record<TrackKind, TrackPreset> = {
  todo: {
    name: 'やること', icon: '◻️', kind: 'todo',
    slots: [
      { key: 'none', label: '時間帯なし', icon: '📋', startMin: null },
      { key: 'morning', label: '午前', icon: '🌅', startMin: 0 },
      { key: 'midday', label: '昼', icon: '☀️', startMin: 11 * 60 },
      { key: 'afternoon', label: '午後', icon: '🌇', startMin: 14 * 60 },
      { key: 'evening', label: '夕方以降', icon: '🌙', startMin: 17 * 60 },
    ],
    fallbackKey: 'none',
    features: { done: true, photos: false, calendar: true, actualFirst: false },
  },
  meal: {
    name: '食事', icon: '🍽', kind: 'meal',
    slots: [
      { key: 'breakfast', label: '朝食', icon: '🌅', startMin: 4 * 60 },
      { key: 'lunch', label: '昼食', icon: '🍱', startMin: 10 * 60 + 30, endMin: 15 * 60 },
      { key: 'dinner', label: '夕食', icon: '🌙', startMin: 16 * 60 + 30 },
      { key: 'snack', label: '間食', icon: '🍪', startMin: null },
    ],
    fallbackKey: 'snack',
    features: { done: false, photos: true, calendar: false, actualFirst: true },
  },
  activity: {
    name: '運動', icon: '🏃', kind: 'activity',
    slots: [
      { key: 'none', label: '時間帯なし', icon: '📋', startMin: null },
      { key: 'morning', label: '朝', icon: '🌅', startMin: 0 },
      { key: 'day', label: '日中', icon: '☀️', startMin: 10 * 60 },
      { key: 'night', label: '夜', icon: '🌙', startMin: 18 * 60 },
    ],
    fallbackKey: 'none',
    features: { done: true, photos: false, calendar: true, actualFirst: false },
  },
  custom: {
    name: '新しい種目', icon: '📌', kind: 'custom',
    slots: [
      { key: 'none', label: '時間帯なし', icon: '📋', startMin: null },
      { key: 'am', label: '午前', icon: '🌅', startMin: 0 },
      { key: 'pm', label: '午後', icon: '🌇', startMin: 12 * 60 },
    ],
    fallbackKey: 'none',
    features: { done: true, photos: false, calendar: true, actualFirst: false },
  },
};
export const KIND_LABEL: Record<TrackKind, string> = {
  todo: 'やること型（✅ を使う）', meal: '食事型（実際が主・📷）', activity: '運動型（✅・時刻つき）', custom: '白紙',
};
