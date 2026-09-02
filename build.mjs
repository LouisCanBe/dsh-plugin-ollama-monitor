// 自包含构建脚本（不依赖 DSH 检出）：
//   client 半侧: src/client/index.tsx → lib/client.js
//     产物形态与 DSH clientBundle 预约一致: CJS 闭包工厂 + __ModuleLoader__.load 挂钩
//   node 半侧:   src/index.ts        → lib/index.js（ESM，全量内联依赖）
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

await esbuild.build({
  entryPoints: [path.join(here, 'src/client/index.tsx')],
  outfile: path.join(here, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "ollama-monitor", factory: (require) => {\n'
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})
console.log('client bundle built → lib/client.js')

await esbuild.build({
  entryPoints: [path.join(here, 'src/index.ts')],
  outfile: path.join(here, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // 宿主半侧的 @deepseek-ai/* 运行时不打包：运行时经 DSH 安装的模块回退目录解析，
  // 与宿主共享同一 schemastery / dsh-tools 实例。
  external: ['@deepseek-ai/*'],
  logLevel: 'info',
})
console.log('node bundle built → lib/index.js')
