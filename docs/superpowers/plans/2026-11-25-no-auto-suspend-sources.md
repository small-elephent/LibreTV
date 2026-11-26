# 点播源不再自动停用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 LibreTV 2.21.2 上让每次搜索都请求所有手动启用的源，失败不再自动暂停源。

**Architecture:** 搜索资格与健康度分开。健康度只记录最近一次真实结果；历史 `disabledUntil` / `permanent` 留在 localStorage 中但被资格判断和徽章忽略。超时与流式搜索保持原实现。

**Tech Stack:** Next.js 15、Zustand、Vitest。版本锁定 `2.21.2`，提交 `722e86fce102aa6701e73a83dd0a14eb5ba707c9`。

## Global Constraints

- 基线提交 `722e86fce102aa6701e73a83dd0a14eb5ba707c9`，`package.json` version 保持 `2.21.2`
- 不改 fork `main`，不 force-push，不合并，PR 只对用户 fork
- 不升级依赖，不做无关重构
- 不清理 localStorage / cookie，persist `version` 保持 8，`migrate` 不删 `sourceHealth`
- 不请求真实影视站，不写入用户密码或源列表
- 保留手动取消勾选、订阅 `enabled === false`、单源超时、流式部分结果、真实错误
- 保留 AGPL 许可与原有版权声明

---

### Task 1: 用失败测试锁住搜索资格

**Files:**
- Modify: `src/lib/store.test.ts`
- Test: `src/lib/store.test.ts`

- [x] **Step 1: 替换「点播源自动停用阶梯」用例**

覆盖四件事：连续失败后下一次仍参与；旧的 `disabledUntil` / `permanent` 不排除且记录还在；手动未勾选和订阅关闭仍排除；徽章不出现倒计时或「已停用」，并带上真实错误。

- [x] **Step 2: 运行**

Run: `npx vitest run src/lib/store.test.ts`

Expected: 新断言失败（当前第二次失败会把 `isSourceDisabled` 变成 true，并写入约 30 分钟的 `disabledUntil`）。缺新导出时先看到导入失败，再补测试所依赖的导出直到断言本身失败。

### Task 2: 最小生产改动

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/settings-shared.tsx`
- Modify: `src/components/source-manager.tsx`
- Modify: `src/components/use-source-probe.ts`（只改注释）
- Modify: `README.md`（两处仍写着自动停用阶梯的句子）

- [x] **Step 1: `sourceEligibleForSearch(state, key)`**

`selectedKeys` 包含该 key，且 `isInDisabledSubscription` 为假。不读 `sourceHealth`。

- [x] **Step 2: `sourceHealthBadge(entry)`**

无记录返回 `null`。`ok` 时 `{ tone: 'ok', text: '✓ ${ms}ms', title: '上次搜索 ${ms}ms' }`。失败时 `{ tone: timedOut ? 'warning' : 'danger', text: '连续 ${failStreak} 次失败', title: error 或连续失败文案 }`。不返回倒计时、`已停用` 或恢复动作。

- [x] **Step 3: `recordSourceHealth`**

仍按 7 天保留未触及的旧条目（包括它们的 `disabledUntil` / `permanent`）。本次条目只写 `ok`、`ms`、`error`、`timedOut`、`failStreak`、`timestamp`。成功则 `failStreak = 0`，失败则在旧值上 +1。函数改为返回 `void`。删除 `SOURCE_DISABLE_THRESHOLD`、`SOURCE_DISABLE_LADDER`、`SourceDisableEvent`。类型里保留可选的历史字段，注释写明已忽略。

- [x] **Step 4: 调用点**

首页不再按健康度过滤，不再渲染「已暂停参与搜索」横幅，不再 toast 自动停用。`HealthBadge` 在订阅手动关闭时仍显示「订阅已停用」，否则只渲染 `sourceHealthBadge`。点播筛选「已启用 / 已停用」只看勾选，删除「全部恢复」。发布已勾选源时去掉 `isSourceDisabled`。

- [x] **Step 5: 运行测试**

Run: `npx vitest run`

Expected: 全部通过。

### Task 3: 构建独立包

- [x] `DOCKER_BUILD=1 npm run build`
- [x] 按 `.github/workflows/release-standalone.yml` 组装 `.next/standalone`，补上 `.next/static` 与 `public`，删除 `.env*`、`sharp`、`@img`，确认没有 `*.node`
- [x] `PORT` 冒烟 `GET /api/status`，确认版本 `2.21.2`
- [x] 打包为独立 tar，不提交进 git

部署与回滚见 PR 说明。不声称已经部署到用户机器。
