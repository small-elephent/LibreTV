import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  DISCOVERY_MOODS,
  DISCOVERY_PAGE_SIZE,
  nextPageOffset,
  pageOf,
  pickOne,
  picksForMood,
} from './discovery';

const FORBIDDEN = /评分|热度|爆款|热播|排行|榜单|豆瓣高分/;

describe('今天看什么策展', () => {
  it('四个心情都能翻出不同的一页，且没有评分或热度文案', () => {
    expect(DISCOVERY_MOODS.map((m) => m.id)).toEqual(['easy', 'mystery', 'action', 'warm']);
    const firstPages = DISCOVERY_MOODS.map((mood) => pageOf(picksForMood(mood.id), 0).map((item) => item.id));
    expect(new Set(firstPages.map((page) => page.join('|'))).size).toBe(DISCOVERY_MOODS.length);

    for (const mood of DISCOVERY_MOODS) {
      const items = picksForMood(mood.id);
      expect(items.length).toBeGreaterThan(DISCOVERY_PAGE_SIZE);
      const first = pageOf(items, 0);
      const second = pageOf(items, nextPageOffset(items.length, 0));
      expect(first).toHaveLength(DISCOVERY_PAGE_SIZE);
      expect(second.map((item) => item.id).some((id) => !first.some((item) => item.id === id))).toBe(true);
      expect(first.some((item) => second.some((other) => other.id === item.id))).toBe(false);
    }

    for (const item of CATALOG) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.reason.trim().length).toBeGreaterThan(0);
      expect(item.reason).not.toMatch(FORBIDDEN);
      expect(item.kind === '电影' || item.kind === '剧集').toBe(true);
      expect(item.year === undefined || (Number.isInteger(item.year) && item.year >= 1900 && item.year <= 2026)).toBe(
        true
      );
      expect('rating' in item || 'cover' in item).toBe(false);
    }
  });

  it('换页步进一整页；随机挑选尊重传入的 random', () => {
    expect(nextPageOffset(12, 0)).toBe(6);
    expect(nextPageOffset(12, 6)).toBe(0);
    expect(nextPageOffset(1, 0)).toBe(0);

    const items = picksForMood('easy');
    expect(pickOne(items, () => 0)?.id).toBe(items[0].id);
    expect(pickOne(items, () => 0.999)?.id).toBe(items[items.length - 1].id);
    expect(pickOne([], () => 0)).toBeUndefined();
  });
});
