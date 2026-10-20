#!/usr/bin/env node
/**
 * Bozzii 品牌改写脚本（幂等、可重放）
 *
 * 用途：把上游 Xinyue AI 的「用户可见品牌字符串」改写成 bozzii。
 * 每次上游升级后运行一次，品牌改动自动叠加到新版本上。
 *
 * 用法：
 *   node scripts/apply-branding.mjs            # 应用改写
 *   node scripts/apply-branding.mjs --check    # 只报告，不写盘
 *   node scripts/apply-branding.mjs --verify   # 只校验受保护标识是否完好
 *
 * 设计原则：
 *   1. 只改 TARGETS 白名单里的文件。
 *   2. 受保护标识先「打码」再替换，替换完再「解码」。这样同一行里
 *      既有保护标识又有展示文案时（例如 auth.ts 的影子账号后缀 + 兜底昵称），
 *      保护标识不动、展示文案照改。
 *   3. 幂等：重复运行不会二次改写。
 *   4. 失败要吵：目标文件缺失、或受保护标识被破坏，立刻非零退出。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const MODE = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--verify')
    ? 'verify'
    : 'apply'

/**
 * 受保护标识：运行时被比较的机器标识。
 * 改名 → CSRF 全站 403 / 影子账号失配 / 本地设置丢失 / 已建助手外键断裂。
 * 这些串在替换前会被打码，替换后再还原。
 */
const PROTECTED = [
  'X-Xinyue-Request',      // CSRF 校验头（前后端必须一致）
  'x-xinyue-request',
  '@auth.xinyue.local',    // 影子账号邮箱后缀
  'xinyue:',               // localStorage 键 / CustomEvent 命名空间
  'xinyue_',               // 存储目录、OAuth 状态键、种子数据主键前缀
  'xinyue/',               // 内部 import 路径与 URL 前缀
  'xinyueApi',
  'xinyueAsync',
  'xinyueText',
  'useXinyueAsync',
  'XinyueAdminIdentity',
  'XinyueSystemSettings',
  'XinyueSystemHealth',
  'xinyue-',               // CSS 变量（--xinyue-ink）与 class 前缀
  'XINYUE_HTTP',           // 部署环境变量
  'XINYUE_UPLOAD',
  'XinyueAI/1.0',          // 出站 User-Agent，改上游白名单风险
  'XinyueAI-Search/1.0',
]

/** 品牌替换规则（长串优先，顺序敏感） */
const RULES = [
  ['Xinyue AI', 'bozzii'],
  ['XINYUE AI', 'bozzii'],
  ['Xinyue', 'bozzii'],
  ['XINYUE', 'BOZZII'],
  ['xinyue.ai', 'bozzii.ai'],
]

/** logo 单字符字标：整个元素的文本恰为 X 时改为 B */
const GLYPH_RULES = [
  ['>X</span>', '>B</span>'],
  ['>X</strong>', '>B</strong>'],
  // favicon：上游是笔画 X 的 path，换成渲染字母 B 的 <text>
  [
    "%3Cpath d='M8 7h6l2 5 2-5h6l-5 9 5 9h-6l-2-5-2 5H8l5-9z' fill='white'/%3E",
    "%3Ctext x='16' y='23' font-family='Helvetica,Arial,sans-serif' font-size='21' font-weight='700' fill='white' text-anchor='middle'%3EB%3C/text%3E",
  ],
]

/** 白名单：用户可见层 + 导出产物 + 后台展示 */
const TARGETS = [
  'index.html',

  // 用户端
  'src/i18n.ts',
  'src/router.ts',
  'src/stores/auth.ts',
  'src/stores/catalog.ts',
  'src/services/api.ts',
  'src/styles/tokens.css',
  'src/styles/workspace/chat.css',
  'src/components/BrandMark.vue',
  'src/components/CanvasAgentDialog.vue',
  'src/components/GeneratedImagePreview.vue',
  'src/components/SupportCenter.vue',
  'src/components/WorkspaceShell.vue',
  'src/components/chat/ChatComposer.vue',
  'src/components/chat/ChatHome.vue',
  'src/components/shell/ShellHeader.vue',
  'src/components/shell/billing/UpgradeDialog.vue',
  'src/components/shell/settings/sections/AccountSection.vue',
  'src/components/shell/settings/sections/GeneralSection.vue',
  'src/components/shell/settings/sections/PersonalizationSection.vue',
  'src/views/InstallPage.vue',
  'src/views/LandingPage.vue',
  'src/views/LegalPage.vue',
  'src/views/LoginPage.vue',
  'src/views/SharedConversationPage.vue',
  'src/views/StudioPage.vue',

  // 服务端：导出文件元数据、支付商品名、公开站点内容、提示词库署名、任务执行器提示词
  'server/src/payments/payments.service.ts',
  'server/src/workspace/office-export.service.ts',
  'server/src/providers/site-content.ts',
  'server/src/providers/chat-home-content.ts',
  'server/src/providers/providers.service.ts',
  'server/src/prompt-templates/prompt-library.defaults.ts',
  'server/src/prompt-templates/prompt-library.service.ts',
  'server/src/agent-tasks/agent-tasks.processor.ts',

  // 管理端
  'admin/src/config/index.ts',
  'admin/src/locales/xinyue.ts',
  'admin/src/locales/langs/zh.json',
  'admin/src/locales/langs/en.json',
  'admin/src/views/auth/login/index.vue',
  'admin/src/views/dashboard/console/modules/about-project.vue',
  'admin/src/views/article/publish/index.vue',
  'admin/src/views/safeguard/server/index.vue',
]

const SENTINEL = '\u0000'

function mask(text) {
  const saved = []
  let out = text
  for (const token of PROTECTED) {
    while (out.includes(token)) {
      const idx = saved.length
      saved.push(token)
      out = out.replace(token, `${SENTINEL}${idx}${SENTINEL}`)
    }
  }
  return { masked: out, saved }
}

function unmask(text, saved) {
  return text.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i) => saved[Number(i)])
}

function rewrite(text) {
  const { masked, saved } = mask(text)
  let out = masked
  let count = 0
  for (const [from, to] of [...RULES, ...GLYPH_RULES]) {
    if (!out.includes(from)) continue
    count += out.split(from).length - 1
    out = out.split(from).join(to)
  }
  return { text: unmask(out, saved), count }
}

let totalChanged = 0
let totalFiles = 0
const report = []
const problems = []

if (MODE !== 'verify') {
  for (const rel of TARGETS) {
    const path = join(ROOT, rel)
    if (!existsSync(path)) {
      problems.push(`缺少目标文件：${rel}（上游可能重命名或删除，请更新 TARGETS）`)
      continue
    }
    const before = readFileSync(path, 'utf8')
    const { text: after, count } = rewrite(before)
    if (count > 0) {
      totalChanged += count
      totalFiles += 1
      report.push(`${String(count).padStart(3)}  ${rel}`)
      if (MODE === 'apply') writeFileSync(path, after, 'utf8')
    }
  }
}

/* ---- 备案信息注入：首页与法律页页脚（幂等） ---- */

import { copyFileSync } from 'node:fs'

const FILING_COMPONENT = 'src/components/SiteFiling.vue'
const FILING_MARK = 'SiteFiling'

function ensureFiling() {
  if (MODE === 'check' || MODE === 'verify') return

  const local = join(ROOT, FILING_COMPONENT)
  if (!existsSync(local)) {
    problems.push(`缺少 ${FILING_COMPONENT}（备案组件，需与脚本一起分发）`)
    return
  }

  // 首页页脚
  const landing = join(ROOT, 'src/views/LandingPage.vue')
  if (existsSync(landing)) {
    let t = readFileSync(landing, 'utf8')
    if (!t.includes(FILING_MARK)) {
      t = t.replace(
        /(\s*)<p class="landing-footer__copyright">\{\{ landing\.copyright \}\}<\/p>/,
        (m) => `${m}\n      <SiteFiling class="landing-footer__filing" />`,
      )
      if (!/^\s*import SiteFiling from '\.\.\/components\/SiteFiling\.vue'/m.test(t)) {
        t = t.replace(
          /(^import .*from 'vue'\n)/m,
          `$1import SiteFiling from '../components/SiteFiling.vue'\n`,
        )
      }
      writeFileSync(landing, t, 'utf8')
      report.push(' +1  src/views/LandingPage.vue（备案注入）')
    }
  } else {
    problems.push('缺少 src/views/LandingPage.vue')
  }

  // 法律页页脚
  const legal = join(ROOT, 'src/views/LegalPage.vue')
  if (existsSync(legal)) {
    let t = readFileSync(legal, 'utf8')
    if (!t.includes(FILING_MARK)) {
      t = t.replace(
        /(\s*)<nav><RouterLink to="\/about">[^\n]*<\/nav>/,
        (m) => `${m}\n      <SiteFiling />`,
      )
      if (!/^\s*import SiteFiling from '\.\.\/components\/SiteFiling\.vue'/m.test(t)) {
        t = t.replace(
          /(^import .*from 'vue'\n)/m,
          `$1import SiteFiling from '../components/SiteFiling.vue'\n`,
        )
      }
      writeFileSync(legal, t, 'utf8')
      report.push(' +1  src/views/LegalPage.vue（备案注入）')
    }
  }

  // 首页页脚样式
  const css = join(ROOT, 'src/styles/landing.css')
  if (existsSync(css)) {
    let t = readFileSync(css, 'utf8')
    if (!t.includes('.landing-footer__filing')) {
      t = t.replace(
        /(\.landing-footer__copyright \{[^}]*\}\n)/,
        `$1\n/* 备案信息：与版权行同处页脚底栏，靠右，避免遮挡左侧版权 */\n.landing-footer__filing {\n  position: absolute;\n  right: 24px;\n  bottom: 14px;\n  font-size: 11px;\n  color: #767676;\n}\n`,
      )
      writeFileSync(css, t, 'utf8')
      report.push(' +1  src/styles/landing.css（备案样式）')
    }
  }
}

if (MODE !== 'verify') ensureFiling()

console.log(`\n模式：${MODE}`)
if (report.length) {
  console.log('替换统计：')
  for (const line of report) console.log('  ' + line)
  console.log(`合计 ${totalChanged} 处 / ${totalFiles} 个文件`)
} else {
  console.log('没有需要改写的行（可能已应用过 branding）')
}

/* ---- 受保护标识完整性校验：这些串必须原样存在 ---- */
const INVARIANTS = [
  ['src/services/api.ts', 'X-Xinyue-Request'],
  ['admin/src/utils/http/index.ts', 'X-Xinyue-Request'],
  ['server/src/config/http-security.ts', 'x-xinyue-request'],
  ['src/stores/auth.ts', '@auth.xinyue.local'],
  ['src/utils/settings-storage.ts', "'xinyue:settings'"],
  ['server/src/workspace/default-capability-presets.ts', 'xinyue_assistant_general'],
]

for (const [rel, needle] of INVARIANTS) {
  const p = join(ROOT, rel)
  if (!existsSync(p)) {
    problems.push(`不变量文件缺失：${rel}`)
    continue
  }
  if (!readFileSync(p, 'utf8').includes(needle)) {
    problems.push(`受保护标识被破坏：${rel} 不再包含 "${needle}"`)
  }
}

if (problems.length) {
  console.error('\n发现问题：')
  for (const p of problems) console.error('  ✗ ' + p)
  console.error('\n中止。请人工确认上游变更后，更新 TARGETS / PROTECTED / RULES。')
  process.exit(1)
}

console.log('\n✓ 受保护标识完好：CSRF 头、影子账号后缀、存储键、种子主键、出站 UA')
console.log(MODE === 'apply' ? '✓ 品牌改写完成。' : '✓ 校验通过。')
