# 品牌定制（Bozzii 白标）

本仓库是 [`qiantingwl/xinyueai`](https://github.com/qiantingwl/xinyueai) 的 fork，用于把上游产品
「Xinyue AI」白标成 **bozzii**（运营主体：深圳市铂子科技有限责任公司）。

目标：**上游升级后，品牌改动可以一条命令重新应用**，而不是每次手工 diff。

---

## 一、日常操作

```bash
# 1. 拉上游最新代码
git fetch upstream
git merge upstream/main          # 冲突时优先保留上游逻辑

# 2. 重新应用品牌改动（幂等，可重复运行）
node scripts/apply-branding.mjs

# 3. 校验受保护标识没被破坏
node scripts/apply-branding.mjs --verify

# 4. 构建
npm ci && npm run build                    # 用户端
npm --prefix server ci && npm run server:build
pnpm --dir admin install && npm run admin:build
```

只查看将要改什么、不写盘：

```bash
node scripts/apply-branding.mjs --check
```

脚本行为：
- 逐文件统计替换次数并打印；
- 目标文件缺失、或任一受保护标识不变量被破坏 → **非零退出**，不会静默改一半；
- 重复运行不会二次改写（幂等）。

---

## 二、改了什么

`scripts/apply-branding.mjs` 的 `TARGETS` 白名单共 41 个文件，替换规则：

| 原值 | 新值 |
| --- | --- |
| `Xinyue AI` | `bozzii` |
| `XINYUE AI` | `bozzii` |
| `Xinyue` | `bozzii` |
| `XINYUE` | `BOZZII` |
| `xinyue.ai` | `bozzii.ai` |
| `<span>X</span>` 等 logo 字标 | `<span>B</span>` |
| favicon 的 X 笔画 path | 渲染字母 B 的 `<text>` |

覆盖的用户可见面：

- **入口**：`index.html`——`<title>`、description meta、favicon
- **首页**：`src/views/LandingPage.vue`、`src/stores/catalog.ts`、`server/src/providers/site-content.ts`（首页内容默认值的服务端权威副本，改前端不改这里，接口返回的还是旧名）
- **登录 / 安装向导 / 法律页 / 分享页**：`LoginPage.vue`、`InstallPage.vue`、`LegalPage.vue`、`SharedConversationPage.vue`
- **多语言**：`src/i18n.ts`——zh-CN / zh-TW / ja / ko / en **五套各一份**，只改默认语言会漏掉四种
- **路由标题**：`src/router.ts`（`Xinyue AI` 与 `${title} | Xinyue AI` 后缀）
- **聊天与设置**：`BrandMark.vue`、`ChatHome.vue`、`ChatComposer.vue`、`ShellHeader.vue`、`WorkspaceShell.vue`、`UpgradeDialog.vue`、`SupportCenter.vue`、`GeneratedImagePreview.vue`、`CanvasAgentDialog.vue`、设置区块三个 section
- **导出产物**：`server/src/workspace/office-export.service.ts`——PPT 封面页脚、DOCX / XLSX 的 `creator` 元数据（用户下载的文件属性里会显示品牌名）
- **支付**：`server/src/payments/payments.service.ts`——下单商品名 `bozzii <套餐名>`
- **提示词库署名**：`prompt-library.service.ts` / `prompt-library.defaults.ts`
- **管理端**：`admin/src/config/index.ts`（系统名）、`locales/xinyue.ts`、`locales/langs/zh.json`、`en.json`、登录页 `XINYUE` 字标、关于项目、文章发布、服务器监控

---

## 三、绝对不能改的（会被脚本自动保护）

这些标识**在运行时被比较**，改名会让系统直接坏掉。脚本在替换前会先把它们「打码」，
替换后还原——所以它们和展示文案出现在同一行时也能正确区分。

| 标识 | 为什么不能改 | 改错后果 |
| --- | --- | --- |
| `X-Xinyue-Request` / `x-xinyue-request` | CSRF 写操作校验头，前端 `src/services/api.ts`、管理端 `admin/src/utils/http/index.ts`、服务端 `server/src/config/http-security.ts` 三处必须一致 | 只改一头 → **所有写操作 403**，页面能打开但保存全失败 |
| `@auth.xinyue.local` | 影子账号（无邮箱用户）的判定后缀 | 历史用户昵称解析失配 |
| `xinyue:` 前缀 | localStorage 键（`xinyue:settings`、`xinyue:auth-session`…）与 CustomEvent 命名空间（`xinyue:close-popovers`、`xinyue:model-catalog-changed`） | 用户本地设置全丢；弹层关不掉、模型列表不刷新 |
| `xinyue_` 前缀 | 上传目录 `xinyue_uploads`、OAuth 状态键、种子数据主键（`xinyue_assistant_*`、`xinyue_tool_*` 共 41 个） | 已建助手/工具与数据行外键断裂 |
| `xinyue/` | 内部 import 路径、URL 路由前缀 | 构建失败 / 接口 404 |
| `xinyue-` 前缀 | CSS 变量（`--xinyue-ink`、`--xinyue-surface`…）与 class 前缀 | 主题与布局样式失效 |
| `xinyueApi` / `xinyueAsync` / `xinyueText` / `useXinyueAsync` / `XinyueAdminIdentity` / `XinyueSystemSettings` / `XinyueSystemHealth` | TypeScript 符号与路由 name | 编译失败 |
| `XINYUE_HTTP_PORT` / `XINYUE_HTTP_BIND` / `XINYUE_UPLOAD*` | 部署环境变量，`.env.production` 已在用 | 容器起不来或端口错 |
| 出站 `User-Agent: XinyueAI/1.0`、`XinyueAI-Search/1.0` | 上游可能按 UA 做白名单/配额识别 | 抓取被拒 |

> 判断口诀：**会渲染出来的字符串可以改；会被 `===`、`startsWith`、`endsWith`、
> `includes`、`split`、字典查找命中的字符串不能改。**

安全的分界点：`src/stores/auth.ts:44` 一行里同时有 `@auth.xinyue.local`（保护）和
兜底昵称 `Xinyue 用户`（展示）。脚本打码后正确处理成 `@auth.xinyue.local` +
`bozzii 用户`。

---

## 四、运行时配置优先于源码

有两条不经过源码、也不会被升级覆盖的路径，改完品牌后建议一并设置：

1. **管理后台 → 系统设置**
   - `siteName`（默认值在 `SystemSetting.siteName`，上游是 `Xinyue AI`）
   - `siteLogoUrl`（留空则使用代码里的 CSS 字标 `B`；填 URL 则用它替换）
   - 这两个字段存 PostgreSQL `SystemSetting` 表，`git pull` 不会动。
2. **备案信息**：见下节。

首页 / 登录页 / 法律页的部分文案是**硬编码**的，不走 `siteName`，所以必须改源码——
这正是本脚本存在的理由。

---

## 五、备案信息

`src/components/SiteFiling.vue` 展示：

```
深圳市铂子科技有限责任公司 · 中国深圳 · 粤ICP备2026040043号-1
```

- 备案号链接到工信部 `https://beian.miit.gov.cn/`（大陆法规要求，不可去掉）。
- 已挂载到首页页脚（`LandingPage.vue`，靠右，避开左侧版权行）与法律页页脚（`LegalPage.vue`）。
- 组件独立、**不参与** `apply-branding.mjs` 的替换，避免上游升级误改备案号。
- `src/styles/landing.css` 里的 `.landing-footer__filing` 规则由脚本幂等注入。

**注意**：ICP 备案按域名核验。上线域名必须已完成备案，且备案主体与页脚展示一致
（深圳市铂子科技有限责任公司）。若换域名或将服务迁到未备案域名，需先去备案系统变更。

---

## 六、Logo

当前是 CSS 字标方案：`BrandMark.vue` 里 `.brand-mark__icon` 显示字母 `B`，配色取
CSS 变量 `--studio-brand`（默认 `#4d6bfe`，见 `src/styles/tokens.css`）。

要换成真图：

1. 把文件放到 `public/assets/brand/logo.svg`（`Dockerfile` 已经 `COPY public ./public`，会被打进镜像）；
2. 后台系统设置填 `siteLogoUrl = /assets/brand/logo.svg`；
3. 若希望未登录用户第一屏也用它，再改 `BrandMark.vue` 的 `__icon` 为 `<img>`。

不用改脚本，`siteLogoUrl` 走数据库。

---

## 七、升级流程（完整）

```bash
# 服务器上
cd /opt/xinyueai

# 0. 备份数据库（升大版本前必做）
node scripts/backup-production.cjs

# 1. 切到品牌分支并合并上游
git fetch origin
git fetch upstream
git checkout bozzii
git merge upstream/main

# 2. 重新应用品牌（上游若重构了文件，脚本会报错提示更新 TARGETS）
node scripts/apply-branding.mjs
node scripts/apply-branding.mjs --verify

# 3. 重建
docker compose -f docker-compose.prod.yml build frontend backend
docker compose -f docker-compose.prod.yml up -d frontend backend

# 4. 验证
curl -s http://127.0.0.1:8081/ | grep -o '<title>[^<]*</title>'        # 期望 <title>bozzii</title>
curl -s http://127.0.0.1:8081/ | grep -c '粤ICP备2026040043号-1'        # 期望 ≥1
curl -s http://127.0.0.1:8081/v1/health/live                             # 期望 200
```

### 脚本报错怎么办

| 报错 | 含义 | 处理 |
| --- | --- | --- |
| `缺少目标文件：xxx` | 上游重命名/删除了文件 | 找到新路径，更新 `TARGETS`；若该文件不再含品牌串则直接删掉这一项 |
| `受保护标识被破坏：xxx` | 保护名单里的串被改掉了 | **立即停止**，`git checkout` 该文件，检查是否是脚本的 `PROTECTED` 列表需要加新条目 |
| 某文件替换数为 0 但预期应改 | 上游把硬编码品牌换成了动态值（例如改为读 `siteName`） | 这是好事，把该文件从 `TARGETS` 移除，改为后台设置 |

### 兜底：完全从零重做

```bash
git diff upstream/main..HEAD -- src server admin index.html   # 看当前品牌差异
```

---

## 八、本次改动清单

见提交 `feat(branding): 白标为 bozzii`：

- 修改 41 个文件（141 处品牌字符串）
- 新增 `scripts/apply-branding.mjs`
- 新增 `src/components/SiteFiling.vue`（备案信息）
- `src/styles/landing.css` 增加 `.landing-footer__filing`
- 未改动任何受保护标识（`--verify` 已确认）
