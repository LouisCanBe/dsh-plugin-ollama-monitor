import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * ollama-monitor — 用两个模型可见的工具观察本机 Ollama:
 *
 *   ollama_status  已安装/已加载模型、显存占用、模型架构支持的上下文上限
 *   ollama_bench    跑一次流式生成，测量首 token 延迟(TTFT)、提示词处理速度、生成速度(tok/s)
 */

export const name = 'ollama-monitor'
export const inject = ['tools', 'webServer']

export interface Config {
  /** Ollama 服务地址。 */
  host: string
  /** bench 未指定模型时使用的默认模型；留空则自动选第一个已加载/已安装的模型。 */
  defaultModel: string
  /** bench 默认提示词。 */
  defaultPrompt: string
  /** bench 默认最多生成的 token 数。 */
  numPredict: number
  /** 单次请求超时（毫秒）。 */
  timeoutMs: number
  /** 测速历史 JSONL 文件路径；每次 ollama_bench 成功后自动追加一行。 */
  historyPath: string
  /** HTML 面板输出路径（用浏览器打开查看）。 */
  dashboardPath: string
}

export const Config = z.object({
  host: z.string().default('http://127.0.0.1:11434'),
  defaultModel: z.string().default(''),
  defaultPrompt: z.string().default('用一句话解释什么是操作系统。'),
  numPredict: z.number().default(128),
  timeoutMs: z.number().default(120_000),
  historyPath: z.string().default(join(homedir(), '.dsh', 'ollama-monitor-history.jsonl')),
  dashboardPath: z.string().default(join(homedir(), '.dsh', 'ollama-dashboard.html')),
})

// ---------------------------------------------------------------------------
// 小工具函数
// ---------------------------------------------------------------------------

function api(host: string, path: string): string {
  return host.replace(/\/+$/, '') + path
}

function round(n: number | undefined, digits = 1): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined
  const p = 10 ** digits
  return Math.round(n * p) / p
}

function bytesToGb(bytes: unknown): number | undefined {
  return typeof bytes === 'number' && bytes > 0 ? round(bytes / 1024 ** 3, 2) : undefined
}

/** 把任意 fetch 失败翻译成带排查提示的错误。 */
async function requestJson(host: string, path: string, init?: RequestInit): Promise<any> {
  let res: Response
  try {
    res = await fetch(api(host, path), init)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      `无法连接 Ollama (${host})：${reason}。请确认已运行 "ollama serve"，或在插件 config.host 里填写正确地址。`,
    )
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama ${path} 返回 HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  return await res.json()
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (signal && typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])
  return timeout
}

/** 从 /api/show 的 model_info 里抠出架构上下文上限，例如 "qwen2.context_length"。 */
function extractContextLengths(modelInfo: Record<string, unknown> | undefined): number[] {
  if (!modelInfo) return []
  return Object.entries(modelInfo)
    .filter(([key, value]) => key.endsWith('.context_length') && typeof value === 'number')
    .map(([, value]) => value as number)
}

interface GenerateChunk {
  response?: string
  thinking?: string
  done?: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

interface StreamSample {
  firstTokenAt: number | null
  finishedAt: number
  tokenChunks: number
  generatedChars: number
  stats: Partial<GenerateChunk>
}

/** 读 NDJSON 流并记录计时点；done=true 的最后一帧携带 Ollama 官方统计。 */
async function sampleGenerateStream(res: Response, t0: number): Promise<StreamSample> {
  const sample: StreamSample = { firstTokenAt: null, finishedAt: t0, tokenChunks: 0, generatedChars: 0, stats: {} }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Ollama 响应没有可读的流式 body')
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineAt = buffer.indexOf('\n')
    while (newlineAt >= 0) {
      const line = buffer.slice(0, newlineAt).trim()
      buffer = buffer.slice(newlineAt + 1)
      newlineAt = buffer.indexOf('\n')
      if (!line) continue
      let chunk: GenerateChunk
      try {
        chunk = JSON.parse(line) as GenerateChunk
      } catch {
        continue // 跳过不完整的帧
      }
      if ((typeof chunk.response === 'string' && chunk.response.length > 0) ||
          (typeof chunk.thinking === 'string' && chunk.thinking.length > 0)) {
        sample.tokenChunks++
        sample.generatedChars += (chunk.response?.length ?? 0) + (chunk.thinking?.length ?? 0)
        if (sample.firstTokenAt === null) sample.firstTokenAt = performance.now()
      }
      if (chunk.done) {
        sample.stats = chunk
        sample.finishedAt = performance.now()
      }
    }
  }
  if (sample.finishedAt === t0) sample.finishedAt = performance.now()
  return sample
}

// ---------------------------------------------------------------------------
// 插件主体
// ---------------------------------------------------------------------------

export function apply(ctx: Context, config: Config) {
  const host = () => config.host

  // -- 同源路由: 面板用的模型目录代理（服务器端抓 ollama.com，绕开浏览器 CORS）--
  // 注册延迟到 ctx.effect：apply 时 webServer 可能尚未就绪（与官方插件同款时序）
  let catalogRouteState: 'ok' | 'no-webservice' | 'error' = 'no-webservice'
  ;(ctx as unknown as { effect(fn: () => void, label?: string): void }).effect(() => {
    const ws = (ctx as unknown as { webServer?: { register(route: unknown): void } }).webServer
    if (!ws) return
    try {
      ws.register({
        kind: 'prefix',
        path: '/ollama-monitor',
        handler: async (req: { url?: string }, res: { writeHead(status: number, headers?: Record<string, string>): void; end(body?: string): void }) => {
          const pathname = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '')
          if (pathname === '/ollama-monitor/catalog') {
            try {
              const catalog = await loadCatalog(false)
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
              res.end(JSON.stringify(catalog))
            } catch (e) {
              res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
            }
            return
          }
          if (pathname === '/ollama-monitor/model-info') {
            const url2 = new URL(req.url ?? '/', 'http://x')
            if (url2.searchParams.get('all') === '1') {
              // 整包返回缓存（扫描完成后前端一次拿全）
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
              res.end(JSON.stringify({ info: infoCache }))
              return
            }
            const q = url2.searchParams.get('names') ?? ''
            const names = q.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12)
            const info: Record<string, unknown> = {}
            await Promise.all(names.map(async (n) => {
              try { info[n] = await loadModelInfo(n) } catch (e) { info[n] = { error: String((e as any)?.message ?? e) } }
            }))
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ info }))
            return
          }
          if (pathname === '/ollama-monitor/scan') {
            // POST=启动全量体积扫描（后台跑，可关面板）；GET=查进度
            if ((req as { method?: string }).method === 'POST') {
              void startInfoScan()
              res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ started: true }))
              return
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify(infoScanState))
            return
          }
          if (pathname === '/ollama-monitor/hf-search') {
            const u = new URL(req.url ?? '/', 'http://x')
            try {
              const out = await searchRemoteModels(u.searchParams.get('source') === 'ms' ? 'ms' : 'hf', u.searchParams.get('q') ?? '')
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ models: out }))
            } catch (e) {
              res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
            }
            return
          }
          if (pathname === '/ollama-monitor/hf-files') {
            const u = new URL(req.url ?? '/', 'http://x')
            try {
              const out = await listRemoteGgufFiles(u.searchParams.get('source') === 'ms' ? 'ms' : 'hf', u.searchParams.get('repo') ?? '')
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ files: out }))
            } catch (e) {
              res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
            }
            return
          }
          if (pathname === '/ollama-monitor/bench-curve') {
            if ((req as { method?: string }).method === 'POST') {
              void (async () => {
                try {
                  const b = await readJsonBody(req)
                  const model = String(b.model ?? '').trim()
                  if (!model) throw new Error('需要 model')
                  const points = Array.isArray(b.points) && b.points.length > 0
                    ? (b.points as unknown[]).map((n) => Math.max(1024, Number(n) | 0))
                    : [4096, 16384, 32768]
                  const filler = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. '
                  const out: Array<{ ctx: number; prefill_tps?: number; eval_tps?: number; vram?: string }> = []
                  for (const c of points) {
                    const targetTok = Math.floor(c * 0.75)
                    const prompt = filler.repeat(Math.ceil(targetTok / 19))
                    const r = await fetch(api(host(), '/api/generate'), {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ model, prompt, stream: false, think: false, options: { num_ctx: c, num_predict: 256, temperature: 0 } }),
                      signal: AbortSignal.timeout(900_000),
                    })
                    const j = await r.json() as any
                    if (j.error) throw new Error(String(j.error))
                    const pc = j.prompt_eval_count || 0
                    const pd = (j.prompt_eval_duration || 1) / 1e9
                    const ec = j.eval_count || 0
                    const ed = (j.eval_duration || 1) / 1e9
                    let vram = ''
                    try {
                      const ps = await fetch(api(host(), '/api/ps')).then((x) => x.json()) as any
                      const norm = (s: unknown) => String(s ?? '').replace(/:latest$/, '')
                      const mm = (ps.models || []).find((x: any) => norm(x.name) === norm(model) || norm(x.model) === norm(model))
                      if (mm?.size_vram != null) vram = 'GPU ' + (mm.size_vram / 1073741824).toFixed(1) + ' GB'
                    } catch { /* 忽略 */ }
                    out.push({
                      ctx: c,
                      prefill_tps: pc > 0 && pd > 0 ? Math.round(pc / pd) : undefined,
                      eval_tps: ec > 0 && ed > 0 ? +(ec / ed).toFixed(1) : undefined,
                      vram: vram || undefined,
                    })
                  }
                  // 补齐式合并：本次扫描覆盖同点位，历史中额外点位（如手工扫过的 48k/64k）保留
                  try {
                    const hist = await readHistory()
                    const prev = [...hist].reverse().find((x) => x.model === model && Array.isArray((x as any).ctx_curve))
                    if (prev) {
                      const byCtx = new Map<number, any>()
                      for (const p of (prev as any).ctx_curve as Array<{ ctx: number }>) byCtx.set(Number(p.ctx), p)
                      for (const p of out) byCtx.set(p.ctx, p)
                      out.length = 0
                      out.push(...[...byCtx.values()].sort((a, b) => a.ctx - b.ctx))
                    }
                  } catch { /* 合并失败不影响主流程 */ }
                  const entry = { ts: new Date().toISOString(), model, type: 'ctx-curve', ctx_curve: out }
                  await mkdir(dirname(config.historyPath), { recursive: true })
                  await writeFile(config.historyPath, JSON.stringify(entry) + '\n', { flag: 'a', encoding: 'utf8' })
                  await refreshDashboard().catch(() => {})
                  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
                  res.end(JSON.stringify({ ok: true, curve: out }))
                } catch (e) {
                  try {
                    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
                    res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
                  } catch { /* 连接已断 */ }
                }
              })()
              return
            }
            res.writeHead(404)
            res.end()
            return
          }
          if (pathname === '/ollama-monitor/import-cancel') {
            if ((req as { method?: string }).method === 'POST') {
              try {
                const b = await readJsonBody(req)
                const job = importJobs.get(String(b.id ?? ''))
                if (!job) throw new Error('任务不存在')
                if (job.state === 'downloading' || job.state === 'uploading' || job.state === 'creating') {
                  job.cancelled = true
                  importAborters.get(job.id)?.abort()
                }
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ ok: true, state: job.state }))
              } catch (e) {
                res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
              }
              return
            }
            res.writeHead(404)
            res.end()
            return
          }
          if (pathname === '/ollama-monitor/import') {
            if ((req as { method?: string }).method === 'POST') {
              try {
                const b = await readJsonBody(req)
                const source: 'hf' | 'ms' = b.source === 'ms' ? 'ms' : 'hf'
                const repo = String(b.repo ?? '').trim()
                const file = String(b.file ?? '').trim()
                const name = String(b.name ?? '').trim()
                if (!repo || !file || !name) throw new Error('需要 repo / file / name')
                const job: ImportJob = {
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  name, repo, file, source,
                  state: 'downloading', bytesDone: 0, bytesTotal: 0, started: Date.now(),
                }
                importJobs.set(job.id, job)
                for (const [k, v] of importJobs) if (importJobs.size > 30 && v.state !== 'downloading' && v.state !== 'uploading' && v.state !== 'creating') importJobs.delete(k)
                persistImportJobs()
                runImportJob(job)
                res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify(job))
              } catch (e) {
                res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ error: String((e as any)?.message ?? e) }))
              }
              return
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ jobs: [...importJobs.values()].sort((a, b) => b.started - a.started) }))
            return
          }
          res.writeHead(404)
          res.end()
        },
      })
      catalogRouteState = 'ok'
    } catch (e) {
      catalogRouteState = 'error'
      console.error('[ollama-monitor] catalog 路由注册失败:', e)
    }
  }, 'ollama-monitor: catalog route')

  async function resolveDefaultModel(): Promise<string> {
    if (config.defaultModel) return config.defaultModel
    const ps = await requestJson(host(), '/api/ps').catch(() => ({ models: [] })) as { models?: Array<{ name?: string }> }
    const loaded = ps.models?.[0]?.name
    if (loaded) return loaded
    const tags = await requestJson(host(), '/api/tags') as { models?: Array<{ name?: string }> }
    const installed = tags.models?.[0]?.name
    if (installed) return installed
    throw new Error('Ollama 里没有任何模型：先 `ollama pull <model>` 再测速。')
  }

  // -- 工具 1: 状态总览 ------------------------------------------------------

  ctx.tools.register(defineTool({
    name: 'ollama_status',
    description:
      '查看本机 Ollama 状态：已安装/已加载的模型、显存(RAM/VRAM)占用、每个模型的架构上下文上限(context length)。用于回答"我的机器上跑哪些模型、还能开多大上下文"。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          host: { type: 'string' },
          installed: { type: 'array', items: { type: 'object', additionalProperties: true } },
          loaded: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderStatus(value) }],
    },
    async execute(_args, exec) {
      const signal = combineSignals(exec.signal, config.timeoutMs)

      let version: string | undefined
      try {
        version = (await requestJson(host(), '/api/version', { signal })).version
      } catch { /* 版本接口失败不影响其余信息 */ }

      const tags = await requestJson(host(), '/api/tags', { signal }) as { models?: any[] }
      const ps = await requestJson(host(), '/api/ps', { signal }) as { models?: any[] }

      const installed = (tags.models ?? []).map((m) => ({
        name: m.name,
        size_gb: bytesToGb(m.size),
        params: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        family: m.details?.family,
        modified: m.modified_at,
      }))

      const loaded = []
      for (const m of ps.models ?? []) {
        let ctxMax: number | undefined
        try {
          const shown = await requestJson(host(), `/api/show`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: m.name }),
            signal,
          })
          const lengths = extractContextLengths(shown?.model_info)
          ctxMax = lengths.length > 0 ? Math.max(...lengths) : undefined
        } catch { /* 单个模型 show 失败不影响整体 */ }

        const sizeGb = bytesToGb(m.size)
        const vramGb = bytesToGb(m.size_vram)
        loaded.push({
          name: m.name,
          size_gb: sizeGb,
          vram_gb: vramGb,
          cpu_ram_gb: sizeGb !== undefined && vramGb !== undefined ? round(sizeGb - vramGb, 2) : undefined,
          fully_on_gpu: vramGb !== undefined && sizeGb !== undefined ? vramGb >= sizeGb : undefined,
          expires_at: m.expires_at,
          arch_context_max: ctxMax,
        })
      }

      return { host: host(), version, installed, loaded }
    },
  }))

  // -- 工具 2: 测速 ----------------------------------------------------------

  ctx.tools.register(defineTool({
    name: 'ollama_bench',
    description:
      '对本机 Ollama 跑一次流式生成来测速：首 token 延迟(TTFT)、提示词处理速度、生成速度(tok/s)、总耗时。可用 num_ctx 指定上下文长度对比不同设置下的速度。',
    parameters: {
      model: { type: 'string', description: '要测的模型名，例如 "qwen2.5:7b"；缺省用插件配置的默认模型' },
      prompt: { type: 'string', description: '测试提示词；缺省用插件配置' },
      num_predict: { type: 'number', description: '最多生成多少个 token；缺省用插件配置' },
      num_ctx: { type: 'number', description: '本次请求的上下文窗口大小(num_ctx)，用于对比不同上下文长度下的速度' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          model: { type: 'string' },
          host: { type: 'string' },
          ttft_ms: { type: 'number' },
          load_ms: { type: 'number' },
          prompt_tokens: { type: 'integer' },
          prompt_tps: { type: 'number' },
          gen_tokens: { type: 'integer' },
          eval_tps: { type: 'number' },
          eval_tps_wall: { type: 'number' },
          total_ms: { type: 'number' },
          preview: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBench(value) }],
    },
    async execute(args, exec) {
      const model = args.model || (await resolveDefaultModel())
      const prompt = args.prompt || config.defaultPrompt

      const options: Record<string, number> = { num_predict: args.num_predict ?? config.numPredict }
      if (args.num_ctx !== undefined) options.num_ctx = args.num_ctx

      const body = JSON.stringify({ model, prompt, stream: true, options })

      const res = await fetch(api(host(), '/api/generate'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: combineSignals(exec.signal, config.timeoutMs),
      }).catch((err) => {
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`无法连接 Ollama (${host()})：${reason}。请确认 "ollama serve" 正在运行。`)
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Ollama /api/generate 返回 HTTP ${res.status}: ${text.slice(0, 300)}`)
      }

      const t0 = performance.now()
      const sample = await sampleGenerateStream(res, t0)
      const s = sample.stats

      const ttftMs = sample.firstTokenAt !== null ? Math.round(sample.firstTokenAt - t0) : undefined
      const totalMs = Math.round(sample.finishedAt - t0)
      const loadMs = typeof s.load_duration === 'number' ? round(s.load_duration / 1e6, 0) : undefined
      const genTokens = s.eval_count ?? sample.tokenChunks
      const evalSeconds = typeof s.eval_duration === 'number' ? s.eval_duration / 1e9 : undefined
      const promptTokens = s.prompt_eval_count
      const promptSeconds = typeof s.prompt_eval_duration === 'number' ? s.prompt_eval_duration / 1e9 : undefined

      const generateSeconds =
        ttftMs !== null && ttftMs !== undefined && genTokens > 1
          ? (sample.finishedAt - (t0 + ttftMs)) / 1000
          : undefined

      const result = {
        model,
        host: host(),
        ttft_ms: ttftMs,
        load_ms: loadMs,
        prompt_tokens: promptTokens,
        prompt_tps: promptTokens && promptSeconds ? round(promptTokens / promptSeconds) : undefined,
        gen_tokens: genTokens || undefined,
        eval_tps: genTokens && evalSeconds ? round(genTokens / evalSeconds) : undefined,
        eval_tps_wall: genTokens && generateSeconds ? round(genTokens / generateSeconds) : undefined,
        total_ms: totalMs,
        options_used: options,
        preview: sample.generatedChars > 0 ? undefined : '(本次输出全部为隐藏思考过程(thinking)，response 无可见文本)',
      }
      // 自动记录到历史文件（失败不影响测速本身）。
      await mkdir(dirname(config.historyPath), { recursive: true }).catch(() => {})
      void appendFile(
        config.historyPath,
        JSON.stringify({ ts: new Date().toISOString(), ...result, options_used: undefined }) + '\n',
        'utf8',
      ).catch(() => {})
      return result
    },
  }))

  // -- 工具 3: 拉取模型 ------------------------------------------------------

  ctx.tools.register(defineTool({
    name: 'ollama_pull',
    description:
      '在 Ollama 服务器上拉取(pull)一个模型，下载发生在服务器端。遇到反向代理超时(如 Cloudflare 100s)会自动断点续传重试，直到完成或达到总时长上限。重复调用会从断点继续。',
    parameters: {
      model: { type: 'string', required: true, description: '模型名，例如 "qwen3.5:35b-a3b" 或 "user/repo:tag"' },
      max_minutes: { type: 'number', description: '总时长上限(分钟)，默认 30' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          model: { type: 'string' },
          host: { type: 'string' },
          ok: { type: 'boolean' },
          status: { type: 'string' },
          downloaded_gb: { type: 'number' },
          total_gb: { type: 'number' },
          attempts: { type: 'integer' },
          elapsed_ms: { type: 'integer' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderPull(value) }],
    },
    async execute(args, exec) {
      const deadline = Date.now() + (args.max_minutes ?? 30) * 60_000
      // 单次尝试 90s 主动断开：Cloudflare 免费版约 100s 掐连接，
      // 与其被动等它切，不如主动续传(Ollama 支持按层断点续传)。
      const attemptMs = 90_000
      const progress = new Map<string, { total: number; completed: number }>()
      let attempts = 0
      let lastStatus = ''
      let done = false
      const t0 = Date.now()

      while (!done) {
        if (exec.signal.aborted) throw new Error('拉取已取消')
        if (Date.now() >= deadline) break
        attempts++
        const signal = typeof AbortSignal.any === 'function'
          ? AbortSignal.any([exec.signal, AbortSignal.timeout(attemptMs)])
          : AbortSignal.timeout(attemptMs)
        let httpError: string | null = null
        try {
          const res = await fetch(api(host(), '/api/pull'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: args.model, stream: true }),
            signal,
          })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            httpError = `HTTP ${res.status}: ${text.slice(0, 200)}`
          } else {
            const reader = res.body?.getReader()
            if (!reader) throw new Error('Ollama 响应没有可读的流式 body')
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
              const chunk = await reader.read()
              if (chunk.done) break
              buffer += decoder.decode(chunk.value, { stream: true })
              let nl = buffer.indexOf('\n')
              while (nl >= 0) {
                const line = buffer.slice(0, nl).trim()
                buffer = buffer.slice(nl + 1)
                nl = buffer.indexOf('\n')
                if (!line) continue
                let evt: {
                  error?: string
                  status?: string
                  digest?: string
                  total?: number
                  completed?: number
                }
                try {
                  evt = JSON.parse(line)
                } catch {
                  continue
                }
                if (typeof evt.error === 'string') {
                  throw new Error(`Ollama 拉取失败: ${evt.error}`)
                }
                if (typeof evt.digest === 'string') {
                  const prev = progress.get(evt.digest)
                  progress.set(evt.digest, {
                    total: typeof evt.total === 'number' ? evt.total : prev?.total ?? 0,
                    completed: Math.max(
                      typeof evt.completed === 'number' ? evt.completed : 0,
                      prev?.completed ?? 0,
                    ),
                  })
                }
                if (typeof evt.status === 'string') lastStatus = evt.status
                if (evt.status === 'success') done = true
              }
            }
          }
        } catch (err) {
          if (exec.signal.aborted) throw new Error('拉取已取消')
          // 传输层错误（超时/代理掐断/连接重置）→ 断点续传下一轮；
          // 流内业务错误(模型不存在等)是普通 Error，同样落在这里——
          // 但它们不该重试，用标记区分：
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.startsWith('Ollama 拉取失败:')) throw err
        }
        if (httpError) throw new Error(`Ollama /api/pull 失败 (${args.model}): ${httpError}`)
      }

      let totalBytes = 0
      let doneBytes = 0
      for (const p of progress.values()) {
        totalBytes += p.total
        doneBytes += Math.min(Math.max(p.completed, 0), p.total > 0 ? p.total : p.completed)
      }
      return {
        model: args.model,
        host: host(),
        ok: done,
        status: lastStatus,
        downloaded_gb: round(doneBytes / 1024 ** 3, 2),
        total_gb: round(totalBytes / 1024 ** 3, 2),
        attempts,
        elapsed_ms: Date.now() - t0,
      }
    },
  }))

  // -- 工具 4: 历史对比 ------------------------------------------------------

  interface HistoryEntry {
    ts: string
    model: string
    ttft_ms?: number
    load_ms?: number
    prompt_tokens?: number
    prompt_tps?: number
    gen_tokens?: number
    eval_tps?: number
    total_ms?: number
  }

  async function readHistory(): Promise<HistoryEntry[]> {
    const text = await readFile(config.historyPath, 'utf8').catch(() => '')
    const entries: HistoryEntry[] = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const e = JSON.parse(line) as HistoryEntry
        if (e && e.model) entries.push(e)
      } catch { /* 跳过坏行 */ }
    }
    return entries
  }

  // -- 可拉取模型目录 ---------------------------------------------------------
  const catalogPath = dirname(config.historyPath) + '/ollama-catalog.json'

  async function loadCatalog(force?: boolean): Promise<{ ts: string; repos: string[] }> {
    if (!force) {
      try {
        const cached = JSON.parse(await readFile(catalogPath, 'utf8'))
        if (cached?.repos?.length && Date.now() - Date.parse(cached.ts) < 24 * 3600e3) return cached
      } catch { /* 无缓存或损坏则重新抓取 */ }
    }
    // registry 的 _catalog 接口需要鉴权且 auth 域名部分网络不可达——改为抓取官网模型库页
    const repos = new Set<string>()
    let pages = 0
    for (const p of [1, 2, 3]) {
      try {
        const res = await fetch('https://ollama.com/library?p=' + p, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 ollama-monitor' } })
        if (!res.ok) break
        const html = await res.text()
        const before = repos.size
        for (const m of html.matchAll(/href="\/library\/([a-zA-Z0-9._-]+)["?]/g)) repos.add(m[1])
        pages++
        if (repos.size === before) break // 翻页无新内容就停
      } catch { break }
    }
    if (!repos.size) throw new Error('无法从 ollama.com 抓取模型目录（检查本机到 ollama.com 的网络）')
    const out = { ts: new Date().toISOString(), repos: [...repos].sort(), pages }
    await mkdir(dirname(catalogPath), { recursive: true })
    await writeFile(catalogPath, JSON.stringify(out), 'utf8')
    return out
  }

  // -- 模型详情（大小/描述，按需抓模型库页，缓存 7 天）-------------------------
  const infoPath = dirname(config.historyPath) + '/ollama-model-info.json'
  let infoCache: Record<string, { desc?: string; tags: Array<{ id: string; gb: number }>; ts: string }> = {}
  try { infoCache = JSON.parse(readFileSync(infoPath, 'utf8')) ?? {} } catch { /* 首次为空 */ }

  function parseSizeGb(s: string): number {
    const m = s.match(/(\d+(?:\.\d+)?)(GB|MB|TB)/i)
    if (!m) return NaN
    const v = parseFloat(m[1])
    return /GB/i.test(m[2]) ? v : /TB/i.test(m[2]) ? v * 1024 : v / 1024
  }

  async function loadModelInfo(name: string): Promise<{ desc?: string; tags: Array<{ id: string; gb: number }>; ts: string }> {
    const fresh = infoCache[name]
    if (fresh && Date.now() - Date.parse(fresh.ts) < 7 * 24 * 3600e3) return fresh
    const res = await fetch('https://ollama.com/library/' + encodeURIComponent(name), {
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': 'Mozilla/5.0 ollama-monitor' },
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1]?.trim()
    const tags = new Map<string, number>()
    for (const m of html.matchAll(/href="\/library\/([a-zA-Z0-9._:-]+)"/g)) {
      const id = m[1]
      if (!id.includes(':')) continue
      if (tags.has(id)) continue
      const window = html.slice(m.index, m.index + 700)
      const sizeText = window.match(/\d+(?:\.\d+)?(?:GB|MB|TB)/i)?.[0]
      if (sizeText) tags.set(id, Math.round(parseSizeGb(sizeText) * 10) / 10)
    }
    if (!tags.size) throw new Error('页面里没解析到 tag 体积')
    const info = { desc, tags: [...tags.entries()].map(([id, gb]) => ({ id, gb })).sort((a, b) => a.gb - b.gb), ts: new Date().toISOString() }
    infoCache[name] = info
    void mkdir(dirname(infoPath), { recursive: true }).then(() => writeFile(infoPath, JSON.stringify(infoCache), 'utf8')).catch(() => {})
    return info
  }

  // 全量体积扫描：并发 6 路抓完整个目录，后台运行，进度可轮询
  const infoScanState = { running: false, done: 0, total: 0 }
  async function startInfoScan(): Promise<void> {
    if (infoScanState.running) return
    let repos: string[] = []
    try { repos = (await loadCatalog(false)).repos } catch { return }
    const missing = repos.filter((n) => {
      const c = infoCache[n]
      return !c || Date.now() - Date.parse(c.ts) >= 7 * 24 * 3600e3
    })
    infoScanState.running = true
    infoScanState.total = repos.length
    infoScanState.done = repos.length - missing.length
    let cursor = 0
    const worker = async () => {
      while (cursor < missing.length) {
        const n = missing[cursor++]
        try { await loadModelInfo(n) } catch { /* 单个失败不影响整体，7 天内不再重试的空缺由下次扫描补 */ }
        infoScanState.done++
        if (infoScanState.done % 10 === 0) {
          void writeFile(infoPath, JSON.stringify(infoCache), 'utf8').catch(() => {})
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    await writeFile(infoPath, JSON.stringify(infoCache), 'utf8').catch(() => {})
    infoScanState.running = false
  }

  // -- 从 HuggingFace(镜像) / ModelScope 导入 GGUF -----------------------------
  // 链路: 搜索 → 列文件 → 服务器端下载(进度) → sha256 → PUT /api/blobs 上传到远端
  // Ollama → POST /api/create 注册。全程 HTTP API，不要求插件与 Ollama 同机。
  type ImportJob = {
    id: string; name: string; repo: string; file: string; source: 'hf' | 'ms'
    state: 'downloading' | 'uploading' | 'creating' | 'done' | 'error' | 'cancelled'
    bytesDone: number; bytesTotal: number; error?: string; started: number
    cancelled?: boolean
  }
  const importJobs = new Map<string, ImportJob>()
  const importAborters = new Map<string, AbortController>()
  let importChain: Promise<void> = Promise.resolve()

  // 任务记录持久化：重启后仍可查历史（含失败原因）
  const importJobsPath = dirname(config.historyPath) + '/ollama-import-jobs.json'

  function persistImportJobs(): void {
    try {
      const arr = [...importJobs.values()].sort((a, b) => b.started - a.started).slice(0, 50)
      void mkdir(dirname(importJobsPath), { recursive: true })
        .then(() => writeFile(importJobsPath, JSON.stringify(arr), 'utf8'))
        .catch(() => {})
    } catch { /* 忽略 */ }
  }
  try {
    const saved = JSON.parse(readFileSync(importJobsPath, 'utf8')) as ImportJob[]
    for (const j of Array.isArray(saved) ? saved.slice(0, 50) : []) {
      if (!j?.id) continue
      if (j.state === 'downloading' || j.state === 'uploading' || j.state === 'creating') {
        // 上个进程的生命周期任务：连接已随进程消失
        j.state = 'cancelled'
        j.error = j.error ?? 'DSH 重启导致中断'
      }
      importJobs.set(j.id, j)
    }
  } catch { /* 首次无记录文件 */ }
  // 启动清扫孤儿临时文件（>1 小时，避开热重载时活跃下载的写入窗口）
  try {
    const sweepDir = join(tmpdir(), 'ollama-monitor')
    const hourAgo = Date.now() - 6 * 3600_000
    let cleaned = 0
    let freedBytes = 0
    for (const n of readdirSync(sweepDir)) {
      const p = join(sweepDir, n)
      let st: { isFile(): boolean; size: number; mtimeMs: number }
      try { st = statSync(p) } catch { continue }
      if (st.isFile() && /\.gguf$/i.test(n) && st.mtimeMs < hourAgo) {
        try { unlinkSync(p); cleaned++; freedBytes += st.size } catch { /* 忽略 */ }
      }
    }
    if (cleaned > 0) console.log(`[ollama-monitor] 启动清扫: 删除孤儿临时文件 ${cleaned} 个，释放 ${(freedBytes / 1073741824).toFixed(2)} GB`)  } catch { /* 目录不存在属正常 */ }

  function sourceBase(source: 'hf' | 'ms'): string {
    return source === 'ms' ? 'https://modelscope.cn' : 'https://hf-mirror.com'
  }

  async function searchRemoteModels(source: 'hf' | 'ms', q: string): Promise<Array<{ id: string; downloads: number }>> {
    if (source === 'ms') {
      const res = await fetch('https://modelscope.cn/api/v1/dolphin/models', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ Name: q, PageSize: 20, PageNumber: 1 }),
        signal: AbortSignal.timeout(20000),
      })
      const j = await res.json() as any
      const arr: any[] = j?.Data?.Model?.Models ?? []
      // Path=组织名, Name=模型名 → 完整 id 是 "Path/Name"
      return arr.map((m) => ({ id: String(m.Path && m.Name ? `${m.Path}/${m.Name}` : (m.model_id ?? '')), downloads: Number(m.Downloads ?? 0) })).filter((m) => m.id)
    }
    const res = await fetch('https://hf-mirror.com/api/models?search=' + encodeURIComponent(q) + '&filter=gguf&sort=downloads&direction=-1&limit=20', { signal: AbortSignal.timeout(20000) })
    const j = await res.json() as any[]
    return (Array.isArray(j) ? j : []).map((m) => ({ id: String(m.id ?? ''), downloads: Number(m.downloads ?? 0) })).filter((m) => m.id)
  }

  async function listRemoteGgufFiles(source: 'hf' | 'ms', repo: string): Promise<Array<{ path: string; size: number }>> {
    if (source === 'ms') {
      const res = await fetch(`https://modelscope.cn/api/v1/models/${repo}/repo/files?Revision=master`, { signal: AbortSignal.timeout(20000) })
      const j = await res.json() as any
      const files: any[] = j?.Data?.Files ?? []
      return files.filter((f) => /\.gguf$/i.test(String(f.Path))).map((f) => ({ path: String(f.Path), size: Number(f.Size ?? 0) }))
    }
    const res = await fetch(`https://hf-mirror.com/api/models/${repo}/tree/main`, { signal: AbortSignal.timeout(20000) })
    const j = await res.json() as any[]
    return (Array.isArray(j) ? j : []).filter((f) => f.type === 'file' && /\.gguf$/i.test(String(f.path))).map((f) => ({ path: String(f.path), size: Number(f.size ?? 0) }))
  }

  function remoteDownloadUrl(source: 'hf' | 'ms', repo: string, file: string): string {
    return source === 'ms'
      ? `https://modelscope.cn/models/${repo}/resolve/master/${file}`
      : `https://hf-mirror.com/${repo}/resolve/main/${file}`
  }

  function runImportJob(job: ImportJob): void {
    importChain = importChain.then(() => (async () => {
      const dir = join(tmpdir(), 'ollama-monitor')
      await mkdir(dir, { recursive: true })
      // 稳定临时名：同一任务跨取消/重启/重试都复用同一个断点文件
      const key = createHash('sha256').update(job.source + '|' + job.repo + '|' + job.file + '|' + job.name).digest('hex').slice(0, 12)
      const tmpPath = join(dir, `import-${key}.gguf`)
      const maxAttempts = 3
      try {
        let attempt = 1
        while (attempt <= maxAttempts) {
          if (job.cancelled) break
          const ac = new AbortController()
          importAborters.set(job.id, ac)
          try {
            // ① 下载（Range 断点续传 + 20 秒零进度看门狗）
            job.state = 'downloading'
            let baseSize = 0
            try { baseSize = statSync(tmpPath).size } catch { /* 无断点文件 */ }
            const headers: Record<string, string> = {}
            if (baseSize > 0) headers.range = `bytes=${baseSize}-`
            const res = await fetch(remoteDownloadUrl(job.source, job.repo, job.file), { signal: ac.signal, redirect: 'follow', headers })
            if (!res.ok || !res.body) throw new Error('下载失败 HTTP ' + res.status)
            const resumed = res.status === 206 && baseSize > 0
            if (!resumed) baseSize = 0 // 服务端不支持续传则从头写
            job.bytesTotal = Number(res.headers.get('content-length') ?? 0) + (resumed ? baseSize : 0)
            job.bytesDone = resumed ? baseSize : 0
            let lastTickAt = Date.now()
            const counter = new Transform({
              transform(chunk, _enc, cb) {
                job.bytesDone += chunk.length
                lastTickAt = Date.now()
                cb(null, chunk)
              },
            })
            const watchdog = setInterval(() => {
              if (Date.now() - lastTickAt > 20_000) {
                clearInterval(watchdog)
                ac.abort(new Error(`进度停滞20s(第${attempt}次)`))
              }
            }, 5_000)
            try {
              await pipeline(
                Readable.fromWeb(res.body as any),
                counter,
                createWriteStream(tmpPath, resumed ? { flags: 'a' } : undefined),
              )
            } finally {
              clearInterval(watchdog)
            }
            break // 下载完成
          } catch (e) {
            if (job.cancelled) break
            if (attempt < maxAttempts) {
              job.error = `第${attempt}次中断(${String((e as any)?.message ?? e).slice(0, 40)})，自动重试`
              persistImportJobs()
              await new Promise((r) => setTimeout(r, 2000))
              attempt++
              continue
            }
            throw e
          } finally {
            importAborters.delete(job.id)
          }
        }
        if (job.cancelled) throw new Error('已取消')
        // ② 整文件 sha256（续传拼接后统一计算）
        const hash = createHash('sha256')
        await new Promise<void>((resolve, reject) => {
          const rs = createReadStream(tmpPath)
          rs.on('data', (c) => hash.update(c))
          rs.on('end', () => resolve())
          rs.on('error', reject)
        })
        const digest = 'sha256:' + hash.digest('hex')
        job.bytesTotal = statSync(tmpPath).size
        job.bytesDone = job.bytesTotal
        // ③ 上传 blob 到远端 Ollama（此时临时文件已完整，中断可秒重试）
        job.state = 'uploading'
        job.bytesDone = 0
        const upCount = new Transform({
          transform(chunk, _enc, cb) {
            job.bytesDone += chunk.length
            cb(null, chunk)
          },
        })
        const upRes = await fetch(api(host(), '/api/blobs/' + digest), {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: Readable.toWeb(upCount.pipe(createReadStream(tmpPath))) as any,
          duplex: 'half',
        })
        if (!upRes.ok && upRes.status !== 201) throw new Error('blob 上传失败 HTTP ' + upRes.status + ' ' + (await upRes.text().catch(() => '')))
        // ④ 注册模型
        job.state = 'creating'
        const crRes = await fetch(api(host(), '/api/create'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: job.name, files: { [path.basename(file)] : digest } }),
        })
        if (!crRes.ok) throw new Error('create 失败 HTTP ' + crRes.status + ' ' + (await crRes.text().catch(() => '')))
        job.state = 'done'
        try { unlinkSync(tmpPath) } catch { /* 忽略 */ }
      } catch (e) {
        if (job.cancelled || (e as any)?.message === '已取消') {
          job.state = 'cancelled'
          job.error = '已取消（断点已保留，可继续）'
        } else {
          job.state = 'error'
          job.error = String((e as any)?.message ?? e)
        }
        // 半成品一律保留供"继续"；启动清扫会在 6 小时后回收孤儿文件
      } finally {
        persistImportJobs()
      }
    })())
  }

  function readJsonBody(req: { on(ev: string, cb: (c?: any) => void): void }): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (c: any) => { data += c })
      req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch (e) { reject(e) } })
      req.on('error', reject)
    })
  }


  // -- 编程评测(PK)任务引擎 ----------------------------------------------------
  interface PkProblem { id: string; sig: string; desc: string; tests: Array<{ args: unknown[]; want: unknown }> }
  const PK_PROBLEMS: PkProblem[] = [
    { id: 'twoSum', sig: 'twoSum(nums, target)', desc: '返回数组中两数之和等于 target 的下标数组 [i, j]（i<j，答案唯一）', tests: [
      { args: [[2, 7, 11, 15], 9], want: [0, 1] }, { args: [[3, 2, 4], 6], want: [1, 2] }, { args: [[3, 3], 6], want: [0, 1] }] },
    { id: 'fizzBuzz', sig: 'fizzBuzz(n)', desc: '返回 1..n 的字符串数组：3 的倍数替换为 "Fizz"，5 的倍数替换为 "Buzz"，两者倍数替换为 "FizzBuzz"，其余数字也转为字符串', tests: [
      { args: [5], want: ['1', '2', 'Fizz', '4', 'Buzz'] },
      { args: [15], want: ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz'] }] },
    { id: 'lengthOfLongestSubstring', sig: 'lengthOfLongestSubstring(s)', desc: '无重复字符的最长子串长度', tests: [
      { args: ['abcabcbb'], want: 3 }, { args: ['bbbbb'], want: 1 }, { args: ['pwwkew'], want: 3 }, { args: [''], want: 0 }] },
    { id: 'isValid', sig: 'isValid(s)', desc: '括号串是否有效（()[]{} 三种括号正确闭合）', tests: [
      { args: ['()'], want: true }, { args: ['()[]{}'], want: true }, { args: ['(]'], want: false }, { args: ['([)]'], want: false }, { args: ['{[]}'], want: true }] },
    { id: 'reverseWords', sig: 'reverseWords(s)', desc: '反转字符串中的单词顺序，多余空格去掉，返回单个空格连接', tests: [
      { args: ['the sky is blue'], want: 'blue is sky the' }, { args: ['  hello world  '], want: 'world hello' }, { args: ['a'], want: 'a' }] },
    { id: 'fib', sig: 'fib(n)', desc: '第 n 个斐波那契数（fib(0)=0, fib(1)=1），必须高效（n 可到 35）', tests: [
      { args: [10], want: 55 }, { args: [30], want: 832040 }, { args: [0], want: 0 }] },
    { id: 'groupAnagrams', sig: 'groupAnagrams(strs)', desc: '字母异位词分组，返回组数（每组至少一个成员）', tests: [
      { args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], want: 3 }, { args: [['']], want: 1 }, { args: [['a']], want: 1 }] },
    { id: 'findMin', sig: 'findMin(nums)', desc: '旋转升序数组中的最小值', tests: [
      { args: [[3, 4, 5, 1, 2]], want: 1 }, { args: [[4, 5, 6, 7, 0, 1, 2]], want: 0 }, { args: [[11, 13, 15, 17]], want: 11 }] },
  ]

  function extractPkCandidates(text: string, fnName: string): string[] {
    let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '\n')
    const open = t.indexOf('<think>')
    if (open >= 0) t = t.slice(0, open)
    const cands = [...t.matchAll(/```(?:javascript|js)?\s*([\s\S]*?)```/g)].map((m) => m[1])
    const m2 = t.match(new RegExp('(?:function\\s+' + fnName + '\\b|const\\s+' + fnName + '\\b|let\\s+' + fnName + '\\b)[\\s\\S]*'))
    if (m2) cands.push(m2[0])
    cands.push(t)
    return cands
  }

  async function askPk(model: string, prompt: string): Promise<string> {
    const call = (extra?: Record<string, unknown>) => fetch(host() + '/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 8192, temperature: 0 }, ...extra }),
      signal: AbortSignal.timeout(15 * 60e3),
    })
    let res = await call({ think: false })
    let j = await res.json().catch(() => ({}) as any) as any
    if (!res.ok || j.error) {
      if (/think/i.test(String(j.error || ''))) {
        res = await call()
        j = await res.json().catch(() => ({}) as any) as any
        if (!res.ok || j.error) throw new Error(j.error || 'HTTP ' + res.status)
        return ((j.response || '') + '\n' + (j.thinking || '')).trim()
      }
      throw new Error(j.error || 'HTTP ' + res.status)
    }
    return ((j.response || '') + '\n' + (j.thinking || '')).trim()
  }

  interface PkTask { id: string; status: 'running' | 'done' | 'error'; models: string[]; current?: string; index: number; total: number; results: any[]; error?: string; startedAt: string; finishedAt?: string }
  const evalTasks = new Map<string, PkTask>()

  async function runPkTask(id: string): Promise<void> {
    const task = evalTasks.get(id)!
    task.total = task.models.length * PK_PROBLEMS.length
    try {
      for (const model of task.models) {
        task.current = model
        const per: any[] = []
        let passTotal = 0
        let assertTotal = 0
        let solved = 0
        for (const p of PK_PROBLEMS) {
          task.index++
          const fnName = p.sig.split('(')[0].trim()
          const prompt = `用 JavaScript 实现函数 ${p.sig}。\n要求: ${p.desc}。\n只允许输出一个 markdown 代码块，块内只包含函数定义（不要 console.log，不要测试代码，不要解释文字）。`
          let out = ''
          try {
            out = await askPk(model, prompt)
          } catch (e: any) {
            per.push({ id: p.id, pass: 0, total: p.tests.length, err: '请求失败: ' + (e.message || e.name) })
            continue
          }
          let fn: ((...a: unknown[]) => unknown) | null = null
          for (const cand of extractPkCandidates(out, fnName)) {
            try {
              const f = new Function(`"use strict";\n${cand}\nreturn typeof ${fnName} === 'function' ? ${fnName} : null;`)()
              if (typeof f === 'function') { fn = f as (...a: unknown[]) => unknown; break }
            } catch { /* 尝试下一个候选 */ }
          }
          if (typeof fn !== 'function') {
            per.push({ id: p.id, pass: 0, total: p.tests.length, err: '未提取到可执行函数' })
            continue
          }
          let passed = 0
          for (const t of p.tests) {
            try { if (JSON.stringify(fn(...t.args)) === JSON.stringify(t.want)) passed++ } catch { /* 断言失败 */ }
          }
          per.push({ id: p.id, pass: passed, total: p.tests.length })
          passTotal += passed
          assertTotal += p.tests.length
          if (passed === p.tests.length) solved++
        }
        task.results.push({ model, pass_total: passTotal, assert_total: assertTotal, solved, of: PK_PROBLEMS.length, per })
      }
      task.status = 'done'
      task.finishedAt = new Date().toISOString()
      const entry = { ts: task.finishedAt, model: '__codepk__', type: 'codepk', suite: 'easy-v1', results: task.results }
      await mkdir(dirname(config.historyPath), { recursive: true })
      await writeFile(config.historyPath, JSON.stringify(entry) + '\n', { flag: 'a', encoding: 'utf8' })
      await refreshDashboard()
    } catch (e: any) {
      task.status = 'error'
      task.error = e.message || String(e)
    }
  }

  ctx.tools.register(defineTool({
    name: 'ollama_models',
    description: '查看 Ollama 官方库里能拉取的模型列表（可按关键词过滤，标记本机已安装的）。数据来自官方注册表并缓存 24 小时。',
    parameters: {
      filter: { type: 'string', description: '关键词过滤，例如 "qwen"、"coder"；缺省返回全部（可能上千条，建议带过滤）' },
      force: { type: 'boolean', description: '跳过缓存强制重新抓取目录' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: { total: { type: 'integer' }, matched: { type: 'integer' }, installed_matched: { type: 'integer' } } },
      render: (_args, value) => [{
        type: 'text',
        text: `## 可拉取模型（匹配 ${value.matched}/${value.total}，其中已安装 ${value.installed_matched}）\n\n${value.list ?? '(无匹配)'}`,
      }],
    },
    async execute(args, exec) {
      const catalog = await loadCatalog(args?.force)
      let installed = new Set<string>()
      try {
        const tags = await requestJson(host(), '/api/tags', { signal: exec.signal }) as { models?: any[] }
        for (const m of tags.models ?? []) {
          installed.add(m.name.split(':')[0].split('/').pop()!.toLowerCase())
        }
      } catch { /* 拿不到已装列表就不标注 */ }
      const kw = (args?.filter || '').toLowerCase()
      const matched = catalog.repos.filter((r: string) => !kw || r.toLowerCase().includes(kw))
      const lines: string[] = []
      let instCount = 0
      for (const r of matched.slice(0, 200)) {
        const base = r.split('/').pop()!.toLowerCase()
        const mark = installed.has(base) ? ' ✅已安装' : ''
        if (mark) instCount++
        lines.push(`- ${r}${mark}`)
      }
      return { total: catalog.repos.length, matched: matched.length, installed_matched: instCount, list: lines.join('\n') || '(无匹配)' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ollama_codepk',
    description: '创建编程评测(PK)任务：让多个模型同答一套 JavaScript 算法题（8 题含边界断言），真实执行判分。后台异步执行，结束后自动写入历史并刷新 HTML 面板。用 ollama_eval_status 查进度。',
    parameters: {
      models: { type: 'array', description: '要参赛的模型名列表，例如 ["qwen3.6:35b-a3b","openbmb/minicpm-o4.5:latest"]' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: { task_id: { type: 'string' }, models: { type: 'integer' }, problems: { type: 'integer' } } },
      render: (_args, value) => [{
        type: 'text',
        text: `评测任务已启动：${value.task_id}（${value.models} 个模型 × ${value.problems} 题）。后台执行中——用 ollama_eval_status 查进度；完成后自动写入历史并刷新面板。`,
      }],
    },
    async execute(args) {
      const models = (args?.models ?? []).filter((m: unknown) => typeof m === 'string' && m.trim()) as string[]
      if (!models.length) throw new Error('models 不能为空')
      const id = 'pk-' + Date.now().toString(36)
      evalTasks.set(id, { id, status: 'running', models, index: 0, total: models.length * PK_PROBLEMS.length, results: [], startedAt: new Date().toISOString() })
      void runPkTask(id)
      return { task_id: id, models: models.length, problems: PK_PROBLEMS.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ollama_eval_status',
    description: '查看编程评测任务的进度和结果：传 task_id 看指定任务，不传看全部任务列表。',
    parameters: {
      task_id: { type: 'string', description: 'ollama_codepk 返回的任务 ID；缺省列出全部任务' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const lines: string[] = []
      const ids = args?.task_id ? [args.task_id] : [...evalTasks.keys()]
      if (!ids.length) return { text: '(还没有评测任务——用 ollama_codepk 创建)' }
      for (const id of ids) {
        const t = evalTasks.get(id)
        if (!t) { lines.push(`找不到任务 ${id}`); continue }
        lines.push(`## ${id} · ${t.status} · ${t.index}/${t.total} 断言步${t.current ? ' · 当前: ' + t.current : ''} · 开始 ${t.startedAt.slice(11, 19)}`)
        if (t.error) lines.push('错误: ' + t.error)
        for (const r of t.results) {
          lines.push(`- ${r.model}: ${r.pass_total}/${r.assert_total} (${(r.pass_total / Math.max(1, r.assert_total) * 100).toFixed(0)}%) · 完整解题 ${r.solved}/${r.of}`)
        }
        if (t.status === 'done') lines.push('已完成——历史与面板已更新。')
      }
      return { text: lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ollama_compare',
    description: '查看所有历史测速记录的对比表：每个模型的最新/最佳生成速度、TTFT、测试次数。数据来自 ollama_bench 的自动记录。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderCompare(value.entries ?? []) }],
    },
    async execute() {
      return { entries: await readHistory() }
    },
  }))

  function aggregateByModel(entries: HistoryEntry[]): Array<{ model: string; latest: HistoryEntry; bestTps: number; count: number }> {
    const byModel = new Map<string, HistoryEntry[]>()
    for (const e of entries) {
      if (typeof e.eval_tps !== 'number') continue // 曲线/特殊记录不进速度对比表
      const list = byModel.get(e.model) ?? []
      list.push(e)
      byModel.set(e.model, list)
    }
    return [...byModel.entries()].map(([model, list]) => ({
      model,
      latest: list[list.length - 1],
      bestTps: Math.max(...list.map((e) => e.eval_tps ?? 0)),
      count: list.length,
    }))
  }

  function renderCompare(entries: HistoryEntry[]): string {
    if (entries.length === 0) return '(还没有测速记录——先跑一次 ollama_bench)'
    const lines: string[] = [
      '## Ollama 测速历史',
      '',
      '| 模型 | 最新速度 | 最佳速度 | 最新 TTFT | 次数 | 最近测试 |',
      '| --- | --- | --- | --- | --- | --- |',
    ]
    for (const g of aggregateByModel(entries)) {
      lines.push(
        `| ${g.model} | ${g.latest.eval_tps ?? '?'} tok/s | ${g.bestTps > 0 ? g.bestTps.toFixed(1) : '?'} tok/s | ${g.latest.ttft_ms !== undefined ? g.latest.ttft_ms + ' ms' : '?'} | ${g.count} | ${(g.latest.ts || '').slice(0, 16).replace('T', ' ')} |`,
      )
    }
    return lines.join('\n')
  }

  // -- 工具 5: HTML 面板 -----------------------------------------------------

  async function refreshDashboard(signal?: AbortSignal) {
    let version: string | undefined
    try {
      version = (await requestJson(host(), '/api/version', { signal })).version
    } catch { /* 版本接口失败不影响面板 */ }
    const tags = await requestJson(host(), '/api/tags', { signal }) as { models?: any[] }
    const ps = await requestJson(host(), '/api/ps', { signal }) as { models?: any[] }
    const loadedNames = new Set((ps.models ?? []).map((m) => m.name))
    const installed = (tags.models ?? []).map((m) => ({
      name: m.name,
      size_gb: bytesToGb(m.size),
      params: m.details?.parameter_size,
      quant: m.details?.quantization_level,
      loaded: loadedNames.has(m.name),
    }))
    const loaded = (ps.models ?? []).map((m) => ({
      name: m.name,
      size_gb: bytesToGb(m.size),
      vram_gb: bytesToGb(m.size_vram),
      cpu_gb: bytesToGb(m.size) !== undefined && bytesToGb(m.size_vram) !== undefined
        ? round(bytesToGb(m.size) - bytesToGb(m.size_vram), 2)
        : undefined,
      expires_at: m.expires_at,
    }))
    const history = await readHistory()
    // 曲线去重：同模型只保留最新一条扫描记录
    const seenCurve = new Map<string, { model: string; ts: string; points: Array<{ ctx: number; prefill_tps?: number; eval_tps?: number; vram?: string }> }>()
    for (const e of history) {
      if (Array.isArray((e as any).ctx_curve)) seenCurve.set(e.model, { model: e.model, ts: e.ts, points: (e as any).ctx_curve })
    }
    const curves = [...seenCurve.values()]
    const pk = history.filter((e) => Array.isArray((e as any).codepk)).map((e) => ({ ts: e.ts, suite: (e as any).suite, results: (e as any).codepk ?? (e as any).results }))
    let catalog: { ts: string; repos: string[] } | undefined
    try { catalog = JSON.parse(await readFile(catalogPath, 'utf8')) } catch { /* 未抓取过目录 */ }
    await mkdir(dirname(config.dashboardPath), { recursive: true })
    await writeFile(
      config.dashboardPath,
      renderDashboardHtml({ host: host(), version, installed, loaded, history, curves, pk, catalog }),
      'utf8',
    )
    return { path: config.dashboardPath, models: installed.length, history_entries: history.length }
  }

  ctx.tools.register(defineTool({
    name: 'ollama_dashboard',
    description: '生成一个可在浏览器打开的 HTML 面板（已安装模型、显存分布、测速历史、上下文曲线、编程评测、可拉取模型目录）。每次调用用最新数据覆盖；评测任务完成时也会自动刷新。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          path: { type: 'string' },
          models: { type: 'integer' },
          history_entries: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `HTML 面板已生成：${value.path}（${value.models} 个模型，${value.history_entries} 条历史记录）。在浏览器打开即可查看；再次调用本工具刷新数据。`,
      }],
    },
    async execute(_args, exec) {
      return await refreshDashboard(combineSignals(exec.signal, config.timeoutMs))
    },
  }))

  function esc(s: unknown): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function renderDashboardHtml(data: {
    host: string
    version?: string
    installed: Array<{ name: string; size_gb?: number; params?: string; quant?: string; loaded: boolean }>
    loaded: Array<{ name: string; size_gb?: number; vram_gb?: number; cpu_gb?: number; expires_at?: string }>
    history: HistoryEntry[]
    curves?: Array<{ model: string; ts: string; points: Array<{ ctx: number; prefill_tps?: number; eval_tps?: number; vram?: string }> }>
    pk?: Array<{ ts: string; suite?: string; results: Array<{ model: string; pass_total: number; assert_total: number; solved: number; of: number }> }>
    catalog?: { ts: string; repos: string[] }
  }): string {
    const groups = aggregateByModel(data.history)
    const maxTps = Math.max(1, ...data.history.map((e) => e.eval_tps ?? 0))
    const globalCurveMax = Math.max(1, ...(data.curves ?? []).flatMap((c) => c.points.map((p) => p.eval_tps ?? 0)))
    const rowsInstalled = data.installed.map((m) => `
      <tr><td>${esc(m.name)}</td><td>${esc(m.params ?? '?')}</td><td>${esc(m.quant ?? '?')}</td>
      <td>${m.size_gb ?? '?'} GB</td><td>${m.loaded ? '<span class="on">已加载</span>' : '<span class="off">未加载</span>'}</td></tr>`).join('')
    const rowsLoaded = data.loaded.length > 0
      ? data.loaded.map((m) => `
      <tr><td>${esc(m.name)}</td><td>${m.size_gb ?? '?'} GB</td><td>${m.vram_gb ?? '?'} GB</td>
      <td class="${m.cpu_gb && m.cpu_gb > 0 ? 'warn' : ''}">${m.cpu_gb ? m.cpu_gb + ' GB' : '-'}</td></tr>`).join('')
      : '<tr><td colspan="4" class="dim">当前没有已加载的模型</td></tr>'
    const rowsHistory = groups.length > 0
      ? groups.sort((a, b) => b.bestTps - a.bestTps).map((g) => `
      <tr><td>${esc(g.model)}</td>
      <td><div class="bar"><div style="width:${Math.min(100, Math.round(((g.latest.eval_tps ?? 0) / maxTps) * 100))}%"></div></div></td>
      <td>${g.latest.eval_tps ?? '?'} tok/s</td><td>${g.bestTps > 0 ? g.bestTps.toFixed(1) : '?'}</td>
      <td>${g.latest.ttft_ms !== undefined ? g.latest.ttft_ms + ' ms' : '?'}</td><td>${g.count}</td></tr>`).join('')
      : '<tr><td colspan="6" class="dim">还没有测速记录</td></tr>'
    const rowsCurve = (data.curves ?? []).flatMap((c) =>
      (c.points || []).map((p, idx) => `
      <tr>${idx === 0 ? `<td rowspan="${c.points.length}">${esc(c.model)}</td>` : ''}
      <td>${Number(p.ctx).toLocaleString()}</td>
      <td>${p.prefill_tps ?? '?'} tok/s</td>
      <td><div class="bar"><div style="width:${Math.min(100, Math.round(((p.eval_tps ?? 0) / globalCurveMax) * 100))}%"></div></div></td>
      <td>${p.eval_tps ?? '?'} tok/s</td>
      <td>${esc(p.vram ?? '-')}</td></tr>`),
    ).join('')
    const rowsPk = (data.pk ?? []).flatMap((run) =>
      (run.results || []).map((r, idx) => `
      <tr>${idx === 0 ? `<td rowspan="${(run.results || []).length}">${esc(run.ts.slice(0, 16).replace('T', ' '))}<br><span class="dim">${esc(run.suite || '')}</span></td>` : ''}
      <td>${esc(r.model)}</td>
      <td><div class="bar"><div style="width:${Math.round((r.pass_total / Math.max(1, r.assert_total)) * 100)}%"></div></div></td>
      <td>${r.pass_total}/${r.assert_total}</td>
      <td>${r.solved}/${r.of}</td>
      <td>${Math.round((r.pass_total / Math.max(1, r.assert_total)) * 100)}%</td></tr>`),
    ).join('')
    const liveHost = esc(data.host.replace(/<[^>]*>/g, ''))
    return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>Ollama Monitor 面板</title>
<style>
 body{background:#11151c;color:#d8dee9;font-family:system-ui,'Segoe UI',sans-serif;margin:24px}
 h1{font-size:20px} h2{font-size:15px;color:#7fb3ff;margin:28px 0 8px}
 .meta{color:#8892a0;font-size:13px}
 table{border-collapse:collapse;width:100%;font-size:13px}
 td,th{padding:6px 10px;border-bottom:1px solid #232a35;text-align:left}
 th{color:#8892a0;font-weight:500}
 .on{color:#5ad19f}.off{color:#5b6572}.warn{color:#ffb454}.dim{color:#5b6572}
 .bar{background:#1c2330;border-radius:3px;height:12px;width:220px}
 .bar div{background:#4d8dff;height:12px;border-radius:3px}
 button{background:#4d8dff;color:#fff;border:0;border-radius:6px;padding:7px 16px;font-size:13px;cursor:pointer}
 #live{margin-left:10px;font-size:12px;color:#8892a0}
</style></head><body>
<h1>Ollama Monitor <span class="meta">${liveHost}${data.version ? ' · v' + esc(data.version) : ''}</span></h1>
<button onclick="location.reload()">重新生成本页请回到 DSH 调用 ollama_dashboard</button><span id="live"></span>
<script>
async function live(){
  try{
    const t=await (await fetch('${liveHost}/api/tags')).json();
    document.getElementById('live').textContent='实时连接成功，'+t.models.length+' 个模型（本页表格为生成时的快照）';
  }catch(e){document.getElementById('live').textContent='浏览器直连被 CORS 拦截（正常现象）——回 DSH 重新调用 ollama_dashboard 即可刷新'}
}
live()
</script>
<h2>已安装模型</h2>
<table><tr><th>名称</th><th>参数量</th><th>量化</th><th>体积</th><th>状态</th></tr>${rowsInstalled}</table>
<h2>已加载 / 显存分布</h2>
<table><tr><th>名称</th><th>总体积</th><th>GPU 显存</th><th>CPU/内存</th></tr>${rowsLoaded}</table>
<h2>测速历史对比（按最佳速度排序）</h2>
<table><tr><th>模型</th><th colspan="1">相对速度</th><th>最新速度</th><th>最佳</th><th>最新 TTFT</th><th>次数</th></tr>${rowsHistory}</table>
${(data.curves ?? []).length > 0 ? `<h2>上下文-速度曲线（生成 256 token 实测）</h2>
<table><tr><th>模型</th><th>num_ctx</th><th>prefill</th><th>相对输出速度</th><th>输出 tok/s</th><th>显存分布</th></tr>${rowsCurve}</table>
<p class="meta">柱状图统一基准：所有曲线中的全局最快速度 = 100%，可直接跨模型对比；同模型仅显示最新一次扫描。</p>` : ''}
${rowsPk ? `<h2>编程评测记录（同题竞技 · 断言判分）</h2>
<table><tr><th>评测时间 / 套件</th><th>模型</th><th>相对得分</th><th>断言通过</th><th>完整解题</th><th>得分率</th></tr>${rowsPk}</table>
<p class="meta">用 ollama_codepk 发起新评测 · ollama_eval_status 查进度 · 完成后本面板自动刷新</p>` : ''}
${data.catalog ? `<h2>可拉取模型目录（${data.catalog.repos.length} 个 · ${esc(data.catalog.ts.slice(0, 16).replace('T', ' '))} 抓取）</h2>
<p class="meta">来自 registry.ollama.ai 官方目录，缓存 24 小时——用 ollama_models 按关键词筛选，ollama_pull 拉取安装。</p>` : ''}
<p class="meta">生成时间：${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC · 数据来源：ollama_bench 自动记录 (${esc(config.historyPath)})</p>
</body></html>`
  }

  function renderPull(value: any): string {
    const lines: string[] = [`## Ollama 拉取: ${value.model}`, '', `- 结果: ${value.ok ? '✅ 成功' : '⚠ 未完成'}`]
    if (value.status) lines.push(`- 状态: ${value.status}`)
    if (value.total_gb > 0) {
      const pct = Math.round((value.downloaded_gb / value.total_gb) * 100)
      lines.push(`- 进度: ${value.downloaded_gb} / ${value.total_gb} GB (${pct}%)`)
    }
    lines.push(`- 尝试次数: ${value.attempts} · 总耗时: ${Math.round(value.elapsed_ms / 1000)} s`)
    if (!value.ok) lines.push('', '> 未完成：超过时长上限或网络中断。再次调用会从断点继续。')
    return lines.join('\n')
  }

  function renderBench(value: any): string {
    const lines: string[] = [`## Ollama 测速: ${value.model}`, '', `- 地址: ${value.host}`]
    if (value.load_ms !== undefined) lines.push(`- 模型加载: ${value.load_ms} ms`)
    if (value.ttft_ms !== undefined) lines.push(`- 首 token 延迟 (TTFT): ${value.ttft_ms} ms`)
    if (value.prompt_tokens !== undefined) {
      lines.push(`- 提示词处理: ${value.prompt_tokens} tok @ ${value.prompt_tps ?? '?'} tok/s`)
    }
    lines.push(`- 生成: ${value.gen_tokens ?? '?'} tok`)
    if (value.eval_tps !== undefined) lines.push(`- 生成速度: ${value.eval_tps} tok/s (Ollama 上报)`)
    if (value.eval_tps_wall !== undefined) lines.push(`- 生成速度(墙钟): ${value.eval_tps_wall} tok/s`)
    lines.push(`- 总耗时: ${value.total_ms} ms`)
    if (value.options_used && Object.keys(value.options_used).length > 0) {
      lines.push(`- 本次参数: ${JSON.stringify(value.options_used)}`)
    }
    if (value.preview) lines.push('', `> ${value.preview}`)
    return lines.join('\n')
  }

  function renderStatus(value: any): string {
    const lines: string[] = [`## Ollama 状态 (${value.host})`]
    if (value.version) lines.push(`版本: ${value.version}`)
    lines.push(`目录路由: ${catalogRouteState}`)

    lines.push('', '### 已加载 (占用显存/内存)')
    if (!value.loaded?.length) {
      lines.push('(当前没有已加载的模型)')
    } else {
      for (const m of value.loaded) {
        const parts = [
          `共 ${m.size_gb ?? '?'} GB`,
          m.vram_gb !== undefined ? `GPU ${m.vram_gb} GB` : null,
          m.cpu_ram_gb ? `内存 ${m.cpu_ram_gb} GB` : null,
          m.fully_on_gpu === false ? '⚠ 部分落在 CPU/内存(会明显变慢)' : null,
          m.arch_context_max !== undefined ? `架构上下文上限 ${m.arch_context_max.toLocaleString()}` : null,
        ].filter(Boolean)
        lines.push(`- **${m.name}**: ${parts.join(' · ')}`)
      }
    }

    lines.push('', '### 已安装')
    if (!value.installed?.length) {
      lines.push('(没有已安装的模型)')
    } else {
      for (const m of value.installed) {
        lines.push(`- **${m.name}** — ${m.params ?? '?'} · ${m.quantization ?? '?'} · ${m.size_gb ?? '?'} GB`)
      }
    }
    return lines.join('\n')
  }
}
