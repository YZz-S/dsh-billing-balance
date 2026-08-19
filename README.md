# dsh-billing-balance

[English](#english) · [中文](#中文)

> DeepSeek Harness (DSH) dynamic Cordis plugin that shows your **DeepSeek official API account balance** and **Volcengine Ark Coding Plan / Agent Plan quota** (used percentages for the 5-hour/session, weekly and monthly windows, plus a countdown to the next quota reset) in the Web GUI.
>
> DeepSeek Harness（DSH）动态 Cordis 插件：在 Web GUI 中显示 DeepSeek 官方 API 账户余额与火山方舟 Coding Plan / Agent Plan 套餐额度（5小时/会话、每周、每月窗口的已用百分比与距下次额度重置的倒计时）。

![余额设置效果图](./images/%E4%BD%99%E9%A2%9D%E8%AE%BE%E7%BD%AE%E6%95%88%E6%9E%9C%E5%9B%BE.png)

![花费和余额显示效果图](./images/%E8%8A%B1%E8%B4%B9%E5%92%8C%E4%BD%99%E9%A2%9D%E6%98%BE%E7%A4%BA%E6%95%88%E6%9E%9C%E5%9B%BE.png)

## English

[中文](#中文) · [← Back to DeepSeekHarnessPlugins](../README.md)

### Features

- **DeepSeek balance**: total / top-up / gift balance and account availability (`GET https://api.deepseek.com/user/balance`).
- **Volcengine Ark Coding Plan**: used percentage, progress bar and countdown to reset (ticking every second) for the `session` (5-hour) / `weekly` / `monthly` windows; if you also subscribe to Agent Plan (5h/week/month windows), it is shown as well (Agent Plan also exposes a daily window).
- **Three display spots + linkage**:
  1. Settings → "Model Balance" page: full panel + manual refresh button + Volcengine AK/SK configuration area;
  2. Readout line below the conversation input box: a persistent one-line summary, auto-refreshing every 30 seconds;
  3. Floating round button `↻` at the bottom right: click to refresh (`…` → `✓`), drag to reposition, hover to show the current DeepSeek balance.
- **AK/SK configured in Settings**: paste the Volcengine access keys directly on the settings page; they are written to `~/.dsh/.credentials.yaml` through DSH's official `credentials` service, never echoed back in the page, and quota is fetched immediately after saving.

### UI Sketch

```
Settings → Model Balance
┌──────────────────────────────────────┐
│ Model Balance                 [Refresh]│
│ ┌ DeepSeek Official API ────────────┐  │
│ │ Total (CNY)              ¥ 26.91  │  │
│ │ Top-up                   ¥ 26.91  │  │
│ │ Gift                      ¥ 0.00  │  │
│ │ ✓ Account available               │  │
│ └───────────────────────────────────┘  │
│ ┌ Volcengine Ark Coding Plan ────────┐  │
│ │ Coding Plan quota (session/week/month)│
│ │ 5h/session   12.3% used  ▓▓░░░░    │  │
│ │ Reset countdown        4h 21m      │  │
│ │ Weekly       45.0% used  ▓▓▓▓▓░░   │  │
│ │ Monthly       3.0% used  ▓░░░░░░   │  │
│ │ ── Access key config ───────────── │  │
│ │ [AK input] [SK input]              │  │
│ │ [Save & refresh] [Clear]           │  │
│ └────────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Installation (dsh.bundle)

This repo is also an installable dsh plugin package (`package.json` declares `dsh.bundle` + `dsh.client`):

```sh
dsh plugin --profile web add github:YZz-S/dsh-billing-balance
```

After installation, the three spots — "Settings → Model Balance", the readout below the input box and the floating refresh button — take effect automatically. The dynamic usage (`cordis_define` loading `host.js` / `client.js`) is kept; pick either one.

### Quick Start

Prerequisites: a running DeepSeek Harness (dynamic Cordis plugins supported; this plugin was developed and verified on DSH + Node.js v22 + Windows).

1. Run `cordis_define` in a DSH session:
   - `code.host`: the content of `host.js` in this directory (the leading comment may be removed);
   - `code.client`: the content of `client.js`.
2. Activate with `cordis_run`; the first activation includes Client code and needs approval in the page.
3. Open Settings → Model Balance and confirm the DeepSeek balance displays correctly.
4. (Optional) Paste the Volcengine AK/SK in "Access key config" → Save & refresh to view plan quota.

> A dynamic plugin disappears when the DSH process ends; for a permanent install, integrate both halves as persistent plugin rows in the DSH composition (host composition + `dsh.client` web artifact).

### Directory Structure

> Both usage modes share the same functionality: the installable bundle (`index.js` + `lib/client.js` + `cordis.patch.yml`) and the dynamic `cordis_define` (`host.js` / `client.js`) are **mutually exclusive** — either one gives the same effect.

| File | Description |
|---|---|
| `index.js` | Host half (installable bundle entry): credential reading, DeepSeek balance / Volcengine quota fetching (child `node -e`), private RPC |
| `lib/client.js` | Client half (installable bundle module): the three UIs (settings page / readout / floating button) and shared state |
| `cordis.patch.yml` | dsh bundle patch: registers the `dsh-billing-balance` plugin row |
| `package.json` | Package metadata declaring `dsh.bundle` + `dsh.client`; installable via `dsh plugin add github:YZz-S/dsh-billing-balance` |
| `host.js` / `client.js` | Kept for the dynamic `cordis_define` usage |
| `images/` | Screenshots |
| `README.md` | This document |
| `SECURITY.md` | Security notes & open-source release checklist |
| `LICENSE` | MIT license |

### Credential Configuration

The plugin reads the following keys from the DSH credentials service (`~/.dsh/.credentials.yaml`):

| Key | Purpose | Required |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek balance query | Yes (for balance display) |
| `ARK_CODING_PLAN_API_KEY` | Volcengine Coding Plan data plane (this plugin only checks existence; the quota API does not use it) | No |
| `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY` | Volcengine OpenAPI control-plane signing (`GetCodingPlanUsage` / `GetAFPUsage`) | No (needed for Volcengine quota display) |

**Why must the quota API use AK/SK?** The Volcengine plan quota API (OpenAPI `/open/GetCodingPlanUsage`) only accepts control-plane V4 signatures (AK/SK or SSO); a data-plane ARK API key (`ark-…`) cannot call it — that is Volcengine's official capability boundary (see the implementation notes of ark-cli and cc-switch).

Getting AK/SK: Volcengine console → account avatar (top right) → API access keys (region cn-beijing; the account needs Ark usage-query permission).

### Technical Implementation

- **Host half** (DSH Node process):
  - Credential reading: `settings.prepareDocument()` locates `settings.yaml`; `.credentials.yaml` is read from the same directory; AK/SK writes go through the `credentials` service;
  - HTTP: the dynamic plugin sandbox provides no `fetch`, so a `node -e` inline script is run through the `subprocess` service (Node ≥ 18 has built-in fetch; the child has its own AbortController timeout); the script is hard-coded, parameters come only from local credentials;
  - DeepSeek: `GET /user/balance` with `Authorization: Bearer`;
  - Volcengine: OpenAPI V4 signing (`HMAC-SHA256`, credential scope `{date}/{region}/ark/request`, fixed SignedHeaders order `host;x-date;x-content-sha256;content-type`, empty body, canonical query sorted by key) requests `https://open.volcengineapi.com/?Action=…&Region=…&Version=2024-01-01`; parses `Result.QuotaUsage[]` (`Level`/`Percent`/`ResetTime`, second-level timestamps) and tolerates field aliases like `Usages`/`Details` and `UsedPercent`/`ResetTimestamp`;
  - RPC: `get-status` (read cache), `refresh` (force re-pull), `set-volc-keys` (write/clear AK/SK then re-pull); background refresh every 60 seconds with `inFlight` dedup.
- **Client half** (browser): registers three Slots — `settings.section` (settings page), `conversation.composer.dock` (readout line), `shell.overlay` (draggable floating button); a shared in-package state store keeps every view in sync immediately when any entry refreshes; the countdown ticks locally every second.
- **Data flow**: Client ⇄ Host only via the Package private JSON RPC; return values are all plain data (no live service objects).

### Known Limitations

- The dynamic plugin is process-level: after a DSH restart you must define + run it again.
- The Volcengine Coding Plan backend only returns each window's `Percent` (no absolute used/total); `ResetTime` may be absent when no window is active (shown as "—").
- The `session` window is labeled "5h/session" per community implementation convention; Agent Plan's `5h` window maps to 5 hours likewise.
- The Volcengine gateway has no official field-by-field documentation; parsing is based on testing and public implementations (see References & Credits). If Volcengine changes the response structure, parsing may return empty — the panel then shows the raw API error.
- Balance data is indicative only and is not a billing basis.

### References & Credits

- [DeepSeek API Docs — Get User Balance](https://api-docs.deepseek.com/api/get-user-balance/)
- [volcengine/ark-cli](https://github.com/volcengine/ark-cli) (`usage plan` semantics: session/weekly/monthly windows, `GetCodingPlanUsage` call surface)
- [farion1231/cc-switch](https://github.com/farion1231/cc-switch) (Volcengine OpenAPI V4 signing details and measured `QuotaUsage` fields; this plugin is an independent JS reimplementation)
- [steipete/CodexBar](https://github.com/steipete/CodexBar) (inspiration for the Doubao/DeepSeek balance display)

### License

[MIT](./LICENSE)

---

## 中文

[English](#english) · [← 返回 DeepSeekHarnessPlugins](../README.md)

DeepSeek Harness（DSH）动态 Cordis 插件：在 Web GUI 中显示 **DeepSeek 官方 API 账户余额** 与 **火山方舟 Coding Plan / Agent Plan 套餐额度**（5小时/会话、每周、每月窗口的已用百分比与距下次额度重置的倒计时）。

### 功能特性

- **DeepSeek 余额**：总余额 / 充值余额 / 赠送余额、账户可用状态（`GET https://api.deepseek.com/user/balance`）。
- **火山方舟 Coding Plan**：`session`（5小时）/ `weekly` / `monthly` 三个窗口的已用百分比、进度条、距重置倒计时（秒级跳动）；若同时订阅 Agent Plan（5h/周/月窗口），一并显示（Agent Plan 另含每日窗口）。
- **三处展示 + 联动**：
  1. 设置 → 「模型余额」页面：完整面板 + 手动刷新按钮 + 火山 AK/SK 配置区；
  2. 对话输入框下方读数条：常驻一行摘要，自动每 30 秒刷新；
  3. 右下角悬浮圆钮 `↻`：点击即刷新（`…`→`✓`），按住可拖动到任意位置，悬停显示当前 DeepSeek 余额。
- **AK/SK 设置内配置**：在设置页直接粘贴火山访问密钥，经 DSH 官方 `credentials` 服务写入 `~/.dsh/.credentials.yaml`，页面不回显密钥，保存后立即拉取额度。

### 界面示意

```
设置 → 模型余额
┌──────────────────────────────────────┐
│ 模型余额                      [刷新]  │
│ ┌ DeepSeek 官方 API ──────────────┐  │
│ │ 总余额 (CNY)            ¥ 26.91 │  │
│ │ 充值余额                ¥ 26.91 │  │
│ │ 赠送余额                ¥ 0.00  │  │
│ │ ✓ 账户可用                      │  │
│ └──────────────────────────────────┘  │
│ ┌ 火山方舟 Coding Plan ────────────┐  │
│ │ Coding Plan 额度（session/周/月） │  │
│ │ 5小时/会话  12.3% 已用  ▓▓░░░░   │  │
│ │ 额度重置倒计时        4 小时 21 分│  │
│ │ 每周        45.0% 已用  ▓▓▓▓▓░░  │  │
│ │ 每月         3.0% 已用  ▓░░░░░░  │  │
│ │ ── 访问密钥配置 ──────────────── │  │
│ │ [AK 输入框] [SK 输入框]          │  │
│ │ [保存并刷新] [清除]              │  │
│ └──────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 安装（dsh.bundle）

本仓库同时是可安装的 dsh 插件包（`package.json` 声明 `dsh.bundle` + `dsh.client`）：

```sh
dsh plugin --profile web add github:YZz-S/dsh-billing-balance
```

安装后「设置 → 模型余额」「输入框下方读数条」「右下角悬浮刷新按钮」三处自动生效。
动态用法（`cordis_define` 加载 `host.js` / `client.js`）仍保留，两种方式二选一。

### 快速开始

前置条件：运行中的 DeepSeek Harness（支持动态 Cordis 插件；本插件在 DSH + Node.js v22 + Windows 上开发验证）。

1. 在 DSH 会话中执行 `cordis_define`：
   - `code.host` 填入本目录 `host.js` 的内容（去掉顶部注释亦可）；
   - `code.client` 填入 `client.js` 的内容。
2. `cordis_run` 激活；首次激活包含 Client 代码，需要在页面上批准。
3. 打开 设置 → 模型余额，确认 DeepSeek 余额显示正常。
4. （可选）在「访问密钥配置」粘贴火山 AK/SK → 保存并刷新，查看套餐额度。

> 动态插件随 DSH 进程结束而消失；如需永久内置，请将两个半边集成为 DSH 组合（host composition + `dsh.client` Web 产物）中的常驻插件行。

### 目录结构

> 两种用法共用同一套功能：可安装 bundle（`index.js` + `lib/client.js` + `cordis.patch.yml`）与动态 `cordis_define`（`host.js` / `client.js`）**二选一**，效果一致。

| 文件 | 说明 |
|---|---|
| `index.js` | Host 半边（可安装 bundle 入口）：凭据读取、DeepSeek 余额 / 火山额度抓取（子进程 `node -e`）、私有 RPC |
| `lib/client.js` | Client 半边（可安装 bundle 模块）：设置页 / 读数条 / 悬浮刷新按钮三处 UI 与共享状态 |
| `cordis.patch.yml` | dsh bundle 补丁：注册 `dsh-billing-balance` 插件行 |
| `package.json` | 包元信息，声明 `dsh.bundle` + `dsh.client`，可用 `dsh plugin add github:YZz-S/dsh-billing-balance` 安装 |
| `host.js` / `client.js` | 动态 `cordis_define` 用法保留文件 |
| `images/` | 效果截图 |
| `README.md` | 本说明 |
| `SECURITY.md` | 安全说明与开源发布检查清单 |
| `LICENSE` | MIT 许可 |

### 凭据配置

插件从 DSH 凭据服务读取以下键（`~/.dsh/.credentials.yaml`）：

| 键 | 用途 | 必需 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek 余额查询 | 是（余额显示） |
| `ARK_CODING_PLAN_API_KEY` | 火山 Coding Plan 数据面（本插件仅检测存在性，额度接口不用它） | 否 |
| `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY` | 火山 OpenAPI 控制面签名（`GetCodingPlanUsage` / `GetAFPUsage`） | 否（火山额度显示时需要） |

**为什么额度接口必须用 AK/SK？** 火山套餐额度接口（OpenAPI `/open/GetCodingPlanUsage`）只接受控制面 V4 签名（AK/SK 或 SSO），数据面 ARK API Key（`ark-…`）无法调用——这是火山官方的能力边界（参考 ark-cli 与 cc-switch 的实现说明）。

AK/SK 获取：火山引擎控制台 → 右上角账号头像 → API 访问密钥（区域 cn-beijing，账号需具备 Ark 用量查询权限）。

### 技术实现

- **Host 半边**（DSH Node 进程）：
  - 凭据读取：`settings.prepareDocument()` 定位 `settings.yaml`，同目录读取 `.credentials.yaml`；AK/SK 写入走 `credentials` 服务；
  - HTTP：动态插件沙箱不提供 `fetch`，因此通过 `subprocess` 服务执行 `node -e` 内嵌脚本（Node ≥18 自带 fetch，child 内置 AbortController 超时）；脚本固定内置，参数仅来自本地凭据；
  - DeepSeek：`GET /user/balance`，`Authorization: Bearer`；
  - 火山：OpenAPI V4 签名（`HMAC-SHA256`，credential scope `{date}/{region}/ark/request`，固定顺序 SignedHeaders `host;x-date;x-content-sha256;content-type`，空 body，canonical query 按 key 排序）请求 `https://open.volcengineapi.com/?Action=…&Region=…&Version=2024-01-01`；解析 `Result.QuotaUsage[]`（`Level`/`Percent`/`ResetTime`，秒级时间戳），兼容 `Usages`/`Details` 与 `UsedPercent`/`ResetTimestamp` 等字段别名；
  - RPC：`get-status`（读缓存）、`refresh`（强制重拉）、`set-volc-keys`（写/清 AK/SK 后重拉）；每 60 秒后台刷新，`inFlight` 去重。
- **Client 半边**（浏览器）：`settings.section`（设置页）、`conversation.composer.dock`（读数条）、`shell.overlay`（可拖动悬浮按钮）三个 Slot 注册；包内共享状态 store，任一入口刷新全部视图立即同步；倒计时每秒本地 tick。
- **数据流**：Client ⇄ Host 仅通过 Package 私有 JSON RPC，返回值全部为自有纯数据（无活体服务对象）。

### 已知限制

- 动态插件为进程级：DSH 重启后需重新 define + run。
- 火山 Coding Plan 后端只返回各窗口 `Percent`（不含绝对已用/总额）；无活跃窗口时可能缺 `ResetTime`（显示「—」）。
- `session` 窗口按社区实现惯例标注为「5小时/会话」；Agent Plan 的 `5h` 窗口同样映射为 5小时。
- 火山网关无官方公开的逐字段文档，字段解析基于实测与公共实现（见「参考与致谢」），火山若调整返回结构可能导致解析为空——此时面板会原样显示接口错误。
- 余额数据仅供提示，不构成计费依据。

### 参考与致谢

- [DeepSeek API 文档 — 查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)
- [volcengine/ark-cli](https://github.com/volcengine/ark-cli)（`usage plan` 语义：session/weekly/monthly 窗口、`GetCodingPlanUsage` 调用面）
- [farion1231/cc-switch](https://github.com/farion1231/cc-switch)（火山 OpenAPI V4 签名细节与 `QuotaUsage` 实测字段；本插件为独立 JS 重实现）
- [steipete/CodexBar](https://github.com/steipete/CodexBar)（Doubao/DeepSeek 余额展示思路）

### 许可

[MIT](./LICENSE)

---

[English](#english) · [中文](#中文)
