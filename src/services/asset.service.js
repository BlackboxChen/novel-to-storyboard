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
  CHARACTER_TURNAROUND: 'character_turnaround',  // 角色四视图
  CHARACTER_EXPRESSION: 'character_expression',   // 角色表情参考
  PROP: 'prop',
  SCENE: 'scene'
};

/**
 * 使用LLM智能提取资产（场景和道具）
 * @param {Object} storyBible - 故事圣经
 * @returns {Promise<Object>} { scenes: [], props: [] }
 */
async function extractAssetsWithLLM(storyBible) {
  // 准备事件摘要文本
  const eventSummaries = (storyBible.events || [])
    .slice(0, 20)
    .map(e => `- ${e.id}: ${e.summary}`)
    .join('\n');

  // 准备角色信息
  const characterInfo = (storyBible.characters || [])
    .slice(0, 5)
    .map(c => `- ${c.name}: ${(c.traits || []).slice(0, 3).join(', ')}`)
    .join('\n');

  const prompt = `你是一个专业的资产提取助手。请从以下故事信息中提取出重要的场景和道具。

## 故事标题
${storyBible.title || '未命名'}

## 故事主题
${storyBible.mainTheme || ''}

## 故事氛围
${(storyBible.toneKeywords || []).join(', ')}

## 主要角色
${characterInfo}

## 主要事件
${eventSummaries}

## 任务
请分析以上内容，提取出：
1. **场景**: 故事中出现的地点、场所、环境。提取3-6个最重要的场景。
2. **道具**: 故事中重要的物品、器具、证据等。提取3-8个最重要的道具。

## 输出格式（纯JSON，无代码块）
{
  "scenes": [
    {
      "name": "场景名称",
      "description": "场景描述（基于故事内容）",
      "atmosphere": "氛围（如：悬疑、恐怖、温馨）",
      "importance": "重要程度（高/中/低）"
    }
  ],
  "props": [
    {
      "name": "道具名称",
      "description": "道具描述（基于故事内容）",
      "type": "道具类型（如：证据、武器、日常用品）",
      "importance": "重要程度（高/中/低）"
    }
  ]
}

## 注意事项
1. 场景和道具必须与故事内容相关
2. 描述要简洁但具体
3. 优先提取对剧情有重要作用的内容
4. 不要凭空创造，只提取故事中明确提及或暗示的内容`;

  try {
    console.log('[Asset] 使用LLM提取资产...');
    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 2048, temperature: 0.3 });

    const parsed = parseJSON(response);
    if (parsed && (parsed.scenes?.length > 0 || parsed.props?.length > 0)) {
      console.log(`[Asset] LLM提取到 ${parsed.scenes?.length || 0} 个场景, ${parsed.props?.length || 0} 个道具`);
      return {
        scenes: parsed.scenes || [],
        props: parsed.props || []
      };
    }
  } catch (error) {
    console.warn('[Asset] LLM提取失败，使用关键词fallback:', error.message);
  }

  // Fallback: 返回空数组，让调用者使用关键词提取
  return { scenes: [], props: [] };
}

/**
 * 表情类型
 */
const EXPRESSION_TYPES = [
  { id: 'neutral', name: '中性/平静', en: 'neutral calm expression', description: '面无表情，自然状态' },
  { id: 'happy', name: '喜悦', en: 'happy smiling expression', description: '微笑，眼角上扬' },
  { id: 'sad', name: '悲伤', en: 'sad melancholic expression', description: '眉头紧锁，嘴角下垂' },
  { id: 'angry', name: '愤怒', en: 'angry furious expression', description: '眉毛紧皱，眼神凌厉' },
  { id: 'surprised', name: '惊讶', en: 'surprised shocked expression', description: '眼睛睁大，嘴巴微张' },
  { id: 'fearful', name: '恐惧', en: 'fearful scared expression', description: '瞳孔收缩，面色紧张' }
];

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

    // 生成角色资产（包含四视图和表情）
    if (storyBible.characters?.length > 0) {
      console.log(`[Asset] 生成 ${storyBible.characters.length} 个角色资产...`);
      for (const character of storyBible.characters) {
        try {
          // 生成完整角色资产（基础 + 四视图 + 表情）
          const asset = await this.generateFullCharacterAssets(character, options);
          result.characters.push(asset);
        } catch (error) {
          console.error(`[Asset] Failed to generate asset for ${character.name}:`, error.message);
          // 添加降级版本
          const style = getStylePreset(options.stylePreset || this.options.defaultStyle);
          const fallbackAsset = this.generateCharacterFromTemplate(character, style);
          // 添加四视图和表情
          fallbackAsset.turnaround = this.generateCharacterTurnaround(character, options.stylePreset);
          fallbackAsset.expressions = this.generateCharacterExpressions(character, options.stylePreset);
          result.characters.push(fallbackAsset);
        }
        await this.delay(500);
      }
    }

    // 使用LLM智能提取场景和道具
    let extractedScenes = [];
    let extractedProps = [];

    try {
      const llmResult = await extractAssetsWithLLM(storyBible);
      extractedScenes = llmResult.scenes;
      extractedProps = llmResult.props;
    } catch (error) {
      console.warn('[Asset] LLM提取失败，使用关键词fallback');
    }

    // 如果LLM提取为空，使用关键词提取作为fallback
    if (extractedScenes.length === 0) {
      extractedScenes = this.extractLocations(storyBible);
    }
    if (extractedProps.length === 0) {
      extractedProps = this.extractProps(storyBible);
    }

    // 生成场景资产
    if (extractedScenes.length > 0) {
      console.log(`[Asset] 生成 ${extractedScenes.length} 个场景资产...`);
      for (const scene of extractedScenes) {
        try {
          const asset = await this.generateScenePrompt(scene, options);
          result.scenes.push(asset);
        } catch (error) {
          const style = getStylePreset(options.stylePreset || this.options.defaultStyle);
          result.scenes.push(this.generateSceneFromTemplate(scene, style));
        }
        await this.delay(500);
      }
    }

    // 生成道具资产
    if (extractedProps.length > 0) {
      console.log(`[Asset] 生成 ${extractedProps.length} 个道具资产...`);
      for (const prop of extractedProps) {
        try {
          const asset = await this.generatePropPrompt(prop, options);
          result.props.push(asset);
        } catch (error) {
          const style = getStylePreset(options.stylePreset || this.options.defaultStyle);
          result.props.push(this.generatePropFromTemplate(prop, style));
        }
        await this.delay(300);
      }
    }

    result.generatedAt = new Date().toISOString();
    return result;
  }

  /**
   * 从故事圣经提取道具
   */
  extractProps(storyBible) {
    const props = [];
    const foundProps = new Set();

    // 扩展道具关键词列表
    const propKeywords = [
      // 武器类
      '剑', '枪', '刀', '武器', '匕首', '凶器',
      // 通讯类
      '手机', '电话', '信', '信件', '信封',
      // 交通类
      '钥匙', '车', '汽车', '马车',
      // 书籍类
      '书', '书籍', '日记', '笔记本', '珍稀书籍',
      // 饰品类
      '戒指', '项链', '手表', '怀表', '珠宝',
      // 医药类
      '药', '药品', '毒药', '药瓶',
      // 金钱类
      '钱', '金币', '钞票',
      // 图像类
      '照片', '画像', '肖像',
      // 照明类
      '蜡烛', '灯', '台灯', '油灯',
      // 家具类
      '镜子', '窗户', '门',
      // 案件相关
      '尸体', '血迹', '指纹', '证据', '文件',
      // 侦探工具
      '放大镜', '显微镜', '尺子', '测量工具',
      // 特殊道具
      '弹簧', '钉子', '窗户机关', '头发样本'
    ];

    // 从事件中提取道具
    if (storyBible.events) {
      for (const event of storyBible.events) {
        const text = event.summary || '';
        for (const keyword of propKeywords) {
          if (text.includes(keyword) && !foundProps.has(keyword)) {
            foundProps.add(keyword);
            props.push({
              id: `P${String(props.length + 1).padStart(2, '0')}`,
              name: keyword,
              description: `来自事件: ${text.slice(0, 80)}`,
              type: '道具',
              importance: '普通'
            });
          }
        }
      }
    }

    // 从角色信息提取道具（如果有）
    if (storyBible.characters) {
      for (const char of storyBible.characters) {
        const traits = (char.traits || []).join(' ');
        const desc = char.description || '';
        const text = traits + ' ' + desc;

        for (const keyword of propKeywords) {
          if (text.includes(keyword) && !foundProps.has(keyword)) {
            foundProps.add(keyword);
            props.push({
              id: `P${String(props.length + 1).padStart(2, '0')}`,
              name: keyword,
              description: `${char.name} 相关道具`,
              type: '道具',
              importance: '重要'
            });
          }
        }
      }
    }

    // 如果道具太少，添加一些默认道具
    if (props.length < 3) {
      const defaultProps = ['信件', '钥匙', '放大镜'];
      for (const prop of defaultProps) {
        if (!foundProps.has(prop)) {
          props.push({
            id: `P${String(props.length + 1).padStart(2, '0')}`,
            name: prop,
            description: '故事相关道具',
            type: '道具',
            importance: '普通'
          });
        }
      }
    }

    console.log(`[Asset] 提取到 ${props.length} 个道具`);
    return props.slice(0, 8); // 增加限制数量
  }

  /**
   * 从故事圣经提取场景
   */
  extractLocations(storyBible) {
    const locationMap = new Map();

    // 场景关键词映射
    const locationKeywords = [
      { pattern: /图书馆|书馆|书房|藏书/g, name: '图书馆/书房' },
      { pattern: /街道|马路|巷|街头/g, name: '街道' },
      { pattern: /公寓|房间|卧室|起居室/g, name: '公寓/房间' },
      { pattern: /酒吧|酒馆|咖啡|茶馆/g, name: '酒吧/茶馆' },
      { pattern: /办公室|事务所|侦探社/g, name: '办公室/事务所' },
      { pattern: /森林|树林|树林/g, name: '森林' },
      { pattern: /海边|海滩|港口|码头/g, name: '海边/港口' },
      { pattern: /山|山顶|山谷/g, name: '山区' },
      { pattern: /医院|诊所|医务室/g, name: '医院/诊所' },
      { pattern: /学校|大学|教室|校园/g, name: '学校/校园' },
      { pattern: /教堂|寺庙|神社/g, name: '宗教场所' },
      { pattern: /监狱|牢房|拘留所/g, name: '监狱' },
      { pattern: /银行|金库/g, name: '银行' },
      { pattern: /餐厅|饭馆|厨房/g, name: '餐厅/厨房' },
      { pattern: /花园|公园|庭院/g, name: '花园/公园' },
      { pattern: /地下室|阁楼|屋顶/g, name: '地下室/阁楼' },
      { pattern: /尸体|凶案|现场|命案/g, name: '案发现场' },
      { pattern: /巴黎|伦敦|纽约|东京|上海|北京/g, name: '城市' },
      { pattern: /莫格街|街道/g, name: '莫格街' }
    ];

    // 从事件摘要中提取场景
    if (storyBible.events) {
      for (const event of storyBible.events) {
        const text = event.summary || '';

        for (const { pattern, name } of locationKeywords) {
          if (pattern.test(text) && !locationMap.has(name)) {
            locationMap.set(name, {
              id: `S${String(locationMap.size + 1).padStart(2, '0')}`,
              name: name,
              description: `来自事件: ${text.slice(0, 80)}`,
              atmosphere: event.emotionalTone || '悬疑'
            });
            break; // 每个事件只提取一个场景
          }
        }
      }
    }

    // 从主题关键词推断场景
    if (storyBible.toneKeywords) {
      const toneToLocation = {
        '古典': '古典建筑',
        '哥特': '哥特式建筑',
        '恐怖': '阴暗场景',
        '悬疑': '神秘场所'
      };

      for (const tone of storyBible.toneKeywords) {
        if (toneToLocation[tone] && !locationMap.has(toneToLocation[tone])) {
          locationMap.set(toneToLocation[tone], {
            id: `S${String(locationMap.size + 1).padStart(2, '0')}`,
            name: toneToLocation[tone],
            description: `基于故事氛围: ${tone}`,
            atmosphere: tone
          });
        }
      }
    }

    // 如果没有找到任何场景，添加默认场景
    if (locationMap.size === 0) {
      locationMap.set('主场景', {
        id: 'S01',
        name: '主场景',
        description: storyBible.title || '故事主场景',
        atmosphere: '悬疑'
      });
    }

    console.log(`[Asset] 提取到 ${locationMap.size} 个场景`);
    return Array.from(locationMap.values()).slice(0, 6); // 限制数量
  }

  /**
   * 延迟辅助
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== 新增：四视图和表情参考 ====================

  /**
   * 生成角色四视图提示词（正面、侧面、背面、四分之三）
   * @param {Object} character - 角色信息 { name, appearance, clothing, archetype }
   * @param {string} stylePreset - 风格预设
   * @returns {Object} 四视图提示词
   */
  generateCharacterTurnaround(character, stylePreset = 'neutral_cinematic') {
    const style = getStylePreset(stylePreset);
    const deai = getDeAIEnhancement({ randomWordCount: 2 });

    const { name, visualDescription, archetype } = character;

    // 基础角色描述
    const baseDescription = this.buildTurnaroundBaseDescription(character);

    // 四个视角
    const views = {
      front: {
        angle: 'front view',
        angleCn: '正面',
        description: `${baseDescription}, facing camera directly, symmetrical pose, neutral expression`,
        prompt: this.buildTurnaroundViewPrompt(baseDescription, 'front view facing camera symmetrical', style, deai)
      },
      side: {
        angle: 'side view / profile',
        angleCn: '侧面',
        description: `${baseDescription}, profile view, facing left, standing straight`,
        prompt: this.buildTurnaroundViewPrompt(baseDescription, 'side view profile facing left', style, deai)
      },
      back: {
        angle: 'back view',
        angleCn: '背面',
        description: `${baseDescription}, viewed from behind, showing back details`,
        prompt: this.buildTurnaroundViewPrompt(baseDescription, 'back view from behind', style, deai)
      },
      three_quarter: {
        angle: 'three-quarter view',
        angleCn: '四分之三',
        description: `${baseDescription}, 45 degree angle, dynamic pose`,
        prompt: this.buildTurnaroundViewPrompt(baseDescription, 'three-quarter view 45 degree angle', style, deai)
      }
    };

    // 整合提示词（用于生成单张四视图）
    const combinedPrompt = this.buildCombinedTurnaroundPrompt(baseDescription, style, deai);

    return {
      type: ASSET_TYPES.CHARACTER_TURNAROUND,
      characterId: character.id,
      characterName: name,
      archetype: archetype || 'unknown',
      views,
      combinedPrompt,
      negativePrompt: this.buildTurnaroundNegativePrompt(style, deai),
      metadata: {
        style: stylePreset,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 构建四视图基础描述
   */
  buildTurnaroundBaseDescription(character) {
    const parts = [];

    if (character.visualDescription) {
      if (character.visualDescription.appearance) {
        parts.push(character.visualDescription.appearance);
      }
      if (character.visualDescription.clothing) {
        parts.push(`wearing ${character.visualDescription.clothing}`);
      }
    }

    if (character.archetype) {
      const archetypeTraits = this.getArchetypeVisualTraits(character.archetype);
      parts.push(archetypeTraits);
    }

    // 如果没有视觉描述，使用基础描述
    if (parts.length === 0) {
      parts.push(`${character.name || 'character'}, young adult, detailed design`);
    }

    return parts.join(', ');
  }

  /**
   * 获取原型视觉特征
   */
  getArchetypeVisualTraits(archetype) {
    const traits = {
      'underdog': 'humble appearance, determined eyes, resilient posture',
      'hidden_identity': 'mysterious aura, composed expression, subtle confidence',
      'gray': 'complex expression, morally ambiguous vibe, sharp features',
      'oppressor': 'intimidating presence, arrogant posture, commanding aura',
      'wildcard': 'unpredictable energy, mischievous smile, dynamic pose',
      'ally': 'warm expression, trustworthy appearance, supportive posture'
    };

    return traits[archetype] || 'distinctive character presence';
  }

  /**
   * 构建四视图单视角提示词
   */
  buildTurnaroundViewPrompt(baseDescription, angle, style, deai) {
    const parts = [
      baseDescription,
      angle,
      'character turnaround sheet',
      'consistent design',
      'clean background',
      'professional character design',
      'full body',
      ...deai.randomWords,
      ...(style.promptModifiers || []).slice(0, 2)
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * 构建整合四视图提示词
   */
  buildCombinedTurnaroundPrompt(baseDescription, style, deai) {
    const parts = [
      baseDescription,
      'character turnaround sheet',
      'four views: front view, side view, back view, three-quarter view',
      'same character in all views',
      'consistent design across all angles',
      'white background',
      'reference sheet layout',
      'professional character design',
      'detailed anatomy',
      'clean lineart',
      ...deai.randomWords,
      ...(style.promptModifiers || []).slice(0, 3)
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * 构建四视图负面提示词
   */
  buildTurnaroundNegativePrompt(style, deai) {
    const parts = [
      'inconsistent design',
      'different faces',
      'asymmetrical features',
      'deformed',
      'distorted',
      'blurry',
      'low quality',
      'bad anatomy',
      'extra limbs',
      'missing limbs',
      'different clothing',
      'different hair',
      ...(style.negativePrompt || [])
    ];

    return [...new Set(parts)].join(', ');
  }

  /**
   * 生成角色表情参考图提示词
   * @param {Object} character - 角色信息
   * @param {string} stylePreset - 风格预设
   * @param {Array} expressions - 要生成的表情列表（默认全部6种）
   * @returns {Object} 表情参考提示词
   */
  generateCharacterExpressions(character, stylePreset = 'neutral_cinematic', expressions = null) {
    const style = getStylePreset(stylePreset);
    const deai = getDeAIEnhancement({ randomWordCount: 2 });

    const baseDescription = this.buildTurnaroundBaseDescription(character);
    const targetExpressions = expressions || EXPRESSION_TYPES;

    const expressionPrompts = targetExpressions.map(expr => ({
      id: expr.id,
      name: expr.name,
      nameEn: expr.en,
      description: expr.description,
      prompt: this.buildExpressionViewPrompt(baseDescription, expr, style, deai)
    }));

    // 整合表情图提示词
    const combinedPrompt = this.buildCombinedExpressionPrompt(baseDescription, targetExpressions, style, deai);

    return {
      type: ASSET_TYPES.CHARACTER_EXPRESSION,
      characterId: character.id,
      characterName: character.name,
      expressions: expressionPrompts,
      combinedPrompt,
      negativePrompt: this.buildTurnaroundNegativePrompt(style, deai),
      metadata: {
        style: stylePreset,
        expressionCount: targetExpressions.length,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 构建单表情提示词
   */
  buildExpressionViewPrompt(baseDescription, expression, style, deai) {
    const parts = [
      baseDescription,
      expression.en,
      'face close-up portrait',
      'detailed facial features',
      expression.description,
      ...deai.randomWords,
      ...(style.promptModifiers || []).slice(0, 2)
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * 构建整合表情图提示词
   */
  buildCombinedExpressionPrompt(baseDescription, expressions, style, deai) {
    const expressionList = expressions.map(e => e.name).join(', ');

    const parts = [
      baseDescription,
      'expression sheet',
      `expressions: ${expressionList}`,
      'multiple facial expressions',
      'same character',
      'consistent design',
      'grid layout',
      'reference sheet',
      'professional character design',
      ...deai.randomWords,
      ...(style.promptModifiers || []).slice(0, 3)
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * 增强版角色资产生成（包含四视图和表情）
   * @param {Object} character - 角色信息
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateFullCharacterAssets(character, options = {}) {
    const { stylePreset = this.options.defaultStyle } = options;

    // 生成基础角色设定
    const baseAsset = await this.generateCharacterPrompt(character, options);

    // 生成四视图
    const turnaround = this.generateCharacterTurnaround(character, stylePreset);

    // 生成表情参考
    const expressions = this.generateCharacterExpressions(character, stylePreset);

    return {
      ...baseAsset,
      turnaround,
      expressions,
      generatedAt: new Date().toISOString()
    };
  }
}

// 导出单例
export const assetService = new AssetService();

export default AssetService;
