/**
 * 小说相关路由
 */

import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { storyBibleService } from '../../services/story-bible.service.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 上传小说
 * POST /api/novel/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
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

    // 保存 job
    await req.app.locals.saveJob(jobId, job);

    res.json({
      jobId,
      title: job.title,
      wordCount: job.novel.wordCount
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 解析小说 → 生成故事圣经
 * POST /api/novel/parse/:jobId
 */
router.post('/parse/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    job.status = 'parsing';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    try {
      // 使用增强的故事圣经服务
      job.storyBible = await storyBibleService.parseNovelFull(
        job.novel.content,
        job.title
      );
    } catch (parseError) {
      console.error('Parse error:', parseError.message);
      // 降级为基础解析
      job.storyBible = {
        title: job.title,
        characters: [
          { id: 'C01', name: '主角', role: 'protagonist', traits: [] }
        ],
        events: [],
        turningPoints: [],
        estimatedEpisodes: Math.ceil(job.novel.wordCount / 1000),
        _parseError: parseError.message
      };
    }

    job.status = 'parsed';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

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
 * 获取故事圣经
 * GET /api/novel/story-bible/:jobId
 */
router.get('/story-bible/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.storyBible) {
      return res.status(404).json({ error: '故事圣经尚未生成' });
    }

    res.json(job.storyBible);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
