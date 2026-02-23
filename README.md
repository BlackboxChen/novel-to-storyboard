# Story Flow - 小说转漫剧工作流平台

> 小说 → [novel-to-mandrama] → 漫剧剧本 → [novel-to-storyboard] → AI视频提示词

## 🚀 快速开始

```bash
# 安装依赖
cd /home/wuying/clawd/apps/story-flow
npm install

# 启动服务
npm run server:dev

# 访问
open http://localhost:3001
```

## 📁 项目结构

```
story-flow/
├── public/
│   └── index.html          # Web 前端（单页应用）
├── src/
│   ├── api/
│   │   └── server.js       # Express API 服务
│   ├── services/
│   │   └── llm-service.js  # LLM API 封装
│   └── lib/
│       └── skill-loader.js # Skill 加载器
├── data/                   # 数据存储目录
│   └── jobs/              # 任务数据
├── docs/
│   └── API.md             # API 文档
└── package.json
```

## 🔌 API 端点

### 上传小说
```
POST /api/novel/upload
Content-Type: application/json

{
  "title": "作品标题",
  "style": "narrated" | "storyboard",
  "content": "小说内容..."
}
```

### 获取任务列表
```
GET /api/jobs
```

### 获取任务详情
```
GET /api/jobs/:id
```

### 解析小说 → 故事圣经
```
POST /api/novel/parse/:jobId
```

### 生成剧本
```
POST /api/script/generate/:jobId
Content-Type: application/json

{
  "episodes": 7
}
```

### 生成分镜
```
POST /api/storyboard/generate/:jobId
Content-Type: application/json

{
  "mode": "A" | "B"
}
```

### 更新剧本
```
PUT /api/script/:jobId
Content-Type: application/json

{
  "episode": 1,
  "content": "剧本内容..."
}
```

### 导出
```
GET /api/export/:jobId/json
GET /api/export/:jobId/markdown
```

### 删除任务
```
DELETE /api/jobs/:id
```

## 🎯 工作流程

```
1. 上传小说
   ↓
2. 解析小说 → 故事圣经（人物/事件链/转折点）
   ↓
3. 生成剧本（分集架构 + 单集剧本）
   ↓
4. 编辑/修改剧本
   ↓
5. 生成分镜提示词（视频片段 + 英文提示词）
   ↓
6. 导出（JSON/Markdown）
```

## ⚙️ 配置

环境变量：
- `PORT` - 服务端口（默认 3001）
- `ZHIPU_API_KEY` - 智谱 API Key

## 🔧 技术栈

- **后端**: Express.js
- **前端**: 原生 HTML + Tailwind CSS
- **LLM**: 智谱 GLM-4
- **存储**: 文件系统（JSON）

## 📝 TODO

- [ ] 集成真实 LLM 调用
- [ ] 添加用户认证
- [ ] 支持更多导出格式
- [ ] 添加任务队列（长文本分批处理）
- [ ] 前端富文本编辑器
- [ ] 实时进度显示
