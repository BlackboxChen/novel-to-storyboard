/**
 * 资产生成服务
 * 生成角色/道具/场景设定图提示词
 */

import { llmService } from './llm-service.js';
import { parseJSON } from '../utils/json-parser.js';
import { getStylePreset, getStylePromptModifiers, getStyleNegativePrompt } from '../config/style-presets.js';
import { getDeAIEnhancement, addDeAIElements } from '../config/deai-elements.js';

/**
 * 资产类型枚举
 */
export const ASSET_TYPES = {
  CHARACTER: 'character',
  PROP: 'prop',
  SCENE: 'scene'
};

/**
 * 资产生成服务类
 */
export class AssetService {
  constructor(options = {}) {
    this.options = {
      defaultStyle: 'neutral_cinematic',
      ...options
    };
  }

  /**
   * 生成角色设定图提示词
   * @param {Object} character - 角色信息
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateCharacterPrompt(character, options = {}) {
    const { stylePreset = this.options.defaultStyle } = options;
    const style = getStylePreset(stylePreset);

    // 构建角色描述
    const charDescription = this.buildCharacterDescription(character);

    // 生成提示词
    const prompt = `为以下角色生成设定图提示词：

## 角色信息
${JSON.stringify(character, null, 2)}

## 角色描述
${charDescription}

## 风格要求
${style.name}: ${style.promptModifiers.slice(0, 5).join(', ')}

## 输出要求
返回 JSON 格式：
{
  "characterId": "${character.id}",
  "characterName": "${character.name}",
  "basePrompt": "基础角色描述（英文）",
  "variations": {
    "portrait": {
      "description": "肖像特写",
      "prompt": "完整提示词",
      "negative": "Negative Prompt"
    },
    "fullBody": {
      "description": "全身立绘",
      "prompt": "完整提示词",
      "negative": "Negative Prompt"
    },
    "action": {
      "description": "动态姿势",
      "prompt": "完整提示词",
      "negative": "Negative Prompt"
    },
    "expression": {
      "description": "表情集",
      "prompt": "完整提示词",
      "negative": "Negative Prompt"
    }
  },
  "colorPalette": {
    "primary": "主色",
    "secondary": "辅色",
    "accent": "强调色"
  },
  "keyFeatures": ["关键特征1", "关键特征2"]
}`;

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 4096 });

      const parsed = parseJSON(response);

      if (parsed) {
        // 增强提示词
        return this.enhanceCharacterAsset(parsed, style);
      }
    } catch (error) {
      console.warn('[Asset] LLM 生成失败，使用模板:', error.message);
    }

    // 降级为模板生成
    return this.generateCharacterFromTemplate(character, style);
  }

  /**
   * 构建角色描述
   */
  buildCharacterDescription(character) {
    const parts = [];

    if (character.visualDescription) {
      parts.push(`外貌: ${character.visualDescription.appearance || ''}`);
      parts.push(`服装: ${character.visualDescription.clothing || ''}`);
      parts.push(`特征: ${character.visualDescription.distinctive || ''}`);
    }

    if (character.traits?.length > 0) {
      parts.push(`性格特点: ${character.traits.join(', ')}`);
    }

    if (character.archetype) {
      parts.push(`角色原型: ${character.archetype}`);
    }

    return parts.filter(Boolean).join('\n');
  }

  /**
   * 增强角色资产
   */
  enhanceCharacterAsset(asset, style) {
    const deai = getDeAIEnhancement({ randomWordCount: 2 });

    // 为每个变体添加去AI味
    for (const [key, variation] of Object.entries(asset.variations || {})) {
      if (variation.prompt) {
        variation.prompt = addDeAIElements(variation.prompt, {
          randomWordCount: 2,
          imperfectionCategories: ['skin', 'hair']
        });
      }
      if (!variation.negative || variation.negative.length < 50) {
        variation.negative = this.buildCharacterNegative(style, deai);
      }
    }

    asset.generatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * 从模板生成角色资产
   */
  generateCharacterFromTemplate(character, style) {
    const deai = getDeAIEnhancement({ randomWordCount: 2 });

    const visualDesc = character.visualDescription || {};
    const baseDescription = [
      visualDesc.appearance || `${character.name}, young adult`,
      visualDesc.clothing || 'casual clothing',
      visualDesc.distinctive || '',
      ...style.promptModifiers.slice(0, 3)
    ].filter(Boolean).join(', ');

    const variations = {
      portrait: {
        description: '肖像特写',
        prompt: `${baseDescription}, close-up portrait, detailed face, looking at camera, ${deai.randomWords.join(', ')}`,
        negative: this.buildCharacterNegative(style, deai)
      },
      fullBody: {
        description: '全身立绘',
        prompt: `${baseDescription}, full body standing, character sheet, white background, ${deai.randomWords.join(', ')}`,
        negative: this.buildCharacterNegative(style, deai)
      },
      action: {
        description: '动态姿势',
        prompt: `${baseDescription}, dynamic action pose, motion blur, dramatic lighting, ${deai.randomWords.join(', ')}`,
        negative: this.buildCharacterNegative(style, deai)
      },
      expression: {
        description: '表情集',
        prompt: `${baseDescription}, expression sheet, multiple expressions, character reference, ${deai.randomWords.join(', ')}`,
        negative: this.buildCharacterNegative(style, deai)
      }
    };

    return {
      characterId: character.id,
      characterName: character.name,
      basePrompt: baseDescription,
      variations,
      colorPalette: {
        primary: '待确定',
        secondary: '待确定',
        accent: '待确定'
      },
      keyFeatures: character.traits || [],
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 构建角色 Negative Prompt
   */
  buildCharacterNegative(style, deai) {
    const parts = [
      ...style.negativePrompt,
      'multiple people',
      'crowd',
      'blurry',
      'low quality',
      'bad anatomy',
      'deformed',
      'extra limbs',
      'watermark',
      'signature'
    ];
    return [...new Set(parts)].join(', ');
  }

  /**
   * 生成道具设定图提示词
   * @param {Object} prop - 道具信息
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generatePropPrompt(prop, options = {}) {
    const { stylePreset = this.options.defaultStyle } = options;
    const style = getStylePreset(stylePreset);

    const prompt = `为以下道具生成设定图提示词：

## 道具信息
名称: ${prop.name}
描述: ${prop.description || '无'}
类型: ${prop.type || '道具'}
重要性: ${prop.importance || '普通'}

## 风格要求
${style.name}: ${style.promptModifiers.slice(0, 3).join(', ')}

## 输出要求
返回 JSON 格式：
{
  "propId": "${prop.id || 'P01'}",
  "propName": "${prop.name}",
  "basePrompt": "基础道具描述（英文）",
  "views": {
    "main": { "prompt": "主视角提示词", "negative": "Negative" },
    "detail": { "prompt": "细节特写提示词", "negative": "Negative" },
    "context": { "prompt": "场景中使用提示词", "negative": "Negative" }
  },
  "materials": ["材质1", "材质2"],
  "colors": ["颜色1", "颜色2"]
}`;

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 2048 });

      const parsed = parseJSON(response);
      if (parsed) {
        return this.enhancePropAsset(parsed, style);
      }
    } catch (error) {
      console.warn('[Asset] Prop generation failed:', error.message);
    }

    return this.generatePropFromTemplate(prop, style);
  }

  /**
   * 增强道具资产
   */
  enhancePropAsset(asset, style) {
    const deai = getDeAIEnhancement({ randomWordCount: 1, foregroundType: 'none' });

    for (const [key, view] of Object.entries(asset.views || {})) {
      if (view.prompt) {
        view.prompt = `${view.prompt}, ${style.promptModifiers.slice(0, 2).join(', ')}`;
      }
      if (!view.negative) {
        view.negative = `blurry, low quality, 3d render, cgi, cartoon, ${style.negativePrompt.slice(0, 3).join(', ')}`;
      }
    }

    asset.generatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * 从模板生成道具资产
   */
  generatePropFromTemplate(prop, style) {
    const baseDescription = `${prop.name}, ${prop.description || 'detailed object'}, product photography style, ${style.promptModifiers.slice(0, 2).join(', ')}`;

    return {
      propId: prop.id || 'P01',
      propName: prop.name,
      basePrompt: baseDescription,
      views: {
        main: {
          prompt: `${baseDescription}, front view, white background`,
          negative: 'blurry, low quality, watermark'
        },
        detail: {
          prompt: `${baseDescription}, close-up detail, macro shot`,
          negative: 'blurry, low quality, watermark'
        },
        context: {
          prompt: `${baseDescription}, in use, environmental context`,
          negative: 'blurry, low quality, watermark'
        }
      },
      materials: [],
      colors: [],
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 生成场景参考图提示词
   * @param {Object} scene - 场景信息
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateScenePrompt(scene, options = {}) {
    const { stylePreset = this.options.defaultStyle } = options;
    const style = getStylePreset(stylePreset);

    const prompt = `为以下场景生成参考图提示词：

## 场景信息
名称: ${scene.name}
描述: ${scene.description || '无'}
氛围: ${scene.atmosphere || '中性'}
时间: ${scene.timeOfDay || '日间'}
天气: ${scene.weather || '晴朗'}

## 风格要求
${style.name}: ${style.promptModifiers.slice(0, 3).join(', ')}
导演风格: ${style.director || '通用'}

## 输出要求
返回 JSON 格式：
{
  "sceneId": "${scene.id || 'S01'}",
  "sceneName": "${scene.name}",
  "basePrompt": "基础场景描述（英文）",
  "variations": {
    "wide": { "prompt": "广角全景提示词", "negative": "Negative" },
    "establishing": { "prompt": "建立镜头提示词", "negative": "Negative" },
    "detail": { "prompt": "细节特写提示词", "negative": "Negative" },
    "atmosphere": { "prompt": "氛围镜头提示词", "negative": "Negative" }
  },
  "lighting": "光线描述",
  "mood": "氛围描述"
}`;

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 2048 });

      const parsed = parseJSON(response);
      if (parsed) {
        return this.enhanceSceneAsset(parsed, style);
      }
    } catch (error) {
      console.warn('[Asset] Scene generation failed:', error.message);
    }

    return this.generateSceneFromTemplate(scene, style);
  }

  /**
   * 增强场景资产
   */
  enhanceSceneAsset(asset, style) {
    const deai = getDeAIEnhancement({ randomWordCount: 2, foregroundType: 'particles' });

    for (const [key, variation] of Object.entries(asset.variations || {})) {
      if (variation.prompt) {
        variation.prompt = addDeAIElements(variation.prompt, {
          randomWordCount: 2,
          foregroundType: 'particles',
          imperfectionCategories: ['environment']
        });
      }
      if (!variation.negative) {
        variation.negative = this.buildSceneNegative(style);
      }
    }

    asset.generatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * 从模板生成场景资产
   */
  generateSceneFromTemplate(scene, style) {
    const deai = getDeAIEnhancement({ randomWordCount: 2 });

    const timeLighting = {
      '早晨': 'golden hour lighting, warm tones',
      '上午': 'natural daylight, soft shadows',
      '中午': 'harsh midday sun, high contrast',
      '下午': 'warm afternoon light',
      '傍晚': 'golden hour, sunset colors',
      '夜晚': 'night scene, artificial lighting, moonlight'
    };

    const lighting = timeLighting[scene.timeOfDay] || 'natural lighting';
    const baseDescription = `${scene.name}, ${scene.description || scene.name}, ${lighting}, ${style.promptModifiers.slice(0, 3).join(', ')}`;

    return {
      sceneId: scene.id || 'S01',
      sceneName: scene.name,
      basePrompt: baseDescription,
      variations: {
        wide: {
          prompt: `${baseDescription}, wide establishing shot, panoramic view, ${deai.randomWords.join(', ')}`,
          negative: this.buildSceneNegative(style)
        },
        establishing: {
          prompt: `${baseDescription}, establishing shot, environmental storytelling, ${deai.randomWords.join(', ')}`,
          negative: this.buildSceneNegative(style)
        },
        detail: {
          prompt: `${baseDescription}, close-up detail, textural elements, ${deai.randomWords.join(', ')}`,
          negative: this.buildSceneNegative(style)
        },
        atmosphere: {
          prompt: `${baseDescription}, atmospheric shot, mood lighting, ${deai.foregroundLayer}, ${deai.randomWords.join(', ')}`,
          negative: this.buildSceneNegative(style)
        }
      },
      lighting,
      mood: scene.atmosphere || 'cinematic',
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 构建场景 Negative Prompt
   */
  buildSceneNegative(style) {
    return [
      ...style.negativePrompt,
      'people',
      'characters',
      'text',
      'watermark',
      'blurry',
      'low quality'
    ].join(', ');
  }

  /**
   * 批量生成角色资产
   * @param {Array} characters
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async generateCharacterAssets(characters, options = {}) {
    const assets = [];

    for (const character of characters) {
      try {
        const asset = await this.generateCharacterPrompt(character, options);
        assets.push(asset);
      } catch (error) {
        console.error(`[Asset] Failed to generate asset for ${character.name}:`, error.message);
        // 添加降级版本
        const style = getStylePreset(options.stylePreset || this.options.defaultStyle);
        assets.push(this.generateCharacterFromTemplate(character, style));
      }

      // 延迟避免限流
      await this.delay(500);
    }

    return assets;
  }

  /**
   * 从故事圣经提取并生成所有资产
   * @param {Object} storyBible
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generateAllAssets(storyBible, options = {}) {
    const result = {
      characters: [],
      props: [],
      scenes: []
    };

    // 生成角色资产
    if (storyBible.characters?.length > 0) {
      console.log(`[Asset] 生成 ${storyBible.characters.length} 个角色资产...`);
      result.characters = await this.generateCharacterAssets(storyBible.characters, options);
    }

    // 提取并生成场景资产
    const locations = this.extractLocations(storyBible);
    if (locations.length > 0) {
      console.log(`[Asset] 生成 ${locations.length} 个场景资产...`);
      for (const location of locations) {
        try {
          const asset = await this.generateScenePrompt(location, options);
          result.scenes.push(asset);
        } catch (error) {
          const style = getStylePreset(options.stylePreset || this.options.defaultStyle);
          result.scenes.push(this.generateSceneFromTemplate(location, style));
        }
        await this.delay(500);
      }
    }

    result.generatedAt = new Date().toISOString();
    return result;
  }

  /**
   * 从故事圣经提取场景
   */
  extractLocations(storyBible) {
    const locationMap = new Map();

    // 从事件提取
    if (storyBible.events) {
      for (const event of storyBible.events) {
        if (event.location) {
          locationMap.set(event.location, {
            id: `S${String(locationMap.size + 1).padStart(2, '0')}`,
            name: event.location,
            description: '',
            atmosphere: event.emotionalTone || '中性'
          });
        }
      }
    }

    // 从世界信息提取
    if (storyBible.worldInfo?.setting) {
      const setting = storyBible.worldInfo.setting;
      if (!locationMap.has(setting)) {
        locationMap.set(setting, {
          id: `S${String(locationMap.size + 1).padStart(2, '0')}`,
          name: setting,
          description: setting
        });
      }
    }

    return Array.from(locationMap.values());
  }

  /**
   * 延迟辅助
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const assetService = new AssetService();

export default AssetService;
