# dsh-billing-balance

DeepSeek Harness（DSH）动态 Cordis 插件：在 Web GUI 中显示 **DeepSeek 官方 API 账户余额** 与 **火山方舟 Coding Plan / Agent Plan 套餐额度**（5小时/会话、每周、每月窗口的已用百分比与距下次额度重置的倒计时）。

![余额设置效果图](./images/%E4%BD%99%E9%A2%9D%E8%AE%BE%E7%BD%AE%E6%95%88%E6%9E%9C%E5%9B%BE.png)

![花费和余额显示效果图](./images/%E8%8A%B1%E8%B4%B9%E5%92%8C%E4%BD%99%E9%A2%9D%E6%98%BE%E7%A4%BA%E6%95%88%E6%9E%9C%E5%9B%BE.png)

## 功能特性

- **DeepSeek 余额**：总余额 / 充值余额 / 赠送余额、账户可用状态（`GET https://api.deepseek.com/user/balance`）。
- **火山方舟 Coding Plan**：`session`（5小时）/ `weekly` / `monthly` 三个窗口的已用百分比、进度条、距重置倒计时（秒级跳动）；若同时订阅 Agent Plan（5h/周/月窗口），一并显示。
- **三处展示 + 联动**：
  1. 设置 → 「模型余额」页面：完整面板 + 手动刷新按钮 + 火山 AK/SK 配置区；
  2. 对话输入框下方读数条：常驻一行摘要，自动每 30 秒刷新；
  3. 右下角悬浮圆钮 `↻`：点击即刷新（`…`→`✓`），按住可拖动到任意位置，悬停显示当前 DeepSeek 余额。
- **AK/SK 设置内配置**：在设置页直接粘贴火山访问密钥，经 DSH 官方 `credentials` 服务写入 `~/.dsh/.credentials.yaml`，页面不回显密钥，保存后立即拉取额度。

## 界面示意

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

## 安装（dsh.bundle）

本仓库同时是可安装的 dsh 插件包（`package.json` 声明 `dsh.bundle` + `dsh.client`）：

```sh
dsh plugin --profile web add github:YZz-S/dsh-billing-balance
```

安装后「设置 → 模型余额」「输入框下方读数条」「右下角悬浮刷新按钮」三处自动生效。
动态用法（`cordis_define` 加载 `host.js` / `client.js`）仍保留，两种方式二选一。
## 快速开始

前置条件：运行中的 DeepSeek Harness（支持动态 Cordis 插件；本插件在 DSH + Node.js v22 + Windows 上开发验证）。

1. 在 DSH 会话中执行 `cordis_define`：
   - `code.host` 填入本目录 `host.js` 的内容（去掉顶部注释亦可）；
   - `code.client` 填入 `client.js` 的内容。
2. `cordis_run` 激活；首次激活包含 Client 代码，需要在页面上批准。
3. 打开 设置 → 模型余额，确认 DeepSeek 余额显示正常。
4. （可选）在「访问密钥配置」粘贴火山 AK/SK → 保存并刷新，查看套餐额度。

> 动态插件随 DSH 进程结束而消失；如需永久内置，请将两个半边集成为 DSH 组合（host composition + `dsh.client` Web 产物）中的常驻插件行。

## 目录结构

| 文件 | 说明 |
|---|---|
| `host.js` | Host 半边：凭据读取、DeepSeek 余额 / 火山额度抓取（子进程 `node -e`）、私有 RPC |
| `client.js` | Client 半边：设置页 / 读数条 / 悬浮刷新按钮三处 UI 与共享状态 |
| `package.json` | 包元信息（不发布 npm，`private: true`） |
| `README.md` | 本说明 |
| `SECURITY.md` | 安全说明与开源发布检查清单 |
| `LICENSE` | MIT 许可 |

## 凭据配置

插件从 DSH 凭据服务读取以下键（`~/.dsh/.credentials.yaml`）：

| 键 | 用途 | 必需 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek 余额查询 | 是（余额显示） |
| `ARK_CODING_PLAN_API_KEY` | 火山 Coding Plan 数据面（本插件仅检测存在性，额度接口不用它） | 否 |
| `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY` | 火山 OpenAPI 控制面签名（`GetCodingPlanUsage` / `GetAFPUsage`） | 否（火山额度显示时需要） |

**为什么额度接口必须用 AK/SK？** 火山套餐额度接口（OpenAPI `/open/GetCodingPlanUsage`）只接受控制面 V4 签名（AK/SK 或 SSO），数据面 ARK API Key（`ark-…`）无法调用——这是火山官方的能力边界（参考 ark-cli 与 cc-switch 的实现说明）。

AK/SK 获取：火山引擎控制台 → 右上角账号头像 → API 访问密钥（区域 cn-beijing，账号需具备 Ark 用量查询权限）。

## 技术实现

- **Host 半边**（DSH Node 进程）：
  - 凭据读取：`settings.prepareDocument()` 定位 `settings.yaml`，同目录读取 `.credentials.yaml`；AK/SK 写入走 `credentials` 服务；
  - HTTP：动态插件沙箱不提供 `fetch`，因此通过 `subprocess` 服务执行 `node -e` 内嵌脚本（Node ≥18 自带 fetch，child 内置 AbortController 超时）；脚本固定内置，参数仅来自本地凭据；
  - DeepSeek：`GET /user/balance`，`Authorization: Bearer`；
  - 火山：OpenAPI V4 签名（`HMAC-SHA256`，credential scope `{date}/{region}/ark/request`，固定顺序 SignedHeaders `host;x-date;x-content-sha256;content-type`，空 body，canonical query 按 key 排序）请求 `https://open.volcengineapi.com/?Action=…&Region=…&Version=2024-01-01`；解析 `Result.QuotaUsage[]`（`Level`/`Percent`/`ResetTime`，秒级时间戳），兼容 `Usages`/`Details` 与 `UsedPercent`/`ResetTimestamp` 等字段别名；
  - RPC：`get-status`（读缓存）、`refresh`（强制重拉）、`set-volc-keys`（写/清 AK/SK 后重拉）；每 60 秒后台刷新，`inFlight` 去重。
- **Client 半边**（浏览器）：`settings.section`（设置页）、`conversation.composer.dock`（读数条）、`shell.overlay`（可拖动悬浮按钮）三个 Slot 注册；包内共享状态 store，任一入口刷新全部视图立即同步；倒计时每秒本地 tick。
- **数据流**：Client ⇄ Host 仅通过 Package 私有 JSON RPC，返回值全部为自有纯数据（无活体服务对象）。

## 已知限制

- 动态插件为进程级：DSH 重启后需重新 define + run。
- 火山 Coding Plan 后端只返回各窗口 `Percent`（不含绝对已用/总额）；无活跃窗口时可能缺 `ResetTime`（显示「—」）。
- `session` 窗口按社区实现惯例标注为「5小时/会话」；Agent Plan 的 `5h` 窗口同样映射为 5小时。
- 火山网关无官方公开的逐字段文档，字段解析基于实测与公共实现（见「参考与致谢」），火山若调整返回结构可能导致解析为空——此时面板会原样显示接口错误。
- 余额数据仅供提示，不构成计费依据。

## 参考与致谢

- [DeepSeek API 文档 — 查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)
- [volcengine/ark-cli](https://github.com/volcengine/ark-cli)（`usage plan` 语义：session/weekly/monthly 窗口、`GetCodingPlanUsage` 调用面）
- [farion1231/cc-switch](https://github.com/farion1231/cc-switch)（火山 OpenAPI V4 签名细节与 `QuotaUsage` 实测字段；本插件为独立 JS 重实现）
- [steipete/CodexBar](https://github.com/steipete/CodexBar)（Doubao/DeepSeek 余额展示思路）

## 许可

[MIT](./LICENSE)
