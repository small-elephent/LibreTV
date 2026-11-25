'use client';

import { useState } from 'react';
import {
  DISCOVERY_MOODS,
  nextPageOffset,
  pageOf,
  pickOne,
  picksForMood,
  type DiscoveryMoodId,
  type DiscoveryPick,
} from '@/lib/discovery';
import { cn } from '@/lib/utils';

/**
 * 首页策展条。不请求网络，不探测源。
 * 点卡片只把片名交给现有搜索。
 */
export function DiscoveryStrip({ onPick }: { onPick: (title: string) => void }) {
  const [mood, setMood] = useState<DiscoveryMoodId>('easy');
  const [offset, setOffset] = useState(0);
  const [spotlight, setSpotlight] = useState<DiscoveryPick | null>(null);

  const pool = picksForMood(mood);
  const page = pageOf(pool, offset);
  const moodLabel = DISCOVERY_MOODS.find((item) => item.id === mood)?.label ?? '';

  const switchMood = (next: DiscoveryMoodId) => {
    if (next === mood) return;
    setMood(next);
    setOffset(0);
    setSpotlight(null);
  };

  const reshuffle = () => {
    setOffset((current) => nextPageOffset(pool.length, current));
    setSpotlight(null);
  };

  const chooseOne = () => {
    const picked = pickOne(pool, Math.random);
    setSpotlight(picked ?? null);
  };

  return (
    <section aria-label="今天看什么" className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-content">今天看什么</h2>
          <p className="text-[11px] text-faint mt-1 max-w-xl leading-relaxed">
            人工策展，不是热榜，也没有评分。点一部会用当前已启用的源搜索片名，搜到不等于一定能播放。
          </p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={reshuffle} disabled={pool.length <= 1}>
            换一批
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={chooseOne} disabled={pool.length === 0}>
            帮我挑一部
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="心情">
        {DISCOVERY_MOODS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors',
              item.id === mood ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
            )}
            aria-pressed={item.id === mood}
            onClick={() => switchMood(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {spotlight && (
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3" aria-live="polite">
          <p className="text-[11px] text-accent mb-1">从「{moodLabel}」里挑中了</p>
          <PickCard pick={spotlight} onPick={onPick} />
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={chooseOne}>
            再挑一部
          </button>
        </div>
      )}

      {page.length === 0 ? (
        <p className="text-center text-sm text-faint py-8">这个心情下还没有策展条目。</p>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {moodLabel}，当前 {page.length} 部
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {page.map((pick) => (
              <li key={pick.id}>
                <PickCard pick={pick} onPick={onPick} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PickCard({ pick, onPick }: { pick: DiscoveryPick; onPick: (title: string) => void }) {
  const meta = [pick.kind, pick.year ? String(pick.year) : null, '策展'].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="card w-full flex gap-3 p-3 text-left hover:bg-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      onClick={() => onPick(pick.title)}
    >
      <span
        className="shrink-0 w-14 h-[4.5rem] rounded-md bg-chip text-faint flex items-center justify-center text-[10px] leading-tight text-center px-1"
        aria-hidden
      >
        无海报
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-content truncate">{pick.title}</span>
        <span className="block text-[11px] text-faint mt-0.5">{meta}</span>
        <span className="block text-xs text-muted mt-1 line-clamp-2">{pick.reason}</span>
      </span>
    </button>
  );
}
