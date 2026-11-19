# 万相 3.0-Prime · DSH Skill

用**千问AI平台**（QwenCloud / 千问）按量计费 Key 调用 `wan3.0-video-prime` 生成视频的 DeepSeek Harness 技能：文生视频 / 首帧图生视频，时长 ≤ 30 秒，480P / 720P / 1080P。

> 仓库已开源（Public），克隆即可用。本仓库只放技能本体与调用脚本，**不放任何 API Key**。Key 由使用者的 DSH 凭据库提供。

## 硬性规则（随技能移植，任何主机都不放宽）

技能内的每一条规则都写在 `SKILL.md` 的「硬性规则」里，并由脚本以退出码硬性拦截：

| 规则 | 含义 | 脚本兜底 |
| --- | --- | --- |
| R1 唯一用途 | 这把 Key 只允许调 `POST /api/v1/services/aigc/video-generation/video-synthesis`（`model` 必须为 `wan3.0-video-prime`）和 `GET /api/v1/tasks/{id}`；禁止 `/chat/completions`、图像、embedding、其它 `wan*`/`qwen*` 模型 | `MODEL` 写死，无 `--model` 参数 |
| R2 不进模型选择器 | 不得把千问 Key 注册成 DSH 对话 provider | 技能只提供 CLI，不写 `llm-pi-ai.providers` |
| R3 主机预检 | 使用前先查本机有没有千问 API；没有就**停手问用户是否安装并提供 Key** | `check` 返回 `NO_QIANWEN_KEY`，退出码 3 |
| R4 密钥不落地 | Key 只留在凭据库，不进代码/日志/回复 | 脚本只读 `refs.DASHSCOPE_API_KEY` |
| R5 提交前报价 | 报方案 + 预估费用，拿到明确同意才提交 | 不带 `--yes` 直接拒绝，退出码 2 |
| R6 一次一条 | 默认 5 秒 720P 单条（≈¥4.5） | 默认值即此 |
| R7 跨主机一致 | 换机器也不得改用别家视频服务凑结果 | 逻辑同上 |

## 安装

复制到目标机的 DSH 技能目录（`~/.dsh/skills/`）即可，目录名保持 `wan3-video-prime`：

```bash
# macOS / Linux
git clone https://github.com/JacksonLyon/wan3-video-prime.git ~/.dsh/skills/wan3-video-prime

# Windows PowerShell
git clone https://github.com/JacksonLyon/wan3-video-prime.git "$env:USERPROFILE\.dsh\skills\wan3-video-prime"
```

或用仓库自带安装脚本：

```bash
bash install.sh          # macOS / Linux
powershell -File install.ps1   # Windows
```

装好后**新开一个 DSH 会话**（老会话不会热加载新技能），在技能清单里看到 `万相 3.0-Prime` 即成功。

## 首次使用：配 Key

```bash
node scripts/wan_prime.mjs check
```

- 返回 `ok:true, code:"OK"` → 本机已有可用 Key，直接开工。
- 返回 `NO_QIANWEN_KEY`（退出码 3）→ 说明本机还没装千问 API。技能会按 R3 停下来问你要不要装、并索取 Key：

```bash
echo "<你的 Key>" | node scripts/wan_prime.mjs save-key
```

Key 写入 `~/.dsh/.credentials.yaml` 的 `refs.DASHSCOPE_API_KEY`，权限 600。也支持环境变量 `DASHSCOPE_API_KEY` / `QIANWEN_API_KEY` 直接提供。

> Key 要到 <https://platform.qianwenai.com>（按量计费）创建，形如 `sk-ws-…` / `sk-sp-…`；账号还需开通「Wan 系列模型」。

## 使用

```bash
# 1. 报价：只出方案和费用，不提交
node scripts/wan_prime.mjs plan --prompt "一只小猫在月光下的屋顶上奔跑" --resolution 720P --duration 5

# 2. 用户同意后出片
node scripts/wan_prime.mjs generate --prompt "一只小猫在月光下的屋顶上奔跑" \
  --resolution 720P --ratio adaptive --duration 5 --yes --out ./wan3-videos

# 首帧图生视频
node scripts/wan_prime.mjs generate --prompt "镜头缓慢推进" --image ./first-frame.png --yes

# 查任务 / 补下载
node scripts/wan_prime.mjs task <task_id>
node scripts/wan_prime.mjs download <task_id> --out ./wan3-videos
```

脚本每步都输出单行 JSON，方便 Agent 解析；失败时不自动重试，如实回报 `code` / `message`。

## 计价（2026-11 平台价，以官方为准）

| 分辨率 | 单价 | 5 秒 | 10 秒 |
| --- | --- | --- | --- |
| 480P | ¥0.45/秒 | ¥2.25 | ¥4.50 |
| 720P | ¥0.90/秒 | ¥4.50 | ¥9.00 |
| 1080P | ¥1.80/秒 | ¥9.00 | ¥18.00 |

任务在参数校验阶段失败（如 `InvalidParameter`）不计费；只有 `SUCCEEDED` 才按秒计费。异步队列上限 500，RPM 300。

## 目录

```
SKILL.md              技能说明与硬性规则
scripts/wan_prime.mjs 唯一调用入口（check/plan/generate/task/download/save-key）
references/api.md     端点、参数、轮询、返回结构、错误样例
install.sh / install.ps1  复制到 ~/.dsh/skills/ 的安装脚本
```

## 安全

- 仓库内不含密钥；`.gitignore` 会挡住本地生成的视频、日志与临时 Key 文件。
- 脚本只在被要求时联网：`check` 会做一次**零计费**自检（空 prompt，任务在校验阶段失败）。
- 平台对 Wan 系列有独立的服务开关；403 `AccessDenied` 时先确认账号是否开通该服务。

## License

[MIT](LICENSE) © 2026 JasonTAO (JacksonLyon)
