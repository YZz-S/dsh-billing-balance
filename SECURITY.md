# Security & 开源发布检查

## 密钥与数据处理

- **凭据来源**：仅从 DSH `credentials` 服务读取（`~/.dsh/.credentials.yaml`），代码中不包含任何硬编码密钥。
- **AK/SK 写入**：设置页「保存并刷新」通过 DSH 官方 `credentials.set()` 写入本机凭据文件；页面只显示「已配置/未配置」状态，**从不回显密钥**。
- **网络去向**：仅两个官方端点：
  - `https://api.deepseek.com/user/balance`（查询余额，只读）
  - `https://open.volcengineapi.com/?Action=GetCodingPlanUsage|GetAFPUsage&…`（查询套餐额度，只读）
  - 无遥测、无第三方中转、无日志外传。
- **凭据在子进程中的传递**：Host 通过 `node -e` 子进程发起 HTTPS；密钥经 argv 传入子进程（不出本机），脚本内容固定内置、不执行任何外部输入。
- **RPC 边界**：Client ⇄ Host 仅走 Package 私有 JSON RPC（`get-status` / `refresh` / `set-volc-keys`），返回值均为标量组成的自有 JSON，不包含服务/会话等活体对象。

## 已知风险与缓解

| 风险 | 说明 | 缓解 |
|---|---|---|
| AK/SK 以明文存于 `~/.dsh/.credentials.yaml` | DSH 官方凭据存储本身如此（与 `DEEPSEEK_API_KEY` 同址） | 文件位于用户主目录；插件不复制不外传；建议 AK 使用最小权限（仅 Ark 用量查询）并定期轮换 |
| `node -e` 子进程 | 插件依赖本机 Node 与出网能力 | 脚本与参数均由插件生成，不拼接外部输入；子进程内置 25s 超时 |
| 额度接口无官方字段文档 | 解析依赖实测字段（`Level`/`Percent`/`ResetTime`） | 多字段名兼容 + 出错时原样展示接口错误；不影响 DeepSeek 余额功能 |
| 动态插件生命周期 | 随 DSH 进程消失，不会残留 | 所有副作用挂在插件 Fiber 上（timer、slot、RPC），停止即清理 |

## 开源发布检查清单

- [x] 无硬编码密钥（`sk-…`、`ark-…`、`AKLT…` 等均不存在于仓库；`grep` 已验证）
- [x] 无个人信息（无用户名、绝对用户路径、内部 IP）
- [x] 每个插件目录包含 `LICENSE`（MIT）
- [x] 第三方实现已归因（ark-cli、cc-switch、CodexBar 见 README「参考与致谢」；本仓库为独立重实现，未复制其代码）
- [x] 无遥测/埋点/外发统计
- [x] 网络端点仅限两家官方 API
- [x] 依赖仅为运行时平台（DeepSeek Harness 动态插件机制 + 本机 Node ≥ 18），无 npm 依赖
- [ ] 发布前建议：在目标平台（Windows / Node 22 / DSH）复测 DeepSeek 余额与火山额度两条链路（火山需真实 AK/SK）

## 报告问题

请通过仓库 Issue 提交；涉及密钥或安全细节请勿在 Issue 中贴出完整凭据。
