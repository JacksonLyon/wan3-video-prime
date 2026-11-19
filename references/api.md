# 万相 3.0-Prime API 参考

## 规则前置（与 SKILL.md 一致）

`DASHSCOPE_API_KEY` 在本技能中只用于下面两个端点。任何 `/chat/completions`、`/compatible-mode/v1`、图像、embedding、其它 `wan*` / `qwen*` 模型调用都属违规，即使平台对同一把 Key 开放了这些能力。

## 端点

提交（异步）：

```
POST https://cn-beijing.maas.qianwenaiapi.com/api/v1/services/aigc/video-generation/video-synthesis
Authorization: Bearer $DASHSCOPE_API_KEY
Content-Type: application/json
X-DashScope-Async: enable
```

备用主机（同一路径）：`https://maas.qianwenaiapi.com`。脚本按顺序尝试，前者网络不可达时自动落到后者。

查询：

```
GET https://cn-beijing.maas.qianwenaiapi.com/api/v1/tasks/{task_id}
Authorization: Bearer $DASHSCOPE_API_KEY
```

> `GET /api/v1/tasks` 不带 id 会返回 403 `AccessDenied`（"current user api does not support asynchronous calls"），这是正常行为，不代表权限问题。

## 请求体

```json
{
  "model": "wan3.0-video-prime",
  "input": { "prompt": "一只小猫在月光下的屋顶上奔跑，电影级画质" },
  "parameters": { "resolution": "720P", "ratio": "adaptive", "duration": 5 }
}
```

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `model` | 固定 `wan3.0-video-prime` | 万相3.0 高速版；本技能不接受其它值 |
| `input.prompt` | 文本，中文/英文 | 与 `input.media` 至少给一个，都空会 `InvalidParameter` |
| `input.media` | `[{ "type": "first_frame", "url": "<路径或URL>" }]` | 首帧图生视频；字段名以平台为准，被拒不重试烧钱 |
| `parameters.resolution` | `480P` / `720P` / `1080P` | 计价档位 |
| `parameters.ratio` | `adaptive` / `16:9` / `9:16` / `1:1` 等 | 画幅 |
| `parameters.duration` | 整数秒，≤ 30 | 时长 |

## 返回与轮询

提交成功：`{"output":{"task_id":"...","task_status":"PENDING"},"request_id":"..."}`

轮询 `output.task_status`：`PENDING` → `RUNNING` → `SUCCEEDED` / `FAILED` / `CANCELED`（偶见 `UNKNOWN`）。

成功时视频地址：

- `output.video_url`（常见）
- `output.results[0].video_url`（部分返回形态）

失败时读 `output.code` + `output.message`，例如：

```json
{"output":{"task_status":"FAILED","code":"InvalidParameter","message":"prompt and media cannot both be empty"}}
```

`InvalidParameter` 一类参数错误发生在校验阶段，**不计费**；只有 `SUCCEEDED` 才按秒计费。

## 计价 / 配额（2026-11 平台页）

| 分辨率 | 单价 |
| --- | --- |
| 480P | ¥0.45 / 秒 |
| 720P | ¥0.90 / 秒 |
| 1080P | ¥1.80 / 秒 |

- 异步队列上限 500，RPM 300。
- 关闭「Wan 系列模型」服务后所有已开通地域同时停服；403 `AccessDenied` 时先查这个开关。

## 零计费自检

`check` 命令故意用空 `prompt` 提交一次：鉴权/模型可用则返回 `task_id`，随后任务以 `InvalidParameter: prompt and media cannot both be empty` 失败，费用为 0。它同时验证了三件事：Key 有效、账号已开通 Wan、`model` 名称正确。

## 凭据位置

- `$DSH_HOME/.credentials.yaml` → `refs.DASHSCOPE_API_KEY`（默认 `~/.dsh/.credentials.yaml`）
- 也认 `QIANWEN_API_KEY` 作为 ref 名，以及环境变量 `DASHSCOPE_API_KEY` / `QIANWEN_API_KEY`
- 写入：`echo <key> | node scripts/wan_prime.mjs save-key`
