/**
 * 分镜相关路由
 */

import express from 'express';
import { storyboardService } from '../../services/storyboard.service.js';

const router = express.Router();

/**
 * 生成分镜
 * POST /api/storyboard/generate/:jobId
 */
router.post('/generate/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.script || !job.script.episodes?.length) {
      return res.status(400).json({ error: '请先生成剧本' });
    }

    const { mode = 'A', stylePreset, episodeRange } = req.body;

    job.status = 'generating_storyboard';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    // 确定要处理的集数
    const episodesToProcess = episodeRange
      ? job.script.episodes.filter(ep =>
          ep.number >= episodeRange[0] && ep.number <= episodeRange[1]
        )
      : job.script.episodes;

    const storyboards = [];

    for (const episode of episodesToProcess) {
      try {
        const storyboard = await storyboardService.generateStoryboard(
          episode.content,
          episode.number,
          { mode, stylePreset: stylePreset || 'neutral_cinematic' }
        );
        storyboards.push(storyboard);
      } catch (error) {
        console.error(`Storyboard generation failed for episode ${episode.number}:`, error.message);
        storyboards.push({
          episodeNumber: episode.number,
          error: error.message,
          fallback: true
        });
      }

      // 延迟避免限流
      if (episodesToProcess.indexOf(episode) < episodesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    job.storyboard = {
      mode,
      stylePreset: stylePreset || 'neutral_cinematic',
      episodes: storyboards,
      generatedAt: new Date().toISOString()
    };

    job.status = 'storyboard_ready';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      jobId: job.id,
      status: job.status,
      episodesGenerated: storyboards.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成单集分镜
 * POST /api/storyboard/generate/:jobId/episode/:episodeNumber
 */
router.post('/generate/:jobId/episode/:episodeNumber', async (req, res) => {
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

    const { mode = 'A', stylePreset } = req.body;

    const storyboard = await storyboardService.generateStoryboard(
      episode.content,
      episodeNumber,
      { mode, stylePreset: stylePreset || 'neutral_cinematic' }
    );

    // 更新 job
    if (!job.storyboard) {
      job.storyboard = { mode, episodes: [] };
    }

    const existingIndex = job.storyboard.episodes.findIndex(e => e.episodeNumber === episodeNumber);
    if (existingIndex >= 0) {
      job.storyboard.episodes[existingIndex] = storyboard;
    } else {
      job.storyboard.episodes.push(storyboard);
      job.storyboard.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json(storyboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取分镜
 * GET /api/storyboard/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.storyboard) {
      return res.status(404).json({ error: '分镜尚未生成' });
    }

    res.json(job.storyboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单集分镜
 * GET /api/storyboard/:jobId/episode/:episodeNumber
 */
router.get('/:jobId/episode/:episodeNumber', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyboard) {
      return res.status(404).json({ error: '任务或分镜不存在' });
    }

    const episodeNumber = parseInt(req.params.episodeNumber);
    const episodeStoryboard = job.storyboard.episodes.find(e => e.episodeNumber === episodeNumber);

    if (!episodeStoryboard) {
      return res.status(404).json({ error: '该集分镜不存在' });
    }

    res.json(episodeStoryboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取可用风格列表
 * GET /api/storyboard/styles
 */
router.get('/styles', (req, res) => {
  const styles = storyboardService.getAvailableStyles();
  res.json(styles);
});

/**
 * 导出分镜
 * GET /api/storyboard/export/:jobId/:format
 */
router.get('/export/:jobId/:format', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyboard) {
      return res.status(404).json({ error: '任务或分镜不存在' });
    }

    const { format } = req.params;
    const safeTitle = encodeURIComponent(job.title || 'unnamed');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_storyboard.json"`);
      return res.send(storyboardService.exportAsJSON(job.storyboard));
    } else if (format === 'csv') {
      // 合并所有集的片段
      const allClips = job.storyboard.episodes.flatMap(ep => ep.clips || []);
      const combinedStoryboard = { clips: allClips };

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_storyboard.csv"`);
      return res.send(storyboardService.exportAsCSV(combinedStoryboard));
    } else {
      return res.status(400).json({ error: '不支持的导出格式' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
