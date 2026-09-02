# ollama-monitor · DSH 插件组合包

Ollama 监控与测评平台：node 半侧向 agent 提供 DSH 工具（状态/测速/拉取模型/编程评测等），web 半侧在 DSH 设置页里提供交互面板。

## 安装

前提：本机装有 `dsh` CLI。以下三条任选其一，装完**重启该 profile**（Bundle 增减需要重启；之后的 patch 改动是热重载）。

```sh
# ① 从 Git 仓库直装（无需发布 npm）
dsh plugin --profile web add github:<you>/dsh-plugin-ollama-monitor

# ② 从 npm（发布后）
dsh plugin --profile web add ollama-monitor

# ③ 离线 tarball（在本仓库执行 pnpm pack 生成）
dsh plugin --profile web add ./ollama-monitor-0.3.1.tgz
```

Git 直装说明：pnpm ≥10 默认拒绝运行 git 依赖的 `prepare` 构建脚本。仓库已提交构建好的 `lib/`，**不允许构建也能直接使用**；若想从源码重建，把 pnpm 提示的键写进该 profile 的 `pnpm-workspace.yaml` 后重跑 add：

```yaml
allowBuilds:
  ollama-monitor: true
```

（建议同时用 `github:<you>/dsh-plugin-ollama-monitor#<commit-sha>` 锁定提交。）

## 配置

插件行 id 为 `ollama-monitor`，默认值在本包的 `cordis.patch.yml`：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `http://127.0.0.1:11434` | Ollama 服务地址 |
| `defaultModel` | `''` | 面板默认选中模型 |
| `defaultPrompt` | `用一句话解释什么是操作系统。` | 默认测速提示词 |
| `numPredict` | `128` | 默认最大生成 token 数 |
| `timeoutMs` | `120000` | 请求超时（毫秒） |

覆盖示例（写入你自己的 `~/.dsh/cordis.patch.yml` 或 profile 层；**patch 替换整份 config，必须重述全部键**）：

```yaml
- id: ollama-monitor
  config:
    host: 'http://192.0.2.10:11434'   # 示例地址（RFC 5737 文档专用段，改成你的）
    defaultModel: ''
    defaultPrompt: '用一句话解释什么是操作系统。'
    numPredict: 128
    timeoutMs: 120000
```

## 验证 / 卸载

```sh
dsh --profile web --dump-config   # 应看到 "# == ollama-monitor" 配置层
dsh plugin --profile web remove ollama-monitor
```

## 开发

```sh
pnpm install
pnpm build        # 重新构建 lib/（client 半侧 + node 半侧，自包含，不依赖 DSH 检出）
```

仓库同时提交了源码（`src/`）与构建产物（`lib/`）：普通安装直接用产物；带 `allowBuilds` 的 git 安装会用 `prepare` 从源码重建。
