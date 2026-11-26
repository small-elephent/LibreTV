import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRightArrowHold, withPlaybackRate3 } from './playback-rate';

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

describe('withPlaybackRate3', () => {
  it('在现有档位末尾加 3，顺序不变', () => {
    expect(withPlaybackRate3(DEFAULT_RATES)).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
  });

  it('已经有 3 时不重复', () => {
    expect(withPlaybackRate3([0.5, 1, 2, 3])).toEqual([0.5, 1, 2, 3]);
  });

  it('直播播放器仍然关闭倍速菜单', () => {
    const src = readFileSync('src/components/live-player.tsx', 'utf8');
    expect(src).toContain('playbackRate: false');
  });

  it('松开右方向键时不因中途按下的修饰键跳过恢复', () => {
    const src = readFileSync('src/components/player-shell.tsx', 'utf8');
    const start = src.indexOf('const onKeyUp');
    const end = src.indexOf('const cancelRightHold');
    const fn = src.slice(start, end);
    expect(fn).toContain("e.key !== 'ArrowRight'");
    expect(fn).not.toMatch(/altKey|ctrlKey|metaKey|shiftKey/);
  });
});

describe('右方向键长按 3 倍', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function harness(initial = 1) {
    vi.useFakeTimers();
    let rate = initial;
    let paused = false;
    const seeks: number[] = [];
    const hints: string[] = [];
    const hold = createRightArrowHold({
      getRate: () => rate,
      setRate: (next) => {
        rate = next;
      },
      seek: () => {
        seeks.push(rate);
        return true;
      },
      isPaused: () => paused,
      onHint: (text) => hints.push(text),
    });
    return {
      hold,
      hints,
      seeks,
      get rate() {
        return rate;
      },
      setPaused(next: boolean) {
        paused = next;
      },
    };
  }

  it('轻点只快进一次，不改倍速', () => {
    const h = harness(1.5);
    expect(h.hold.onKeyDown({ repeat: false, paused: false })).toBe(true);
    vi.advanceTimersByTime(499);
    expect(h.rate).toBe(1.5);
    expect(h.seeks).toEqual([]);
    expect(h.hold.onKeyUp()).toBe(true);
    expect(h.seeks).toEqual([1.5]);
    expect(h.rate).toBe(1.5);
  });

  it('按住到阈值只进入 3 倍一次，松开回到按下前的倍速且不快进', () => {
    const h = harness(1.5);
    h.hold.onKeyDown({ repeat: false, paused: false });
    h.hold.onKeyDown({ repeat: true, paused: false });
    h.hold.onKeyDown({ repeat: true, paused: false });
    vi.advanceTimersByTime(500);
    expect(h.rate).toBe(3);
    expect(h.seeks).toEqual([]);
    expect(h.hints).toEqual(['3 倍速']);
    h.hold.onKeyDown({ repeat: true, paused: false });
    expect(h.rate).toBe(3);
    expect(h.hold.onKeyUp()).toBe(false);
    expect(h.seeks).toEqual([]);
    expect(h.rate).toBe(1.5);
    expect(h.hints.at(-1)).toBe('1.5 倍速');
  });

  it('按下前已经是 3 倍时，松开仍是 3 倍', () => {
    const h = harness(3);
    h.hold.onKeyDown({ repeat: false, paused: false });
    vi.advanceTimersByTime(500);
    expect(h.hold.onKeyUp()).toBe(false);
    expect(h.rate).toBe(3);
    expect(h.seeks).toEqual([]);
  });

  it('暂停时不加速，松开仍只快进一次', () => {
    const h = harness(1);
    h.setPaused(true);
    h.hold.onKeyDown({ repeat: false, paused: true });
    vi.advanceTimersByTime(1000);
    expect(h.rate).toBe(1);
    expect(h.hold.onKeyUp()).toBe(true);
    expect(h.seeks).toEqual([1]);
  });

  it('加速前取消不快进；加速后取消恢复原倍速，随后松开不再快进', () => {
    const pending = harness(2);
    pending.hold.onKeyDown({ repeat: false, paused: false });
    pending.hold.cancel();
    vi.advanceTimersByTime(500);
    expect(pending.rate).toBe(2);
    expect(pending.hold.onKeyUp()).toBe(false);
    expect(pending.seeks).toEqual([]);

    const boosted = harness(2);
    boosted.hold.onKeyDown({ repeat: false, paused: false });
    vi.advanceTimersByTime(500);
    boosted.hold.cancel();
    expect(boosted.rate).toBe(2);
    expect(boosted.hold.onKeyUp()).toBe(false);
    expect(boosted.seeks).toEqual([]);
  });

  it('孤立的重复 keydown 不快进', () => {
    const h = harness();
    expect(h.hold.onKeyDown({ repeat: true, paused: false })).toBe(true);
    expect(h.hold.onKeyUp()).toBe(false);
    expect(h.seeks).toEqual([]);
    expect(h.rate).toBe(1);
  });

  it('输入框和修饰键不启动手势', () => {
    const editable = harness(1.25);
    expect(editable.hold.onKeyDown({ repeat: false, paused: false, editable: true })).toBe(false);
    vi.advanceTimersByTime(500);
    expect(editable.hold.onKeyUp()).toBe(false);
    expect(editable.rate).toBe(1.25);
    expect(editable.seeks).toEqual([]);

    const modified = harness(1.25);
    expect(modified.hold.onKeyDown({ repeat: false, paused: false, altKey: true })).toBe(false);
    expect(modified.hold.onKeyDown({ repeat: false, paused: false, ctrlKey: true })).toBe(false);
    expect(modified.hold.onKeyDown({ repeat: false, paused: false, metaKey: true })).toBe(false);
    expect(modified.hold.onKeyDown({ repeat: false, paused: false, shiftKey: true })).toBe(false);
    vi.advanceTimersByTime(500);
    expect(modified.rate).toBe(1.25);
    expect(modified.seeks).toEqual([]);
  });
});
