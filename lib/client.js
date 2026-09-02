window.__ModuleLoader__.load({ id: "ollama-monitor", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var PK_PROBLEMS = [
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
async function askPk(base, model, prompt) {
  const call = (extra) => fetch(base + "/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 8192, temperature: 0 }, ...extra })
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
var CSS = `
.om{color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.6;max-width:860px}
.om .sec{margin:22px 0 0;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2)}
.om h3{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 10px;display:flex;align-items:center;gap:8px}
.om .muted{color:var(--dsw-alias-label-secondary);font-size:12.5px}
.om .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.om .table{width:100%;border-collapse:collapse;font-size:12.5px}
.om .table th{color:var(--dsw-alias-label-secondary);font-weight:500;text-align:left;padding:6px 10px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.om .table td{padding:7px 10px 7px 0;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:middle}
.om .table tr:last-child td{border-bottom:none}
.om .mute{color:var(--dsw-alias-label-secondary)}
.om .warn{color:var(--dsw-alias-interactive-bg-hover-danger);background:var(--dsw-alias-interactive-bg-hover-danger);border-radius:4px;padding:1px 6px}
.om .ok{color:var(--dsw-static-green-600)}
.om .bar{display:inline-block;width:140px;height:8px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden;vertical-align:middle}
.om .bar i{display:block;height:8px;border-radius:4px;background:var(--dsw-alias-button-primary-fill)}
.om .cells{display:flex;gap:6px;align-items:center}
.om code{background:var(--dsw-alias-interactive-bg-hover);border-radius:4px;padding:1px 5px;font-size:12px}
.om pre{background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;padding:10px 12px;font-size:11.5px;white-space:pre-wrap;margin:8px 0 0}
.om input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary)}
.om .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:2px;max-height:190px;overflow:auto}
.om .chip{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:14px;padding:3px 11px;font-size:12px;cursor:pointer}
.om .chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.om .chip.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
`;
function OllamaPanel() {
  const [url, setUrl] = (0, import_react.useState)(() => localStorage.getItem("ollama-monitor.url") || "http://127.0.0.1:11434");
  const [base, setBase] = (0, import_react.useState)(() => localStorage.getItem("ollama-monitor.url") || "http://127.0.0.1:11434");
  const [err, setErr] = (0, import_react.useState)("");
  const [models, setModels] = (0, import_react.useState)([]);
  const [psMap, setPsMap] = (0, import_react.useState)({});
  const [auto, setAuto] = (0, import_react.useState)(false);
  const [pullName, setPullName] = (0, import_react.useState)("");
  const [pullSt, setPullSt] = (0, import_react.useState)(null);
  const [benchSt, setBenchSt] = (0, import_react.useState)({});
  const [catRepos, setCatRepos] = (0, import_react.useState)(null);
  const [catErr, setCatErr] = (0, import_react.useState)("");
  const [catQ, setCatQ] = (0, import_react.useState)("");
  const [catBusy, setCatBusy] = (0, import_react.useState)(false);
  const [infoMap, setInfoMap] = (0, import_react.useState)({});
  const infoInflight = (0, import_react.useRef)(/* @__PURE__ */ new Set());
  const infoFailed = (0, import_react.useRef)(/* @__PURE__ */ new Set());
  const [pkSel, setPkSel] = (0, import_react.useState)({});
  const [pkLog, setPkLog] = (0, import_react.useState)([]);
  const [pkBusy, setPkBusy] = (0, import_react.useState)(false);
  const [pkScore, setPkScore] = (0, import_react.useState)([]);
  const [jobs, setJobs] = (0, import_react.useState)(() => {
    try {
      return JSON.parse(localStorage.getItem("ollama-monitor.jobs") || "[]");
    } catch {
      return [];
    }
  });
  const updateJobs = (fn) => {
    setJobs((js) => {
      const next = fn(js);
      try {
        localStorage.setItem("ollama-monitor.jobs", JSON.stringify(next));
      } catch {
      }
      return next;
    });
  };
  const [sortKey, setSortKey] = (0, import_react.useState)("size");
  const [sortDir, setSortDir] = (0, import_react.useState)(-1);
  const [catSort, setCatSort] = (0, import_react.useState)("name");
  const [srcSel, setSrcSel] = (0, import_react.useState)("hf");
  const [srcQ, setSrcQ] = (0, import_react.useState)("");
  const [srcBusy, setSrcBusy] = (0, import_react.useState)(false);
  const [srcResults, setSrcResults] = (0, import_react.useState)(null);
  const [srcErr, setSrcErr] = (0, import_react.useState)("");
  const [srcRepo, setSrcRepo] = (0, import_react.useState)("");
  const [ggufFiles, setGgufFiles] = (0, import_react.useState)(null);
  const [filesBusy, setFilesBusy] = (0, import_react.useState)(false);
  const [imports, setImports] = (0, import_react.useState)([]);
  const prevDoneCount = (0, import_react.useRef)(0);
  const [vramBudget, setVramBudget] = (0, import_react.useState)("");
  const refresh = (0, import_react.useCallback)(async (silent) => {
    if (!silent) setErr("");
    try {
      const t = await (await fetch(base + "/api/tags")).json();
      const p = await (await fetch(base + "/api/ps")).json();
      setModels(t.models || []);
      const m = {};
      for (const x of p.models || []) m[x.name] = x;
      setPsMap(m);
    } catch (e) {
      if (!silent) {
        setErr("\u8FDE\u63A5\u5931\u8D25: " + (e.message || e) + " \u2014\u2014 \u82E5\u662F\u8DE8\u57DF\u62E6\u622A\uFF0C\u8BF7\u5728\u670D\u52A1\u5668\u5BB9\u5668\u73AF\u5883\u53D8\u91CF\u52A0 OLLAMA_ORIGINS=* \u540E\u91CD\u542F Ollama");
        setModels([]);
      }
    }
  }, [base]);
  (0, import_react.useEffect)(() => {
    void refresh();
  }, [refresh]);
  (0, import_react.useEffect)(() => {
    if (!auto) return;
    const h = setInterval(() => void refresh(true), 5e3);
    return () => clearInterval(h);
  }, [auto, refresh]);
  const connect = () => {
    localStorage.setItem("ollama-monitor.url", url.replace(/\/$/, ""));
    setBase(url.replace(/\/$/, ""));
  };
  const pullModel = async (nameArg) => {
    const name = (nameArg ?? pullName).trim();
    if (!name) return;
    setPullSt({ pct: 0, text: "starting\u2026" });
    updateJobs((js) => [...js.filter((j) => j.name !== name), { name, started: Date.now(), pct: 0, state: "running" }]);
    const poll = setInterval(() => void refresh(true), 8e3);
    const ac = new AbortController();
    pullAbort.current = ac;
    try {
      const res = await fetch(base + "/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name, stream: true }),
        signal: ac.signal
      });
      const rd = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (; ; ) {
        const r = await rd.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let f;
          try {
            f = JSON.parse(line);
          } catch {
            continue;
          }
          if (f.error) throw new Error(f.error);
          if (f.total && f.completed) {
            const pct = Math.round(f.completed / f.total * 100);
            setPullSt({ pct, text: (f.completed / 1073741824).toFixed(2) + " / " + (f.total / 1073741824).toFixed(2) + " GB" });
            updateJobs((js) => js.map((j) => j.name === name ? { ...j, pct } : j));
          } else if (f.status) setPullSt({ pct: 0, text: f.status });
          if (f.status === "success") setPullSt({ pct: 100, text: "\u5B8C\u6210" });
        }
      }
      setPullSt((s) => s ? { ...s, pct: 100, text: "\u5B8C\u6210\uFF0C\u5217\u8868\u5DF2\u5237\u65B0" } : s);
      updateJobs((js) => js.filter((j) => j.name !== name));
      await refresh(false);
    } catch (e) {
      const aborted = e?.name === "AbortError";
      setPullSt({ pct: 0, text: aborted ? "\u5DF2\u53D6\u6D88\uFF08\u65AD\u70B9\u4FDD\u7559\uFF0C\u53EF\u7EE7\u7EED\u62C9\u53D6\uFF09" : "\u5931\u8D25: " + (e.message || e) });
      updateJobs((js) => js.map((j) => j.name === name ? { ...j, state: "interrupted" } : j));
    } finally {
      clearInterval(poll);
      pullAbort.current = null;
    }
  };
  const pullAbort = (0, import_react.useRef)(null);
  const [pullStall, setPullStall] = (0, import_react.useState)(false);
  const pullStRef = (0, import_react.useRef)(null);
  pullStRef.current = pullSt;
  const pullProgressAt = (0, import_react.useRef)(Date.now());
  (0, import_react.useEffect)(() => {
    if (pullSt) pullProgressAt.current = Date.now();
  }, [pullSt?.pct]);
  (0, import_react.useEffect)(() => {
    const h = setInterval(() => {
      const s = pullStRef.current;
      const active = !!s && s.pct > 0 && s.pct < 100;
      setPullStall(active && Date.now() - pullProgressAt.current > 45e3);
    }, 5e3);
    return () => clearInterval(h);
  }, []);
  (0, import_react.useEffect)(() => {
    updateJobs((js) => js.map((j) => j.state === "running" ? { ...j, state: "interrupted" } : j));
  }, []);
  const browseCatalog = async () => {
    setCatBusy(true);
    setCatErr("");
    try {
      const r = await fetch(window.location.origin + "/ollama-monitor/catalog");
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
      setCatRepos(j.repos || []);
      void fetch(window.location.origin + "/ollama-monitor/model-info?all=1").then((r2) => r2.json()).then((j2) => {
        if (j2?.info) setInfoMap((s) => ({ ...j2.info, ...s }));
      }).catch(() => {
      });
      void pollScan();
    } catch (e) {
      setCatErr("\u76EE\u5F55\u83B7\u53D6\u5931\u8D25: " + (e.message || e) + " \u2014\u2014 \u82E5 404\uFF0C\u9700\u91CD\u542F DSH \u8BA9 node \u534A\u4FA7\u6CE8\u518C\u8BE5\u8DEF\u7531");
    } finally {
      setCatBusy(false);
    }
  };
  const [scan, setScan] = (0, import_react.useState)(null);
  const scanPolling = (0, import_react.useRef)(false);
  const pollScan = async () => {
    if (scanPolling.current) return;
    scanPolling.current = true;
    try {
      for (; ; ) {
        const s = await fetch(window.location.origin + "/ollama-monitor/scan").then((r) => r.json()).catch(() => null);
        if (!s) break;
        setScan(s);
        if (!s.running) {
          if (s.done > 0 || s.total > 0) {
            const j2 = await fetch(window.location.origin + "/ollama-monitor/model-info?all=1").then((r) => r.json()).catch(() => null);
            if (j2?.info) setInfoMap((prev) => ({ ...j2.info, ...prev }));
          }
          break;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
    } finally {
      scanPolling.current = false;
    }
  };
  const startScan = async () => {
    await fetch(window.location.origin + "/ollama-monitor/scan", { method: "POST" }).catch(() => {
    });
    void pollScan();
  };
  const catList = (0, import_react.useMemo)(
    () => (catRepos ?? []).filter((r) => r.includes(catQ.trim().toLowerCase())),
    [catRepos, catQ]
  );
  (0, import_react.useEffect)(() => {
    if (!catRepos) return;
    const visible = catList.slice(0, 12).filter((n) => !infoMap[n] && !infoInflight.current.has(n) && !infoFailed.current.has(n));
    if (!visible.length) return;
    for (const n of visible) infoInflight.current.add(n);
    const ctrl = new AbortController();
    fetch(window.location.origin + "/ollama-monitor/model-info?names=" + encodeURIComponent(visible.join(",")), { signal: ctrl.signal }).then((r) => r.json()).then((j) => {
      const got = j?.info || {};
      for (const n of visible) if (got[n]?.error) infoFailed.current.add(n);
      setInfoMap((s) => ({ ...s, ...got }));
    }).catch(() => {
    }).finally(() => {
      for (const n of visible) infoInflight.current.delete(n);
    });
    return () => ctrl.abort();
  }, [catList, catRepos]);
  const catView = (0, import_react.useMemo)(() => {
    const arr = [...catList];
    if (catSort === "size") arr.sort((a, b) => (infoMap[a]?.tags?.[0]?.gb ?? Infinity) - (infoMap[b]?.tags?.[0]?.gb ?? Infinity));
    return arr;
  }, [catList, catSort, infoMap]);
  const searchSource = async () => {
    setSrcBusy(true);
    setSrcErr("");
    try {
      const r = await fetch(window.location.origin + `/ollama-monitor/hf-search?source=${srcSel}&q=` + encodeURIComponent(srcQ.trim()));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
      setSrcResults(j.models || []);
    } catch (e) {
      setSrcErr("\u641C\u7D22\u5931\u8D25: " + (e.message || e));
    } finally {
      setSrcBusy(false);
    }
  };
  const pickRepo = async (id) => {
    setSrcRepo(id);
    setFilesBusy(true);
    setGgufFiles(null);
    try {
      const r = await fetch(window.location.origin + `/ollama-monitor/hf-files?source=${srcSel}&repo=` + encodeURIComponent(id));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
      setGgufFiles((j.files || []).sort((a, b) => a.size - b.size));
    } catch (e) {
      setSrcErr("\u8BFB\u53D6\u6587\u4EF6\u5217\u8868\u5931\u8D25: " + (e.message || e));
    } finally {
      setFilesBusy(false);
    }
  };
  const importFile = async (f) => {
    const stem = (f.path.split("/").pop() || "model").replace(/\.gguf$/i, "");
    const name = (srcSel === "ms" ? "ms-" : "hf-") + (srcRepo.split("/").pop() || "model").toLowerCase().replace(/[^a-z0-9._-]+/g, "-") + "-" + stem.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    await fetch(window.location.origin + "/ollama-monitor/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: srcSel, repo: srcRepo, file: f.path, name })
    }).catch(() => {
    });
  };
  (0, import_react.useEffect)(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const j = await fetch(window.location.origin + "/ollama-monitor/import").then((r) => r.json());
        const jobs2 = j?.jobs ?? [];
        setImports(jobs2);
        const doneN = jobs2.filter((x) => x.state === "done").length;
        if (doneN > prevDoneCount.current) void refresh(true);
        prevDoneCount.current = doneN;
      } catch {
      }
    };
    void tick();
    const h = setInterval(tick, 2e3);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [refresh]);
  const quickBench = async (name) => {
    setBenchSt((s) => ({ ...s, [name]: "\u8FD0\u884C\u4E2D\u2026" }));
    try {
      const t0 = performance.now();
      const r = await fetch(base + "/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name, prompt: "\u8BF7\u4ECE1\u6570\u523030\uFF0C\u6BCF\u4E2A\u6570\u5B57\u7528\u9017\u53F7\u9694\u5F00\uFF0C\u7136\u540E\u89E3\u91CA\u4E3A\u4EC0\u4E48\u5B66\u4E60\u5F88\u91CD\u8981", stream: false, think: false, options: { num_predict: 256, temperature: 0 } })
      });
      const j = await r.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      const wall = (performance.now() - t0) / 1e3;
      const tps = j.eval_count && j.eval_duration ? (j.eval_count / (j.eval_duration / 1e9)).toFixed(1) : "?";
      setBenchSt((s) => ({ ...s, [name]: tps + " tok/s" }));
    } catch (e) {
      setBenchSt((s) => ({ ...s, [name]: "\u5931\u8D25" }));
    }
  };
  const curveBench = async (name) => {
    setBenchSt((s) => ({ ...s, [name]: "\u66F2\u7EBF\u626B\u63CF\u4E2D\u2026" }));
    try {
      const r = await fetch(window.location.origin + "/ollama-monitor/bench-curve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name })
      });
      const j = await r.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      const pts = (j.curve || []).map((p) => p.ctx / 1024 + "k:" + p.eval_tps).join("  ");
      setBenchSt((s) => ({ ...s, [name]: pts }));
    } catch {
      setBenchSt((s) => ({ ...s, [name]: "\u66F2\u7EBF\u5931\u8D25" }));
    }
  };
  const runPk = async () => {
    const chosen = models.map((m) => m.name).filter((n) => pkSel[n]);
    if (chosen.length === 0) {
      setPkLog(["\u5148\u52FE\u9009\u81F3\u5C11\u4E00\u4E2A\u53C2\u8D5B\u6A21\u578B"]);
      return;
    }
    setPkBusy(true);
    setPkScore([]);
    setPkLog(["\u5F00\u8D5B\uFF1A" + chosen.join(" vs ") + "\uFF0C\u5171 " + PK_PROBLEMS.length + " \u9898"]);
    const scores = [];
    for (const model of chosen) {
      setPkLog((l) => [...l, "\u2014\u2014 " + model]);
      let pass = 0, total = 0, solved = 0;
      for (const p of PK_PROBLEMS) {
        const fnName = p.sig.split("(")[0].trim();
        const prompt = `\u7528 JavaScript \u5B9E\u73B0\u51FD\u6570 ${p.sig}\u3002
\u8981\u6C42: ${p.desc}\u3002
\u53EA\u5141\u8BB8\u8F93\u51FA\u4E00\u4E2A markdown \u4EE3\u7801\u5757\uFF0C\u5757\u5185\u53EA\u5305\u542B\u51FD\u6570\u5B9A\u4E49\uFF08\u4E0D\u8981 console.log\uFF0C\u4E0D\u8981\u6D4B\u8BD5\u4EE3\u7801\uFF0C\u4E0D\u8981\u89E3\u91CA\u6587\u5B57\uFF09\u3002`;
        let out = "";
        try {
          out = await askPk(base, model, prompt);
        } catch (e) {
          total += p.tests.length;
          setPkLog((l) => [...l, "  \u2717 " + p.id + " \u8BF7\u6C42\u5931\u8D25"]);
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
          total += p.tests.length;
          setPkLog((l) => [...l, "  \u2717 " + p.id + " \u672A\u63D0\u53D6\u5230\u4EE3\u7801"]);
          continue;
        }
        let ok = 0;
        for (const t of p.tests) {
          try {
            if (JSON.stringify(fn(...t.args)) === JSON.stringify(t.want)) ok++;
          } catch {
          }
        }
        pass += ok;
        total += p.tests.length;
        if (ok === p.tests.length) solved++;
        setPkLog((l) => [...l, `  ${ok === p.tests.length ? "\u2713" : ok > 0 ? "~" : "\u2717"} ${p.id} ${ok}/${p.tests.length}`]);
      }
      scores.push({ model, pass, total, solved });
      setPkScore([...scores]);
    }
    setPkBusy(false);
    setPkLog((l) => [...l, "\u6BD4\u8D5B\u7ED3\u675F\u2014\u2014\u4E0A\u65B9\u8868\u683C\u4E3A\u6700\u7EC8\u6210\u7EE9"]);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "om", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { style: { width: 320 }, value: url, onChange: (e) => setUrl(e.currentTarget.value), placeholder: "Ollama \u5730\u5740" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", onClick: connect, children: "\u8FDE\u63A5" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutline16, {}), onClick: () => void refresh(), children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "mute", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: auto, onChange: (e) => setAuto(e.target.checked) }),
        " \u81EA\u52A8\u5237\u65B0 5s"
      ] })
    ] }),
    err ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", style: { color: "var(--dsw-alias-interactive-bg-hover-danger)", background: "var(--dsw-alias-interactive-bg-hover-danger)" }, children: err }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconDownloadOutline16, {}),
        " \u5DF2\u5B89\u88C5\u6A21\u578B ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "muted", children: [
          "\xB7 ",
          models.length,
          " \u4E2A \xB7 \u70B9\u8868\u5934\u6392\u5E8F"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { style: { cursor: "pointer" }, onClick: () => {
            setSortKey("name");
            setSortDir((d) => sortKey === "name" ? -d : 1);
          }, children: [
            "\u6A21\u578B",
            sortKey === "name" ? sortDir === 1 ? " \u2191" : " \u2193" : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u53C2\u6570 / \u91CF\u5316" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { style: { cursor: "pointer" }, onClick: () => {
            setSortKey("size");
            setSortDir((d) => sortKey === "size" ? -d : -1);
          }, children: [
            "\u4F53\u79EF",
            sortKey === "size" ? sortDir === 1 ? " \u2191" : " \u2193" : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u663E\u5B58\u5206\u5E03" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u901F\u5EA6" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
          [...models].sort((a, b) => {
            const cmp = sortKey === "name" ? String(a.name).localeCompare(String(b.name)) : (a.size ?? 0) - (b.size ?? 0);
            return cmp * sortDir;
          }).map((m) => {
            const p = psMap[m.name];
            const loaded = !!p;
            const spill = loaded ? (p.size - p.size_vram) / 1073741824 : 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
                loaded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "done" }) : null,
                " ",
                m.name
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "mute", children: [
                m.details?.parameter_size,
                " \xB7 ",
                m.details?.quantization_level
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
                (m.size / 1073741824).toFixed(1),
                " GB"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: loaded ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "GPU ",
                (p.size_vram / 1073741824).toFixed(1),
                spill > 0.05 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "warn", children: [
                  " + \u5185\u5B58 ",
                  spill.toFixed(1)
                ] }) : null
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: "\u672A\u52A0\u8F7D" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: benchSt[m.name] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: benchSt[m.name] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => void quickBench(m.name), children: "\u6D4B\u901F" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", title: "\u626B\u63CF 4k/16k/32k \u4E0A\u4E0B\u6587\u901F\u5EA6\uFF0C\u5199\u5165\u4EEA\u8868\u76D8\u66F2\u7EBF", onClick: () => void curveBench(m.name), children: "\u66F2\u7EBF" })
              ] }) })
            ] }, m.name);
          }),
          !models.length && !err ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 5, className: "mute", children: "\u52A0\u8F7D\u4E2D\u2026" }) }) : null
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconDownloadOutline16, {}),
        " \u62C9\u53D6\u6A21\u578B",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "a",
          {
            href: "https://ollama.com/library",
            target: "_blank",
            rel: "noreferrer",
            style: { color: "var(--dsw-alias-brand-primary)", fontSize: 12, fontWeight: 400, textDecoration: "none" },
            children: "\u5B98\u65B9\u6A21\u578B\u5E93 ollama.com/library \u2197"
          }
        )
      ] }),
      jobs.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { margin: "4px 0 10px" }, children: [
        jobs.map((j) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cells", style: { justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: j.state === "running" ? "ongoing" : "warning" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: j.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "mute", children: [
              j.state === "running" ? `\u4E0B\u8F7D\u4E2D ${j.pct}% \xB7 ` : `\u5DF2\u4E2D\u65AD\uFF08${j.pct}% \u65F6\u65AD\u5F00\uFF09\xB7 `,
              new Date(j.started).toLocaleTimeString(),
              " \u5F00\u59CB"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cells", children: j.state !== "running" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => void pullModel(j.name), children: "\u7EE7\u7EED" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => updateJobs((js) => js.filter((x) => x.name !== j.name)), children: "\u79FB\u9664" })
          ] }) : null })
        ] }, j.name)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mute", children: "\u5173\u95ED\u9875\u9762\u4F1A\u65AD\u5F00 Ollama \u7684\u62C9\u53D6\u8FDE\u63A5\uFF0C\u4E0B\u8F7D\u505C\u5728\u65AD\u70B9\uFF1B\u70B9\u201C\u7EE7\u7EED\u201D\u4ECE\u65AD\u70B9\u7EED\u4F20\uFF0C\u4E0D\u4F1A\u91CD\u5934\u4E0B\u8F7D\u3002" })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { style: { width: 280 }, value: pullName, onChange: (e) => setPullName(e.currentTarget.value), placeholder: "\u6A21\u578B\u540D\uFF0C\u5982 qwen3-coder:30b" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: !!pullSt && pullSt.pct > 0 && pullSt.pct < 100, onClick: () => void pullModel(), children: "\u5F00\u59CB\u62C9\u53D6" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutline16, {}), disabled: catBusy, onClick: () => void browseCatalog(), children: catBusy ? "\u6293\u53D6\u4E2D\u2026" : catRepos ? `\u76EE\u5F55 ${catRepos.length}` : "\u6D4F\u89C8\u8FDC\u7AEF\u76EE\u5F55" })
      ] }),
      pullSt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: pullSt.pct + "%" } }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: pullSt.text }),
        pullStall ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "warn", children: "\u8FDB\u5EA6\u505C\u6EDE\uFF1F\u70B9\u300C\u53D6\u6D88\u300D\u540E\u91CD\u65B0\u62C9\u53D6\u4F1A\u65AD\u70B9\u7EED\u4F20" }) : null,
        pullSt.pct > 0 && pullSt.pct < 100 && pullAbort.current ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", onClick: () => pullAbort.current?.abort(), children: "\u53D6\u6D88" }) : null
      ] }) : null,
      catErr ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "mute", children: catErr }) : null,
      catRepos ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { style: { width: 240 }, value: catQ, onChange: (e) => setCatQ(e.currentTarget.value), placeholder: `\u8FC7\u6EE4 ${catRepos.length} \u4E2A\u6A21\u578B\u2026` }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => setCatSort((s) => s === "name" ? "size" : "name"), children: [
            "\u6392\u5E8F\uFF1A",
            catSort === "name" ? "\u540D\u79F0" : "\u5927\u5C0F"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              variant: "ghost",
              size: "sm",
              disabled: !!scan?.running,
              onClick: () => void startScan(),
              children: scan?.running ? `\u626B\u63CF\u4F53\u79EF ${scan.done}/${scan.total}\u2026` : "\u6293\u5168\u90E8\u4F53\u79EF"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "mute", children: [
            catList.length,
            " \u4E2A\u5339\u914D \xB7 \u70B9\u51FB\u540D\u79F0\u76F4\u63A5\u5F00\u59CB\u62C9\u53D6"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "chips", children: [
          catView.map((r) => {
            const inf = infoMap[r];
            const latest = inf?.tags?.find((t) => t.id === r + ":latest");
            const shown = latest ?? inf?.tags?.[0];
            const tip = inf?.desc ? inf.desc + "\n\n" + (inf.tags ?? []).slice(0, 10).map((t) => `${t.id} \xB7 ${t.gb} GB`).join("\n") + ((inf.tags?.length ?? 0) > 10 ? `
\u2026\u5171 ${inf.tags.length} \u4E2A tag` : "") : void 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                className: "chip" + (pullName === r ? " on" : ""),
                disabled: !!pullSt && pullSt.pct > 0 && pullSt.pct < 100,
                title: tip,
                onClick: () => {
                  setPullName(r);
                  void pullModel(r);
                },
                children: [
                  r,
                  shown ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.6 }, children: [
                    " \xB7 ",
                    shown.gb,
                    "GB"
                  ] }) : inf?.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.45 }, children: " \xB7 ?" }) : null
                ]
              },
              r
            );
          }),
          !catView.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: "\u65E0\u5339\u914D" }) : null
        ] }),
        catList.length > 12 && !scan?.running && catList.some((r) => !infoMap[r]?.tags) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mute", children: "\u90E8\u5206\u6A21\u578B\u8FD8\u6CA1\u4F53\u79EF\u2014\u2014\u70B9\u201C\u6293\u5168\u90E8\u4F53\u79EF\u201D\u540E\u53F0\u626B\u4E00\u904D\uFF08\u5E76\u53D1\u6293\u53D6\u30017 \u5929\u7F13\u5B58\uFF0C\u53EF\u5173\u9762\u677F\u7B49\u5B83\u8DD1\u5B8C\uFF09\u3002" }) : null
      ] }) : !catErr ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mute", children: [
        "\u76EE\u5F55\u6765\u81EA ollama.com\uFF08\u670D\u52A1\u5668\u7AEF\u6293\u53D6\u3001\u7F13\u5B58 24h\uFF09\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u540D\u5B57\u62C9\u53D6\u3002HF \u6A21\u578B\u53EF\u76F4\u63A5\u62C9\uFF1A",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "hf.co/\u4ED3\u5E93/Qwen3-4B-GGUF:Q4_K_M" }),
        "\uFF08\u670D\u52A1\u5668\u81EA\u5DF1\u8FDE hf.co\uFF0C\u96F6\u4E2D\u8F6C\uFF09\uFF1BModelScope \u4E0D\u88AB Ollama \u652F\u6301\uFF0C\u8BF7\u5728\u4E0B\u65B9\u201C\u5BFC\u5165\u201D\u8282\u8D70\u6D41\u6C34\u7EBF\u3002"
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconDownloadOutline16, {}),
        " \u4ECE HF / ModelScope \u5BFC\u5165 GGUF ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "muted", children: "\xB7 \u670D\u52A1\u5668\u4E0B\u8F7D \u2192 \u4E0A\u4F20\u5230\u4F60\u7684 Ollama \u2192 \u81EA\u52A8\u6CE8\u518C" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mute", children: [
        "\u9009\u578B\u901F\u67E5\uFF1AQ8\u2248\u65E0\u635F \xB7 Q6_K \u8FD1\u65E0\u635F \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "UD-Q4_K_XL / Q4_K_M \u751C\u70B9" }),
        " \xB7 Q3 \u8D77\u660E\u663E\u6389\u667A \xB7 Q2/IQ1 \u4EC5\u6551\u6025\u3002UD=Unsloth \u52A8\u6001\u91CF\u5316\uFF08\u540C\u4F53\u79EF\u8D28\u91CF\u66F4\u4F18\uFF09\u3002\u539F\u5219\uFF1A\u9009\u80FD\u6574\u4E2A\u585E\u8FDB\u663E\u5B58\u7684\u6700\u5927\u91CF\u5316\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "chip" + (srcSel === "hf" ? " on" : ""), onClick: () => {
          setSrcSel("hf");
          setSrcResults(null);
          setGgufFiles(null);
          setSrcRepo("");
        }, children: "HuggingFace \u955C\u50CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "chip" + (srcSel === "ms" ? " on" : ""), onClick: () => {
          setSrcSel("ms");
          setSrcResults(null);
          setGgufFiles(null);
          setSrcRepo("");
        }, children: "ModelScope" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Input,
          {
            style: { width: 240 },
            value: srcQ,
            onChange: (e) => setSrcQ(e.currentTarget.value),
            placeholder: srcSel === "hf" ? "\u641C GGUF\uFF0C\u5982 qwen3 coder" : "\u641C\u6A21\u578B\uFF0C\u5982 Qwen3",
            onKeyDown: (e) => {
              if (e.key === "Enter") void searchSource();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: srcBusy || !srcQ.trim(), onClick: () => void searchSource(), children: srcBusy ? "\u641C\u7D22\u4E2D\u2026" : "\u641C\u7D22" })
      ] }),
      srcErr ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "mute", children: srcErr }) : null,
      srcResults && srcResults.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mute", children: [
          srcResults.length,
          " \u4E2A\u4ED3\u5E93 \xB7 \u70B9\u4ED3\u5E93\u540D\u5217\u51FA\u5B83\u7684 .gguf \u6587\u4EF6",
          srcRepo ? ` \xB7 \u5F53\u524D\u9009\u4E2D\uFF1A${srcRepo}` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "chips", children: srcResults.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "chip" + (srcRepo === m.id ? " on" : ""), onClick: () => void pickRepo(m.id), children: [
          m.id,
          m.downloads > 1e3 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.55 }, children: [
            " \xB7 ",
            (m.downloads / 1e4).toFixed(1),
            "\u4E07\u4E0B\u8F7D"
          ] }) : null
        ] }, m.id)) })
      ] }) : srcResults ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mute", children: "\u65E0\u7ED3\u679C\uFF0C\u6362\u4E2A\u5173\u952E\u8BCD\u8BD5\u8BD5" }) : null,
      filesBusy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mute", children: "\u8BFB\u53D6\u6587\u4EF6\u5217\u8868\u2026" }) : null,
      ggufFiles && ggufFiles.length ? (() => {
        const base2 = (p) => p.split("/").pop() || p;
        const isAux = (p) => /^(mmproj|imatrix)/i.test(base2(p));
        const main = ggufFiles.filter((f) => !isAux(f.path));
        const aux = ggufFiles.filter((f) => isAux(f.path));
        const budget = parseFloat(vramBudget);
        const hasBudget = !isNaN(budget) && budget > 0;
        const fits = main.filter((f) => f.size / 1073741824 <= budget);
        const rec = hasBudget && fits.length ? fits[fits.length - 1] : null;
        const row = (f, starred) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { style: starred ? { background: "var(--dsw-alias-interactive-bg-hover)" } : void 0, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            starred ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ok", children: "\u2B50 " }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: base2(f.path) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            (f.size / 1073741824).toFixed(2),
            " GB"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
            srcSel === "hf" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                variant: "primary",
                size: "sm",
                title: "\u670D\u52A1\u5668\u76F4\u62C9\uFF1A\u4F60\u7684 Ollama \u81EA\u5DF1\u53BB hf.co \u4E0B\u8F7D\uFF0C\u4E0D\u7ECF\u8FC7\u672C\u673A\uFF08\u9700\u670D\u52A1\u5668\u7F51\u7EDC\u901A\uFF09",
                onClick: () => {
                  const n = "hf.co/" + srcRepo + ":" + base2(f.path).replace(/\.gguf$/i, "");
                  setPullName(n);
                  void pullModel(n);
                },
                children: "\u76F4\u62C9"
              }
            ) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => void importFile(f), children: "\u5BFC\u5165" })
          ] }) })
        ] }, f.path);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { style: { width: 170 }, value: vramBudget, onChange: (e) => setVramBudget(e.currentTarget.value), placeholder: "\u663E\u5B58\u9884\u7B97 GB\uFF0C\u5982 16" }),
            rec ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ok", children: [
              "\u2B50 \u63A8\u8350 ",
              base2(rec.path),
              "\uFF08\u9884\u7B97\u5185\u6700\u5927\u7684\u91CF\u5316\uFF09"
            ] }) : hasBudget ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: "\u9884\u7B97\u5185\u6CA1\u6709\u5B8C\u6574\u91CF\u5316\uFF0C\u8C03\u5927\u9884\u7B97\u6216\u9009\u6700\u5C0F\u7684\u8BD5\u8BD5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mute", children: "\u586B\u663E\u5B58\u9884\u7B97\u81EA\u52A8\u6807\u63A8\u8350 \xB7 Q8\u2248\u65E0\u635F Q6\u8FD1\u65E0\u635F Q4_K/XL\u751C\u70B9 Q3\u8D77\u660E\u663E\u6389\u667A \xB7 UD=\u52A8\u6001\u91CF\u5316\u66F4\u4F18" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "table", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: ".gguf \u6587\u4EF6\uFF08\u6309\u4F53\u79EF\u5347\u5E8F\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4F53\u79EF" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {})
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: main.map((f) => row(f, rec?.path === f.path)) })
          ] }),
          aux.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { className: "mute", children: [
              "\u8F85\u52A9\u6587\u4EF6 ",
              aux.length,
              " \u4E2A\uFF08mmproj=\u89C6\u89C9\u6295\u5F71 / imatrix=\u6821\u51C6\u77E9\u9635\u2014\u2014\u90FD\u4E0D\u662F\u5B8C\u6574\u6A21\u578B\uFF0C\u4E0D\u7528\u5BFC\u5165\uFF09"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", { className: "table", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: aux.map((f) => row(f)) }) })
          ] }) : null
        ] });
      })() : null,
      imports.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 12 }, children: imports.slice(0, 10).map((j) => {
        const pct = j.bytesTotal ? Math.min(100, Math.round(j.bytesDone / j.bytesTotal * 100)) : j.state === "done" ? 100 : 0;
        const active = j.state === "downloading" || j.state === "uploading" || j.state === "creating";
        const label = j.state === "downloading" ? `\u4E0B\u8F7D\u4E2D ${pct}%` : j.state === "uploading" ? `\u4E0A\u4F20\u4E2D ${pct}%` : j.state === "creating" ? "\u6CE8\u518C\u4E2D\u2026" : j.state === "done" ? "\u5B8C\u6210 \u2713" : j.state === "cancelled" ? "\u5DF2\u53D6\u6D88" : `\u5931\u8D25: ${j.error ?? ""}`;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cells", style: { justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: j.state === "done" ? "done" : j.state === "error" || j.state === "cancelled" ? "error" : "ongoing" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: j.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "mute", children: [
              label,
              j.bytesTotal ? ` \xB7 ${(j.bytesDone / 1073741824).toFixed(2)}/${(j.bytesTotal / 1073741824).toFixed(2)} GB` : "",
              " \xB7 ",
              new Date(j.started).toLocaleTimeString()
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cells", children: [
            active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", onClick: () => {
              void fetch(window.location.origin + "/ollama-monitor/import-cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: j.id }) });
            }, children: "\u53D6\u6D88" }) : j.state !== "done" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", title: "\u4ECE\u65AD\u70B9\u7EE7\u7EED\uFF08\u5DF2\u4E0B\u8F7D\u7684\u90E8\u5206\u4E0D\u4F1A\u91CD\u4E0B\uFF09", onClick: () => {
              void fetch(window.location.origin + "/ollama-monitor/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: j.source, repo: j.repo, file: j.file, name: j.name }) });
            }, children: "\u7EE7\u7EED" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: pct + "%" } }) })
          ] })
        ] }, j.id);
      }) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlayOutline16, {}),
        " \u7F16\u7A0B\u540C\u9898\u7ADE\u6280 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "muted", children: [
          "\xB7 ",
          PK_PROBLEMS.length,
          " \u9898 \xB7 \u6D4F\u89C8\u5668\u672C\u5730\u5224\u5206"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "row", children: [
        models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "mute", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: !!pkSel[m.name], onChange: (e) => setPkSel((s) => ({ ...s, [m.name]: e.target.checked })) }),
          " ",
          m.name
        ] }, m.name)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: pkBusy, onClick: () => void runPk(), children: pkBusy ? "\u6BD4\u8D5B\u4E2D\u2026" : "\u5F00\u8D5B" })
      ] }),
      pkScore.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u76F8\u5BF9\u5F97\u5206" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u65AD\u8A00" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u5B8C\u6574\u89E3\u9898" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: [...pkScore].sort((a, b) => b.pass - a.pass).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: s.model }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: Math.round(s.pass / Math.max(1, s.total) * 100) + "%" } }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            s.pass,
            "/",
            s.total
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            s.solved,
            "/8"
          ] })
        ] }, s.model)) })
      ] }) : null,
      pkLog.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: "mute", children: "\u8FC7\u7A0B\u65E5\u5FD7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: pkLog.join("\n") })
      ] }) : null
    ] })
  ] });
}
function apply(ctx) {
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register(
    { name: "settings.plugins.tab", id: "ollama-monitor", order: 60, label: "Ollama Monitor" },
    OllamaPanel
  ));
}
return module.exports; } });
