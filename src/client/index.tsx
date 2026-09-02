/**
 * Ollama Monitor 交互面板（web 半侧）· 贴合 DSH 设计语言
 * 挂载点: 设置 → 插件 → "Ollama Monitor" 标签页
 * 数据链路: 浏览器直连用户配置的 Ollama URL（服务器需设置 OLLAMA_ORIGINS=*）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Input,
  StateDot,
  IconRefreshOutline16,
  IconDownloadOutline16,
  IconPlayOutline16,
  IconWarningOutline16,
  IconCheckOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'

export const inject = ['slots']

// ---------- 编程评测题库（与 code-pk.mjs 同步的 easy-v1 套件） ----------
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

async function askPk(base: string, model: string, prompt: string): Promise<string> {
  const call = (extra?: Record<string, unknown>) => fetch(base + '/api/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 8192, temperature: 0 }, ...extra }),
  })
  let res = await call({ think: false })
  let j = await res.json().catch(() => ({}) as any) as any
  if (!res.ok || j.error) {
    if (/think/i.test(String(j.error || ''))) {
      res = await call()
      j = await res.json().catch(() => ({}) as any) as any
      if (!res.ok || j.error) throw new Error(j.error || ('HTTP ' + res.status))
      return ((j.response || '') + '\n' + (j.thinking || '')).trim()
    }
    throw new Error(j.error || ('HTTP ' + res.status))
  }
  return ((j.response || '') + '\n' + (j.thinking || '')).trim()
}

// 统一用 DSH --dsw-alias-* 主题令牌, 随明暗自适应; 不做突兀的卡片底色
const CSS = `
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
`

type Model = any

function OllamaPanel(): React.ReactElement {
  const [url, setUrl] = useState(() => localStorage.getItem('ollama-monitor.url') || 'http://127.0.0.1:11434')
  const [base, setBase] = useState(() => localStorage.getItem('ollama-monitor.url') || 'http://127.0.0.1:11434')
  const [err, setErr] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [psMap, setPsMap] = useState<Record<string, any>>({})
  const [auto, setAuto] = useState(false)
  const [pullName, setPullName] = useState('')
  const [pullSt, setPullSt] = useState<{ pct: number; text: string } | null>(null)
  const [benchSt, setBenchSt] = useState<Record<string, string>>({})

  // 模型目录（同源代理 /ollama-monitor/catalog，服务器端抓 ollama.com）
  const [catRepos, setCatRepos] = useState<string[] | null>(null)
  const [catErr, setCatErr] = useState('')
  const [catQ, setCatQ] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  // 每个模型的大小/描述（按需补抓，仅当前可见的 ≤12 个）
  const [infoMap, setInfoMap] = useState<Record<string, { desc?: string; tags?: Array<{ id: string; gb: number }>; error?: string }>>({})
  const infoInflight = useRef<Set<string>>(new Set())
  const infoFailed = useRef<Set<string>>(new Set())

  const [pkSel, setPkSel] = useState<Record<string, boolean>>({})
  const [pkLog, setPkLog] = useState<string[]>([])
  const [pkBusy, setPkBusy] = useState(false)
  const [pkScore, setPkScore] = useState<Array<{ model: string; pass: number; total: number; solved: number }>>([])

  // 下载任务追踪：localStorage 持久化，重开面板仍可见（关闭页面会中断 Ollama 拉取连接，可断点续传）
  type Job = { name: string; started: number; pct: number; state: 'running' | 'interrupted' }
  const [jobs, setJobs] = useState<Job[]>(() => {
    try { return JSON.parse(localStorage.getItem('ollama-monitor.jobs') || '[]') } catch { return [] }
  })
  const updateJobs = (fn: (js: Job[]) => Job[]) => {
    setJobs((js) => {
      const next = fn(js)
      try { localStorage.setItem('ollama-monitor.jobs', JSON.stringify(next)) } catch { /* 忽略 */ }
      return next
    })
  }

  // 已安装列表排序
  const [sortKey, setSortKey] = useState<'name' | 'size'>('size')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  // 目录芯片排序
  const [catSort, setCatSort] = useState<'name' | 'size'>('name')

  // HF / ModelScope 导入
  const [srcSel, setSrcSel] = useState<'hf' | 'ms'>('hf')
  const [srcQ, setSrcQ] = useState('')
  const [srcBusy, setSrcBusy] = useState(false)
  const [srcResults, setSrcResults] = useState<Array<{ id: string; downloads: number }> | null>(null)
  const [srcErr, setSrcErr] = useState('')
  const [srcRepo, setSrcRepo] = useState('')
  const [ggufFiles, setGgufFiles] = useState<Array<{ path: string; size: number }> | null>(null)
  const [filesBusy, setFilesBusy] = useState(false)
  const [imports, setImports] = useState<any[]>([])
  const prevDoneCount = useRef(0)
  // GGUF 选型：显存预算 → 自动标推荐（能塞进预算的最大量化）
  const [vramBudget, setVramBudget] = useState('')

  const refresh = useCallback(async (silent?: boolean) => {
    if (!silent) setErr('')
    try {
      const t = await (await fetch(base + '/api/tags')).json()
      const p = await (await fetch(base + '/api/ps')).json()
      setModels(t.models || [])
      const m: Record<string, any> = {}
      for (const x of p.models || []) m[x.name] = x
      setPsMap(m)
    } catch (e: any) {
      if (!silent) {
        setErr('连接失败: ' + (e.message || e) + ' —— 若是跨域拦截，请在服务器容器环境变量加 OLLAMA_ORIGINS=* 后重启 Ollama')
        setModels([])
      }
    }
  }, [base])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!auto) return
    const h = setInterval(() => void refresh(true), 5000)
    return () => clearInterval(h)
  }, [auto, refresh])

  const connect = () => {
    localStorage.setItem('ollama-monitor.url', url.replace(/\/$/, ''))
    setBase(url.replace(/\/$/, ''))
  }

  const pullModel = async (nameArg?: string) => {
    const name = (nameArg ?? pullName).trim()
    if (!name) return
    setPullSt({ pct: 0, text: 'starting…' })
    updateJobs((js) => [...js.filter((j) => j.name !== name), { name, started: Date.now(), pct: 0, state: 'running' }])
    // 拉取期间定期刷新已安装列表（模型落盘后就能看到）
    const poll = setInterval(() => void refresh(true), 8000)
    const ac = new AbortController()
    pullAbort.current = ac
    try {
      const res = await fetch(base + '/api/pull', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name, stream: true }),
        signal: ac.signal,
      })
      const rd = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const r = await rd.read()
        if (r.done) break
        buf += dec.decode(r.value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
          if (!line) continue
          let f: any; try { f = JSON.parse(line) } catch { continue }
          if (f.error) throw new Error(f.error)
          if (f.total && f.completed) {
            const pct = Math.round((f.completed / f.total) * 100)
            setPullSt({ pct, text: (f.completed / 1073741824).toFixed(2) + ' / ' + (f.total / 1073741824).toFixed(2) + ' GB' })
            updateJobs((js) => js.map((j) => (j.name === name ? { ...j, pct } : j)))
          }
          else if (f.status) setPullSt({ pct: 0, text: f.status })
          if (f.status === 'success') setPullSt({ pct: 100, text: '完成' })
        }
      }
      setPullSt((s) => (s ? { ...s, pct: 100, text: '完成，列表已刷新' } : s))
      updateJobs((js) => js.filter((j) => j.name !== name))
      await refresh(false)
    } catch (e: any) {
      const aborted = e?.name === 'AbortError'
      setPullSt({ pct: 0, text: aborted ? '已取消（断点保留，可继续拉取）' : '失败: ' + (e.message || e) })
      updateJobs((js) => js.map((j) => (j.name === name ? { ...j, state: 'interrupted' as const } : j)))
    } finally {
      clearInterval(poll)
      pullAbort.current = null
    }
  }
  const pullAbort = useRef<AbortController | null>(null)

  // 直拉卡死检测：45 秒进度无变化 → 提示取消重试（断点续传）
  const [pullStall, setPullStall] = useState(false)
  const pullStRef = useRef<{ pct: number } | null>(null)
  pullStRef.current = pullSt
  const pullProgressAt = useRef(Date.now())
  useEffect(() => { if (pullSt) pullProgressAt.current = Date.now() }, [pullSt?.pct])
  useEffect(() => {
    const h = setInterval(() => {
      const s = pullStRef.current
      const active = !!s && s.pct > 0 && s.pct < 100
      setPullStall(active && Date.now() - pullProgressAt.current > 45_000)
    }, 5000)
    return () => clearInterval(h)
  }, [])

  // 面板重开时：localStorage 里 running 状态的任务实际已中断（连接随页面关闭断开）
  useEffect(() => {
    updateJobs((js) => js.map((j) => (j.state === 'running' ? { ...j, state: 'interrupted' as const } : j)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const browseCatalog = async () => {
    setCatBusy(true); setCatErr('')
    try {
      const r = await fetch(window.location.origin + '/ollama-monitor/catalog')
      const j = await r.json().catch(() => ({}) as any) as any
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status))
      setCatRepos(j.repos || [])
      // 顺手把服务端已有的体积缓存整包拿回来
      void fetch(window.location.origin + '/ollama-monitor/model-info?all=1')
        .then((r2) => r2.json())
        .then((j2: any) => { if (j2?.info) setInfoMap((s) => ({ ...j2.info, ...s })) })
        .catch(() => {})
      void pollScan()
    } catch (e: any) {
      setCatErr('目录获取失败: ' + (e.message || e) + ' —— 若 404，需重启 DSH 让 node 半侧注册该路由')
    } finally {
      setCatBusy(false)
    }
  }

  // 全量体积扫描：启动 + 轮询进度，结束后整包刷新缓存
  const [scan, setScan] = useState<{ running: boolean; done: number; total: number } | null>(null)
  const scanPolling = useRef(false)
  const pollScan = async () => {
    if (scanPolling.current) return
    scanPolling.current = true
    try {
      for (;;) {
        const s = await fetch(window.location.origin + '/ollama-monitor/scan').then((r) => r.json()).catch(() => null)
        if (!s) break
        setScan(s)
        if (!s.running) {
          if (s.done > 0 || s.total > 0) {
            const j2 = await fetch(window.location.origin + '/ollama-monitor/model-info?all=1').then((r) => r.json()).catch(() => null)
            if (j2?.info) setInfoMap((prev) => ({ ...j2.info, ...prev }))
          }
          break
        }
        await new Promise((res) => setTimeout(res, 1500))
      }
    } finally {
      scanPolling.current = false
    }
  }
  const startScan = async () => {
    await fetch(window.location.origin + '/ollama-monitor/scan', { method: 'POST' }).catch(() => {})
    void pollScan()
  }
  const catList = useMemo(
    () => (catRepos ?? []).filter((r) => r.includes(catQ.trim().toLowerCase())),
    [catRepos, catQ],
  )

  // 过滤结果 ≤12 个时自动补抓这些模型的体积信息（7 天服务端缓存）
  useEffect(() => {
    if (!catRepos) return
    const visible = catList.slice(0, 12).filter((n) => !infoMap[n] && !infoInflight.current.has(n) && !infoFailed.current.has(n))
    if (!visible.length) return
    for (const n of visible) infoInflight.current.add(n)
    const ctrl = new AbortController()
    fetch(window.location.origin + '/ollama-monitor/model-info?names=' + encodeURIComponent(visible.join(',')), { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: any) => {
        const got = (j?.info || {}) as Record<string, any>
        for (const n of visible) if (got[n]?.error) infoFailed.current.add(n)
        setInfoMap((s) => ({ ...s, ...got }))
      })
      .catch(() => { /* 面板刷新重试 */ })
      .finally(() => { for (const n of visible) infoInflight.current.delete(n) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catList, catRepos])

  const catView = useMemo(() => {
    const arr = [...catList]
    if (catSort === 'size') arr.sort((a, b) => (infoMap[a]?.tags?.[0]?.gb ?? Infinity) - (infoMap[b]?.tags?.[0]?.gb ?? Infinity))
    return arr
  }, [catList, catSort, infoMap])

  // ---- HF / ModelScope 导入 ----
  const searchSource = async () => {
    setSrcBusy(true); setSrcErr('')
    try {
      const r = await fetch(window.location.origin + `/ollama-monitor/hf-search?source=${srcSel}&q=` + encodeURIComponent(srcQ.trim()))
      const j = await r.json().catch(() => ({}) as any) as any
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status))
      setSrcResults(j.models || [])
    } catch (e: any) {
      setSrcErr('搜索失败: ' + (e.message || e))
    } finally {
      setSrcBusy(false)
    }
  }
  const pickRepo = async (id: string) => {
    setSrcRepo(id); setFilesBusy(true); setGgufFiles(null)
    try {
      const r = await fetch(window.location.origin + `/ollama-monitor/hf-files?source=${srcSel}&repo=` + encodeURIComponent(id))
      const j = await r.json().catch(() => ({}) as any) as any
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status))
      setGgufFiles((j.files || []).sort((a: any, b: any) => a.size - b.size))
    } catch (e: any) {
      setSrcErr('读取文件列表失败: ' + (e.message || e))
    } finally {
      setFilesBusy(false)
    }
  }
  const importFile = async (f: { path: string; size: number }) => {
    const stem = (f.path.split('/').pop() || 'model').replace(/\.gguf$/i, '')
    const name = (srcSel === 'ms' ? 'ms-' : 'hf-')
      + (srcRepo.split('/').pop() || 'model').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
      + '-' + stem.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
    await fetch(window.location.origin + '/ollama-monitor/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: srcSel, repo: srcRepo, file: f.path, name }),
    }).catch(() => {})
  }

  // 导入任务轮询（2s；有新完成任务时刷新已安装列表）
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!alive) return
      try {
        const j = await fetch(window.location.origin + '/ollama-monitor/import').then((r) => r.json())
        const jobs: any[] = j?.jobs ?? []
        setImports(jobs)
        const doneN = jobs.filter((x: any) => x.state === 'done').length
        if (doneN > prevDoneCount.current) void refresh(true)
        prevDoneCount.current = doneN
      } catch { /* 忽略 */ }
    }
    void tick()
    const h = setInterval(tick, 2000)
    return () => { alive = false; clearInterval(h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  const quickBench = async (name: string) => {
    setBenchSt((s) => ({ ...s, [name]: '运行中…' }))
    try {
      const t0 = performance.now()
      const r = await fetch(base + '/api/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name, prompt: '请从1数到30，每个数字用逗号隔开，然后解释为什么学习很重要', stream: false, think: false, options: { num_predict: 256, temperature: 0 } }),
      })
      const j = await r.json().catch(() => ({}) as any) as any
      if (j.error) throw new Error(j.error)
      const wall = (performance.now() - t0) / 1000
      const tps = j.eval_count && j.eval_duration ? (j.eval_count / (j.eval_duration / 1e9)).toFixed(1) : '?'
      setBenchSt((s) => ({ ...s, [name]: tps + ' tok/s' }))
    } catch (e: any) {
      setBenchSt((s) => ({ ...s, [name]: '失败' }))
    }
  }

  const curveBench = async (name: string) => {
    setBenchSt((s) => ({ ...s, [name]: '曲线扫描中…' }))
    try {
      const r = await fetch(window.location.origin + '/ollama-monitor/bench-curve', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name }),
      })
      const j = await r.json().catch(() => ({}) as any) as any
      if (j.error) throw new Error(j.error)
      const pts = (j.curve || []).map((p: any) => p.ctx / 1024 + 'k:' + p.eval_tps).join('  ')
      setBenchSt((s) => ({ ...s, [name]: pts }))
    } catch {
      setBenchSt((s) => ({ ...s, [name]: '曲线失败' }))
    }
  }

  const runPk = async () => {
    const chosen = models.map((m) => m.name).filter((n: string) => pkSel[n])
    if (chosen.length === 0) { setPkLog(['先勾选至少一个参赛模型']); return }
    setPkBusy(true); setPkScore([]); setPkLog(['开赛：' + chosen.join(' vs ') + '，共 ' + PK_PROBLEMS.length + ' 题'])
    const scores: Array<{ model: string; pass: number; total: number; solved: number }> = []
    for (const model of chosen) {
      setPkLog((l) => [...l, '—— ' + model])
      let pass = 0, total = 0, solved = 0
      for (const p of PK_PROBLEMS) {
        const fnName = p.sig.split('(')[0].trim()
        const prompt = `用 JavaScript 实现函数 ${p.sig}。\n要求: ${p.desc}。\n只允许输出一个 markdown 代码块，块内只包含函数定义（不要 console.log，不要测试代码，不要解释文字）。`
        let out = ''
        try { out = await askPk(base, model, prompt) } catch (e: any) { total += p.tests.length; setPkLog((l) => [...l, '  ✗ ' + p.id + ' 请求失败']); continue }
        let fn: ((...a: unknown[]) => unknown) | null = null
        for (const cand of extractPkCandidates(out, fnName)) {
          try {
            const f = new Function(`"use strict";\n${cand}\nreturn typeof ${fnName} === 'function' ? ${fnName} : null;`)()
            if (typeof f === 'function') { fn = f as (...a: unknown[]) => unknown; break }
          } catch { /* 下一个候选 */ }
        }
        if (typeof fn !== 'function') { total += p.tests.length; setPkLog((l) => [...l, '  ✗ ' + p.id + ' 未提取到代码']); continue }
        let ok = 0
        for (const t of p.tests) {
          try { if (JSON.stringify(fn(...t.args)) === JSON.stringify(t.want)) ok++ } catch { /* 断言失败 */ }
        }
        pass += ok; total += p.tests.length
        if (ok === p.tests.length) solved++
        setPkLog((l) => [...l, `  ${ok === p.tests.length ? '✓' : ok > 0 ? '~' : '✗'} ${p.id} ${ok}/${p.tests.length}`])
      }
      scores.push({ model, pass, total, solved })
      setPkScore([...scores])
    }
    setPkBusy(false)
    setPkLog((l) => [...l, '比赛结束——上方表格为最终成绩'])
  }

  return (
    <div className="om">
      <style>{CSS}</style>

      <div className="row">
        <Input style={{ width: 320 }} value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="Ollama 地址" />
        <Button variant="primary" size="sm" onClick={connect}>连接</Button>
        <Button variant="ghost" size="sm" icon={<IconRefreshOutline16 />} onClick={() => void refresh()}>刷新</Button>
        <label className="mute"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动刷新 5s</label>
      </div>
      {err ? <p role="alert" style={{ color: 'var(--dsw-alias-interactive-bg-hover-danger)', background: 'var(--dsw-alias-interactive-bg-hover-danger)' }}>{err}</p> : null}

      <section className="sec">
        <h3><IconDownloadOutline16 /> 已安装模型 <span className="muted">· {models.length} 个 · 点表头排序</span></h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => { setSortKey('name'); setSortDir((d) => (sortKey === 'name' ? -d as 1 | -1 : 1)) }}>
                模型{sortKey === 'name' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
              <th>参数 / 量化</th>
              <th style={{ cursor: 'pointer' }} onClick={() => { setSortKey('size'); setSortDir((d) => (sortKey === 'size' ? -d as 1 | -1 : -1)) }}>
                体积{sortKey === 'size' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
              <th>显存分布</th>
              <th>速度</th>
            </tr>
          </thead>
          <tbody>
            {[...models].sort((a, b) => {
              const cmp = sortKey === 'name'
                ? String(a.name).localeCompare(String(b.name))
                : (a.size ?? 0) - (b.size ?? 0)
              return cmp * sortDir
            }).map((m) => {
              const p = psMap[m.name]
              const loaded = !!p
              const spill = loaded ? (p.size - p.size_vram) / 1073741824 : 0
              return (
                <tr key={m.name}>
                  <td><span className="cells">{loaded ? <StateDot state="done" /> : null} {m.name}</span></td>
                  <td className="mute">{m.details?.parameter_size} · {m.details?.quantization_level}</td>
                  <td>{(m.size / 1073741824).toFixed(1)} GB</td>
                  <td>{loaded
                    ? <span>GPU {(p.size_vram / 1073741824).toFixed(1)}{spill > 0.05 ? <span className="warn"> + 内存 {spill.toFixed(1)}</span> : null}</span>
                    : <span className="mute">未加载</span>}</td>
                  <td>{benchSt[m.name] ? <span className="mute">{benchSt[m.name]}</span> : <span className="cells">
                    <Button variant="ghost" size="sm" onClick={() => void quickBench(m.name)}>测速</Button>
                    <Button variant="ghost" size="sm" title="扫描 4k/16k/32k 上下文速度，写入仪表盘曲线" onClick={() => void curveBench(m.name)}>曲线</Button>
                  </span>}</td>
                </tr>
              )
            })}
            {!models.length && !err ? <tr><td colSpan={5} className="mute">加载中…</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="sec">
        <h3>
          <IconDownloadOutline16 /> 拉取模型
          <a
            href="https://ollama.com/library"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--dsw-alias-brand-primary)', fontSize: 12, fontWeight: 400, textDecoration: 'none' }}
          >
            官方模型库 ollama.com/library ↗
          </a>
        </h3>
        {jobs.length ? (
          <div style={{ margin: '4px 0 10px' }}>
            {jobs.map((j) => (
              <div key={j.name} className="cells" style={{ justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
                <span className="cells">
                  <StateDot state={j.state === 'running' ? 'ongoing' : 'warning'} />
                  <span>{j.name}</span>
                  <span className="mute">{j.state === 'running' ? `下载中 ${j.pct}% · ` : `已中断（${j.pct}% 时断开）· `}{new Date(j.started).toLocaleTimeString()} 开始</span>
                </span>
                <span className="cells">
                  {j.state !== 'running'
                    ? <>
                      <Button variant="ghost" size="sm" onClick={() => void pullModel(j.name)}>继续</Button>
                      <Button variant="ghost" size="sm" onClick={() => updateJobs((js) => js.filter((x) => x.name !== j.name))}>移除</Button>
                    </>
                    : null}
                </span>
              </div>
            ))}
            <p className="mute">关闭页面会断开 Ollama 的拉取连接，下载停在断点；点“继续”从断点续传，不会重头下载。</p>
          </div>
        ) : null}
        <div className="row">
          <Input style={{ width: 280 }} value={pullName} onChange={(e) => setPullName(e.currentTarget.value)} placeholder="模型名，如 qwen3-coder:30b" />
          <Button variant="primary" size="sm" disabled={!!pullSt && pullSt.pct > 0 && pullSt.pct < 100} onClick={() => void pullModel()}>开始拉取</Button>
          <Button variant="ghost" size="sm" icon={<IconRefreshOutline16 />} disabled={catBusy} onClick={() => void browseCatalog()}>
            {catBusy ? '抓取中…' : catRepos ? `目录 ${catRepos.length}` : '浏览远端目录'}
          </Button>
        </div>
        {pullSt ? (
          <div className="row">
            <span className="bar"><i style={{ width: pullSt.pct + '%' }} /></span>
            <span className="mute">{pullSt.text}</span>
            {pullStall ? <span className="warn">进度停滞？点「取消」后重新拉取会断点续传</span> : null}
            {pullSt.pct > 0 && pullSt.pct < 100 && pullAbort.current ? (
              <Button variant="outline" size="sm" onClick={() => pullAbort.current?.abort()}>取消</Button>
            ) : null}
          </div>
        ) : null}
        {catErr ? <p role="alert" className="mute">{catErr}</p> : null}
        {catRepos ? (
          <>
            <div className="row">
              <Input style={{ width: 240 }} value={catQ} onChange={(e) => setCatQ(e.currentTarget.value)} placeholder={`过滤 ${catRepos.length} 个模型…`} />
              <Button variant="ghost" size="sm" onClick={() => setCatSort((s) => (s === 'name' ? 'size' : 'name'))}>
                排序：{catSort === 'name' ? '名称' : '大小'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!!scan?.running}
                onClick={() => void startScan()}
              >
                {scan?.running ? `扫描体积 ${scan.done}/${scan.total}…` : '抓全部体积'}
              </Button>
              <span className="mute">{catList.length} 个匹配 · 点击名称直接开始拉取</span>
            </div>
            <div className="chips">
              {catView.map((r) => {
                const inf = infoMap[r]
                const latest = inf?.tags?.find((t) => t.id === r + ':latest')
                const shown = latest ?? inf?.tags?.[0]
                const tip = inf?.desc
                  ? inf.desc + '\n\n' + (inf.tags ?? []).slice(0, 10).map((t) => `${t.id} · ${t.gb} GB`).join('\n') + ((inf.tags?.length ?? 0) > 10 ? `\n…共 ${inf.tags!.length} 个 tag` : '')
                  : undefined
                return (
                  <button
                    key={r}
                    className={'chip' + (pullName === r ? ' on' : '')}
                    disabled={!!pullSt && pullSt.pct > 0 && pullSt.pct < 100}
                    title={tip}
                    onClick={() => { setPullName(r); void pullModel(r) }}
                  >
                    {r}{shown ? <span style={{ opacity: 0.6 }}> · {shown.gb}GB</span> : inf?.error ? <span style={{ opacity: 0.45 }}> · ?</span> : null}
                  </button>
                )
              })}
              {!catView.length ? <span className="mute">无匹配</span> : null}
            </div>
            {catList.length > 12 && !scan?.running && catList.some((r) => !infoMap[r]?.tags) ? (
              <p className="mute">部分模型还没体积——点“抓全部体积”后台扫一遍（并发抓取、7 天缓存，可关面板等它跑完）。</p>
            ) : null}
          </>
        ) : !catErr ? (
          <p className="mute">目录来自 ollama.com（服务器端抓取、缓存 24h）；也可以直接输入名字拉取。HF 模型可直接拉：<code>hf.co/仓库/Qwen3-4B-GGUF:Q4_K_M</code>（服务器自己连 hf.co，零中转）；ModelScope 不被 Ollama 支持，请在下方“导入”节走流水线。</p>
        ) : null}
      </section>

      <section className="sec">
        <h3><IconDownloadOutline16 /> 从 HF / ModelScope 导入 GGUF <span className="muted">· 服务器下载 → 上传到你的 Ollama → 自动注册</span></h3>
        <p className="mute">选型速查：Q8≈无损 · Q6_K 近无损 · <b>UD-Q4_K_XL / Q4_K_M 甜点</b> · Q3 起明显掉智 · Q2/IQ1 仅救急。UD=Unsloth 动态量化（同体积质量更优）。原则：选能整个塞进显存的最大量化。</p>
        <div className="row">
          <button className={'chip' + (srcSel === 'hf' ? ' on' : '')} onClick={() => { setSrcSel('hf'); setSrcResults(null); setGgufFiles(null); setSrcRepo('') }}>HuggingFace 镜像</button>
          <button className={'chip' + (srcSel === 'ms' ? ' on' : '')} onClick={() => { setSrcSel('ms'); setSrcResults(null); setGgufFiles(null); setSrcRepo('') }}>ModelScope</button>
          <Input
            style={{ width: 240 }}
            value={srcQ}
            onChange={(e) => setSrcQ(e.currentTarget.value)}
            placeholder={srcSel === 'hf' ? '搜 GGUF，如 qwen3 coder' : '搜模型，如 Qwen3'}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchSource() }}
          />
          <Button variant="primary" size="sm" disabled={srcBusy || !srcQ.trim()} onClick={() => void searchSource()}>{srcBusy ? '搜索中…' : '搜索'}</Button>
        </div>
        {srcErr ? <p role="alert" className="mute">{srcErr}</p> : null}
        {srcResults && srcResults.length ? (
          <>
            <p className="mute">{srcResults.length} 个仓库 · 点仓库名列出它的 .gguf 文件{srcRepo ? ` · 当前选中：${srcRepo}` : ''}</p>
            <div className="chips">
              {srcResults.map((m) => (
                <button key={m.id} className={'chip' + (srcRepo === m.id ? ' on' : '')} onClick={() => void pickRepo(m.id)}>
                  {m.id}{m.downloads > 1000 ? <span style={{ opacity: 0.55 }}> · {(m.downloads / 10000).toFixed(1)}万下载</span> : null}
                </button>
              ))}
            </div>
          </>
        ) : srcResults ? <p className="mute">无结果，换个关键词试试</p> : null}
        {filesBusy ? <p className="mute">读取文件列表…</p> : null}
        {ggufFiles && ggufFiles.length ? (() => {
          const base = (p: string) => p.split('/').pop() || p
          const isAux = (p: string) => /^(mmproj|imatrix)/i.test(base(p))
          const main = ggufFiles.filter((f) => !isAux(f.path))
          const aux = ggufFiles.filter((f) => isAux(f.path))
          const budget = parseFloat(vramBudget)
          const hasBudget = !isNaN(budget) && budget > 0
          const fits = main.filter((f) => f.size / 1073741824 <= budget)
          const rec = hasBudget && fits.length ? fits[fits.length - 1] : null
          const row = (f: { path: string; size: number }, starred?: boolean) => (
            <tr key={f.path} style={starred ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : undefined}>
              <td>
                {starred ? <span className="ok">⭐ </span> : null}
                <code>{base(f.path)}</code>
              </td>
              <td>{(f.size / 1073741824).toFixed(2)} GB</td>
              <td>
                <span className="cells">
                  {srcSel === 'hf' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      title="服务器直拉：你的 Ollama 自己去 hf.co 下载，不经过本机（需服务器网络通）"
                      onClick={() => {
                        const n = 'hf.co/' + srcRepo + ':' + base(f.path).replace(/\.gguf$/i, '')
                        setPullName(n)
                        void pullModel(n)
                      }}
                    >
                      直拉
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => void importFile(f)}>导入</Button>
                </span>
              </td>
            </tr>
          )
          return (
            <>
              <div className="row">
                <Input style={{ width: 170 }} value={vramBudget} onChange={(e) => setVramBudget(e.currentTarget.value)} placeholder="显存预算 GB，如 16" />
                {rec
                  ? <span className="ok">⭐ 推荐 {base(rec.path)}（预算内最大的量化）</span>
                  : hasBudget ? <span className="mute">预算内没有完整量化，调大预算或选最小的试试</span>
                  : <span className="mute">填显存预算自动标推荐 · Q8≈无损 Q6近无损 Q4_K/XL甜点 Q3起明显掉智 · UD=动态量化更优</span>}
              </div>
              <table className="table">
                <thead><tr><th>.gguf 文件（按体积升序）</th><th>体积</th><th></th></tr></thead>
                <tbody>{main.map((f) => row(f, rec?.path === f.path))}</tbody>
              </table>
              {aux.length ? (
                <details>
                  <summary className="mute">辅助文件 {aux.length} 个（mmproj=视觉投影 / imatrix=校准矩阵——都不是完整模型，不用导入）</summary>
                  <table className="table"><tbody>{aux.map((f) => row(f))}</tbody></table>
                </details>
              ) : null}
            </>
          )
        })() : null}
        {imports.length ? (
          <div style={{ marginTop: 12 }}>
            {imports.slice(0, 10).map((j) => {
              const pct = j.bytesTotal ? Math.min(100, Math.round((j.bytesDone / j.bytesTotal) * 100)) : j.state === 'done' ? 100 : 0
              const active = j.state === 'downloading' || j.state === 'uploading' || j.state === 'creating'
              const label = j.state === 'downloading' ? `下载中 ${pct}%`
                : j.state === 'uploading' ? `上传中 ${pct}%`
                : j.state === 'creating' ? '注册中…'
                : j.state === 'done' ? '完成 ✓'
                : j.state === 'cancelled' ? '已取消'
                : `失败: ${j.error ?? ''}`
              return (
                <div key={j.id} className="cells" style={{ justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
                  <span className="cells">
                    <StateDot state={j.state === 'done' ? 'done' : j.state === 'error' || j.state === 'cancelled' ? 'error' : 'ongoing'} />
                    <span>{j.name}</span>
                    <span className="mute">
                      {label}
                      {j.bytesTotal ? ` · ${(j.bytesDone / 1073741824).toFixed(2)}/${(j.bytesTotal / 1073741824).toFixed(2)} GB` : ''}
                      {' · '}
                      {new Date(j.started).toLocaleTimeString()}
                    </span>
                  </span>
                  <span className="cells">
                    {active ? (
                      <Button variant="outline" size="sm" onClick={() => { void fetch(window.location.origin + '/ollama-monitor/import-cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: j.id }) }) }}>取消</Button>
                    ) : j.state !== 'done' ? (
                      <Button variant="ghost" size="sm" title="从断点继续（已下载的部分不会重下）" onClick={() => { void fetch(window.location.origin + '/ollama-monitor/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: j.source, repo: j.repo, file: j.file, name: j.name }) }) }}>继续</Button>
                    ) : null}
                    <span className="bar"><i style={{ width: pct + '%' }} /></span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="sec">
        <h3><IconPlayOutline16 /> 编程同题竞技 <span className="muted">· {PK_PROBLEMS.length} 题 · 浏览器本地判分</span></h3>
        <div className="row">
          {models.map((m) => (
            <label key={m.name} className="mute"><input type="checkbox" checked={!!pkSel[m.name]} onChange={(e) => setPkSel((s) => ({ ...s, [m.name]: e.target.checked }))} /> {m.name}</label>
          ))}
          <Button variant="primary" size="sm" disabled={pkBusy} onClick={() => void runPk()}>{pkBusy ? '比赛中…' : '开赛'}</Button>
        </div>
        {pkScore.length ? (
          <table className="table">
            <thead><tr><th>模型</th><th>相对得分</th><th>断言</th><th>完整解题</th></tr></thead>
            <tbody>
              {[...pkScore].sort((a, b) => b.pass - a.pass).map((s) => (
                <tr key={s.model}>
                  <td>{s.model}</td>
                  <td><span className="bar"><i style={{ width: Math.round((s.pass / Math.max(1, s.total)) * 100) + '%' }} /></span></td>
                  <td>{s.pass}/{s.total}</td>
                  <td>{s.solved}/8</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {pkLog.length ? (
          <details><summary className="mute">过程日志</summary><pre>{pkLog.join('\n')}</pre></details>
        ) : null}
      </section>
    </div>
  )
}

interface SlotsLike {
  inject(name: string, fn: () => void): void
  register(opts: Record<string, unknown>, comp: React.ComponentType<any>): void
}

export function apply(ctx: { slots: SlotsLike }): void {
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      { name: 'settings.plugins.tab', id: 'ollama-monitor', order: 60, label: 'Ollama Monitor' },
      OllamaPanel,
    ))
}
