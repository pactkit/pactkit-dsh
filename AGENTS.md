# pactkit-dsh

> 能力、配置、限制在 `README.md`。这里只写改这个插件时不能破坏的约束，以及改完怎么验。

## 不变量

- **门禁判据只有一份**：在 PactKit 的 `commit-gate --hook` 里。插件只做调用映射与结果汇报；不要用 JS 重新实现任何一条检查——两份真相必然漂移，而且漂移时没人会发现。
- **裁决语义不要混**：退出码 `2` = 拒绝（理由取 stderr），`0` = 放行，其余（缺 CLI / 超时 / 异常退出 / 解析不了）是"门禁答不上来"，**不是**拒绝。默认放行对应 PactKit 的自锁保护；只有 `denyWhenGateUnavailable: true` 才翻转。
- **无意见就 `next()`**：不映射的工具、项目外、目录未知时一律 abstain。目录未知时返回 `undefined`，不要用 `cwd` 或当前目录去猜——那正是"静默放行"的形状。
- **项目锚点只认共享层**：`pactkit.yaml`（或 legacy `.pactkit/continuations`、`.pactkit/workflow-runs`）。宿主副本（`.claude/` `.codex/` `.github/`）不算锚点——实测 `$HOME/.codex/pactkit.yaml` 会把整片家目录变成"项目"。
- **参数表用扁平写法**（`required: true` 写在属性里，由 `defineTool` 编译）；`output.schema` 不能出现根级 `required` 数组，`valueSchemaSpecToJsonSchema` 会以 author error 拒绝，表现是插件条目激活失败。
- **配置项必须有默认值且能做降级**：`resolveOptions` 负责把非法值回落到默认（例如 `enforce: "false"` 不得关闭门禁）。

## 命令

```bash
npm test                 # node --test test/*.test.js
node --check index.js
```

## 改完怎么验

本地测试只覆盖纯逻辑与子进程，覆盖不到宿主接线。改动 `index.js` 后必须补两条实测：

1. `apply()` 能在假 ctx 上跑通（注册 1 个工具、1 个 section、1 个 `tools/pre-execute` 监听），且拒签时不调用 `next()`。
2. 装进 profile 后，在 `tamper_guard: true` 的项目里写 `.pactkit/enforcement/x.json` 被真拦，且该文件确实没落盘；同项目普通写入仍成功（证明不是一律拦）。

只验证"允许"路径等于没验证门禁。
