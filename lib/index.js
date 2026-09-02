// src/index.ts
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
var name = "ollama-monitor";
var inject = ["tools", "webServer"];
var Config = z.object({
  host: z.string().default("http://127.0.0.1:11434"),
  defaultModel: z.string().default(""),
  defaultPrompt: z.string().default("\u7528\u4E00\u53E5\u8BDD\u89E3\u91CA\u4EC0\u4E48\u662F\u64CD\u4F5C\u7CFB\u7EDF\u3002"),
  numPredict: z.number().default(128),
  timeoutMs: z.number().default(3e5),
  historyPath: z.string().default(join(homedir(), ".dsh", "ollama-monitor-history.jsonl")),
  dashboardPath: z.string().default(join(homedir(), ".dsh", "ollama-dashboard.html"))
});
function api(host, path2) {
  return host.replace(/\/+$/, "") + path2;
}
function round(n, digits = 1) {
  if (n === void 0 || !Number.isFinite(n)) return void 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
function bytesToGb(bytes) {
  return typeof bytes === "number" && bytes > 0 ? round(bytes / 1024 ** 3, 2) : void 0;
}
function pruneUndefined(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== void 0).map((v) => pruneUndefined(v));
  if (value && typeof value === "object") {
    const obj = value;
    for (const k of Object.keys(obj)) {
      if (obj[k] === void 0) delete obj[k];
      else obj[k] = pruneUndefined(obj[k]);
    }
  }
  return value;
}
function defineToolSafe(def) {
  return defineTool({
    ...def,
    execute: async (...a) => pruneUndefined(await def.execute(...a))
  });
}
async function requestJson(host, path2, init) {
  let res;
  try {
    res = await fetch(api(host, path2), init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `\u65E0\u6CD5\u8FDE\u63A5 Ollama (${host})\uFF1A${reason}\u3002\u8BF7\u786E\u8BA4\u5DF2\u8FD0\u884C "ollama serve"\uFF0C\u6216\u5728\u63D2\u4EF6 config.host \u91CC\u586B\u5199\u6B63\u786E\u5730\u5740\u3002`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama ${path2} \u8FD4\u56DE HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.json();
}
function combineSignals(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (signal && typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  return timeout;
}
function extractContextLengths(modelInfo) {
  if (!modelInfo) return [];
  return Object.entries(modelInfo).filter(([key, value]) => key.endsWith(".context_length") && typeof value === "number").map(([, value]) => value);
}
async function sampleGenerateStream(res, t0) {
  const sample = { firstTokenAt: null, finishedAt: t0, tokenChunks: 0, generatedChars: 0, stats: {} };
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Ollama \u54CD\u5E94\u6CA1\u6709\u53EF\u8BFB\u7684\u6D41\u5F0F body");
  const decoder = new TextDecoder();
  let buffer = "";
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineAt = buffer.indexOf("\n");
    while (newlineAt >= 0) {
      const line = buffer.slice(0, newlineAt).trim();
      buffer = buffer.slice(newlineAt + 1);
      newlineAt = buffer.indexOf("\n");
      if (!line) continue;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof chunk.response === "string" && chunk.response.length > 0 || typeof chunk.thinking === "string" && chunk.thinking.length > 0) {
        sample.tokenChunks++;
        sample.generatedChars += (chunk.response?.length ?? 0) + (chunk.thinking?.length ?? 0);
        if (sample.firstTokenAt === null) sample.firstTokenAt = performance.now();
      }
      if (chunk.done) {
        sample.stats = chunk;
        sample.finishedAt = performance.now();
      }
    }
  }
  if (sample.finishedAt === t0) sample.finishedAt = performance.now();
  return sample;
}
function apply(ctx, config) {
  const host = () => config.host;
  let catalogRouteState = "no-webservice";
  ctx.effect(() => {
    const ws = ctx.webServer;
    if (!ws) return;
    try {
      ws.register({
        kind: "prefix",
        path: "/ollama-monitor",
        handler: async (req, res) => {
          const pathname = new URL(req.url ?? "/", "http://x").pathname.replace(/\/+$/, "");
          if (pathname === "/ollama-monitor/catalog") {
            try {
              const catalog = await loadCatalog(false);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
              res.end(JSON.stringify(catalog));
            } catch (e) {
              res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: String(e?.message ?? e) }));
            }
            return;
          }
          if (pathname === "/ollama-monitor/model-info") {
            const url2 = new URL(req.url ?? "/", "http://x");
            if (url2.searchParams.get("all") === "1") {
              res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
              res.end(JSON.stringify({ info: infoCache }));
              return;
            }
            const q = url2.searchParams.get("names") ?? "";
            const names = q.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
            const info = {};
            await Promise.all(names.map(async (n) => {
              try {
                info[n] = await loadModelInfo(n);
              } catch (e) {
                info[n] = { error: String(e?.message ?? e) };
              }
            }));
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end(JSON.stringify({ info }));
            return;
          }
          if (pathname === "/ollama-monitor/scan") {
            if (req.method === "POST") {
              void startInfoScan();
              res.writeHead(202, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ started: true }));
              return;
            }
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end(JSON.stringify(infoScanState));
            return;
          }
          if (pathname === "/ollama-monitor/hf-search") {
            const u = new URL(req.url ?? "/", "http://x");
            try {
              const out = await searchRemoteModels(u.searchParams.get("source") === "ms" ? "ms" : "hf", u.searchParams.get("q") ?? "");
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ models: out }));
            } catch (e) {
              res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: String(e?.message ?? e) }));
            }
            return;
          }
          if (pathname === "/ollama-monitor/hf-files") {
            const u = new URL(req.url ?? "/", "http://x");
            try {
              const out = await listRemoteGgufFiles(u.searchParams.get("source") === "ms" ? "ms" : "hf", u.searchParams.get("repo") ?? "");
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ files: out }));
            } catch (e) {
              res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: String(e?.message ?? e) }));
            }
            return;
          }
          if (pathname === "/ollama-monitor/bench-curve") {
            if (req.method === "POST") {
              void (async () => {
                try {
                  const b = await readJsonBody(req);
                  const model = String(b.model ?? "").trim();
                  if (!model) throw new Error("\u9700\u8981 model");
                  const points = Array.isArray(b.points) && b.points.length > 0 ? b.points.map((n) => Math.max(1024, Number(n) | 0)) : [4096, 16384, 32768];
                  const filler = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. ";
                  const out = [];
                  for (const c of points) {
                    const targetTok = Math.floor(c * 0.75);
                    const prompt = filler.repeat(Math.ceil(targetTok / 19));
                    const r = await fetch(api(host(), "/api/generate"), {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ model, prompt, stream: false, think: false, options: { num_ctx: c, num_predict: 256, temperature: 0 } }),
                      signal: AbortSignal.timeout(9e5)
                    });
                    const j = await r.json();
                    if (j.error) throw new Error(String(j.error));
                    const pc = j.prompt_eval_count || 0;
                    const pd = (j.prompt_eval_duration || 1) / 1e9;
                    const ec = j.eval_count || 0;
                    const ed = (j.eval_duration || 1) / 1e9;
                    let vram = "";
                    try {
                      const ps = await fetch(api(host(), "/api/ps")).then((x) => x.json());
                      const norm = (s) => String(s ?? "").replace(/:latest$/, "");
                      const mm = (ps.models || []).find((x) => norm(x.name) === norm(model) || norm(x.model) === norm(model));
                      if (mm?.size_vram != null) vram = "GPU " + (mm.size_vram / 1073741824).toFixed(1) + " GB";
                    } catch {
                    }
                    out.push({
                      ctx: c,
                      prefill_tps: pc > 0 && pd > 0 ? Math.round(pc / pd) : void 0,
                      eval_tps: ec > 0 && ed > 0 ? +(ec / ed).toFixed(1) : void 0,
                      vram: vram || void 0
                    });
                  }
                  try {
                    const hist = await readHistory();
                    const prev = [...hist].reverse().find((x) => x.model === model && Array.isArray(x.ctx_curve));
                    if (prev) {
                      const byCtx = /* @__PURE__ */ new Map();
                      for (const p of prev.ctx_curve) byCtx.set(Number(p.ctx), p);
                      for (const p of out) byCtx.set(p.ctx, p);
                      out.length = 0;
                      out.push(...[...byCtx.values()].sort((a, b2) => a.ctx - b2.ctx));
                    }
                  } catch {
                  }
                  const entry = { ts: (/* @__PURE__ */ new Date()).toISOString(), model, type: "ctx-curve", ctx_curve: out };
                  await mkdir(dirname(config.historyPath), { recursive: true });
                  await writeFile(config.historyPath, JSON.stringify(entry) + "\n", { flag: "a", encoding: "utf8" });
                  await refreshDashboard().catch(() => {
                  });
                  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
                  res.end(JSON.stringify({ ok: true, curve: out }));
                } catch (e) {
                  try {
                    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ error: String(e?.message ?? e) }));
                  } catch {
                  }
                }
              })();
              return;
            }
            res.writeHead(404);
            res.end();
            return;
          }
          if (pathname === "/ollama-monitor/import-cancel") {
            if (req.method === "POST") {
              try {
                const b = await readJsonBody(req);
                const job = importJobs.get(String(b.id ?? ""));
                if (!job) throw new Error("\u4EFB\u52A1\u4E0D\u5B58\u5728");
                if (job.state === "downloading" || job.state === "uploading" || job.state === "creating") {
                  job.cancelled = true;
                  importAborters.get(job.id)?.abort();
                }
                res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: true, state: job.state }));
              } catch (e) {
                res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ error: String(e?.message ?? e) }));
              }
              return;
            }
            res.writeHead(404);
            res.end();
            return;
          }
          if (pathname === "/ollama-monitor/import") {
            if (req.method === "POST") {
              try {
                const b = await readJsonBody(req);
                const source = b.source === "ms" ? "ms" : "hf";
                const repo = String(b.repo ?? "").trim();
                const file2 = String(b.file ?? "").trim();
                const name2 = String(b.name ?? "").trim();
                if (!repo || !file2 || !name2) throw new Error("\u9700\u8981 repo / file / name");
                const job = {
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  name: name2,
                  repo,
                  file: file2,
                  source,
                  state: "downloading",
                  bytesDone: 0,
                  bytesTotal: 0,
                  started: Date.now()
                };
                importJobs.set(job.id, job);
                for (const [k, v] of importJobs) if (importJobs.size > 30 && v.state !== "downloading" && v.state !== "uploading" && v.state !== "creating") importJobs.delete(k);
                persistImportJobs();
                runImportJob(job);
                res.writeHead(202, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(job));
              } catch (e) {
                res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ error: String(e?.message ?? e) }));
              }
              return;
            }
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end(JSON.stringify({ jobs: [...importJobs.values()].sort((a, b) => b.started - a.started) }));
            return;
          }
          res.writeHead(404);
          res.end();
        }
      });
      catalogRouteState = "ok";
    } catch (e) {
      catalogRouteState = "error";
      console.error("[ollama-monitor] catalog \u8DEF\u7531\u6CE8\u518C\u5931\u8D25:", e);
    }
  }, "ollama-monitor: catalog route");
  async function resolveDefaultModel() {
    if (config.defaultModel) return config.defaultModel;
    const ps = await requestJson(host(), "/api/ps").catch(() => ({ models: [] }));
    const loaded = ps.models?.[0]?.name;
    if (loaded) return loaded;
    const tags = await requestJson(host(), "/api/tags");
    const installed = tags.models?.[0]?.name;
    if (installed) return installed;
    throw new Error("Ollama \u91CC\u6CA1\u6709\u4EFB\u4F55\u6A21\u578B\uFF1A\u5148 `ollama pull <model>` \u518D\u6D4B\u901F\u3002");
  }
  ctx.tools.register(defineToolSafe({
    name: "ollama_status",
    description: '\u67E5\u770B\u672C\u673A Ollama \u72B6\u6001\uFF1A\u5DF2\u5B89\u88C5/\u5DF2\u52A0\u8F7D\u7684\u6A21\u578B\u3001\u663E\u5B58(RAM/VRAM)\u5360\u7528\u3001\u6BCF\u4E2A\u6A21\u578B\u7684\u67B6\u6784\u4E0A\u4E0B\u6587\u4E0A\u9650(context length)\u3002\u7528\u4E8E\u56DE\u7B54"\u6211\u7684\u673A\u5668\u4E0A\u8DD1\u54EA\u4E9B\u6A21\u578B\u3001\u8FD8\u80FD\u5F00\u591A\u5927\u4E0A\u4E0B\u6587"\u3002',
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          host: { type: "string" },
          installed: { type: "array", items: { type: "object", additionalProperties: true } },
          loaded: { type: "array", items: { type: "object", additionalProperties: true } }
        }
      },
      render: (_args, value) => [{ type: "text", text: renderStatus(value) }]
    },
    async execute(_args, exec) {
      const signal = combineSignals(exec.signal, config.timeoutMs);
      let version;
      try {
        version = (await requestJson(host(), "/api/version", { signal })).version;
      } catch {
      }
      const tags = await requestJson(host(), "/api/tags", { signal });
      const ps = await requestJson(host(), "/api/ps", { signal });
      const installed = (tags.models ?? []).map((m) => ({
        name: m.name,
        size_gb: bytesToGb(m.size),
        params: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        family: m.details?.family,
        modified: m.modified_at
      }));
      const loaded = [];
      for (const m of ps.models ?? []) {
        let ctxMax;
        try {
          const shown = await requestJson(host(), `/api/show`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: m.name }),
            signal
          });
          const lengths = extractContextLengths(shown?.model_info);
          ctxMax = lengths.length > 0 ? Math.max(...lengths) : void 0;
        } catch {
        }
        const sizeGb = bytesToGb(m.size);
        const vramGb = bytesToGb(m.size_vram);
        loaded.push({
          name: m.name,
          size_gb: sizeGb,
          vram_gb: vramGb,
          cpu_ram_gb: sizeGb !== void 0 && vramGb !== void 0 ? round(sizeGb - vramGb, 2) : void 0,
          fully_on_gpu: vramGb !== void 0 && sizeGb !== void 0 ? vramGb >= sizeGb : void 0,
          expires_at: m.expires_at,
          arch_context_max: ctxMax
        });
      }
      return { host: host(), version, installed, loaded };
    }
  }));
  ctx.tools.register(defineToolSafe({
    name: "ollama_bench",
    description: "\u5BF9\u672C\u673A Ollama \u8DD1\u4E00\u6B21\u6D41\u5F0F\u751F\u6210\u6765\u6D4B\u901F\uFF1A\u9996 token \u5EF6\u8FDF(TTFT)\u3001\u63D0\u793A\u8BCD\u5904\u7406\u901F\u5EA6\u3001\u751F\u6210\u901F\u5EA6(tok/s)\u3001\u603B\u8017\u65F6\u3002\u53EF\u7528 num_ctx \u6307\u5B9A\u4E0A\u4E0B\u6587\u957F\u5EA6\u5BF9\u6BD4\u4E0D\u540C\u8BBE\u7F6E\u4E0B\u7684\u901F\u5EA6\u3002",
    parameters: {
      model: { type: "string", description: '\u8981\u6D4B\u7684\u6A21\u578B\u540D\uFF0C\u4F8B\u5982 "qwen2.5:7b"\uFF1B\u7F3A\u7701\u7528\u63D2\u4EF6\u914D\u7F6E\u7684\u9ED8\u8BA4\u6A21\u578B' },
      prompt: { type: "string", description: "\u6D4B\u8BD5\u63D0\u793A\u8BCD\uFF1B\u7F3A\u7701\u7528\u63D2\u4EF6\u914D\u7F6E" },
      num_predict: { type: "number", description: "\u6700\u591A\u751F\u6210\u591A\u5C11\u4E2A token\uFF1B\u7F3A\u7701\u7528\u63D2\u4EF6\u914D\u7F6E" },
      num_ctx: { type: "number", description: "\u672C\u6B21\u8BF7\u6C42\u7684\u4E0A\u4E0B\u6587\u7A97\u53E3\u5927\u5C0F(num_ctx)\uFF0C\u7528\u4E8E\u5BF9\u6BD4\u4E0D\u540C\u4E0A\u4E0B\u6587\u957F\u5EA6\u4E0B\u7684\u901F\u5EA6" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          model: { type: "string" },
          host: { type: "string" },
          ttft_ms: { type: "number" },
          load_ms: { type: "number" },
          prompt_tokens: { type: "integer" },
          prompt_tps: { type: "number" },
          gen_tokens: { type: "integer" },
          eval_tps: { type: "number" },
          eval_tps_wall: { type: "number" },
          total_ms: { type: "number" },
          preview: { type: "string" }
        }
      },
      render: (_args, value) => [{ type: "text", text: renderBench(value) }]
    },
    async execute(args, exec) {
      const model = args.model || await resolveDefaultModel();
      const prompt = args.prompt || config.defaultPrompt;
      const options = { num_predict: args.num_predict ?? config.numPredict };
      if (args.num_ctx !== void 0) options.num_ctx = args.num_ctx;
      const body = JSON.stringify({ model, prompt, stream: true, options });
      const res = await fetch(api(host(), "/api/generate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: combineSignals(exec.signal, config.timeoutMs)
      }).catch((err) => {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`\u65E0\u6CD5\u8FDE\u63A5 Ollama (${host()})\uFF1A${reason}\u3002\u8BF7\u786E\u8BA4 "ollama serve" \u6B63\u5728\u8FD0\u884C\u3002`);
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama /api/generate \u8FD4\u56DE HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const t0 = performance.now();
      const sample = await sampleGenerateStream(res, t0);
      const s = sample.stats;
      const ttftMs = sample.firstTokenAt !== null ? Math.round(sample.firstTokenAt - t0) : void 0;
      const totalMs = Math.round(sample.finishedAt - t0);
      const loadMs = typeof s.load_duration === "number" ? round(s.load_duration / 1e6, 0) : void 0;
      const genTokens = s.eval_count ?? sample.tokenChunks;
      const evalSeconds = typeof s.eval_duration === "number" ? s.eval_duration / 1e9 : void 0;
      const promptTokens = s.prompt_eval_count;
      const promptSeconds = typeof s.prompt_eval_duration === "number" ? s.prompt_eval_duration / 1e9 : void 0;
      const generateSeconds = ttftMs !== null && ttftMs !== void 0 && genTokens > 1 ? (sample.finishedAt - (t0 + ttftMs)) / 1e3 : void 0;
      const result = {
        model,
        host: host(),
        ttft_ms: ttftMs,
        load_ms: loadMs,
        prompt_tokens: promptTokens,
        prompt_tps: promptTokens && promptSeconds ? round(promptTokens / promptSeconds) : void 0,
        gen_tokens: genTokens || void 0,
        eval_tps: genTokens && evalSeconds ? round(genTokens / evalSeconds) : void 0,
        eval_tps_wall: genTokens && generateSeconds ? round(genTokens / generateSeconds) : void 0,
        total_ms: totalMs,
        options_used: options,
        preview: sample.generatedChars > 0 ? void 0 : "(\u672C\u6B21\u8F93\u51FA\u5168\u90E8\u4E3A\u9690\u85CF\u601D\u8003\u8FC7\u7A0B(thinking)\uFF0Cresponse \u65E0\u53EF\u89C1\u6587\u672C)"
      };
      await mkdir(dirname(config.historyPath), { recursive: true }).catch(() => {
      });
      void appendFile(
        config.historyPath,
        JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...result }) + "\n",
        "utf8"
      ).catch(() => {
      });
      return result;
    }
  }));
  ctx.tools.register(defineToolSafe({
    name: "ollama_pull",
    description: "\u5728 Ollama \u670D\u52A1\u5668\u4E0A\u62C9\u53D6(pull)\u4E00\u4E2A\u6A21\u578B\uFF0C\u4E0B\u8F7D\u53D1\u751F\u5728\u670D\u52A1\u5668\u7AEF\u3002\u9047\u5230\u53CD\u5411\u4EE3\u7406\u8D85\u65F6(\u5982 Cloudflare 100s)\u4F1A\u81EA\u52A8\u65AD\u70B9\u7EED\u4F20\u91CD\u8BD5\uFF0C\u76F4\u5230\u5B8C\u6210\u6216\u8FBE\u5230\u603B\u65F6\u957F\u4E0A\u9650\u3002\u91CD\u590D\u8C03\u7528\u4F1A\u4ECE\u65AD\u70B9\u7EE7\u7EED\u3002",
    parameters: {
      model: { type: "string", required: true, description: '\u6A21\u578B\u540D\uFF0C\u4F8B\u5982 "qwen3.5:35b-a3b" \u6216 "user/repo:tag"' },
      max_minutes: { type: "number", description: "\u603B\u65F6\u957F\u4E0A\u9650(\u5206\u949F)\uFF0C\u9ED8\u8BA4 30" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          model: { type: "string" },
          host: { type: "string" },
          ok: { type: "boolean" },
          status: { type: "string" },
          downloaded_gb: { type: "number" },
          total_gb: { type: "number" },
          attempts: { type: "integer" },
          elapsed_ms: { type: "integer" }
        }
      },
      render: (_args, value) => [{ type: "text", text: renderPull(value) }]
    },
    async execute(args, exec) {
      const deadline = Date.now() + (args.max_minutes ?? 30) * 6e4;
      const attemptMs = 9e4;
      const progress = /* @__PURE__ */ new Map();
      let attempts = 0;
      let lastStatus = "";
      let done = false;
      const t0 = Date.now();
      while (!done) {
        if (exec.signal.aborted) throw new Error("\u62C9\u53D6\u5DF2\u53D6\u6D88");
        if (Date.now() >= deadline) break;
        attempts++;
        const signal = typeof AbortSignal.any === "function" ? AbortSignal.any([exec.signal, AbortSignal.timeout(attemptMs)]) : AbortSignal.timeout(attemptMs);
        let httpError = null;
        try {
          const res = await fetch(api(host(), "/api/pull"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: args.model, stream: true }),
            signal
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            httpError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
          } else {
            const reader = res.body?.getReader();
            if (!reader) throw new Error("Ollama \u54CD\u5E94\u6CA1\u6709\u53EF\u8BFB\u7684\u6D41\u5F0F body");
            const decoder = new TextDecoder();
            let buffer = "";
            for (; ; ) {
              const chunk = await reader.read();
              if (chunk.done) break;
              buffer += decoder.decode(chunk.value, { stream: true });
              let nl = buffer.indexOf("\n");
              while (nl >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                nl = buffer.indexOf("\n");
                if (!line) continue;
                let evt;
                try {
                  evt = JSON.parse(line);
                } catch {
                  continue;
                }
                if (typeof evt.error === "string") {
                  throw new Error(`Ollama \u62C9\u53D6\u5931\u8D25: ${evt.error}`);
                }
                if (typeof evt.digest === "string") {
                  const prev = progress.get(evt.digest);
                  progress.set(evt.digest, {
                    total: typeof evt.total === "number" ? evt.total : prev?.total ?? 0,
                    completed: Math.max(
                      typeof evt.completed === "number" ? evt.completed : 0,
                      prev?.completed ?? 0
                    )
                  });
                }
                if (typeof evt.status === "string") lastStatus = evt.status;
                if (evt.status === "success") done = true;
              }
            }
          }
        } catch (err) {
          if (exec.signal.aborted) throw new Error("\u62C9\u53D6\u5DF2\u53D6\u6D88");
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("Ollama \u62C9\u53D6\u5931\u8D25:")) throw err;
        }
        if (httpError) throw new Error(`Ollama /api/pull \u5931\u8D25 (${args.model}): ${httpError}`);
      }
      let totalBytes = 0;
      let doneBytes = 0;
      for (const p of progress.values()) {
        totalBytes += p.total;
        doneBytes += Math.min(Math.max(p.completed, 0), p.total > 0 ? p.total : p.completed);
      }
      return {
        model: args.model,
        host: host(),
        ok: done,
        status: lastStatus,
        downloaded_gb: round(doneBytes / 1024 ** 3, 2),
        total_gb: round(totalBytes / 1024 ** 3, 2),
        attempts,
        elapsed_ms: Date.now() - t0
      };
    }
  }));
  async function readHistory() {
    const text = await readFile(config.historyPath, "utf8").catch(() => "");
    const entries = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && e.model) entries.push(e);
      } catch {
      }
    }
    return entries;
  }
  const catalogPath = dirname(config.historyPath) + "/ollama-catalog.json";
  async function loadCatalog(force) {
    if (!force) {
      try {
        const cached = JSON.parse(await readFile(catalogPath, "utf8"));
        if (cached?.repos?.length && Date.now() - Date.parse(cached.ts) < 24 * 36e5) return cached;
      } catch {
      }
    }
    const repos = /* @__PURE__ */ new Set();
    let pages = 0;
    for (const p of [1, 2, 3]) {
      try {
        const res = await fetch("https://ollama.com/library?p=" + p, { signal: AbortSignal.timeout(3e4), headers: { "user-agent": "Mozilla/5.0 ollama-monitor" } });
        if (!res.ok) break;
        const html = await res.text();
        const before = repos.size;
        for (const m of html.matchAll(/href="\/library\/([a-zA-Z0-9._-]+)["?]/g)) repos.add(m[1]);
        pages++;
        if (repos.size === before) break;
      } catch {
        break;
      }
    }
    if (!repos.size) throw new Error("\u65E0\u6CD5\u4ECE ollama.com \u6293\u53D6\u6A21\u578B\u76EE\u5F55\uFF08\u68C0\u67E5\u672C\u673A\u5230 ollama.com \u7684\u7F51\u7EDC\uFF09");
    const out = { ts: (/* @__PURE__ */ new Date()).toISOString(), repos: [...repos].sort(), pages };
    await mkdir(dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, JSON.stringify(out), "utf8");
    return out;
  }
  const infoPath = dirname(config.historyPath) + "/ollama-model-info.json";
  let infoCache = {};
  try {
    infoCache = JSON.parse(readFileSync(infoPath, "utf8")) ?? {};
  } catch {
  }
  function parseSizeGb(s) {
    const m = s.match(/(\d+(?:\.\d+)?)(GB|MB|TB)/i);
    if (!m) return NaN;
    const v = parseFloat(m[1]);
    return /GB/i.test(m[2]) ? v : /TB/i.test(m[2]) ? v * 1024 : v / 1024;
  }
  async function loadModelInfo(name2) {
    const fresh = infoCache[name2];
    if (fresh && Date.now() - Date.parse(fresh.ts) < 7 * 24 * 36e5) return fresh;
    const res = await fetch("https://ollama.com/library/" + encodeURIComponent(name2), {
      signal: AbortSignal.timeout(2e4),
      headers: { "user-agent": "Mozilla/5.0 ollama-monitor" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1]?.trim();
    const tags = /* @__PURE__ */ new Map();
    for (const m of html.matchAll(/href="\/library\/([a-zA-Z0-9._:-]+)"/g)) {
      const id = m[1];
      if (!id.includes(":")) continue;
      if (tags.has(id)) continue;
      const window = html.slice(m.index, m.index + 700);
      const sizeText = window.match(/\d+(?:\.\d+)?(?:GB|MB|TB)/i)?.[0];
      if (sizeText) tags.set(id, Math.round(parseSizeGb(sizeText) * 10) / 10);
    }
    if (!tags.size) throw new Error("\u9875\u9762\u91CC\u6CA1\u89E3\u6790\u5230 tag \u4F53\u79EF");
    const info = { desc, tags: [...tags.entries()].map(([id, gb]) => ({ id, gb })).sort((a, b) => a.gb - b.gb), ts: (/* @__PURE__ */ new Date()).toISOString() };
    infoCache[name2] = info;
    void mkdir(dirname(infoPath), { recursive: true }).then(() => writeFile(infoPath, JSON.stringify(infoCache), "utf8")).catch(() => {
    });
    return info;
  }
  const infoScanState = { running: false, done: 0, total: 0 };
  async function startInfoScan() {
    if (infoScanState.running) return;
    let repos = [];
    try {
      repos = (await loadCatalog(false)).repos;
    } catch {
      return;
    }
    const missing = repos.filter((n) => {
      const c = infoCache[n];
      return !c || Date.now() - Date.parse(c.ts) >= 7 * 24 * 36e5;
    });
    infoScanState.running = true;
    infoScanState.total = repos.length;
    infoScanState.done = repos.length - missing.length;
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const n = missing[cursor++];
        try {
          await loadModelInfo(n);
        } catch {
        }
        infoScanState.done++;
        if (infoScanState.done % 10 === 0) {
          void writeFile(infoPath, JSON.stringify(infoCache), "utf8").catch(() => {
          });
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await writeFile(infoPath, JSON.stringify(infoCache), "utf8").catch(() => {
    });
    infoScanState.running = false;
  }
  const importJobs = /* @__PURE__ */ new Map();
  const importAborters = /* @__PURE__ */ new Map();
  let importChain = Promise.resolve();
  const importJobsPath = dirname(config.historyPath) + "/ollama-import-jobs.json";
  function persistImportJobs() {
    try {
      const arr = [...importJobs.values()].sort((a, b) => b.started - a.started).slice(0, 50);
      void mkdir(dirname(importJobsPath), { recursive: true }).then(() => writeFile(importJobsPath, JSON.stringify(arr), "utf8")).catch(() => {
      });
    } catch {
    }
  }
  try {
    const saved = JSON.parse(readFileSync(importJobsPath, "utf8"));
    for (const j of Array.isArray(saved) ? saved.slice(0, 50) : []) {
      if (!j?.id) continue;
      if (j.state === "downloading" || j.state === "uploading" || j.state === "creating") {
        j.state = "cancelled";
        j.error = j.error ?? "DSH \u91CD\u542F\u5BFC\u81F4\u4E2D\u65AD";
      }
      importJobs.set(j.id, j);
    }
  } catch {
  }
  try {
    const sweepDir = join(tmpdir(), "ollama-monitor");
    const hourAgo = Date.now() - 6 * 36e5;
    let cleaned = 0;
    let freedBytes = 0;
    for (const n of readdirSync(sweepDir)) {
      const p = join(sweepDir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isFile() && /\.gguf$/i.test(n) && st.mtimeMs < hourAgo) {
        try {
          unlinkSync(p);
          cleaned++;
          freedBytes += st.size;
        } catch {
        }
      }
    }
    if (cleaned > 0) console.log(`[ollama-monitor] \u542F\u52A8\u6E05\u626B: \u5220\u9664\u5B64\u513F\u4E34\u65F6\u6587\u4EF6 ${cleaned} \u4E2A\uFF0C\u91CA\u653E ${(freedBytes / 1073741824).toFixed(2)} GB`);
  } catch {
  }
  function sourceBase(source) {
    return source === "ms" ? "https://modelscope.cn" : "https://hf-mirror.com";
  }
  async function searchRemoteModels(source, q) {
    if (source === "ms") {
      const res2 = await fetch("https://modelscope.cn/api/v1/dolphin/models", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ Name: q, PageSize: 20, PageNumber: 1 }),
        signal: AbortSignal.timeout(2e4)
      });
      const j2 = await res2.json();
      const arr = j2?.Data?.Model?.Models ?? [];
      return arr.map((m) => ({ id: String(m.Path && m.Name ? `${m.Path}/${m.Name}` : m.model_id ?? ""), downloads: Number(m.Downloads ?? 0) })).filter((m) => m.id);
    }
    const res = await fetch("https://hf-mirror.com/api/models?search=" + encodeURIComponent(q) + "&filter=gguf&sort=downloads&direction=-1&limit=20", { signal: AbortSignal.timeout(2e4) });
    const j = await res.json();
    return (Array.isArray(j) ? j : []).map((m) => ({ id: String(m.id ?? ""), downloads: Number(m.downloads ?? 0) })).filter((m) => m.id);
  }
  async function listRemoteGgufFiles(source, repo) {
    if (source === "ms") {
      const res2 = await fetch(`https://modelscope.cn/api/v1/models/${repo}/repo/files?Revision=master`, { signal: AbortSignal.timeout(2e4) });
      const j2 = await res2.json();
      const files = j2?.Data?.Files ?? [];
      return files.filter((f) => /\.gguf$/i.test(String(f.Path))).map((f) => ({ path: String(f.Path), size: Number(f.Size ?? 0) }));
    }
    const res = await fetch(`https://hf-mirror.com/api/models/${repo}/tree/main`, { signal: AbortSignal.timeout(2e4) });
    const j = await res.json();
    return (Array.isArray(j) ? j : []).filter((f) => f.type === "file" && /\.gguf$/i.test(String(f.path))).map((f) => ({ path: String(f.path), size: Number(f.size ?? 0) }));
  }
  function remoteDownloadUrl(source, repo, file2) {
    return source === "ms" ? `https://modelscope.cn/models/${repo}/resolve/master/${file2}` : `https://hf-mirror.com/${repo}/resolve/main/${file2}`;
  }
  function runImportJob(job) {
    importChain = importChain.then(() => (async () => {
      const dir = join(tmpdir(), "ollama-monitor");
      await mkdir(dir, { recursive: true });
      const key = createHash("sha256").update(job.source + "|" + job.repo + "|" + job.file + "|" + job.name).digest("hex").slice(0, 12);
      const tmpPath = join(dir, `import-${key}.gguf`);
      const maxAttempts = 3;
      try {
        let attempt = 1;
        while (attempt <= maxAttempts) {
          if (job.cancelled) break;
          const ac = new AbortController();
          importAborters.set(job.id, ac);
          try {
            job.state = "downloading";
            let baseSize = 0;
            try {
              baseSize = statSync(tmpPath).size;
            } catch {
            }
            const headers = {};
            if (baseSize > 0) headers.range = `bytes=${baseSize}-`;
            const res = await fetch(remoteDownloadUrl(job.source, job.repo, job.file), { signal: ac.signal, redirect: "follow", headers });
            if (!res.ok || !res.body) throw new Error("\u4E0B\u8F7D\u5931\u8D25 HTTP " + res.status);
            const resumed = res.status === 206 && baseSize > 0;
            if (!resumed) baseSize = 0;
            job.bytesTotal = Number(res.headers.get("content-length") ?? 0) + (resumed ? baseSize : 0);
            job.bytesDone = resumed ? baseSize : 0;
            let lastTickAt = Date.now();
            const counter = new Transform({
              transform(chunk, _enc, cb) {
                job.bytesDone += chunk.length;
                lastTickAt = Date.now();
                cb(null, chunk);
              }
            });
            const watchdog = setInterval(() => {
              if (Date.now() - lastTickAt > 2e4) {
                clearInterval(watchdog);
                ac.abort(new Error(`\u8FDB\u5EA6\u505C\u6EDE20s(\u7B2C${attempt}\u6B21)`));
              }
            }, 5e3);
            try {
              await pipeline(
                Readable.fromWeb(res.body),
                counter,
                createWriteStream(tmpPath, resumed ? { flags: "a" } : void 0)
              );
            } finally {
              clearInterval(watchdog);
            }
            break;
          } catch (e) {
            if (job.cancelled) break;
            if (attempt < maxAttempts) {
              job.error = `\u7B2C${attempt}\u6B21\u4E2D\u65AD(${String(e?.message ?? e).slice(0, 40)})\uFF0C\u81EA\u52A8\u91CD\u8BD5`;
              persistImportJobs();
              await new Promise((r) => setTimeout(r, 2e3));
              attempt++;
              continue;
            }
            throw e;
          } finally {
            importAborters.delete(job.id);
          }
        }
        if (job.cancelled) throw new Error("\u5DF2\u53D6\u6D88");
        const hash = createHash("sha256");
        await new Promise((resolve, reject) => {
          const rs = createReadStream(tmpPath);
          rs.on("data", (c) => hash.update(c));
          rs.on("end", () => resolve());
          rs.on("error", reject);
        });
        const digest = "sha256:" + hash.digest("hex");
        job.bytesTotal = statSync(tmpPath).size;
        job.bytesDone = job.bytesTotal;
        job.state = "uploading";
        job.bytesDone = 0;
        const upCount = new Transform({
          transform(chunk, _enc, cb) {
            job.bytesDone += chunk.length;
            cb(null, chunk);
          }
        });
        const upRes = await fetch(api(host(), "/api/blobs/" + digest), {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: Readable.toWeb(upCount.pipe(createReadStream(tmpPath))),
          duplex: "half"
        });
        if (!upRes.ok && upRes.status !== 201) throw new Error("blob \u4E0A\u4F20\u5931\u8D25 HTTP " + upRes.status + " " + await upRes.text().catch(() => ""));
        job.state = "creating";
        const crRes = await fetch(api(host(), "/api/create"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: job.name, files: { [path.basename(file)]: digest } })
        });
        if (!crRes.ok) throw new Error("create \u5931\u8D25 HTTP " + crRes.status + " " + await crRes.text().catch(() => ""));
        job.state = "done";
        try {
          unlinkSync(tmpPath);
        } catch {
        }
      } catch (e) {
        if (job.cancelled || e?.message === "\u5DF2\u53D6\u6D88") {
          job.state = "cancelled";
          job.error = "\u5DF2\u53D6\u6D88\uFF08\u65AD\u70B9\u5DF2\u4FDD\u7559\uFF0C\u53EF\u7EE7\u7EED\uFF09";
        } else {
          job.state = "error";
          job.error = String(e?.message ?? e);
        }
      } finally {
        persistImportJobs();
      }
    })());
  }
  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (c) => {
        data += c;
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }
  const PK_PROBLEMS = [
    { id: "twoSum", sig: "twoSum(nums, target)", desc: "\u8FD4\u56DE\u6570\u7EC4\u4E2D\u4E24\u6570\u4E4B\u548C\u7B49\u4E8E target \u7684\u4E0B\u6807\u6570\u7EC4 [i, j]\uFF08i<j\uFF0C\u7B54\u6848\u552F\u4E00\uFF09", tests: [
      { args: [[2, 7, 11, 15], 9], want: [0, 1] },
      { args: [[3, 2, 4], 6], want: [1, 2] },
      { args: [[3, 3], 6], want: [0, 1] }
    ] },
    { id: "fizzBuzz", sig: "fizzBuzz(n)", desc: '\u8FD4\u56DE 1..n \u7684\u5B57\u7B26\u4E32\u6570\u7EC4\uFF1A3 \u7684\u500D\u6570\u66FF\u6362\u4E3A "Fizz"\uFF0C5 \u7684\u500D\u6570\u66FF\u6362\u4E3A "Buzz"\uFF0C\u4E24\u8005\u500D\u6570\u66FF\u6362\u4E3A "FizzBuzz"\uFF0C\u5176\u4F59\u6570\u5B57\u4E5F\u8F6C\u4E3A\u5B57\u7B26\u4E32', tests: [
      { args: [5], want: ["1", "2", "Fizz", "4", "Buzz"] },
      { args: [15], want: ["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"] }
    ] },
    { id: "lengthOfLongestSubstring", sig: "lengthOfLongestSubstring(s)", desc: "\u65E0\u91CD\u590D\u5B57\u7B26\u7684\u6700\u957F\u5B50\u4E32\u957F\u5EA6", tests: [
      { args: ["abcabcbb"], want: 3 },
      { args: ["bbbbb"], want: 1 },
      { args: ["pwwkew"], want: 3 },
      { args: [""], want: 0 }
    ] },
    { id: "isValid", sig: "isValid(s)", desc: "\u62EC\u53F7\u4E32\u662F\u5426\u6709\u6548\uFF08()[]{} \u4E09\u79CD\u62EC\u53F7\u6B63\u786E\u95ED\u5408\uFF09", tests: [
      { args: ["()"], want: true },
      { args: ["()[]{}"], want: true },
      { args: ["(]"], want: false },
      { args: ["([)]"], want: false },
      { args: ["{[]}"], want: true }
    ] },
    { id: "reverseWords", sig: "reverseWords(s)", desc: "\u53CD\u8F6C\u5B57\u7B26\u4E32\u4E2D\u7684\u5355\u8BCD\u987A\u5E8F\uFF0C\u591A\u4F59\u7A7A\u683C\u53BB\u6389\uFF0C\u8FD4\u56DE\u5355\u4E2A\u7A7A\u683C\u8FDE\u63A5", tests: [
      { args: ["the sky is blue"], want: "blue is sky the" },
      { args: ["  hello world  "], want: "world hello" },
      { args: ["a"], want: "a" }
    ] },
    { id: "fib", sig: "fib(n)", desc: "\u7B2C n \u4E2A\u6590\u6CE2\u90A3\u5951\u6570\uFF08fib(0)=0, fib(1)=1\uFF09\uFF0C\u5FC5\u987B\u9AD8\u6548\uFF08n \u53EF\u5230 35\uFF09", tests: [
      { args: [10], want: 55 },
      { args: [30], want: 832040 },
      { args: [0], want: 0 }
    ] },
    { id: "groupAnagrams", sig: "groupAnagrams(strs)", desc: "\u5B57\u6BCD\u5F02\u4F4D\u8BCD\u5206\u7EC4\uFF0C\u8FD4\u56DE\u7EC4\u6570\uFF08\u6BCF\u7EC4\u81F3\u5C11\u4E00\u4E2A\u6210\u5458\uFF09", tests: [
      { args: [["eat", "tea", "tan", "ate", "nat", "bat"]], want: 3 },
      { args: [[""]], want: 1 },
      { args: [["a"]], want: 1 }
    ] },
    { id: "findMin", sig: "findMin(nums)", desc: "\u65CB\u8F6C\u5347\u5E8F\u6570\u7EC4\u4E2D\u7684\u6700\u5C0F\u503C", tests: [
      { args: [[3, 4, 5, 1, 2]], want: 1 },
      { args: [[4, 5, 6, 7, 0, 1, 2]], want: 0 },
      { args: [[11, 13, 15, 17]], want: 11 }
    ] }
  ];
  function extractPkCandidates(text, fnName) {
    let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "\n");
    const open = t.indexOf("<think>");
    if (open >= 0) t = t.slice(0, open);
    const cands = [...t.matchAll(/```(?:javascript|js)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
    const m2 = t.match(new RegExp("(?:function\\s+" + fnName + "\\b|const\\s+" + fnName + "\\b|let\\s+" + fnName + "\\b)[\\s\\S]*"));
    if (m2) cands.push(m2[0]);
    cands.push(t);
    return cands;
  }
  async function askPk(model, prompt) {
    const call = (extra) => fetch(host() + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 8192, temperature: 0 }, ...extra }),
      signal: AbortSignal.timeout(15 * 6e4)
    });
    let res = await call({ think: false });
    let j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (/think/i.test(String(j.error || ""))) {
        res = await call();
        j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error || "HTTP " + res.status);
        return ((j.response || "") + "\n" + (j.thinking || "")).trim();
      }
      throw new Error(j.error || "HTTP " + res.status);
    }
    return ((j.response || "") + "\n" + (j.thinking || "")).trim();
  }
  const evalTasks = /* @__PURE__ */ new Map();
  async function runPkTask(id) {
    const task = evalTasks.get(id);
    task.total = task.models.length * PK_PROBLEMS.length;
    try {
      for (const model of task.models) {
        task.current = model;
        const per = [];
        let passTotal = 0;
        let assertTotal = 0;
        let solved = 0;
        for (const p of PK_PROBLEMS) {
          task.index++;
          const fnName = p.sig.split("(")[0].trim();
          const prompt = `\u7528 JavaScript \u5B9E\u73B0\u51FD\u6570 ${p.sig}\u3002
\u8981\u6C42: ${p.desc}\u3002
\u53EA\u5141\u8BB8\u8F93\u51FA\u4E00\u4E2A markdown \u4EE3\u7801\u5757\uFF0C\u5757\u5185\u53EA\u5305\u542B\u51FD\u6570\u5B9A\u4E49\uFF08\u4E0D\u8981 console.log\uFF0C\u4E0D\u8981\u6D4B\u8BD5\u4EE3\u7801\uFF0C\u4E0D\u8981\u89E3\u91CA\u6587\u5B57\uFF09\u3002`;
          let out = "";
          try {
            out = await askPk(model, prompt);
          } catch (e) {
            per.push({ id: p.id, pass: 0, total: p.tests.length, err: "\u8BF7\u6C42\u5931\u8D25: " + (e.message || e.name) });
            continue;
          }
          let fn = null;
          for (const cand of extractPkCandidates(out, fnName)) {
            try {
              const f = new Function(`"use strict";
${cand}
return typeof ${fnName} === 'function' ? ${fnName} : null;`)();
              if (typeof f === "function") {
                fn = f;
                break;
              }
            } catch {
            }
          }
          if (typeof fn !== "function") {
            per.push({ id: p.id, pass: 0, total: p.tests.length, err: "\u672A\u63D0\u53D6\u5230\u53EF\u6267\u884C\u51FD\u6570" });
            continue;
          }
          let passed = 0;
          for (const t of p.tests) {
            try {
              if (JSON.stringify(fn(...t.args)) === JSON.stringify(t.want)) passed++;
            } catch {
            }
          }
          per.push({ id: p.id, pass: passed, total: p.tests.length });
          passTotal += passed;
          assertTotal += p.tests.length;
          if (passed === p.tests.length) solved++;
        }
        task.results.push({ model, pass_total: passTotal, assert_total: assertTotal, solved, of: PK_PROBLEMS.length, per });
      }
      task.status = "done";
      task.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      const entry = { ts: task.finishedAt, model: "__codepk__", type: "codepk", suite: "easy-v1", results: task.results };
      await mkdir(dirname(config.historyPath), { recursive: true });
      await writeFile(config.historyPath, JSON.stringify(entry) + "\n", { flag: "a", encoding: "utf8" });
      await refreshDashboard();
    } catch (e) {
      task.status = "error";
      task.error = e.message || String(e);
    }
  }
  ctx.tools.register(defineToolSafe({
    name: "ollama_models",
    description: "\u67E5\u770B Ollama \u5B98\u65B9\u5E93\u91CC\u80FD\u62C9\u53D6\u7684\u6A21\u578B\u5217\u8868\uFF08\u53EF\u6309\u5173\u952E\u8BCD\u8FC7\u6EE4\uFF0C\u6807\u8BB0\u672C\u673A\u5DF2\u5B89\u88C5\u7684\uFF09\u3002\u6570\u636E\u6765\u81EA\u5B98\u65B9\u6CE8\u518C\u8868\u5E76\u7F13\u5B58 24 \u5C0F\u65F6\u3002",
    parameters: {
      filter: { type: "string", description: '\u5173\u952E\u8BCD\u8FC7\u6EE4\uFF0C\u4F8B\u5982 "qwen"\u3001"coder"\uFF1B\u7F3A\u7701\u8FD4\u56DE\u5168\u90E8\uFF08\u53EF\u80FD\u4E0A\u5343\u6761\uFF0C\u5EFA\u8BAE\u5E26\u8FC7\u6EE4\uFF09' },
      force: { type: "boolean", description: "\u8DF3\u8FC7\u7F13\u5B58\u5F3A\u5236\u91CD\u65B0\u6293\u53D6\u76EE\u5F55" }
    },
    output: {
      schema: { type: "object", additionalProperties: true, properties: { total: { type: "integer" }, matched: { type: "integer" }, installed_matched: { type: "integer" } } },
      render: (_args, value) => [{
        type: "text",
        text: `## \u53EF\u62C9\u53D6\u6A21\u578B\uFF08\u5339\u914D ${value.matched}/${value.total}\uFF0C\u5176\u4E2D\u5DF2\u5B89\u88C5 ${value.installed_matched}\uFF09

${value.list ?? "(\u65E0\u5339\u914D)"}`
      }]
    },
    async execute(args, exec) {
      const catalog = await loadCatalog(args?.force);
      let installed = /* @__PURE__ */ new Set();
      try {
        const tags = await requestJson(host(), "/api/tags", { signal: exec.signal });
        for (const m of tags.models ?? []) {
          installed.add(m.name.split(":")[0].split("/").pop().toLowerCase());
        }
      } catch {
      }
      const kw = (args?.filter || "").toLowerCase();
      const matched = catalog.repos.filter((r) => !kw || r.toLowerCase().includes(kw));
      const lines = [];
      let instCount = 0;
      for (const r of matched.slice(0, 200)) {
        const base = r.split("/").pop().toLowerCase();
        const mark = installed.has(base) ? " \u2705\u5DF2\u5B89\u88C5" : "";
        if (mark) instCount++;
        lines.push(`- ${r}${mark}`);
      }
      return { total: catalog.repos.length, matched: matched.length, installed_matched: instCount, list: lines.join("\n") || "(\u65E0\u5339\u914D)" };
    }
  }));
  ctx.tools.register(defineToolSafe({
    name: "ollama_codepk",
    description: "\u521B\u5EFA\u7F16\u7A0B\u8BC4\u6D4B(PK)\u4EFB\u52A1\uFF1A\u8BA9\u591A\u4E2A\u6A21\u578B\u540C\u7B54\u4E00\u5957 JavaScript \u7B97\u6CD5\u9898\uFF088 \u9898\u542B\u8FB9\u754C\u65AD\u8A00\uFF09\uFF0C\u771F\u5B9E\u6267\u884C\u5224\u5206\u3002\u540E\u53F0\u5F02\u6B65\u6267\u884C\uFF0C\u7ED3\u675F\u540E\u81EA\u52A8\u5199\u5165\u5386\u53F2\u5E76\u5237\u65B0 HTML \u9762\u677F\u3002\u7528 ollama_eval_status \u67E5\u8FDB\u5EA6\u3002",
    parameters: {
      models: { type: "array", description: '\u8981\u53C2\u8D5B\u7684\u6A21\u578B\u540D\u5217\u8868\uFF0C\u4F8B\u5982 ["qwen3.6:35b-a3b","openbmb/minicpm-o4.5:latest"]' }
    },
    output: {
      schema: { type: "object", additionalProperties: true, properties: { task_id: { type: "string" }, models: { type: "integer" }, problems: { type: "integer" } } },
      render: (_args, value) => [{
        type: "text",
        text: `\u8BC4\u6D4B\u4EFB\u52A1\u5DF2\u542F\u52A8\uFF1A${value.task_id}\uFF08${value.models} \u4E2A\u6A21\u578B \xD7 ${value.problems} \u9898\uFF09\u3002\u540E\u53F0\u6267\u884C\u4E2D\u2014\u2014\u7528 ollama_eval_status \u67E5\u8FDB\u5EA6\uFF1B\u5B8C\u6210\u540E\u81EA\u52A8\u5199\u5165\u5386\u53F2\u5E76\u5237\u65B0\u9762\u677F\u3002`
      }]
    },
    async execute(args) {
      const models = (args?.models ?? []).filter((m) => typeof m === "string" && m.trim());
      if (!models.length) throw new Error("models \u4E0D\u80FD\u4E3A\u7A7A");
      const id = "pk-" + Date.now().toString(36);
      evalTasks.set(id, { id, status: "running", models, index: 0, total: models.length * PK_PROBLEMS.length, results: [], startedAt: (/* @__PURE__ */ new Date()).toISOString() });
      void runPkTask(id);
      return { task_id: id, models: models.length, problems: PK_PROBLEMS.length };
    }
  }));
  ctx.tools.register(defineToolSafe({
    name: "ollama_eval_status",
    description: "\u67E5\u770B\u7F16\u7A0B\u8BC4\u6D4B\u4EFB\u52A1\u7684\u8FDB\u5EA6\u548C\u7ED3\u679C\uFF1A\u4F20 task_id \u770B\u6307\u5B9A\u4EFB\u52A1\uFF0C\u4E0D\u4F20\u770B\u5168\u90E8\u4EFB\u52A1\u5217\u8868\u3002",
    parameters: {
      task_id: { type: "string", description: "ollama_codepk \u8FD4\u56DE\u7684\u4EFB\u52A1 ID\uFF1B\u7F3A\u7701\u5217\u51FA\u5168\u90E8\u4EFB\u52A1" }
    },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: "text", text: value.text }]
    },
    async execute(args) {
      const lines = [];
      const ids = args?.task_id ? [args.task_id] : [...evalTasks.keys()];
      if (!ids.length) return { text: "(\u8FD8\u6CA1\u6709\u8BC4\u6D4B\u4EFB\u52A1\u2014\u2014\u7528 ollama_codepk \u521B\u5EFA)" };
      for (const id of ids) {
        const t = evalTasks.get(id);
        if (!t) {
          lines.push(`\u627E\u4E0D\u5230\u4EFB\u52A1 ${id}`);
          continue;
        }
        lines.push(`## ${id} \xB7 ${t.status} \xB7 ${t.index}/${t.total} \u65AD\u8A00\u6B65${t.current ? " \xB7 \u5F53\u524D: " + t.current : ""} \xB7 \u5F00\u59CB ${t.startedAt.slice(11, 19)}`);
        if (t.error) lines.push("\u9519\u8BEF: " + t.error);
        for (const r of t.results) {
          lines.push(`- ${r.model}: ${r.pass_total}/${r.assert_total} (${(r.pass_total / Math.max(1, r.assert_total) * 100).toFixed(0)}%) \xB7 \u5B8C\u6574\u89E3\u9898 ${r.solved}/${r.of}`);
        }
        if (t.status === "done") lines.push("\u5DF2\u5B8C\u6210\u2014\u2014\u5386\u53F2\u4E0E\u9762\u677F\u5DF2\u66F4\u65B0\u3002");
      }
      return { text: lines.join("\n") };
    }
  }));
  ctx.tools.register(defineToolSafe({
    name: "ollama_compare",
    description: "\u67E5\u770B\u6240\u6709\u5386\u53F2\u6D4B\u901F\u8BB0\u5F55\u7684\u5BF9\u6BD4\u8868\uFF1A\u6BCF\u4E2A\u6A21\u578B\u7684\u6700\u65B0/\u6700\u4F73\u751F\u6210\u901F\u5EA6\u3001TTFT\u3001\u6D4B\u8BD5\u6B21\u6570\u3002\u6570\u636E\u6765\u81EA ollama_bench \u7684\u81EA\u52A8\u8BB0\u5F55\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          entries: { type: "array", items: { type: "object", additionalProperties: true } }
        }
      },
      render: (_args, value) => [{ type: "text", text: renderCompare(value.entries ?? []) }]
    },
    async execute() {
      return { entries: await readHistory() };
    }
  }));
  function aggregateByModel(entries) {
    const byModel = /* @__PURE__ */ new Map();
    for (const e of entries) {
      if (typeof e.eval_tps !== "number") continue;
      const list = byModel.get(e.model) ?? [];
      list.push(e);
      byModel.set(e.model, list);
    }
    return [...byModel.entries()].map(([model, list]) => ({
      model,
      latest: list[list.length - 1],
      bestTps: Math.max(...list.map((e) => e.eval_tps ?? 0)),
      count: list.length
    }));
  }
  function renderCompare(entries) {
    if (entries.length === 0) return "(\u8FD8\u6CA1\u6709\u6D4B\u901F\u8BB0\u5F55\u2014\u2014\u5148\u8DD1\u4E00\u6B21 ollama_bench)";
    const lines = [
      "## Ollama \u6D4B\u901F\u5386\u53F2",
      "",
      "| \u6A21\u578B | \u6700\u65B0\u901F\u5EA6 | \u6700\u4F73\u901F\u5EA6 | \u6700\u65B0 TTFT | \u6B21\u6570 | \u6700\u8FD1\u6D4B\u8BD5 |",
      "| --- | --- | --- | --- | --- | --- |"
    ];
    for (const g of aggregateByModel(entries)) {
      lines.push(
        `| ${g.model} | ${g.latest.eval_tps ?? "?"} tok/s | ${g.bestTps > 0 ? g.bestTps.toFixed(1) : "?"} tok/s | ${g.latest.ttft_ms !== void 0 ? g.latest.ttft_ms + " ms" : "?"} | ${g.count} | ${(g.latest.ts || "").slice(0, 16).replace("T", " ")} |`
      );
    }
    return lines.join("\n");
  }
  async function refreshDashboard(signal) {
    let version;
    try {
      version = (await requestJson(host(), "/api/version", { signal })).version;
    } catch {
    }
    const tags = await requestJson(host(), "/api/tags", { signal });
    const ps = await requestJson(host(), "/api/ps", { signal });
    const loadedNames = new Set((ps.models ?? []).map((m) => m.name));
    const installed = (tags.models ?? []).map((m) => ({
      name: m.name,
      size_gb: bytesToGb(m.size),
      params: m.details?.parameter_size,
      quant: m.details?.quantization_level,
      loaded: loadedNames.has(m.name)
    }));
    const loaded = (ps.models ?? []).map((m) => ({
      name: m.name,
      size_gb: bytesToGb(m.size),
      vram_gb: bytesToGb(m.size_vram),
      cpu_gb: bytesToGb(m.size) !== void 0 && bytesToGb(m.size_vram) !== void 0 ? round(bytesToGb(m.size) - bytesToGb(m.size_vram), 2) : void 0,
      expires_at: m.expires_at
    }));
    const history = await readHistory();
    const seenCurve = /* @__PURE__ */ new Map();
    for (const e of history) {
      if (Array.isArray(e.ctx_curve)) seenCurve.set(e.model, { model: e.model, ts: e.ts, points: e.ctx_curve });
    }
    const curves = [...seenCurve.values()];
    const pk = history.filter((e) => Array.isArray(e.codepk)).map((e) => ({ ts: e.ts, suite: e.suite, results: e.codepk ?? e.results }));
    let catalog;
    try {
      catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    } catch {
    }
    await mkdir(dirname(config.dashboardPath), { recursive: true });
    await writeFile(
      config.dashboardPath,
      renderDashboardHtml({ host: host(), version, installed, loaded, history, curves, pk, catalog }),
      "utf8"
    );
    return { path: config.dashboardPath, models: installed.length, history_entries: history.length };
  }
  ctx.tools.register(defineToolSafe({
    name: "ollama_dashboard",
    description: "\u751F\u6210\u4E00\u4E2A\u53EF\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u7684 HTML \u9762\u677F\uFF08\u5DF2\u5B89\u88C5\u6A21\u578B\u3001\u663E\u5B58\u5206\u5E03\u3001\u6D4B\u901F\u5386\u53F2\u3001\u4E0A\u4E0B\u6587\u66F2\u7EBF\u3001\u7F16\u7A0B\u8BC4\u6D4B\u3001\u53EF\u62C9\u53D6\u6A21\u578B\u76EE\u5F55\uFF09\u3002\u6BCF\u6B21\u8C03\u7528\u7528\u6700\u65B0\u6570\u636E\u8986\u76D6\uFF1B\u8BC4\u6D4B\u4EFB\u52A1\u5B8C\u6210\u65F6\u4E5F\u4F1A\u81EA\u52A8\u5237\u65B0\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          path: { type: "string" },
          models: { type: "integer" },
          history_entries: { type: "integer" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `HTML \u9762\u677F\u5DF2\u751F\u6210\uFF1A${value.path}\uFF08${value.models} \u4E2A\u6A21\u578B\uFF0C${value.history_entries} \u6761\u5386\u53F2\u8BB0\u5F55\uFF09\u3002\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u5373\u53EF\u67E5\u770B\uFF1B\u518D\u6B21\u8C03\u7528\u672C\u5DE5\u5177\u5237\u65B0\u6570\u636E\u3002`
      }]
    },
    async execute(_args, exec) {
      return await refreshDashboard(combineSignals(exec.signal, config.timeoutMs));
    }
  }));
  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderDashboardHtml(data) {
    const groups = aggregateByModel(data.history);
    const maxTps = Math.max(1, ...data.history.map((e) => e.eval_tps ?? 0));
    const globalCurveMax = Math.max(1, ...(data.curves ?? []).flatMap((c) => c.points.map((p) => p.eval_tps ?? 0)));
    const rowsInstalled = data.installed.map((m) => `
      <tr><td>${esc(m.name)}</td><td>${esc(m.params ?? "?")}</td><td>${esc(m.quant ?? "?")}</td>
      <td>${m.size_gb ?? "?"} GB</td><td>${m.loaded ? '<span class="on">\u5DF2\u52A0\u8F7D</span>' : '<span class="off">\u672A\u52A0\u8F7D</span>'}</td></tr>`).join("");
    const rowsLoaded = data.loaded.length > 0 ? data.loaded.map((m) => `
      <tr><td>${esc(m.name)}</td><td>${m.size_gb ?? "?"} GB</td><td>${m.vram_gb ?? "?"} GB</td>
      <td class="${m.cpu_gb && m.cpu_gb > 0 ? "warn" : ""}">${m.cpu_gb ? m.cpu_gb + " GB" : "-"}</td></tr>`).join("") : '<tr><td colspan="4" class="dim">\u5F53\u524D\u6CA1\u6709\u5DF2\u52A0\u8F7D\u7684\u6A21\u578B</td></tr>';
    const rowsHistory = groups.length > 0 ? groups.sort((a, b) => b.bestTps - a.bestTps).map((g) => `
      <tr><td>${esc(g.model)}</td>
      <td><div class="bar"><div style="width:${Math.min(100, Math.round((g.latest.eval_tps ?? 0) / maxTps * 100))}%"></div></div></td>
      <td>${g.latest.eval_tps ?? "?"} tok/s</td><td>${g.bestTps > 0 ? g.bestTps.toFixed(1) : "?"}</td>
      <td>${g.latest.ttft_ms !== void 0 ? g.latest.ttft_ms + " ms" : "?"}</td><td>${g.count}</td></tr>`).join("") : '<tr><td colspan="6" class="dim">\u8FD8\u6CA1\u6709\u6D4B\u901F\u8BB0\u5F55</td></tr>';
    const rowsCurve = (data.curves ?? []).flatMap(
      (c) => (c.points || []).map((p, idx) => `
      <tr>${idx === 0 ? `<td rowspan="${c.points.length}">${esc(c.model)}</td>` : ""}
      <td>${Number(p.ctx).toLocaleString()}</td>
      <td>${p.prefill_tps ?? "?"} tok/s</td>
      <td><div class="bar"><div style="width:${Math.min(100, Math.round((p.eval_tps ?? 0) / globalCurveMax * 100))}%"></div></div></td>
      <td>${p.eval_tps ?? "?"} tok/s</td>
      <td>${esc(p.vram ?? "-")}</td></tr>`)
    ).join("");
    const rowsPk = (data.pk ?? []).flatMap(
      (run) => (run.results || []).map((r, idx) => `
      <tr>${idx === 0 ? `<td rowspan="${(run.results || []).length}">${esc(run.ts.slice(0, 16).replace("T", " "))}<br><span class="dim">${esc(run.suite || "")}</span></td>` : ""}
      <td>${esc(r.model)}</td>
      <td><div class="bar"><div style="width:${Math.round(r.pass_total / Math.max(1, r.assert_total) * 100)}%"></div></div></td>
      <td>${r.pass_total}/${r.assert_total}</td>
      <td>${r.solved}/${r.of}</td>
      <td>${Math.round(r.pass_total / Math.max(1, r.assert_total) * 100)}%</td></tr>`)
    ).join("");
    const liveHost = esc(data.host.replace(/<[^>]*>/g, ""));
    return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>Ollama Monitor \u9762\u677F</title>
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
<h1>Ollama Monitor <span class="meta">${liveHost}${data.version ? " \xB7 v" + esc(data.version) : ""}</span></h1>
<button onclick="location.reload()">\u91CD\u65B0\u751F\u6210\u672C\u9875\u8BF7\u56DE\u5230 DSH \u8C03\u7528 ollama_dashboard</button><span id="live"></span>
<script>
async function live(){
  try{
    const t=await (await fetch('${liveHost}/api/tags')).json();
    document.getElementById('live').textContent='\u5B9E\u65F6\u8FDE\u63A5\u6210\u529F\uFF0C'+t.models.length+' \u4E2A\u6A21\u578B\uFF08\u672C\u9875\u8868\u683C\u4E3A\u751F\u6210\u65F6\u7684\u5FEB\u7167\uFF09';
  }catch(e){document.getElementById('live').textContent='\u6D4F\u89C8\u5668\u76F4\u8FDE\u88AB CORS \u62E6\u622A\uFF08\u6B63\u5E38\u73B0\u8C61\uFF09\u2014\u2014\u56DE DSH \u91CD\u65B0\u8C03\u7528 ollama_dashboard \u5373\u53EF\u5237\u65B0'}
}
live()
</script>
<h2>\u5DF2\u5B89\u88C5\u6A21\u578B</h2>
<table><tr><th>\u540D\u79F0</th><th>\u53C2\u6570\u91CF</th><th>\u91CF\u5316</th><th>\u4F53\u79EF</th><th>\u72B6\u6001</th></tr>${rowsInstalled}</table>
<h2>\u5DF2\u52A0\u8F7D / \u663E\u5B58\u5206\u5E03</h2>
<table><tr><th>\u540D\u79F0</th><th>\u603B\u4F53\u79EF</th><th>GPU \u663E\u5B58</th><th>CPU/\u5185\u5B58</th></tr>${rowsLoaded}</table>
<h2>\u6D4B\u901F\u5386\u53F2\u5BF9\u6BD4\uFF08\u6309\u6700\u4F73\u901F\u5EA6\u6392\u5E8F\uFF09</h2>
<table><tr><th>\u6A21\u578B</th><th colspan="1">\u76F8\u5BF9\u901F\u5EA6</th><th>\u6700\u65B0\u901F\u5EA6</th><th>\u6700\u4F73</th><th>\u6700\u65B0 TTFT</th><th>\u6B21\u6570</th></tr>${rowsHistory}</table>
${(data.curves ?? []).length > 0 ? `<h2>\u4E0A\u4E0B\u6587-\u901F\u5EA6\u66F2\u7EBF\uFF08\u751F\u6210 256 token \u5B9E\u6D4B\uFF09</h2>
<table><tr><th>\u6A21\u578B</th><th>num_ctx</th><th>prefill</th><th>\u76F8\u5BF9\u8F93\u51FA\u901F\u5EA6</th><th>\u8F93\u51FA tok/s</th><th>\u663E\u5B58\u5206\u5E03</th></tr>${rowsCurve}</table>
<p class="meta">\u67F1\u72B6\u56FE\u7EDF\u4E00\u57FA\u51C6\uFF1A\u6240\u6709\u66F2\u7EBF\u4E2D\u7684\u5168\u5C40\u6700\u5FEB\u901F\u5EA6 = 100%\uFF0C\u53EF\u76F4\u63A5\u8DE8\u6A21\u578B\u5BF9\u6BD4\uFF1B\u540C\u6A21\u578B\u4EC5\u663E\u793A\u6700\u65B0\u4E00\u6B21\u626B\u63CF\u3002</p>` : ""}
${rowsPk ? `<h2>\u7F16\u7A0B\u8BC4\u6D4B\u8BB0\u5F55\uFF08\u540C\u9898\u7ADE\u6280 \xB7 \u65AD\u8A00\u5224\u5206\uFF09</h2>
<table><tr><th>\u8BC4\u6D4B\u65F6\u95F4 / \u5957\u4EF6</th><th>\u6A21\u578B</th><th>\u76F8\u5BF9\u5F97\u5206</th><th>\u65AD\u8A00\u901A\u8FC7</th><th>\u5B8C\u6574\u89E3\u9898</th><th>\u5F97\u5206\u7387</th></tr>${rowsPk}</table>
<p class="meta">\u7528 ollama_codepk \u53D1\u8D77\u65B0\u8BC4\u6D4B \xB7 ollama_eval_status \u67E5\u8FDB\u5EA6 \xB7 \u5B8C\u6210\u540E\u672C\u9762\u677F\u81EA\u52A8\u5237\u65B0</p>` : ""}
${data.catalog ? `<h2>\u53EF\u62C9\u53D6\u6A21\u578B\u76EE\u5F55\uFF08${data.catalog.repos.length} \u4E2A \xB7 ${esc(data.catalog.ts.slice(0, 16).replace("T", " "))} \u6293\u53D6\uFF09</h2>
<p class="meta">\u6765\u81EA registry.ollama.ai \u5B98\u65B9\u76EE\u5F55\uFF0C\u7F13\u5B58 24 \u5C0F\u65F6\u2014\u2014\u7528 ollama_models \u6309\u5173\u952E\u8BCD\u7B5B\u9009\uFF0Collama_pull \u62C9\u53D6\u5B89\u88C5\u3002</p>` : ""}
<p class="meta">\u751F\u6210\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19)} UTC \xB7 \u6570\u636E\u6765\u6E90\uFF1Aollama_bench \u81EA\u52A8\u8BB0\u5F55 (${esc(config.historyPath)})</p>
</body></html>`;
  }
  function renderPull(value) {
    const lines = [`## Ollama \u62C9\u53D6: ${value.model}`, "", `- \u7ED3\u679C: ${value.ok ? "\u2705 \u6210\u529F" : "\u26A0 \u672A\u5B8C\u6210"}`];
    if (value.status) lines.push(`- \u72B6\u6001: ${value.status}`);
    if (value.total_gb > 0) {
      const pct = Math.round(value.downloaded_gb / value.total_gb * 100);
      lines.push(`- \u8FDB\u5EA6: ${value.downloaded_gb} / ${value.total_gb} GB (${pct}%)`);
    }
    lines.push(`- \u5C1D\u8BD5\u6B21\u6570: ${value.attempts} \xB7 \u603B\u8017\u65F6: ${Math.round(value.elapsed_ms / 1e3)} s`);
    if (!value.ok) lines.push("", "> \u672A\u5B8C\u6210\uFF1A\u8D85\u8FC7\u65F6\u957F\u4E0A\u9650\u6216\u7F51\u7EDC\u4E2D\u65AD\u3002\u518D\u6B21\u8C03\u7528\u4F1A\u4ECE\u65AD\u70B9\u7EE7\u7EED\u3002");
    return lines.join("\n");
  }
  function renderBench(value) {
    const lines = [`## Ollama \u6D4B\u901F: ${value.model}`, "", `- \u5730\u5740: ${value.host}`];
    if (value.load_ms !== void 0) lines.push(`- \u6A21\u578B\u52A0\u8F7D: ${value.load_ms} ms`);
    if (value.ttft_ms !== void 0) lines.push(`- \u9996 token \u5EF6\u8FDF (TTFT): ${value.ttft_ms} ms`);
    if (value.prompt_tokens !== void 0) {
      lines.push(`- \u63D0\u793A\u8BCD\u5904\u7406: ${value.prompt_tokens} tok @ ${value.prompt_tps ?? "?"} tok/s`);
    }
    lines.push(`- \u751F\u6210: ${value.gen_tokens ?? "?"} tok`);
    if (value.eval_tps !== void 0) lines.push(`- \u751F\u6210\u901F\u5EA6: ${value.eval_tps} tok/s (Ollama \u4E0A\u62A5)`);
    if (value.eval_tps_wall !== void 0) lines.push(`- \u751F\u6210\u901F\u5EA6(\u5899\u949F): ${value.eval_tps_wall} tok/s`);
    lines.push(`- \u603B\u8017\u65F6: ${value.total_ms} ms`);
    if (value.options_used && Object.keys(value.options_used).length > 0) {
      lines.push(`- \u672C\u6B21\u53C2\u6570: ${JSON.stringify(value.options_used)}`);
    }
    if (value.preview) lines.push("", `> ${value.preview}`);
    return lines.join("\n");
  }
  function renderStatus(value) {
    const lines = [`## Ollama \u72B6\u6001 (${value.host})`];
    if (value.version) lines.push(`\u7248\u672C: ${value.version}`);
    lines.push(`\u76EE\u5F55\u8DEF\u7531: ${catalogRouteState}`);
    lines.push("", "### \u5DF2\u52A0\u8F7D (\u5360\u7528\u663E\u5B58/\u5185\u5B58)");
    if (!value.loaded?.length) {
      lines.push("(\u5F53\u524D\u6CA1\u6709\u5DF2\u52A0\u8F7D\u7684\u6A21\u578B)");
    } else {
      for (const m of value.loaded) {
        const parts = [
          `\u5171 ${m.size_gb ?? "?"} GB`,
          m.vram_gb !== void 0 ? `GPU ${m.vram_gb} GB` : null,
          m.cpu_ram_gb ? `\u5185\u5B58 ${m.cpu_ram_gb} GB` : null,
          m.fully_on_gpu === false ? "\u26A0 \u90E8\u5206\u843D\u5728 CPU/\u5185\u5B58(\u4F1A\u660E\u663E\u53D8\u6162)" : null,
          m.arch_context_max !== void 0 ? `\u67B6\u6784\u4E0A\u4E0B\u6587\u4E0A\u9650 ${m.arch_context_max.toLocaleString()}` : null
        ].filter(Boolean);
        lines.push(`- **${m.name}**: ${parts.join(" \xB7 ")}`);
      }
    }
    lines.push("", "### \u5DF2\u5B89\u88C5");
    if (!value.installed?.length) {
      lines.push("(\u6CA1\u6709\u5DF2\u5B89\u88C5\u7684\u6A21\u578B)");
    } else {
      for (const m of value.installed) {
        lines.push(`- **${m.name}** \u2014 ${m.params ?? "?"} \xB7 ${m.quantization ?? "?"} \xB7 ${m.size_gb ?? "?"} GB`);
      }
    }
    return lines.join("\n");
  }
}
export {
  Config,
  apply,
  inject,
  name
};
