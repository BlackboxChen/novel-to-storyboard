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

    const { mode = 'A', stylePreset, episodeRange, maxDuration, useLLM = true, useBatch = true } = req.body;

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
    const allSpeechRateWarnings = [];
    const failedEpisodes = [];

    if (!job.storyboard) {
      job.storyboard = { episodes: [], failedEpisodes: [] };
    }
    if (!Array.isArray(job.storyboard.episodes)) {
      job.storyboard.episodes = [];
    }
    if (!Array.isArray(job.storyboard.failedEpisodes)) {
      job.storyboard.failedEpisodes = [];
    }

    const processingEpisodeNumbers = episodesToProcess.map(ep => ep.number);
    job.storyboard.failedEpisodes = job.storyboard.failedEpisodes.filter(
      f => !processingEpisodeNumbers.includes(f.episodeNumber)
    );

    console.log(`[StoryboardRoutes] 开始生成分镜，共 ${episodesToProcess.length} 集，useLLM: ${useLLM}`);
    const totalStartTime = Date.now();

    for (const episode of episodesToProcess) {
      const episodeStartTime = Date.now();
      console.log(`[StoryboardRoutes] 开始处理第 ${episode.number} 集`);

      try {
        // 优先使用结构化数据（clips数组）
        let storyboard;
        const options = {
          mode,
          stylePreset: stylePreset || 'neutral_cinematic',
          maxDuration: maxDuration || null, // 用户自定义最大时长
          useLLM, // LLM增强开关
          useBatch
        };

        if (episode.clips && episode.clips.length > 0) {
          console.log(`[StoryboardRoutes] 第 ${episode.number} 集使用结构化剧本数据，最大时长: ${maxDuration || '无限制'}，LLM增强: ${useLLM}`);
          storyboard = await storyboardService.generateStoryboardFromStructuredScript(
            episode,
            episode.number,
            options
          );
        } else {
          // 回退到Markdown解析
          console.log(`[StoryboardRoutes] 第 ${episode.number} 集使用Markdown解析`);
          storyboard = await storyboardService.generateStoryboard(
            episode.content,
            episode.number,
            options
          );
        }

        // 收集语速警告 (Mode B)
        if (storyboard.speechRateWarnings && storyboard.speechRateWarnings.length > 0) {
          allSpeechRateWarnings.push({
            episodeNumber: episode.number,
            warnings: storyboard.speechRateWarnings
          });
        }

        storyboards.push(storyboard);

        const existingIndex = job.storyboard.episodes.findIndex(e => e.episodeNumber === episode.number);
        if (existingIndex >= 0) {
          job.storyboard.episodes[existingIndex] = storyboard;
        } else {
          job.storyboard.episodes.push(storyboard);
          job.storyboard.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }

        job.storyboard.failedEpisodes = job.storyboard.failedEpisodes.filter(
          f => f.episodeNumber !== episode.number
        );

        const episodeElapsed = Date.now() - episodeStartTime;
        console.log(`[StoryboardRoutes] 第 ${episode.number} 集完成，耗时 ${(episodeElapsed / 1000).toFixed(1)}s`);
      } catch (episodeError) {
        console.error(`[StoryboardRoutes] 第 ${episode.number} 集失败:`, episodeError.message);
        const failure = {
          episodeNumber: episode.number,
          error: episodeError.message,
          failedAt: new Date().toISOString()
        };

        failedEpisodes.push(failure);

        const failureIndex = job.storyboard.failedEpisodes.findIndex(
          f => f.episodeNumber === episode.number
        );
        if (failureIndex >= 0) {
          job.storyboard.failedEpisodes[failureIndex] = failure;
        } else {
          job.storyboard.failedEpisodes.push(failure);
        }
      }

      job.updatedAt = new Date().toISOString();
      await req.app.locals.saveJob(job.id, job);

      // 延迟避免限流
      if (episodesToProcess.indexOf(episode) < episodesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalElapsed = Date.now() - totalStartTime;
    console.log(`[StoryboardRoutes] 所有分镜生成完成，共 ${episodesToProcess.length} 集，总耗时 ${(totalElapsed / 1000).toFixed(1)}s`);

    job.storyboard.mode = mode;
    job.storyboard.stylePreset = stylePreset || 'neutral_cinematic';
    job.storyboard.maxDuration = maxDuration || null;
    job.storyboard.useLLM = useLLM;
    job.storyboard.useBatch = useBatch;
    job.storyboard.generatedAt = new Date().toISOString();

    // 添加语速警告摘要 (Mode B)
    if (mode === 'B' && allSpeechRateWarnings.length > 0) {
      job.storyboard.speechRateWarnings = allSpeechRateWarnings;
    }

    job.status = 'storyboard_ready';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      jobId: job.id,
      status: job.status,
      episodesGenerated: storyboards.length,
      useLLM,
      failedEpisodes,
      speechRateWarnings: allSpeechRateWarnings.length > 0 ? allSpeechRateWarnings : null
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

    const { mode = 'A', stylePreset, maxDuration, useLLM = true, useBatch = true } = req.body;

    const options = {
      mode,
      stylePreset: stylePreset || 'neutral_cinematic',
      maxDuration: maxDuration || null,
      useLLM,
      useBatch
    };

    const storyboard = (episode.clips && episode.clips.length > 0)
      ? await storyboardService.generateStoryboardFromStructuredScript(
          episode,
          episodeNumber,
          options
        )
      : await storyboardService.generateStoryboard(
          episode.content,
          episodeNumber,
          options
        );

    // 更新 job
    if (!job.storyboard) {
      job.storyboard = { mode, episodes: [], failedEpisodes: [] };
    }
    if (!Array.isArray(job.storyboard.failedEpisodes)) {
      job.storyboard.failedEpisodes = [];
    }
    job.storyboard.mode = mode;
    job.storyboard.stylePreset = stylePreset || 'neutral_cinematic';
    job.storyboard.maxDuration = maxDuration || null;
    job.storyboard.useLLM = useLLM;
    job.storyboard.useBatch = useBatch;

    const existingIndex = job.storyboard.episodes.findIndex(e => e.episodeNumber === episodeNumber);
    if (existingIndex >= 0) {
      job.storyboard.episodes[existingIndex] = storyboard;
    } else {
      job.storyboard.episodes.push(storyboard);
      job.storyboard.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }
    job.storyboard.failedEpisodes = job.storyboard.failedEpisodes.filter(
      f => f.episodeNumber !== episodeNumber
    );

    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      ...storyboard,
      regenerated: true
    });
  } catch (error) {
    try {
      const job = await req.app.locals.loadJob(req.params.jobId);
      if (job && job.storyboard) {
        if (!Array.isArray(job.storyboard.failedEpisodes)) {
          job.storyboard.failedEpisodes = [];
        }
        const episodeNumber = parseInt(req.params.episodeNumber);
        const failure = {
          episodeNumber,
          error: error.message,
          failedAt: new Date().toISOString()
        };
        const failureIndex = job.storyboard.failedEpisodes.findIndex(
          f => f.episodeNumber === episodeNumber
        );
        if (failureIndex >= 0) {
          job.storyboard.failedEpisodes[failureIndex] = failure;
        } else {
          job.storyboard.failedEpisodes.push(failure);
        }
        job.updatedAt = new Date().toISOString();
        await req.app.locals.saveJob(job.id, job);
      }
    } catch (saveError) {
      console.error('[StoryboardRoutes] 保存单集失败状态失败:', saveError.message);
    }
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
 * 停止分镜生成
 * POST /api/storyboard/abort/:jobId
 */
router.post('/abort/:jobId', async (req, res) => {
  try {
    storyboardService.abort();
    res.json({ status: 'aborted', message: '分镜生成已停止' });
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
 * SSE 流式生成分镜（批量处理 + 实时响应）
 * GET /api/storyboard/generate/:jobId/stream
 *
 * Query params:
 * - mode: A/B
 * - stylePreset: 风格预设
 * - maxDuration: 最大时长
 * - useLLM: 是否使用LLM增强
 * - episodeRange: 集数范围 (如 "1-12")
 */
router.get('/generate/:jobId/stream', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.script || !job.script.episodes?.length) {
      return res.status(400).json({ error: '请先生成剧本' });
    }

    // 解析参数
    const {
      mode = 'A',
      stylePreset = 'neutral_cinematic',
      maxDuration = null,
      useLLM = 'true',
      episodeRange = null
    } = req.query;

    // 解析集数范围
    let episodesToProcess = job.script.episodes;
    if (episodeRange) {
      const [start, end] = episodeRange.split('-').map(Number);
      episodesToProcess = job.script.episodes.filter(ep =>
        ep.number >= start && ep.number <= end
      );
    }

    // 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

    // 发送 SSE 消息的辅助函数
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 发送开始事件
    sendEvent('start', {
      jobId: job.id,
      totalEpisodes: episodesToProcess.length,
      mode,
      stylePreset,
      useLLM: useLLM === 'true',
      timestamp: new Date().toISOString()
    });

    // 更新任务状态
    job.status = 'generating_storyboard';
    job.updatedAt = new Date().toISOString();

    if (!job.storyboard) {
      job.storyboard = { episodes: [], failedEpisodes: [] };
    }
    if (!Array.isArray(job.storyboard.episodes)) {
      job.storyboard.episodes = [];
    }
    if (!Array.isArray(job.storyboard.failedEpisodes)) {
      job.storyboard.failedEpisodes = [];
    }

    const processingEpisodeNumbers = episodesToProcess.map(ep => ep.number);
    job.storyboard.failedEpisodes = job.storyboard.failedEpisodes.filter(
      f => !processingEpisodeNumbers.includes(f.episodeNumber)
    );

    job.storyboard.mode = mode;
    job.storyboard.stylePreset = stylePreset;
    job.storyboard.maxDuration = maxDuration ? parseInt(maxDuration) : null;
    job.storyboard.useLLM = useLLM === 'true';
    job.storyboard.useBatch = true;

    await req.app.locals.saveJob(job.id, job);

    const storyboards = [];
    const allSpeechRateWarnings = [];

    console.log(`[StoryboardRoutes] SSE开始生成分镜，共 ${episodesToProcess.length} 集，useLLM: ${useLLM}`);
    const totalStartTime = Date.now();

    // 逐集处理，每完成一集就推送结果
    for (const episode of episodesToProcess) {
      const episodeStartTime = Date.now();
      console.log(`[StoryboardRoutes] SSE开始处理第 ${episode.number} 集`);

      // 发送进度事件
      sendEvent('progress', {
        episodeNumber: episode.number,
        status: 'processing',
        message: `正在处理第 ${episode.number} 集...`
      });

      try {
        // 生成单集分镜
        const options = {
          mode,
          stylePreset,
          maxDuration: maxDuration ? parseInt(maxDuration) : null,
          useLLM: useLLM === 'true',
          useBatch: true // 启用批量处理
        };

        let storyboard;
        if (episode.clips && episode.clips.length > 0) {
          storyboard = await storyboardService.generateStoryboardFromStructuredScript(
            episode,
            episode.number,
            options
          );
        } else {
          storyboard = await storyboardService.generateStoryboard(
            episode.content,
            episode.number,
            options
          );
        }

        // 收集语速警告
        if (storyboard.speechRateWarnings?.length > 0) {
          allSpeechRateWarnings.push({
            episodeNumber: episode.number,
            warnings: storyboard.speechRateWarnings
          });
        }

        storyboards.push(storyboard);

        // 发送单集完成事件
        const episodeElapsed = Date.now() - episodeStartTime;
        sendEvent('episode', {
          episodeNumber: episode.number,
          status: 'completed',
          clipsCount: storyboard.clips?.length || 0,
          elapsed: episodeElapsed,
          storyboard // 包含完整的分镜数据
        });

        console.log(`[StoryboardRoutes] SSE第 ${episode.number} 集完成，耗时 ${(episodeElapsed / 1000).toFixed(1)}s`);

        // 更新 job 中的分镜数据（实时保存）
        const existingIndex = job.storyboard.episodes.findIndex(e => e.episodeNumber === episode.number);
        if (existingIndex >= 0) {
          job.storyboard.episodes[existingIndex] = storyboard;
        } else {
          job.storyboard.episodes.push(storyboard);
          job.storyboard.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }

        job.storyboard.failedEpisodes = job.storyboard.failedEpisodes.filter(
          f => f.episodeNumber !== episode.number
        );

        job.updatedAt = new Date().toISOString();
        await req.app.locals.saveJob(job.id, job);

      } catch (error) {
        // 发送单集错误事件（不中断整个流程）
        sendEvent('episode_error', {
          episodeNumber: episode.number,
          status: 'error',
          error: error.message
        });

        const failure = {
          episodeNumber: episode.number,
          error: error.message,
          failedAt: new Date().toISOString()
        };
        const failureIndex = job.storyboard.failedEpisodes.findIndex(
          f => f.episodeNumber === episode.number
        );
        if (failureIndex >= 0) {
          job.storyboard.failedEpisodes[failureIndex] = failure;
        } else {
          job.storyboard.failedEpisodes.push(failure);
        }
        job.updatedAt = new Date().toISOString();
        await req.app.locals.saveJob(job.id, job);

        console.error(`[StoryboardRoutes] SSE第 ${episode.number} 集失败:`, error.message);
      }
    }

    // 所有集处理完成
    const totalElapsed = Date.now() - totalStartTime;

    // 更新最终状态
    job.status = 'storyboard_ready';
    job.storyboard.generatedAt = new Date().toISOString();
    if (allSpeechRateWarnings.length > 0) {
      job.storyboard.speechRateWarnings = allSpeechRateWarnings;
    }
    await req.app.locals.saveJob(job.id, job);

    // 发送完成事件
    sendEvent('complete', {
      jobId: job.id,
      status: 'storyboard_ready',
      totalEpisodes: episodesToProcess.length,
      completedEpisodes: storyboards.length,
      totalElapsed,
      failedEpisodes: job.storyboard.failedEpisodes || [],
      speechRateWarnings: allSpeechRateWarnings.length > 0 ? allSpeechRateWarnings : null
    });

    console.log(`[StoryboardRoutes] SSE所有分镜生成完成，共 ${episodesToProcess.length} 集，总耗时 ${(totalElapsed / 1000).toFixed(1)}s`);

    res.end();

  } catch (error) {
    console.error('[StoryboardRoutes] SSE错误:', error.message);
    // 如果 headers 还没发送，返回错误
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // 否则通过 SSE 发送错误
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
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
