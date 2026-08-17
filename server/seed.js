import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db from './db.js';

// 每次启动都确保存在至少一个管理员。
// 密码来源：ADMIN_PASSWORD 环境变量 > 随机生成（打印到控制台，仅出现一次）。
// 演示账号与演示数据仅在 SEED_DEMO=1 时写入（开发体验用），生产环境不应开启。
const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
if (!hasAdmin) {
  const demoMode = process.env.SEED_DEMO === '1';
  const password = process.env.ADMIN_PASSWORD || (demoMode
    ? 'admin123456'
    : crypto.randomBytes(9).toString('base64url'));
  db.prepare(
    "INSERT INTO users (username, email, password_hash, bio, avatar, role) VALUES (?, ?, ?, ?, ?, 'admin')"
  ).run(
    'admin',
    process.env.ADMIN_EMAIL || 'admin@prompthub.local',
    bcrypt.hashSync(password, 10),
    '系统管理员',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=admin'
  );
  if (process.env.ADMIN_PASSWORD) {
    console.log('[prompt-hub] 已创建管理员账号：admin（密码来自 ADMIN_PASSWORD 环境变量）');
  } else {
    console.log(`[prompt-hub] 已创建管理员账号：admin / ${password}${demoMode ? '（演示模式，请尽快修改）' : '（随机生成，请立即保存并修改）'}`);
  }
}

if (process.env.SEED_DEMO === '1') {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count <= 1) {
    const hash = bcrypt.hashSync('demo123456', 10);
    const insertUser = db.prepare(
      'INSERT INTO users (username, email, password_hash, bio, avatar) VALUES (?, ?, ?, ?, ?)'
    );

    const demo = insertUser.run(
      'demo',
      'demo@prompthub.local',
      hash,
      'AI 提示词爱好者 · 专注图像生成与工作效率类 Prompt',
      'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=demo'
    ).lastInsertRowid;

    const maker = insertUser.run(
      'promptmaker',
      'maker@prompthub.local',
      hash,
      '分享实用的 AI 提示词，转载请注明出处',
      'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=maker'
    ).lastInsertRowid;

    const insertPrompt = db.prepare(
      `INSERT INTO prompts (user_id, title, description, content, category, model, tags, visibility, views)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertImage = db.prepare('INSERT INTO prompt_images (prompt_id, url, sort) VALUES (?, ?, ?)');
    const insertLink = db.prepare('INSERT INTO prompt_links (prompt_id, url, title) VALUES (?, ?, ?)');
    const insertVersion = db.prepare(
      `INSERT INTO prompt_versions (prompt_id, version, title, description, content, category, model, tags, nsfw)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, 0)`
    );

    const seed = [
      {
        user: demo,
        title: '赛博朋克城市夜景 - 电影级质感',
        description:
          '适用于 Midjourney / Stable Diffusion 的城市夜景通用模板，替换主体词即可套用。重点控制光影层次和镜头语言，出图稳定。',
        category: 'image',
        model: 'Midjourney v6',
        tags: ['Midjourney', '风景', '赛博朋克'],
        views: 1284,
        images: [
          'https://picsum.photos/seed/cyber1/800/500',
          'https://picsum.photos/seed/cyber2/800/500',
          'https://picsum.photos/seed/cyber3/800/500'
        ],
        links: [{ url: 'https://www.midjourney.com/', title: 'Midjourney 官网' }],
        content: `cinematic wide shot of a cyberpunk megacity at night, neon signs reflecting on wet streets, rain, volumetric fog, flying vehicles, towering skyscrapers, teal and orange color grading, ultra detailed, 8k, shot on ARRI Alexa, anamorphic lens flare --ar 16:9 --style raw --v 6

【中文版】
电影级广角镜头，夜晚的赛博朋克超级城市，霓虹灯牌倒映在湿润的街道上，细雨，体积雾，飞行汽车，摩天大楼群，青橙配色，超高细节，8K，ARRI Alexa 摄影机，变形镜头光晕

【使用技巧】
1. 替换 "cyberpunk megacity" 为其他主体（如 "ancient chinese city" 古城）
2. 想要白天场景删除 "at night" 和 "neon"
3. --ar 21:9 可获得更宽的画幅`
      },
      {
        user: demo,
        title: '产品宣传视频 - 分镜脚本生成器',
        description:
          '给可灵 / 即梦 / Sora 生成产品宣传视频用的分镜脚本 Prompt，一次输出 5 个分镜 + 运镜说明 + 台词，直接可用。',
        category: 'video',
        model: '可灵 Kling / 即梦',
        tags: ['视频生成', '分镜', '产品宣传'],
        views: 967,
        images: ['https://picsum.photos/seed/video1/800/500'],
        links: [
          { url: 'https://klingai.com/', title: '可灵 AI' },
          { url: 'https://jimeng.jianying.com/', title: '即梦 AI' }
        ],
        content: `你是一位资深广告导演。请为以下产品生成 5 个分镜的视频脚本，用于 AI 视频生成工具。

产品信息：
- 产品名称：{{产品名}}
- 核心卖点：{{一句话卖点}}
- 目标人群：{{人群}}
- 视频时长：15 秒

每个分镜请按以下格式输出：
【分镜 N】时长 Xs
- 画面描述：（给视频生成工具的英文 Prompt，包含主体、动作、环境、光线、镜头运动）
- 运镜：（如：slow push-in / orbit / crane shot）
- 中文台词/字幕：
- 音效建议：

要求：画面描述要有电影感，镜头语言专业，整体节奏从悬念到产品展示再到品牌定调。`
      },
      {
        user: demo,
        title: '全栈项目开发 - 需求拆解与任务编排',
        description:
          '把一个模糊的产品想法变成可执行的开发计划：技术选型建议、里程碑拆分、任务清单、验收标准。配合 Claude Code / Cursor 使用。',
        category: 'project',
        model: 'Claude / GPT-4o',
        tags: ['项目管理', 'Claude Code', '开发流程'],
        views: 2103,
        images: [],
        links: [{ url: 'https://github.com/', title: 'GitHub' }],
        content: `你是一位有 10 年经验的全栈技术负责人。我有一个产品想法，请帮我完成从需求到开发计划的完整拆解。

## 我的产品想法
{{在这里描述你的想法}}

## 请输出以下内容

### 1. 需求澄清
列出你需要我进一步确认的问题（最多 8 个），按重要性排序

### 2. 技术方案
- 推荐技术栈（给出 2 个方案并说明取舍）
- 数据模型设计（核心表结构）
- API 接口清单

### 3. 里程碑计划
按 3-5 个里程碑拆分，每个里程碑包含：
- 目标
- 任务清单（可直接执行的粒度）
- 验收标准

### 4. 风险清单
可能踩的坑与规避建议

约束：优先选择成熟、易维护的技术；单人开发者视角；不追求过度设计。`
      },
      {
        user: maker,
        title: '周报生成器 - 3 分钟产出高质量周报',
        description: '把流水账变成结构清晰、有数据、有思考的周报。支持 STAR 法则和向上管理视角。',
        category: 'text',
        model: '通用',
        tags: ['职场', '效率', '写作'],
        views: 3420,
        images: ['https://picsum.photos/seed/week1/800/500'],
        links: [],
        content: `你是我的写作助理，帮我把本周工作流水账整理成一份高质量周报。

## 本周做的事（流水账）
{{粘贴你的流水账，越乱越好}}

## 输出要求
1. 按「核心成果 / 进行中 / 风险与求助 / 下周计划」四段式组织
2. 每条成果尽量量化（完成率、数量、对比）
3. 用动词开头的短句，删除所有废话
4. 风险部分给出建议的求助对象
5. 语气：专业、克制、不邀功也不卑微

先输出周报正文，再用一句话点评我本周的时间分配是否合理。`
      },
      {
        user: maker,
        title: '极简个人主页 - 一句话生成方案',
        description: '私藏的个人主页生成 Prompt，从文案到配色一步到位。这条设为私密，仅自己可见。',
        category: 'project',
        model: 'v0 / Claude',
        tags: ['前端', '设计'],
        views: 89,
        images: ['https://picsum.photos/seed/home1/800/500'],
        links: [],
        visibility: 'private',
        content: `为一个{{职业}}设计极简个人主页。

要求：
- 单屏布局，无滚动
- 大标题用一句话个人介绍，30 字以内，有记忆点
- 主色只用一个，强调色一个，黑白灰打底
- 字体：中文用思源黑体，英文用 Inter
- 响应式，移动端优先
- 一个 CTA 按钮引导到联系方式

先给我 3 个方向的文案与配色方案（附色值），我选定后再输出完整代码。`
      }
    ];

    for (const s of seed) {
      const pid = insertPrompt.run(
        s.user,
        s.title,
        s.description,
        s.content,
        s.category,
        s.model,
        s.tags.join(','),
        s.visibility || 'public',
        s.views
      ).lastInsertRowid;
      (s.images || []).forEach((url, i) => insertImage.run(pid, url, i));
      (s.links || []).forEach((l) => insertLink.run(pid, l.url, l.title));
      insertVersion.run(pid, s.title, s.description, s.content, s.category, s.model, s.tags.join(','));
    }

    // 给部分演示提示词加点赞，让热度排序有区分度
    const ids = db.prepare('SELECT id FROM prompts').all().map((r) => r.id);
    const like = db.prepare('INSERT OR IGNORE INTO likes (user_id, prompt_id) VALUES (?, ?)');
    if (ids[0]) like.run(maker, ids[0]);
    if (ids[3]) like.run(demo, ids[3]);

    console.log('[prompt-hub] 已写入演示数据：demo / demo123456');
  }
}
