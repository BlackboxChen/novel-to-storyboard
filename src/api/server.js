/**
 * Story Flow API Server
 * 模块化版本 - 小说 → 漫剧剧本 → AI视频分镜
 */

// 加载环境变量（必须在最前面）
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入路由
import novelRoutes from './routes/novel.routes.js';
import architectureRoutes from './routes/architecture.routes.js';
import scriptRoutes from './routes/script.routes.js';
import storyboardRoutes from './routes/storyboard.routes.js';
import assetRoutes from './routes/asset.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 配置
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '../../data/story-flow');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');

// 确保目录存在
await fs.mkdir(JOBS_DIR, { recursive: true });

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 存储函数 - 挂载到 app.locals 供路由使用
app.locals.saveJob = async (jobId, data) => {
  const filePath = path.join(JOBS_DIR, `${jobId}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

app.locals.loadJob = async (jobId) => {
  const filePath = path.join(JOBS_DIR, `${jobId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
};

// ============ 基础 API Routes ============

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 获取任务列表
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const files = await fs.readdir(JOBS_DIR);
    const jobs = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const jobId = file.replace('.json', '');
        const job = await app.locals.loadJob(jobId);
        if (job) {
          jobs.push({
            id: jobId,
            title: job.title,
            status: job.status,
            createdAt: job.createdAt
          });
        }
      }
    }
    res.json({
      jobs: jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取任务详情
 */
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await app.locals.loadJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除任务
 */
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const filePath = path.join(JOBS_DIR, `${req.params.id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导出任务
 */
app.get('/api/export/:jobId/:format', async (req, res) => {
  try {
    const job = await app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const { format } = req.params;
    const safeTitle = encodeURIComponent(job.title || 'unnamed');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.json"`);
      return res.json(job);
    } else if (format === 'markdown' || format === 'md') {
      const md = generateMarkdownExport(job);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.md"`);
      return res.send(md);
    } else {
      return res.status(400).json({ error: '不支持的导出格式' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成 Markdown 导出
 */
function generateMarkdownExport(job) {
  let md = `# ${job.title}\n\n`;
  md += `**状态**: ${job.status}\n`;
  md += `**创建时间**: ${job.createdAt}\n\n`;

  // 故事圣经
  if (job.storyBible) {
    md += `## 故事圣经\n\n`;
    md += `**主题**: ${job.storyBible.mainTheme || '未设置'}\n`;
    md += `**预估集数**: ${job.storyBible.estimatedEpisodes || 'N/A'}\n\n`;

    if (job.storyBible.characters?.length > 0) {
      md += `### 角色\n\n`;
      job.storyBible.characters.forEach(c => {
        md += `- **${c.name}** (${c.role}) - ${c.archetype || '未知原型'}\n`;
        if (c.traits?.length > 0) {
          md += `  - 特征: ${c.traits.join(', ')}\n`;
        }
      });
      md += `\n`;
    }

    if (job.storyBible.events?.length > 0) {
      md += `### 事件 (${job.storyBible.events.length})\n\n`;
      job.storyBible.events.slice(0, 10).forEach(e => {
        md += `- **${e.id}**: ${e.summary} [${e.type}]\n`;
      });
      if (job.storyBible.events.length > 10) {
        md += `- ... 还有 ${job.storyBible.events.length - 10} 个事件\n`;
      }
      md += `\n`;
    }
  }

  // 分集架构
  if (job.architecture) {
    md += `## 分集架构\n\n`;
    md += `**总集数**: ${job.architecture.totalEpisodes}\n\n`;

    if (job.architecture.episodes?.length > 0) {
      job.architecture.episodes.forEach(ep => {
        md += `### 第 ${ep.number} 集: ${ep.title || '未命名'}\n\n`;
        md += `**卖点**: ${ep.logline || '无'}\n`;
        md += `**情绪弧线**: ${ep.emotionalArc || '无'}\n\n`;
      });
    }
  }

  // 剧本
  if (job.script?.episodes?.length > 0) {
    md += `## 剧本\n\n`;
    job.script.episodes.forEach(ep => {
      md += `### 第 ${ep.number} 集\n\n`;
      md += `${ep.content || '（空）'}\n\n`;
      md += `---\n\n`;
    });
  }

  // 分镜
  if (job.storyboard?.episodes?.length > 0) {
    md += `## 分镜\n\n`;
    md += `**模式**: ${job.storyboard.mode || 'A'}\n`;
    md += `**风格**: ${job.storyboard.stylePreset || 'neutral_cinematic'}\n\n`;

    job.storyboard.episodes.forEach(ep => {
      md += `### 第 ${ep.episodeNumber} 集\n\n`;
      if (ep.clips?.length > 0) {
        ep.clips.forEach(clip => {
          md += `#### ${clip.id}: ${clip.title}\n\n`;
          if (clip.prompt?.combined) {
            md += `**提示词**: ${clip.prompt.combined.slice(0, 200)}...\n\n`;
          }
        });
      }
    });
  }

  // 资产
  if (job.assets) {
    md += `## 资产\n\n`;
    if (job.assets.characters?.length > 0) {
      md += `### 角色资产 (${job.assets.characters.length})\n\n`;
    }
    if (job.assets.scenes?.length > 0) {
      md += `### 场景资产 (${job.assets.scenes.length})\n\n`;
    }
  }

  return md;
}

// ============ 模块化路由 ============

app.use('/api/novel', novelRoutes);
app.use('/api/architecture', architectureRoutes);
app.use('/api/script', scriptRoutes);
app.use('/api/storyboard', storyboardRoutes);
app.use('/api/asset', assetRoutes);

// ============ 兼容旧 API ============

// 兼容旧的解析路由
app.post('/api/novel/parse/:jobId', async (req, res) => {
  // 重定向到新路由
  const job = await app.locals.loadJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '任务不存在' });
  }

  job.status = 'parsing';
  await app.locals.saveJob(job.id, job);

  try {
    const { storyBibleService } = await import('../services/story-bible.service.js');
    job.storyBible = await storyBibleService.parseNovelFull(job.novel.content, job.title);
  } catch (llmError) {
    console.error('LLM error, using mock:', llmError.message);
    job.storyBible = {
      characters: [{ id: 'C01', name: '主角', role: 'protagonist', traits: [] }],
      events: [],
      turningPoints: [],
      estimatedEpisodes: Math.ceil(job.novel.wordCount / 1000)
    };
  }

  job.status = 'parsed';
  job.updatedAt = new Date().toISOString();
  await app.locals.saveJob(job.id, job);

  res.json({
    jobId: job.id,
    storyBible: job.storyBible,
    estimatedEpisodes: job.storyBible.estimatedEpisodes
  });
});

// 兼容旧的剧本生成路由
app.post('/api/script/generate/:jobId', async (req, res) => {
  const job = await app.locals.loadJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '任务不存在' });
  }

  const { episodes } = req.body;
  job.status = 'generating_script';
  job.targetEpisodes = episodes || job.storyBible?.estimatedEpisodes || 7;
  await app.locals.saveJob(job.id, job);

  try {
    const { llmService } = await import('../services/llm-service.js');
    job.script = {
      episodes: [],
      totalEpisodes: job.targetEpisodes,
      style: job.style
    };

    if (job.storyBible) {
      const episode1Script = await llmService.generateEpisode(
        job.storyBible,
        1,
        job.targetEpisodes,
        job.style
      );
      job.script.episodes.push({
        number: 1,
        content: episode1Script
      });
    }
  } catch (llmError) {
    console.error('LLM error, using mock:', llmError.message);
    job.script = {
      episodes: [],
      totalEpisodes: job.targetEpisodes,
      style: job.style
    };
  }

  job.status = 'script_ready';
  job.updatedAt = new Date().toISOString();
  await app.locals.saveJob(job.id, job);

  res.json({ jobId: job.id, status: job.status });
});

// 兼容旧的分镜生成路由
app.post('/api/storyboard/generate/:jobId', async (req, res) => {
  const job = await app.locals.loadJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '任务不存在' });
  }

  const { mode = 'A' } = req.body;
  job.status = 'generating_storyboard';
  await app.locals.saveJob(job.id, job);

  job.storyboard = {
    mode,
    scenes: [],
    clips: []
  };

  job.status = 'storyboard_ready';
  job.updatedAt = new Date().toISOString();
  await app.locals.saveJob(job.id, job);

  res.json({ jobId: job.id, status: job.status });
});

// 兼容旧的剧本更新路由
app.put('/api/script/:jobId', async (req, res) => {
  const job = await app.locals.loadJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '任务不存在' });
  }

  const { episode, content } = req.body;
  if (!job.script) job.script = { episodes: [] };

  const existingIndex = job.script.episodes.findIndex(e => e.number === episode);
  if (existingIndex >= 0) {
    job.script.episodes[existingIndex].content = content;
  } else {
    job.script.episodes.push({ number: episode, content });
  }

  job.updatedAt = new Date().toISOString();
  await app.locals.saveJob(job.id, job);

  res.json({ success: true });
});

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../../public')));

// 启动服务器
app.listen(PORT, () => {
  console.log(` Story Flow API running at http://localhost:${PORT}`);
  console.log(` Data directory: ${DATA_DIR}`);
  console.log(` Available routes:`);
  console.log(`   - /api/novel/*`);
  console.log(`   - /api/architecture/*`);
  console.log(`   - /api/script/*`);
  console.log(`   - /api/storyboard/*`);
  console.log(`   - /api/asset/*`);
});
