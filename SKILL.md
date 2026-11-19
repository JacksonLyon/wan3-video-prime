---
name: wan3-video-prime
description: 万相 3.0-Prime（wan3.0-video-prime）视频生成：用千问AI平台按量计费 Key 出片，文生视频 / 首帧图生视频，时长 ≤30 秒，480P/720P/1080P。触发词：万相、万相3.0、Wan3.0-Video-Prime、千问生视频、文生视频、生成视频片段、分镜素材、参考图生成视频。硬性规则：该 Key 只允许调用 wan3.0-video-prime，禁止任何会话/文本/图像/其他模型调用；使用前必须先检测本机是否已配置千问 API，缺失就停下来问用户「是否安装并提供 API」，不得用别的厂商 Key 顶替；任何任务提交前必须报方案与预估费用并取得明确同意。
metadata:
  version: "1.0.0"
  author: "本地自建"
  model: "wan3.0-video-prime"
  updated: "2026-11-20"
  license: "MIT"
---

# 万相 3.0-Prime 视频生成

只做一件事：调千问AI平台的 `wan3.0-video-prime` 生成视频。不做对话、不做文本、不做图像，不接第二个模型。

## 硬性规则（随技能走，任何主机、任何 Agent 都不放宽）

- **R1 唯一用途**：本技能可用 `DASHSCOPE_API_KEY` 调用的端点只有 `POST /api/v1/services/aigc/video-generation/video-synthesis`（`model` 必须为 `wan3.0-video-prime`）与 `GET /api/v1/tasks/{task_id}`。禁止 `/chat/completions`、`/compatible-mode/v1`、图像生成、embedding、以及其他任何 wan/qwen 模型——即使同一把 Key 有权限。
- **R2 不进模型选择器**：不得把千问 Key 注册成 DSH 的对话 provider（不写 `llm-pi-ai.providers`、不进 picker、不参与会话路由）。这是用户定死的规则；要改必须先问用户。
- **R3 主机预检（每次开工第一步）**：先跑 `node {baseDir}/scripts/wan_prime.mjs check`。它会按 `env DASHSCOPE_API_KEY / QIANWEN_API_KEY → $DSH_HOME/.credentials.yaml → ~/.dsh/.credentials.yaml` 找 Key，并做一次零计费自检。
  - 若返回 `code: "NO_QIANWEN_KEY"`（退出码 3）：**立即停手**，用下面原话问用户，得到答复前不得生成、不得换别的视频服务、不得猜 Key。
    > 本机 DSH 里没有检测到千问AI平台的 API Key（DASHSCOPE_API_KEY）。要不要现在安装？如果要，请把千问AI平台（platform.qianwenai.com，按量计费）的 Key 发我，我只登记到凭据库供万相视频使用，不会注册成对话模型。
  - 用户给了 Key：`echo <key> | node {baseDir}/scripts/wan_prime.mjs save-key` 写入 `refs.DASHSCOPE_API_KEY`，然后重跑 `check` 确认 `code: "OK"`。
  - 返回 `AUTH_FAILED` / 403：Key 无效或未开通「Wan 系列模型」，让用户去平台开通，不要重试猜测。
- **R4 密钥不落地**：Key 只留在凭据库；不得写进 SKILL.md、脚本、日志、回复正文、仓库或截图。对外只显示脱敏形式（`sk-ws-****`）。
- **R5 提交前报价**：任何 `generate` 之前，先 `plan` 拿方案与预估费用，把「提示词 / 分辨率 / 比例 / 时长 / 预估¥」发给用户并取得明确同意，再加 `--yes` 执行。脚本不带 `--yes` 会拒绝提交（退出码 2），这是硬闸门，不要绕过。
- **R6 一次一条**：默认只出 1 条 5 秒 720P（≈¥4.5）。要多条、要 >10 秒、要 1080P，逐条确认。
- **R7 跨主机一致**：技能复制到别的电脑后，R1–R6 原样成立。不能因为宿主没配 Key 就改成「用别家模型凑一段视频」；正确动作永远是 R3 的提问安装。

## 执行流程

1. **预检**（R3）：`node {baseDir}/scripts/wan_prime.mjs check`
   - 完成判据：输出 `ok: true, code: "OK"`，且 `model` 为 `wan3.0-video-prime`。
2. **收需求**：画面内容、用途（分镜/封面/成片镜头）、画幅（`16:9` / `9:16` / `adaptive`）、时长、分辨率。
   - 用户没说画幅与分辨率就按 720P + `adaptive`，并在报价里写明，等用户改。
3. **报价**：`plan --prompt "..." --resolution 720P --duration 5`
   - 完成判据：拿到 `estimate.total`，并把方案原样报给用户。
4. **出片**：用户同意后 `generate --prompt "..." --resolution 720P --ratio adaptive --duration 5 --yes --out <目标目录>`
   - 完成判据：输出 `ok: true`，带上 `file` 本地路径与 `videoUrl`。
5. **交付**：给出本地文件路径 + 时长/分辨率/实际花费，说明可继续生成下一镜。不要用 base64 塞视频、不要只给 URL 让用户自己去下。

## 命令速查

`{baseDir}` = 本技能目录（`~/.dsh/skills/wan3-video-prime`）。

```bash
node {baseDir}/scripts/wan_prime.mjs check
node {baseDir}/scripts/wan_prime.mjs plan --prompt "..." [--resolution 720P] [--ratio adaptive] [--duration 5]
node {baseDir}/scripts/wan_prime.mjs generate --prompt "..." --yes [--out DIR] [--timeout 900]
node {baseDir}/scripts/wan_prime.mjs task <task_id>
node {baseDir}/scripts/wan_prime.mjs download <task_id> [--out DIR]
node {baseDir}/scripts/wan_prime.mjs save-key        # 从 stdin 或 DSH_KEY 读，写 refs.DASHSCOPE_API_KEY
```

首帧图生视频：`--image <本地路径或 https URL>`（会以 `input.media=[{type:"first_frame",url}]` 提交；若平台拒绝该字段，按返回的参数错误如实回报，不要反复重试烧钱）。

## 计价与上限

| 分辨率 | 单价 | 5 秒 | 10 秒 |
| --- | --- | --- | --- |
| 480P | ¥0.45/秒 | ¥2.25 | ¥4.50 |
| 720P | ¥0.90/秒 | ¥4.50 | ¥9.00 |
| 1080P | ¥1.80/秒 | ¥9.00 | ¥18.00 |

上限：单条 ≤30 秒；异步队列 500 任务；RPM 300。任务失败（`FAILED` + `InvalidParameter`）不计费；`SUCCEEDED` 才计费。

## 退出码与错误码

| 码 | 含义 | 动作 |
| --- | --- | --- |
| 0 | 成功 | — |
| 2 | `NEEDS_CONFIRMATION` | 把 plan+费用报给用户，同意后加 `--yes` |
| 3 | `NO_QIANWEN_KEY` | 按 R3 提问是否安装并提供 Key，停手等答复 |
| 4 | `AUTH_FAILED` | Key 无效/未开通 Wan 服务：让用户处理，不重试 |
| 5 | `MODEL_UNAVAILABLE` | 该账号无此模型权限：如实回报 |
| 1 | 其它（`TIMEOUT` / `NO_VIDEO_URL` / 参数错误） | 回报原始 `code/message`，不自行改参数连打 |

## 移植到其它主机

1. 整目录复制到目标机器的 `~/.dsh/skills/wan3-video-prime`（Windows：`C:\Users\<用户>\.dsh\skills\`）。
2. 新会话里技能即被发现；老会话需重开才看到。
3. 目标机器没有 Key 时，`check` 会返回 `NO_QIANWEN_KEY` —— 按 R3 问用户要 Key，再 `save-key`，不要沿用本机的 Key 文本。
4. 目标机器若已有 `refs.DASHSCOPE_API_KEY`，直接用；若该主机把它配成了对话 provider，按 R2 提示用户移除。

细节（端点、参数、返回结构、错误样例）见 `references/api.md`。
