/**
 * 资产相关路由
 */

import express from 'express';
import { assetService, ASSET_TYPES } from '../../services/asset.service.js';

const router = express.Router();

/**
 * 生成所有资产
 * POST /api/asset/generate/:jobId
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

    const { stylePreset } = req.body;

    job.status = 'generating_assets';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    try {
      const assets = await assetService.generateAllAssets(job.storyBible, {
        stylePreset: stylePreset || 'neutral_cinematic'
      });

      job.assets = assets;
    } catch (assetError) {
      console.error('Asset generation error:', assetError.message);
      job.assets = {
        characters: [],
        props: [],
        scenes: [],
        _error: assetError.message
      };
    }

    job.status = 'assets_ready';
    job.updatedAt = new Date().toISOString();
    await req.app.locals.saveJob(job.id, job);

    res.json({
      jobId: job.id,
      assets: job.assets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成角色资产
 * POST /api/asset/character/:jobId
 */
router.post('/character/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyBible) {
      return res.status(404).json({ error: '任务或故事圣经不存在' });
    }

    const { characterId, stylePreset } = req.body;

    // 如果指定了角色ID，只生成该角色
    if (characterId) {
      const character = job.storyBible.characters.find(c => c.id === characterId);
      if (!character) {
        return res.status(404).json({ error: '角色不存在' });
      }

      const asset = await assetService.generateCharacterPrompt(character, {
        stylePreset: stylePreset || 'neutral_cinematic'
      });

      res.json(asset);
    } else {
      // 生成所有角色资产
      const assets = await assetService.generateCharacterAssets(
        job.storyBible.characters,
        { stylePreset: stylePreset || 'neutral_cinematic' }
      );

      res.json({ characters: assets });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成场景资产
 * POST /api/asset/scene/:jobId
 */
router.post('/scene/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.storyBible) {
      return res.status(404).json({ error: '任务或故事圣经不存在' });
    }

    const { sceneName, sceneDescription, stylePreset } = req.body;

    const scene = {
      name: sceneName || '未命名场景',
      description: sceneDescription || '',
      atmosphere: '中性'
    };

    const asset = await assetService.generateScenePrompt(scene, {
      stylePreset: stylePreset || 'neutral_cinematic'
    });

    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成道具资产
 * POST /api/asset/prop/:jobId
 */
router.post('/prop/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const { propName, propDescription, stylePreset } = req.body;

    const prop = {
      id: 'P01',
      name: propName || '未知道具',
      description: propDescription || ''
    };

    const asset = await assetService.generatePropPrompt(prop, {
      stylePreset: stylePreset || 'neutral_cinematic'
    });

    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取资产
 * GET /api/asset/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!job.assets) {
      return res.status(404).json({ error: '资产尚未生成' });
    }

    res.json(job.assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取指定类型资产
 * GET /api/asset/:jobId/:type
 */
router.get('/:jobId/:type', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.assets) {
      return res.status(404).json({ error: '任务或资产不存在' });
    }

    const { type } = req.params;
    const assets = job.assets[type];

    if (!assets) {
      return res.status(404).json({ error: '该类型资产不存在' });
    }

    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单个角色资产
 * GET /api/asset/:jobId/character/:characterId
 */
router.get('/:jobId/character/:characterId', async (req, res) => {
  try {
    const job = await req.app.locals.loadJob(req.params.jobId);
    if (!job || !job.assets) {
      return res.status(404).json({ error: '任务或资产不存在' });
    }

    const { characterId } = req.params;
    const character = job.assets.characters?.find(c => c.characterId === characterId);

    if (!character) {
      return res.status(404).json({ error: '该角色资产不存在' });
    }

    res.json(character);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
