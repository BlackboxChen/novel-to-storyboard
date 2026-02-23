/**
 * 剧本相关路由
 */

import express from 'express';
import { scriptWriterService } from '../../services/script-writer.service.js';

const router = express.Router();

/**
 * 生成剧本
 * POST /api/script/generate/:jobId
 */
router.post('/generate/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.storyBible) {
      return res.status(400).json({ error: '请先解析小说' });
    }

    // 确保有架构
    if (!job.architecture) {
      return res.status(400).json({ error: '请先生成分集架构' });
    }

    const { episodeRange, style, rhythmTemplate } = req.body;

    job.status = 'generating_script';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    try {
      const script = await scriptWriterService.generateFullScript(
        job.storyBible,
        job.architecture,
        {
          style: style || job.style || 'narrated',
          rhythmTemplate: rhythmTemplate || 'standard_90',
          episodeRange
        }
      );

      job.script = script;
    } catch (scriptError) {
      console.error('Script generation error:', scriptError.message);
      job.script = {
        totalEpisodes: job.architecture.totalEpisodes,
        episodes: [],
        _error: scriptError.message
      };
    }

    job.status = 'script_ready';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      jobId: job.id,
      status: job.status,
      episodesGenerated: job.script.episodes?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成单集剧本
 * POST /api/script/generate/:jobId/episode/:episodeNumber
 */
router.post('/generate/:jobId/episode/:episodeNumber', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyBible || !job.architecture) {
      return res.status(404).json({ error: '任务或必要数据不存在' });
    }

    const episodeNumber = parseInt(req.params.episodeNumber);
    const { style, rhythmTemplate } = req.body;

    const result = await scriptWriterService.generateEpisodeWithProgress(
      job.storyBible,
      job.architecture,
      episodeNumber,
      { style: style || job.style || 'narrated', rhythmTemplate }
    );

    // 更新 job 中的剧本
    if (!job.script) {
      job.script = { episodes: [], totalEpisodes: job.architecture.totalEpisodes };
    }

    const existingIndex = job.script.episodes.findIndex(e => e.number === episodeNumber);
    if (existingIndex >= 0) {
      job.script.episodes[existingIndex] = result;
    } else {
      job.script.episodes.push(result);
      job.script.episodes.sort((a, b) => a.number - b.number);
    }

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取剧本
 * GET /api/script/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.script) {
      return res.status(404).json({ error: '剧本尚未生成' });
    }

    res.json(job.script);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单集剧本
 * GET /api/script/:jobId/episode/:episodeNumber
 */
router.get('/:jobId/episode/:episodeNumber', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.script) {
      return res.status(404).json({ error: '任务或剧本不存在' });
    }

    const episodeNumber = parseInt(req.params.episodeNumber);
    const episode = job.script.episodes.find(e => e.number === episodeNumber);

    if (!episode) {
      return res.status(404).json({ error: '该集剧本不存在' });
    }

    res.json(episode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新剧本内容
 * PUT /api/script/:jobId
 */
router.put('/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
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
    await req.app.locals.saveJob(job.id, job);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量生成剧本
 * POST /api/script/batch/:jobId
 */
router.post('/batch/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyBible || !job.architecture) {
      return res.status(404).json({ error: '任务或必要数据不存在' });
    }

    const { episodeNumbers, concurrency = 2 } = req.body;

    const result = await scriptWriterService.generateBatch(
      job.storyBible,
      job.architecture,
      {
        episodeNumbers,
        concurrency,
        style: job.style || 'narrated'
      }
    );

    // 更新 job
    if (!job.script) {
      job.script = { episodes: [], totalEpisodes: job.architecture.totalEpisodes };
    }

    for (const ep of result.episodes) {
      const existingIndex = job.script.episodes.findIndex(e => e.number === ep.number);
      if (existingIndex >= 0) {
        job.script.episodes[existingIndex] = ep;
      } else {
        job.script.episodes.push(ep);
      }
    }
    job.script.episodes.sort((a, b) => a.number - b.number);

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
