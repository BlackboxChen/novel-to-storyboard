/**
 * Story Flow API Server
 * MVP 版本 - 小说 → 漫剧剧本 → AI视频分镜
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 配置
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '../../../data/story-flow');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');

// 确保目录存在
await fs.mkdir(JOBS_DIR, { recursive: true });

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 存储 jobs 到文件
async function saveJob(jobId, data) {
  const filePath = path.join(JOBS_DIR, `${jobId}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function loadJob(jobId) {
  const filePath = path.join(JOBS_DIR, `${jobId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function listJobs() {
  const files = await fs.readdir(JOBS_DIR);
  const jobs = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const jobId = file.replace('.json', '');
      const job = await loadJob(jobId);
      if (job) jobs.push({ id: jobId, title: job.title, status: job.status, createdAt: job.createdAt });
    }
  }
  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ============ API Routes ============

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 上传小说
 */
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/novel/upload', upload.single('file'), async (req, res) => {
  try {
    const { style = 'narrated' } = req.body;
    let content = '';
    let filename = '未命名小说';

    if (req.file) {
      content = req.file.buffer.toString('utf-8');
      filename = req.file.originalname;
    } else if (req.body.content) {
      content = req.body.content;
    } else {
      return res.status(400).json({ error: '请上传文件或提供小说内容' });
    }

    const jobId = uuidv4();
    const job = {
      id: jobId,
      title: req.body.title || filename.replace(/\.(txt|md)$/, ''),
      status: 'uploaded',
      style,
      novel: {
        content,
        filename,
        wordCount: content.length
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveJob(jobId, job);
    res.json({ jobId, title: job.title, wordCount: job.novel.wordCount });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取任务列表
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取任务详情
 */
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await loadJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 解析小说 → 生成故事圣经
 * 这里调用 LLM API 进行解析
 */
app.post('/api/novel/parse/:jobId', async (req, res) => {
  try {
    const job = await loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    job.status = 'parsing';
    await saveJob(job.id, job);

    // 调用真实 LLM API
    try {
      const { llmService } = await import('../services/llm-service.js');
      job.storyBible = await llmService.parseNovel(job.novel.content, job.title);
    } catch (llmError) {
      console.error('LLM error, using mock:', llmError.message);
      // Fallback to mock
      job.storyBible = {
        characters: [
          { id: 'C01', name: '主角', role: 'protagonist', traits: [] }
        ],
        events: [],
        turningPoints: [],
        estimatedEpisodes: Math.ceil(job.novel.wordCount / 1000)
      };
    }
    
    job.status = 'parsed';
    job.updatedAt = new Date().toISOString();
    await saveJob(job.id, job);

    res.json({ 
      jobId: job.id, 
      storyBible: job.storyBible,
      estimatedEpisodes: job.storyBible.estimatedEpisodes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成剧本
 */
app.post('/api/script/generate/:jobId', async (req, res) => {
  try {
    const job = await loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const { episodes } = req.body;
    job.status = 'generating_script';
    job.targetEpisodes = episodes || job.storyBible?.estimatedEpisodes || 7;
    await saveJob(job.id, job);

    // 调用真实 LLM 生成剧本
    try {
      const { llmService } = await import('../services/llm-service.js');
      job.script = {
        episodes: [],
        totalEpisodes: job.targetEpisodes,
        style: job.style
      };
      
      // 生成第一集剧本
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
      // Fallback to mock
      job.script = {
        episodes: [],
        totalEpisodes: job.targetEpisodes,
        style: job.style
      };
    }
    
    job.status = 'script_ready';
    job.updatedAt = new Date().toISOString();
    await saveJob(job.id, job);

    res.json({ jobId: job.id, status: job.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成分镜提示词
 */
app.post('/api/storyboard/generate/:jobId', async (req, res) => {
  try {
    const job = await loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const { mode = 'A', episodeRange } = req.body;
    job.status = 'generating_storyboard';
    await saveJob(job.id, job);

    // TODO: 调用 LLM API 生成分镜
    job.storyboard = {
      mode,
      scenes: [],
      clips: []
    };
    job.status = 'storyboard_ready';
    job.updatedAt = new Date().toISOString();
    await saveJob(job.id, job);

    res.json({ jobId: job.id, status: job.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新剧本内容
 */
app.put('/api/script/:jobId', async (req, res) => {
  try {
    const job = await loadJob(req.params.jobId);
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
    await saveJob(job.id, job);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导出
 */
app.get('/api/export/:jobId/:format', async (req, res) => {
  try {
    const job = await loadJob(req.params.jobId);
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
      // 转换为 Markdown
      let md = `# ${job.title}\n\n`;
      md += `**状态**: ${job.status}\n`;
      md += `**创建时间**: ${job.createdAt}\n\n`;
      
      if (job.storyBible) {
        md += `## 故事圣经\n\n`;
        md += `**角色**:\n`;
        if (job.storyBible.characters) {
          job.storyBible.characters.forEach(c => {
            md += `- ${c.name} (${c.role})\n`;
          });
        }
        md += `\n**预估集数**: ${job.storyBible.estimatedEpisodes || 'N/A'}\n\n`;
      }
      
      if (job.script && job.script.episodes) {
        md += `## 剧本\n\n`;
        job.script.episodes.forEach(ep => {
          md += `### 第 ${ep.number} 集\n\n${ep.content}\n\n`;
        });
      }
      
      if (job.storyboard) {
        md += `## 分镜\n\n`;
        md += `模式: ${job.storyboard.mode || 'A'}\n`;
      }
      
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

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../../public')));

// 启动服务器
app.listen(PORT, () => {
  console.log(`🦞 Story Flow API running at http://localhost:${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
});
