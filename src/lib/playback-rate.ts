/** ArtPlayer 默认档位之外补上 3 倍。已有 3 时不重复，其余档位和顺序保持原样。 */
export function withPlaybackRate3(rates: readonly number[]): number[] {
  return rates.includes(3) ? [...rates] : [...rates, 3];
}

/** 与播放器里触摸长按 3 倍的等待时间相同。 */
export const RIGHT_ARROW_HOLD_MS = 500;

export interface RightArrowHoldInput {
  repeat: boolean;
  paused: boolean;
  editable?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface RightArrowHoldOptions {
  getRate: () => number;
  setRate: (rate: number) => void;
  /** 返回 true 表示这次轻点确实快进了。 */
  seek: () => boolean;
  isPaused: () => boolean;
  onHint?: (text: string) => void;
  holdMs?: number;
}

type Phase = 'idle' | 'pending' | 'boosted';

/**
 * 普通右方向键：轻点快进一次，按住到达阈值后暂时 3 倍。
 * 重复 keydown 不重新计时，也不覆盖按下前记住的倍速。
 */
export function createRightArrowHold(options: RightArrowHoldOptions) {
  const holdMs = options.holdMs ?? RIGHT_ARROW_HOLD_MS;
  let phase: Phase = 'idle';
  let priorRate: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const restore = () => {
    if (phase !== 'boosted' || priorRate === null) return;
    const rate = priorRate;
    phase = 'idle';
    priorRate = null;
    options.setRate(rate);
    options.onHint?.(`${rate} 倍速`);
  };

  return {
    /** 返回 true 表示这次按键由手势接管（调用方应 preventDefault，且不要再快进）。 */
    onKeyDown(input: RightArrowHoldInput): boolean {
      if (input.editable || input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return false;
      if (phase !== 'idle' || input.repeat) return true;
      phase = 'pending';
      if (!input.paused) {
        timer = setTimeout(() => {
          timer = null;
          if (phase !== 'pending') return;
          if (options.isPaused()) return;
          priorRate = options.getRate();
          options.setRate(3);
          phase = 'boosted';
          options.onHint?.('3 倍速');
        }, holdMs);
      }
      return true;
    },
    /** 返回 true 表示轻点触发了一次快进。 */
    onKeyUp(): boolean {
      if (phase === 'idle') return false;
      clearTimer();
      if (phase === 'boosted') {
        restore();
        return false;
      }
      phase = 'idle';
      priorRate = null;
      return options.seek();
    },
    cancel() {
      clearTimer();
      if (phase === 'boosted') {
        restore();
        return;
      }
      phase = 'idle';
      priorRate = null;
    },
  };
}
