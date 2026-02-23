/**
 * 分集架构相关路由
 */

import express from 'express';
import { episodeArchitectService } from '../../services/episode-architect.service.js';

const router = express.Router();

/**
 * 生成分集架构
 * POST /api/architecture/generate/:jobId
 */
router.post('/generate/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.storyBible) {
      return res.status(400).json({ error: '请先解析小说生成故事圣经' });
    }

    job.status = 'architecting';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    const { targetEpisodes, rhythmTemplate } = req.body;

    try {
      job.architecture = await episodeArchitectService.generateArchitecture(
        job.storyBible,
        { targetEpisodes, rhythmTemplate }
      );
    } catch (archError) {
      console.error('Architecture error:', archError.message);
      // 降级为基础架构
      job.architecture = {
        totalEpisodes: targetEpisodes || job.storyBible.estimatedEpisodes || 7,
        episodes: [],
        _error: archError.message
      };
    }

    job.status = 'architected';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      jobId: job.id,
      architecture: job.architecture
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取分集架构
 * GET /api/architecture/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.architecture) {
      return res.status(404).json({ error: '分集架构尚未生成' });
    }

    res.json(job.architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 调整单集设计
 * PUT /api/architecture/:jobId/episodes/:episodeNumber
 */
router.put('/:jobId/episodes/:episodeNumber', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.architecture) {
      return res.status(404).json({ error: '分集架构尚未生成' });
    }

    const episodeNumber = parseInt(req.params.episodeNumber);
    const adjustments = req.body;

    job.architecture = await episodeArchitectService.adjustEpisode(
      job.architecture,
      episodeNumber,
      adjustments,
      job.storyBible
    );

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json(job.architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 重新生成爽点地图
 * POST /api/architecture/:jobId/beatmap
 */
router.post('/:jobId/beatmap', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.architecture) {
      return res.status(404).json({ error: '任务或架构不存在' });
    }

    // 重新生成爽点地图
    const events = job.storyBible?.events || [];
    const newBeatMaps = episodeArchitectService.planBeatMaps(
      job.architecture.episodes.map(ep =>
        events.filter(e => ep.assignedEvents.includes(e.id))
      ),
      job.storyBible
    );

    // 更新架构
    job.architecture.episodes = job.architecture.episodes.map((ep, i) => ({
      ...ep,
      beatMap: newBeatMaps[i]
    }));

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json(job.architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
