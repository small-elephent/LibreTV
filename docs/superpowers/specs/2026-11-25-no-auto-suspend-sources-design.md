# 点播源不再自动停用

基线：上游 LibreSpark/LibreTV `v2.21.2`（annotated tag `163a4dabe5a6e08b71e22c4c71879c0af259d5fc`，提交 `722e86fce102aa6701e73a83dd0a14eb5ba707c9`）。`package.json` 版本保持 `2.21.2`。不基于 fork 的 `main`（2.24.0），不升级依赖，不改 `main`。

## 问题

搜索页把「用户已勾选」和「系统暂停」混在一起。`recordSourceHealth` 在连续失败达到 2 次后写入 `sourceHealth[key].disabledUntil`（30 分钟，再 24 小时，然后 `permanent`）。首页 `selectedSources` 用 `isSourceDisabled` 丢掉这些源。设置里的 `HealthBadge` 在源仍然勾选时显示黄色倒计时（约 26–29 分钟）或「已停用」。

结果是 8 个已启用源里可以有 7 个不参与搜索。剩下的源若忽略关键词，搜索《后会友期》就会得到 0。失败只该影响那一次请求。

## 已批准行为

- 从不因为失败、超时或历史健康度自动停用点播源。
- 每次搜索请求每一个手动启用、且不属于已手动关闭订阅的源。
- 某一次失败或超时只记在这一次搜索上，不改变下一次是否参与。
- 保留手动取消勾选，以及订阅总开关 `enabled === false`。
- 保留真实健康/错误反馈、单源有界超时、流式部分结果。
- 已存在的 `disabledUntil` / `permanent` 不得再排除已启用源。
- 不清理 localStorage、cookie，也不做会删掉这些字段的 persist 迁移。
- 去掉会让人以为源已被暂停的倒计时、「已停用」自动暂停徽章和「恢复」按钮。

## 做法

搜索资格只看两件事：`selectedKeys` 里有这个 key，且 `isInDisabledSubscription` 为假。`sourceHealth` 不参与资格判断。

`recordSourceHealth` 继续写入 `ok`、`ms`、`error`、`timedOut`、`failStreak`、`timestamp`。成功把 `failStreak` 归零。不再写入 `disabledUntil`、`permanent`、`disableCount`，不再返回停用事件，首页不再弹出「已停用 N 分钟」。未被本次写入碰到的旧条目原样留在 `sourceHealth` 里（含历史 `disabledUntil` / `permanent`）。7 天未出现的条目仍按原逻辑淘汰，这不是清空存储。

徽章只反映最近一次真实结果：成功显示耗时；失败显示连续失败次数，`title` 放完整错误，超时用警告色。历史停用字段不产生倒计时或「已停用」。订阅被手动关闭时仍显示「订阅已停用」。

点播源筛选「已启用 / 已停用」改为与直播源相同，只看勾选。去掉只为自动暂停服务的「全部恢复」。发布已勾选源时不再因健康度剔除。

服务端 `SEARCH_SOURCE_TIMEOUT_MS`（默认 10s，单页 8s）和流式 `onSource` 不动。不访问真实影视站，不改密码、源列表、代理或下载器。

## 不在范围内

不升级到 2.24.0，不改订阅自动刷新的 `failStreak` 暂停（那是订阅同步，不是点播搜索），不实现 `--use-env-proxy`（v2.21.2 没有这个开关；上游请求走 SSRF 专用 undici Agent，本来就不会改用 `HTTP_PROXY`）。不修改用户机器上的启动脚本。
