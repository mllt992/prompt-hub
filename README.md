# ⚡ PromptHub - 提示词管理平台

像 GitHub 一样管理 AI 提示词：支持**私密收藏**与**公开分享**，拥有**个人主页**，覆盖文本对话、图像生成、视频生成、项目工作流等场景，可为每条提示词附加**效果图**与**相关链接**。

## 功能

- 🔐 用户系统：注册 / 登录（JWT），改密后全端会话立即失效
- 🛡 管理后台 `/admin`：概览统计、用户管理（封禁/解封/设管理员/删除/重置密码）、提示词管理（含私密，强制改可见性 / 强制 NSFW / 删除）、动态管理、**举报处理队列**、站点设置（注册开关 + 邀请码）
  - 封禁立即生效：被封禁用户无法登录，已有 token 在下次请求即失效，其公开内容不再对外展示
  - 系统始终保持至少一名管理员，防止误操作自锁
- 🗂 提示词管理：新建 / 编辑 / 删除，**公开 / 私密**一键切换
- 📜 **版本历史**：发布与每次编辑自动存档，可查看并一键恢复任意历史版本（恢复也会生成新版本，历史不可变）
- 💬 **评论区**：提示词支持评论（1000 字内），作者可管理自己提示词下的评论
- 🔔 **通知系统**：点赞、评论、动态点赞、关注实时通知（导航栏铃铛 + 未读角标 + 通知页）
- 🚩 **举报**：提示词与动态可举报（违规 / 垃圾信息 / NSFW 未标记 / 侵权等），管理端处置或驳回
- 📦 **导入 / 导出**：一键导出全部提示词为 JSON 备份，支持批量导入（兼容导出格式）
- 🏷 分类体系：文本对话 · 图像生成 · 视频生成 · 项目工作流 · 其他
- 🖼 效果图：本地上传（存至服务器，PNG/JPG/GIF/WebP/AVIF，魔数校验防伪装）或粘贴图片 URL，多图画廊 + 灯箱预览
- 🔗 相关链接：为提示词附上工具官网、参考文章、在线体验地址
- 🌍 探索页：关键词搜索、分类 / 标签筛选、最新 / 最热（时间衰减加权）/ 最多点赞排序、分页加载
- 👤 个人主页 `/u/:username`：头像（支持上传）、昵称、个人网站、简介、公开提示词、动态、关注/粉丝、获赞与浏览统计、修改密码
- 🔞 NSFW 标记：提示词可标记为敏感内容，标记后所有预览图默认模糊，需手动点击逐张显示；管理员可强制打标
- ❤️ 点赞 & ⭐ 收藏，浏览量统计（同一访问者 1 小时内去重）
- 📋 一键复制提示词内容
- 📤 **分享**：复制分享链接（支持浏览器系统分享）；一键生成分享海报（品牌标识 / 标题 / 作者 / 效果图或内容摘录 / 二维码），Canvas 本地绘制、可下载 PNG；跨域图片加载失败或画布受污染时自动降级为文字卡片，NSFW 提示词海报不含效果图
- 👥 关注系统：关注/取消关注创作者，主页展示关注/粉丝数
- 📢 动态 `/feed`：发布动态（可关联自己的提示词）、点赞、删除
  - 推荐流参考 [x-algorithm](https://github.com/MaoTouHU/x-algorithm)（X 平台 For You 架构）的阶段化流水线：
    双候选源（关注网络内/外）→ 预过滤（封禁作者、自帖）→ 多行为加权评分
    `score = Σ weight_i × P(action_i)`（点赞倾向/关联提示词/作者吸引力/时间衰减）
    → 作者多样性衰减 → 分页选取（候选窗口限最近 800 条，避免全表扫描）
  - 关联的私密提示词卡片仅作者可见，他人不展示（避免点击 404）
  - 「关注」标签页为纯时间线（仅关注者动态）

## 安全特性

- 登录 / 注册 / 上传 / 发帖 / 评论 / 举报接口限流（防爆破、防刷号、防灌屏）
- 上传文件双重校验（MIME 白名单 + 文件魔数），禁用 SVG（防存储型 XSS），静态文件带 `X-Content-Type-Options: nosniff`
- 修改密码后所有已签发 JWT 立即失效（`pwd_version` 机制），管理员重置密码同样吊销用户会话
- 全站安全响应头（nosniff / DENY frame / Referrer-Policy / Permissions-Policy）
- 注册保留用户名黑名单，防仿冒官方
- 上传文件回收：编辑移除图片、删除提示词 / 用户时自动清理不再引用的上传文件
- 提示词页注入 OG meta（分享到社交平台有标题/封面预览）

## 技术栈

- 前端：React 18 + React Router 6 + Vite（无 UI 库，纯 CSS 设计系统）
- 后端：Node.js + Express
- 数据库：SQLite（better-sqlite3，文件型零配置）
- 认证：JWT；图片上传：multer

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（前后端热更新）
npm run dev
#   前端: http://localhost:5173
#   API : http://localhost:14021

# 生产部署
npm run build
npm start          # 单端口 http://localhost:14021 托管全部服务

# 冒烟测试（独立端口 + 临时数据目录，不碰开发数据）
npm test
```

### 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 服务端口 | `14021` |
| `DATA_DIR` | 数据目录（SQLite + 上传文件） | `server/data` |
| `ADMIN_PASSWORD` | 首次启动创建管理员的密码 | 随机生成并打印到控制台 |
| `ADMIN_EMAIL` | 管理员邮箱 | `admin@prompthub.local` |
| `SEED_DEMO` | `1` 时写入演示数据（demo / demo123456） | 不写入 |
| `TRUST_PROXY` | 反向代理部署时设置（如 `1`），保证限流取到真实 IP | 不启用 |

> 生产部署建议：设置 `ADMIN_PASSWORD`、不开启 `SEED_DEMO`、位于 Nginx 等反代之后时设置 `TRUST_PROXY=1` 并强制 HTTPS。

## 目录结构

```
├── server/            # Express 后端
│   ├── index.js       # 入口：安全头、限流、路由挂载、静态托管、SPA 回退 + OG 注入
│   ├── db.js          # SQLite 建表与迁移、通知、上传文件回收
│   ├── auth.js        # JWT 签发与校验（含 pwd_version 会话吊销）
│   ├── ratelimit.js   # 滑动窗口限流中间件
│   ├── seed.js        # 管理员初始化（环境变量可控）+ 演示数据（可选）
│   └── routes/        # auth / prompts / users / upload / admin / posts / notifications / reports
├── client/            # React 前端（Vite root）
│   └── src/           # pages/ 页面组件 · components/ 通用组件（含 ShareModal 分享弹窗）· poster.js 分享海报生成
├── dist/              # npm run build 产物
├── scripts/
│   └── smoke-test.mjs # 端到端冒烟测试（npm test）
└── server/data/       # SQLite 数据库 + 上传的图片（自动创建，勿提交）
```

## 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` `/api/auth/login` | 注册（站点设置 + 邀请码 + 保留名校验）/ 登录（限流） |
| PUT | `/api/auth/password` | 修改密码（吊销全部旧会话，返回新 token） |
| GET | `/api/settings` `/api/health` | 公开站点设置 / 健康检查 |
| GET | `/api/prompts` | 公开信息流（q / category / tag / username / sort / page，过滤封禁作者） |
| GET/POST/PUT/DELETE | `/api/prompts/:id` | 详情（浏览量去重）/ 新建 / 编辑 / 删除 |
| PATCH | `/api/prompts/:id/visibility` | 公开 ⇄ 私密切换 |
| POST | `/api/prompts/:id/like` `/bookmark` | 点赞 / 收藏（toggle，收藏转私密后仍可取消） |
| GET | `/api/prompts/:id/versions` | 版本历史（仅作者） |
| POST | `/api/prompts/:id/restore/:versionId` | 恢复历史版本 |
| GET/POST | `/api/prompts/:id/comments` | 评论列表 / 发表（限流） |
| DELETE | `/api/prompts/comments/:commentId` | 删除评论（本人 / 管理员 / 提示词作者） |
| GET | `/api/prompts/mine` `/bookmarks` `/export` | 我的提示词 / 收藏（含失效占位）/ 导出 JSON |
| POST | `/api/prompts/import` | 批量导入（单次上限 100 条） |
| GET | `/api/users/:username` | 个人主页信息 + 统计（封禁用户 404） |
| POST | `/api/users/:username/follow` | 关注 / 取消关注（toggle） |
| POST | `/api/upload/image` | 图片上传（≤5MB，魔数校验，限流） |
| GET | `/api/notifications` `/unread-count` | 通知列表 / 未读数 |
| POST | `/api/notifications/read-all` | 全部已读 |
| POST | `/api/reports` | 提交举报（限流，同对象防重复） |
| GET | `/api/posts/feed?tab=` | 信息流：`recommend`（推荐算法）/ `following`（关注时间线） |
| POST/DELETE | `/api/posts/:id` | 发布动态（可关联自己的提示词）/ 删除 |
| POST | `/api/posts/:id/like` | 动态点赞（toggle） |
| GET | `/api/admin/stats` `/logs` | 全站统计 / 管理日志（分页 + 按动作筛选，管理员） |
| GET/PUT/DELETE | `/api/admin/users/:id` | 用户管理：详情搜索 / 角色·状态 / 重置密码 / 删除（管理员） |
| GET/PATCH/DELETE | `/api/admin/prompts/:id` | 提示词管理：预览 / 可见性 / 强制 NSFW / 删除（管理员） |
| GET/PUT | `/api/admin/reports` `/reports/:id` | 举报队列：筛选查看 / 处置·驳回（管理员） |
| GET/PUT | `/api/admin/settings` | 站点设置：注册开关 + 邀请码（管理员） |
