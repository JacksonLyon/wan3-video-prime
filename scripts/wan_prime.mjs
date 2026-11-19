#!/usr/bin/env node
/**
 * 万相 3.0-Prime 视频生成（千问AI平台）
 *
 * 唯一的对外能力：model = wan3.0-video-prime 的文生视频 / 首帧图生视频。
 * 本脚本刻意不提供任何聊天、文本、图像、其他模型的入口；写死 MODEL 常量，
 * 不接受 --model 覆盖。规则见 SKILL.md「硬性规则」。
 *
 * 用法：
 *   node wan_prime.mjs check                                     # 密钥 + 模型可用性自检（零计费）
 *   node wan_prime.mjs plan  --prompt "..." [--resolution 720P] [--duration 5]
 *   node wan_prime.mjs generate --prompt "..." --yes [--resolution 720P] [--ratio adaptive] [--duration 5] [--out DIR]
 *   node wan_prime.mjs task <task_id>
 *   node wan_prime.mjs download <task_id> [--out DIR]
 *   node wan_prime.mjs save-key                                  # 从环境变量 DSH_KEY 或 stdin 读取，写入凭据库
 *
 * 退出码：0 成功 / 2 需要用户确认 / 3 缺少千问 API Key / 4 鉴权失败 / 5 模型不可用 / 1 其它错误
 * 输出：单行 JSON，便于上游 Agent 解析。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL = 'wan3.0-video-prime';
const HOSTS = [
  'https://cn-beijing.maas.qianwenaiapi.com',
  'https://maas.qianwenaiapi.com',
];
const KEY_REFS = ['DASHSCOPE_API_KEY', 'QIANWEN_API_KEY'];
const PRICE_PER_SECOND = { '480P': 0.45, '720P': 0.9, '1080P': 1.8 };

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (!a.startsWith('--')) {
    flags._ = flags._ || [];
    flags._.push(a);
    continue;
  }
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = true;
  else { flags[a.slice(2)] = next; i += 1; }
}

const out = (obj, code = 0) => {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
  process.exit(code);
};

// ---------- 凭据解析 -------------------------------------------------------
function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh');
}

function credentialsPaths() {
  const dirs = [dshHome(), path.join(os.homedir(), '.dsh')];
  const files = [];
  for (const d of dirs) {
    for (const name of ['.credentials.yaml', '.credentials.yml']) {
      const p = path.join(d, name);
      if (fs.existsSync(p) && !files.includes(p)) files.push(p);
    }
  }
  return files;
}

function resolveKey() {
  for (const ref of KEY_REFS) {
    const v = process.env[ref];
    if (v && v.trim()) return { key: v.trim(), source: `env:${ref}` };
  }
  for (const file of credentialsPaths()) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const ref of KEY_REFS) {
      const m = text.match(new RegExp(`^\\s*${ref}\\s*:\\s*(\\S+)`, 'm'));
      if (m && m[1] && !m[1].startsWith('<')) {
        return { key: m[1].trim(), source: `${file}#refs.${ref}` };
      }
    }
  }
  return null;
}

function requireKey() {
  const found = resolveKey();
  if (found) return found;
  out({
    ok: false,
    code: 'NO_QIANWEN_KEY',
    rule: '千问 API 只用于万相 3.0-Prime；缺失时必须停下来问用户，不得用其它厂商密钥顶替。',
    askUser:
      '本机 DSH 里没有检测到千问AI平台的 API Key（DASHSCOPE_API_KEY）。要不要现在安装？'
      + '如果要，请把千问AI平台（platform.qianwenai.com，按量计费）的 sk-ws- 或 sk-sp- 开头的 Key 发给我，'
      + '我只把它登记到凭据库用于万相视频生成，不会注册成对话模型。',
  }, 3);
}

// ---------- HTTP ------------------------------------------------------------
async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

async function withHost(fn) {
  let lastErr = null;
  for (const host of HOSTS) {
    try {
      return await fn(host);
    } catch (e) {
      lastErr = e;
      if (e && e.code === 'AUTH') throw e;
    }
  }
  throw lastErr || new Error('all hosts unreachable');
}

const authHeaders = (key) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'X-DashScope-Async': 'enable',
});

function classify(status, body) {
  const code = String(body?.code || body?.output?.code || '');
  const message = String(body?.message || body?.output?.message || '');
  const blob = `${code} ${message}`.toLowerCase();
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (blob.includes('model') && (blob.includes('not') || blob.includes('denied') || blob.includes('unavailable'))) return 'MODEL_UNAVAILABLE';
  if (blob.includes('accessdenied')) return 'AUTH_FAILED';
  return null;
}

async function submit(host, key, payload) {
  const { status, body } = await request(`${host}/api/v1/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify(payload),
  });
  if (status >= 400) {
    const kind = classify(status, body);
    const err = new Error(`submit failed ${status}`);
    if (kind) err.code = 'AUTH';
    throw Object.assign(err, { status, body, kind });
  }
  const taskId = body?.output?.task_id;
  if (!taskId) {
    throw Object.assign(new Error('no task_id'), { status, body });
  }
  return taskId;
}

async function query(host, key, taskId) {
  const { status, body } = await request(`${host}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return { status, body };
}

function estimate(resolution, duration) {
  const unit = PRICE_PER_SECOND[resolution];
  if (!unit) return null;
  return { currency: 'CNY', unitPerSecond: unit, seconds: duration, total: +(unit * duration).toFixed(2) };
}

// ---------- 命令 ------------------------------------------------------------
async function cmdCheck() {
  const { key, source } = requireKey();
  const masked = `${key.slice(0, 6)}…${key.slice(-4)}`;
  let result;
  try {
    result = await withHost(async (host) => {
      // 空 prompt：任务在参数校验阶段必定失败，用于验证鉴权与模型可用性，不计费。
      const taskId = await submit(host, key, {
        model: MODEL,
        input: { prompt: '' },
        parameters: { resolution: '480P', ratio: 'adaptive', duration: 5 },
      });
      await new Promise((r) => setTimeout(r, 1200));
      const { body } = await query(host, key, taskId);
      return { host, taskId, body };
    });
  } catch (e) {
    const code = e.kind || (e.body && classify(e.status, e.body)) || 'UNKNOWN';
    out({
      ok: false,
      code: code === 'AUTH_FAILED' ? 'AUTH_FAILED' : code,
      detail: e.body || e.message,
      hint: e.status === 403 ? '该 Key 未开通万相视频服务，去平台开启「Wan系列模型」后再试。' : undefined,
    }, code === 'AUTH_FAILED' ? 4 : 1);
  }
  const status = result.body?.output?.task_status;
  const code = result.body?.output?.code;
  const message = result.body?.output?.message || '';
  const modelOk = result.body?.model === MODEL;
  const authOk = !['AUTH_FAILED', 'AccessDenied'].includes(String(code || ''));
  out({
    ok: authOk && modelOk,
    code: authOk && modelOk ? 'OK' : 'MODEL_UNAVAILABLE',
    host: result.host,
    model: result.body?.model || MODEL,
    keyRef: source,
    keyMasked: masked,
    selftest: { taskStatus: status, code, message },
    note: '零计费自检：任务在参数校验阶段即失败（prompt 为空），不会产生生成费用。',
  }, authOk && modelOk ? 0 : 5);
}

function buildPayload() {
  const prompt = typeof flags.prompt === 'string' ? flags.prompt.trim() : '';
  const image = typeof flags.image === 'string' ? flags.image.trim() : '';
  if (!prompt && !image) {
    out({ ok: false, code: 'MISSING_PROMPT', hint: '需要 --prompt "画面描述"，或 --image 首帧图。' }, 1);
  }
  const resolution = String(flags.resolution || '720P').toUpperCase();
  if (!PRICE_PER_SECOND[resolution]) {
    out({ ok: false, code: 'BAD_RESOLUTION', hint: '仅支持 480P / 720P / 1080P。' }, 1);
  }
  const duration = Number(flags.duration || 5);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) {
    out({ ok: false, code: 'BAD_DURATION', hint: 'duration 为秒，范围 (0, 30]。' }, 1);
  }
  const ratio = String(flags.ratio || 'adaptive');
  const input = { prompt };
  if (image) input.media = [{ type: 'first_frame', url: image }];
  return {
    payload: { model: MODEL, input, parameters: { resolution, ratio, duration } },
    plan: { model: MODEL, resolution, ratio, duration, prompt, image: image || null },
  };
}

async function cmdGenerate() {
  const { key, source } = requireKey();
  const { payload, plan } = buildPayload();
  const cost = estimate(plan.resolution, plan.duration);
  if (!flags.yes) {
    out({
      ok: false,
      code: 'NEEDS_CONFIRMATION',
      plan,
      estimate: cost,
      rule: '提交前必须把 plan + 预估费用报给用户并拿到明确同意，然后加 --yes 重跑。',
      keyRef: source,
    }, 2);
  }
  const started = Date.now();
  const { host, taskId } = await withHost(async (h) => ({ host: h, taskId: await submit(h, key, payload) }))
    .catch((e) => {
      const code = e.kind || (e.body && classify(e.status, e.body)) || 'SUBMIT_FAILED';
      out({ ok: false, code, detail: e.body || e.message }, code === 'AUTH_FAILED' ? 4 : 1);
    });

  const timeoutMs = Number(flags.timeout || 900) * 1000;
  let last = null;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 6000));
    const { body } = await query(host, key, taskId);
    last = body;
    const status = body?.output?.task_status;
    if (process.env.WAN_PRIME_VERBOSE) process.stderr.write(`[wan] ${status}\n`);
    if (status === 'SUCCEEDED') {
      const url = body?.output?.video_url
        || body?.output?.results?.[0]?.video_url
        || body?.output?.results?.[0]?.url;
      if (!url) out({ ok: false, code: 'NO_VIDEO_URL', taskId, detail: body }, 1);
      const file = await download(url, taskId);
      out({ ok: true, code: 'OK', host, taskId, plan, estimate: cost, file, videoUrl: url, elapsedSeconds: Math.round((Date.now() - started) / 1000) });
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      out({
        ok: false,
        code: body?.output?.code || status,
        message: body?.output?.message,
        taskId,
        plan,
        charged: false,
      }, 1);
    }
  }
  out({ ok: false, code: 'TIMEOUT', taskId, elapsedSeconds: Math.round((Date.now() - started) / 1000), detail: last }, 1);
}

async function download(url, taskId) {
  const dir = path.resolve(typeof flags.out === 'string' ? flags.out : 'wan3-videos');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `wan3-prime-${String(taskId).slice(0, 8)}.mp4`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return file;
}

async function cmdTask() {
  const taskId = flags._?.[0];
  if (!taskId) out({ ok: false, code: 'MISSING_TASK_ID' }, 1);
  const { key } = requireKey();
  const { host, body } = await withHost(async (h) => ({ host: h, body: (await query(h, key, taskId)).body }));
  out({ ok: true, host, taskId, status: body?.output?.task_status, detail: body });
}

async function cmdDownload() {
  const taskId = flags._?.[0];
  if (!taskId) out({ ok: false, code: 'MISSING_TASK_ID' }, 1);
  const { key } = requireKey();
  const { host, body } = await withHost(async (h) => ({ host: h, body: (await query(h, key, taskId)).body }));
  const url = body?.output?.video_url || body?.output?.results?.[0]?.video_url;
  if (!url) out({ ok: false, code: 'NO_VIDEO_URL', status: body?.output?.task_status, detail: body }, 1);
  const file = await download(url, taskId);
  out({ ok: true, host, taskId, file, videoUrl: url });
}

async function cmdSaveKey() {
  let key = process.env.DSH_KEY || '';
  if (!key && !process.stdin.isTTY) {
    key = await new Promise((resolve) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      process.stdin.on('end', () => resolve(buf.trim()));
    });
  }
  key = key.trim();
  if (!key) out({ ok: false, code: 'NO_KEY_PROVIDED', hint: '把 Key 放进环境变量 DSH_KEY 或通过 stdin 传入。' }, 1);
  const dir = path.join(dshHome());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, '.credentials.yaml');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'refs:\n';
  if (new RegExp(`^\\s*${KEY_REFS[0]}\\s*:`, 'm').test(text)) {
    text = text.replace(new RegExp(`(^\\s*${KEY_REFS[0]}\\s*:\\s*).*$`, 'm'), `$1${key}`);
  } else if (/^refs:\s*$/m.test(text)) {
    text = text.replace(/^refs:\s*$/m, `refs:\n  ${KEY_REFS[0]}: ${key}`);
  } else {
    text += `${text.endsWith('\n') ? '' : '\n'}refs:\n  ${KEY_REFS[0]}: ${key}\n`;
  }
  fs.writeFileSync(file, text, { mode: 0o600 });
  out({ ok: true, code: 'KEY_SAVED', file, ref: KEY_REFS[0] });
}

const commands = {
  check: cmdCheck,
  plan: async () => {
    requireKey();
    const { plan } = buildPayload();
    out({ ok: true, plan, estimate: estimate(plan.resolution, plan.duration) });
  },
  generate: cmdGenerate,
  task: cmdTask,
  download: cmdDownload,
  'save-key': cmdSaveKey,
};

if (!cmd || !commands[cmd]) {
  out({
    ok: false,
    code: 'USAGE',
    usage: [
      'check | plan --prompt ... | generate --prompt ... --yes | task <id> | download <id> | save-key',
      'options: --resolution 480P|720P|1080P --ratio adaptive|16:9|9:16 --duration 1..30 --image <path|url> --out DIR --timeout SEC',
    ],
    rule: `本技能只允许调用 ${MODEL}。`,
  }, 1);
}

await commands[cmd]();
