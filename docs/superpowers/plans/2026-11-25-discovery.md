# 「今天看什么」实现计划

**Goal:** 在现有首页推荐区上方加一块人工策展，用心情、换一批和随机挑一部改变 6 张卡片，点击走现有搜索。

**Architecture:** `src/lib/discovery.ts` 放清单和纯函数。`DiscoveryStrip` 只渲染。`page.tsx` 在无搜索词时把它放在 `RecommendSection` 前面，`onPick` 仍是 `runSearch`。

**Tech Stack:** 现有 React 与样式。无新依赖。版本保持 2.21.2。

## Global Constraints

- 基线 `3653c62`，不改搜索路由、播放器、代理、自动停用和 3 倍逻辑
- 不新增接口、账号或密钥
- 策展数据不含评分、热度、海报
- 不在首页探测点播源

### Task 1: 选择逻辑

**Files:** `src/lib/discovery.test.ts`，`src/lib/discovery.ts`

- 四个心情各自至少 7 部，第一页 6 张互不相同
- `nextPageOffset` 在组长度大于 6 时步进 6，两页片单不相交
- `pickOne` 使用传入的 random，能挑到首尾
- 理由非空，且不含评分、热度、爆款、热播、榜

### Task 2: 界面

**Files:** `src/components/discovery-strip.tsx`，`src/app/page.tsx`

- 心情按钮、6 张卡片、换一批、帮我挑一部
- 卡片显示片名、年份、电影/剧集、策展理由和无海报占位
- 说明「点了是搜索，不是保证能播」
- 有搜索词时不显示，避免和结果抢位置
