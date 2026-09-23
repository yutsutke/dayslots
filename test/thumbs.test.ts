import { describe, it, expect } from 'vitest';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { inlineThumbs, moveThumbsOut, photoId } from '../src/domain/thumbs';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);
const URL1 = 'data:image/jpeg;base64,AAAA', URL2 = 'data:image/jpeg;base64,BBBB';

describe('📷 サムネを記録の外へ（憲法8条）', () => {
  it('写真の id＝idb: の後ろ。idb で指していない写真は移せない', () => {
    expect(photoId({ path: 'idb:abc' })).toBe('abc');
    expect(photoId({ path: 'https://example.com/a.jpg' })).toBeNull();
  });
  it('移せたサムネは記録から外れ、指（path）は残る', async () => {
    const r = await open();
    const e = r.addEntry('t-todo', { title: '昼', date: TODAY, photos: [{ path: 'idb:p1', thumb: URL1 }, { path: 'idb:p2', thumb: URL2 }] });
    const put: Record<string, string> = {};
    const n = await moveThumbsOut(r.db, async (id, url) => { put[id] = url; });
    expect(n).toBe(2);
    expect(put).toEqual({ p1: URL1, p2: URL2 });
    expect(e.photos).toEqual([{ path: 'idb:p1' }, { path: 'idb:p2' }]);
    expect(JSON.stringify(r.db)).not.toContain('data:image');
  });
  it('型と記録で共有する写真は1回だけ置き、両方から外す', async () => {
    const r = await open();
    r.addEntry('t-todo', { title: 'a', date: TODAY, photos: [{ path: 'idb:p1', thumb: URL1 }] });
    r.db.templates[0].photos = [{ path: 'idb:p1', thumb: URL1 }];
    expect(inlineThumbs(r.db).size).toBe(1);
    let calls = 0;
    const n = await moveThumbsOut(r.db, async () => { calls++; });
    expect(calls).toBe(1); expect(n).toBe(2);
    expect(r.db.templates[0].photos[0].thumb).toBeUndefined();
  });
  it('置けなかったサムネは記録に残す（消えない）', async () => {
    const r = await open();
    const e = r.addEntry('t-todo', { title: 'a', date: TODAY, photos: [{ path: 'idb:ok', thumb: URL1 }, { path: 'idb:ng', thumb: URL2 }] });
    const n = await moveThumbsOut(r.db, async (id) => { if (id === 'ng') throw new Error('満杯'); });
    expect(n).toBe(1);
    expect(e.photos).toEqual([{ path: 'idb:ok' }, { path: 'idb:ng', thumb: URL2 }]);
  });
  it('idb で指していない写真のサムネには触らない・移すものが無ければ 0', async () => {
    const r = await open();
    const e = r.addEntry('t-todo', { title: 'a', date: TODAY, photos: [{ path: 'x.jpg', thumb: URL1 }, { path: 'idb:p3' }] });
    let calls = 0;
    expect(await moveThumbsOut(r.db, async () => { calls++; })).toBe(0);
    expect(calls).toBe(0);
    expect(e.photos[0].thumb).toBe(URL1);
  });
});
