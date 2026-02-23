/**
 * 分镜生成服务
 * 完整实现：5D框架、去AI味元素、Negative Prompt
 */

import { llmService } from './llm-service.js';
import { parseJSON } from '../utils/json-parser.js';
import {
  getStylePreset,
  getStylePromptModifiers,
  getStyleNegativePrompt,
  getAllStylePresets
} from '../config/style-presets.js';
import {
  addDeAIElements,
  generateNegativePrompt,
  getDeAIEnhancement,
  generateRandomWords,
  getImperfections,
  getForegroundElement
} from '../config/deai-elements.js';
import { getRhythmTemplate } from '../config/rhythm-templates.js';
import { generateStoryboardPrompt, generateClipPrompt } from '../prompts/storyboard.prompt.js';

/**
 * 分镜生成服务类
 */
export class StoryboardService {
  constructor(options = {}) {
    this.options = {
      defaultMode: 'A',
      defaultStyle: 'neutral_cinematic',
      ...options
    };
  }

  /**
   * 生成分镜 - 总入口
   * @param {string} scriptContent - 剧本内容
   * @param {number} episodeNumber - 集数
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateStoryboard(scriptContent, episodeNumber, options = {}) {
    const {
      mode = this.options.defaultMode,
      stylePreset = this.options.defaultStyle
    } = options;

    console.log(`[Storyboard] 生成第 ${episodeNumber} 集分镜，模式: ${mode}, 风格: ${stylePreset}`);

    const prompt = generateStoryboardPrompt(scriptContent, episodeNumber, {
      mode,
      stylePreset
    });

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 8192 });

      // 解析分镜内容
      const clips = this.parseStoryboardResponse(response, stylePreset);

      return {
        episodeNumber,
        mode,
        stylePreset,
        clips,
        rawContent: response,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Storyboard] 生成失败:', error.message);
      return this.generateFallbackStoryboard(scriptContent, episodeNumber, options);
    }
  }

  /**
   * 解析分镜响应
   * @param {string} response
   * @param {string} stylePreset
   * @returns {Array}
   */
  parseStoryboardResponse(response, stylePreset) {
    const clips = [];

    // 匹配片段块
    const clipPattern = /###\s*V(\d+)\s*\|\s*([^|]+)\s*\|\s*(\d+(?:-\d+)?s?)\s*\n([\s\S]*?)(?=###\s*V\d+|$)/g;
    let match;

    while ((match = clipPattern.exec(response)) !== null) {
      const [_, id, title, duration, content] = match;

      const clip = {
        id: `V${id.padStart(2, '0')}`,
        title: title.trim(),
        duration: this.parseDuration(duration),
        ...this.parseClipContent(content, stylePreset)
      };

      clips.push(clip);
    }

    // 如果解析失败，创建默认片段
    if (clips.length === 0) {
      clips.push(this.createDefaultClip(1, stylePreset));
    }

    return clips;
  }

  /**
   * 解析片段内容
   */
  parseClipContent(content, stylePreset) {
    // 提取段落意图
    const intentMatch = content.match(/\*\*段落意图\*\*[：:]\s*([^\n]+)/);
    const intent = intentMatch ? intentMatch[1].trim() : '';

    // 提取情绪
    const emotionMatch = content.match(/\*\*情绪\*\*[：:]\s*([^\n]+)/);
    const emotion = emotionMatch ? emotionMatch[1].trim() : '';

    // 提取转场
    const transitionMatch = content.match(/\*\*转场\*\*[：:]\s*([^\n]+)/);
    const transition = transitionMatch ? transitionMatch[1].trim() : '';

    // 提取镜头与节奏
    const cameraMatch = content.match(/\*\*镜头与节奏\*\*[：:]\s*\n```[\s\S]*?```/);
    const camera = cameraMatch ? cameraMatch[0] : '';

    // 提取5D框架
    const d5Match = content.match(/\*\*5D框架提示词\*\*[：:]\s*\n```([\s\S]*?)```/);
    const d5Raw = d5Match ? d5Match[1] : '';

    // 解析5D
    const d5 = this.parse5DFramework(d5Raw);

    // 提取去AI味元素
    const deaiMatch = content.match(/\*\*去AI味元素\*\*[：:]\s*\n```([\s\S]*?)```/);
    const deaiRaw = deaiMatch ? deaiMatch[1] : '';
    const deai = this.parseDeAIElements(deaiRaw);

    // 提取完整提示词
    const promptMatch = content.match(/\*\*完整提示词.*?\*\*[：:]\s*\n```([\s\S]*?)```/i);
    const combinedPrompt = promptMatch ? promptMatch[1].trim() : '';

    // 提取 Negative
    const negativeMatch = content.match(/\*\*Negative.*?\*\*[：:]\s*\n```([\s\S]*?)```/i);
    const negative = negativeMatch ? negativeMatch[1].trim() : generateNegativePrompt();

    return {
      intent,
      emotion,
      transition,
      camera,
      prompt: {
        ...d5,
        ...deai,
        combined: combinedPrompt || this.combinePrompt(d5, deai, stylePreset),
        negative
      }
    };
  }

  /**
   * 解析5D框架
   */
  parse5DFramework(raw) {
    const d5 = {
      d1_subject: '',
      d2_environment: '',
      d3_material: '',
      d4_camera: '',
      d5_mood: ''
    };

    if (!raw) return d5;

    // 匹配每个维度
    const patterns = {
      d1_subject: /D1\s*主体[：:]\s*([^\n]+)/i,
      d2_environment: /D2\s*环境.*?[：:]\s*([^\n]+)/i,
      d3_material: /D3\s*材质.*?[：:]\s*([^\n]+)/i,
      d4_camera: /D4\s*拍摄.*?[：:]\s*([^\n]+)/i,
      d5_mood: /D5\s*氛围.*?[：:]\s*([^\n]+)/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = raw.match(pattern);
      if (match) {
        d5[key] = match[1].trim();
      }
    }

    return d5;
  }

  /**
   * 解析去AI味元素
   */
  parseDeAIElements(raw) {
    const deai = {
      imperfections: [],
      randomWords: [],
      foregroundLayer: ''
    };

    if (!raw) return deai;

    // 匹配不完美
    const imperfectionsMatch = raw.match(/不完美[：:]\s*\[?([^\]\n]+)/);
    if (imperfectionsMatch) {
      deai.imperfections = imperfectionsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    // 匹配随机词
    const randomMatch = raw.match(/随机词[：:]\s*\[?([^\]\n]+)/);
    if (randomMatch) {
      deai.randomWords = randomMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    // 匹配前景层
    const foregroundMatch = raw.match(/前景层[：:]\s*([^\n]+)/);
    if (foregroundMatch) {
      deai.foregroundLayer = foregroundMatch[1].trim();
    }

    return deai;
  }

  /**
   * 组合提示词
   */
  combinePrompt(d5, deai, stylePreset) {
    const parts = [];

    // 添加5D内容
    if (d5.d1_subject) parts.push(d5.d1_subject);
    if (d5.d2_environment) parts.push(d5.d2_environment);
    if (d5.d3_material) parts.push(d5.d3_material);
    if (d5.d4_camera) parts.push(d5.d4_camera);
    if (d5.d5_mood) parts.push(d5.d5_mood);

    // 添加去AI味元素
    if (deai.imperfections?.length > 0) {
      parts.push(...deai.imperfections);
    }
    if (deai.randomWords?.length > 0) {
      parts.push(...deai.randomWords);
    }
    if (deai.foregroundLayer) {
      parts.push(deai.foregroundLayer);
    }

    // 添加风格修饰
    const styleModifiers = getStylePromptModifiers(stylePreset);
    parts.push(styleModifiers);

    return parts.join(', ');
  }

  /**
   * 解析时长
   */
  parseDuration(durationStr) {
    const match = durationStr.match(/(\d+)(?:-(\d+))?s?/);
    if (match) {
      const start = parseInt(match[1]);
      const end = match[2] ? parseInt(match[2]) : start + 10;
      return { start, end, total: end - start };
    }
    return { start: 0, end: 10, total: 10 };
  }

  /**
   * 创建默认片段
   */
  createDefaultClip(index, stylePreset) {
    const deai = getDeAIEnhancement({ randomWordCount: 3 });
    const style = getStylePreset(stylePreset);

    return {
      id: `V${String(index).padStart(2, '0')}`,
      title: `片段 ${index}`,
      duration: { start: (index - 1) * 10, end: index * 10, total: 10 },
      intent: '待补充',
      emotion: '中性 · 5',
      transition: '← 淡入 | → 淡出',
      camera: '',
      prompt: {
        d1_subject: '主体描述待补充',
        d2_environment: '环境光线待补充',
        d3_material: '材质细节待补充',
        d4_camera: 'medium shot, slow pan',
        d5_mood: 'cinematic mood',
        imperfections: deai.imperfections,
        randomWords: deai.randomWords,
        foregroundLayer: deai.foregroundLayer,
        combined: style.promptModifiers.join(', '),
        negative: deai.negativePrompt
      }
    };
  }

  /**
   * 生成单个片段（5D框架完整实现）
   * @param {Object} segment - 片段信息
   * @param {string} stylePreset - 风格预设
   * @returns {Object}
   */
  generateClip(segment, stylePreset = 'neutral_cinematic') {
    const style = getStylePreset(stylePreset);
    const deai = getDeAIEnhancement({ randomWordCount: 3, foregroundType: 'particles' });

    // 生成5D框架
    const d5 = this.generate5DFramework(segment, style);

    // 组合提示词
    const combined = this.buildFullPrompt(d5, deai, style);

    // 生成 Negative
    const negative = this.buildNegativePrompt(style, deai);

    return {
      id: segment.id || 'V01',
      title: segment.title || '片段',
      duration: segment.duration || { start: 0, end: 10, total: 10 },
      intent: segment.intent || '',
      emotion: segment.emotion || '',
      transition: segment.transition || '',
      camera: segment.camera || '',
      prompt: {
        ...d5,
        imperfections: deai.imperfections,
        randomWords: deai.randomWords,
        foregroundLayer: deai.foregroundLayer,
        combined,
        negative
      }
    };
  }

  /**
   * 生成5D框架
   * @param {Object} segment
   * @param {Object} style
   * @returns {Object}
   */
  generate5DFramework(segment, style) {
    // 从片段信息提取
    const visual = segment.visual || segment.description || '';
    const emotion = segment.emotion || '';

    // D1: 主体
    const d1_subject = this.extractSubject(visual, segment);

    // D2: 环境光线
    const d2_environment = this.extractEnvironment(visual, style, segment);

    // D3: 材质细节
    const d3_material = this.extractMaterial(visual);

    // D4: 拍摄风格
    const d4_camera = this.extractCameraStyle(visual, style, segment);

    // D5: 氛围情感
    const d5_mood = this.extractMood(emotion, style);

    return {
      d1_subject,
      d2_environment,
      d3_material,
      d4_camera,
      d5_mood
    };
  }

  /**
   * 提取主体描述
   */
  extractSubject(visual, segment) {
    // 如果有角色信息
    if (segment.character) {
      const char = segment.character;
      return `${char.appearance || ''}, ${char.clothing || ''}, ${char.pose || ''}`.trim();
    }

    // 从视觉描述提取
    if (visual.includes('人') || visual.includes('角色')) {
      return visual.slice(0, 100);
    }

    return 'subject in scene';
  }

  /**
   * 提取环境光线
   */
  extractEnvironment(visual, style, segment) {
    const location = segment.location || '';

    // 基于风格的光线描述
    const lighting = style.lighting?.examples?.[0] || 'natural lighting';

    if (location) {
      return `${location}, ${lighting}`;
    }

    return lighting;
  }

  /**
   * 提取材质细节
   */
  extractMaterial(visual) {
    // 默认材质描述
    const materials = ['natural skin texture', 'realistic fabric', 'environmental details'];
    return materials.join(', ');
  }

  /**
   * 提取拍摄风格
   */
  extractCameraStyle(visual, style, segment) {
    const shots = style.cameraStyle?.shots || ['medium shot'];
    const movements = style.cameraStyle?.movements || ['static'];

    // 根据情绪选择
    const shot = segment.emotion?.includes('高潮') ? 'close-up' : shots[0];
    const movement = segment.emotion?.includes('紧张') ? 'slow zoom' : movements[0];

    return `${shot}, ${movement}`;
  }

  /**
   * 提取氛围情感
   */
  extractMood(emotion, style) {
    if (emotion) {
      return emotion;
    }

    const moods = style.characteristics || ['cinematic'];
    return moods.join(', ');
  }

  /**
   * 构建完整提示词
   */
  buildFullPrompt(d5, deai, style) {
    const parts = [
      d5.d1_subject,
      d5.d2_environment,
      d5.d3_material,
      d5.d4_camera,
      d5.d5_mood,
      ...deai.randomWords,
      deai.foregroundLayer,
      ...style.promptModifiers.slice(0, 3)
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * 构建 Negative Prompt
   */
  buildNegativePrompt(style, deai) {
    const parts = [
      ...style.negativePrompt,
      ...deai.negativePrompt.split(', ')
    ];

    return [...new Set(parts)].join(', ');
  }

  /**
   * 添加去AI味元素
   * @param {string} basePrompt
   * @param {Object} options
   * @returns {string}
   */
  addDeAIElements(basePrompt, options = {}) {
    return addDeAIElements(basePrompt, options);
  }

  /**
   * 生成 Negative Prompt
   * @param {Object} options
   * @returns {string}
   */
  generateNegativePrompt(options = {}) {
    return generateNegativePrompt(options);
  }

  /**
   * 生成降级版分镜
   */
  generateFallbackStoryboard(scriptContent, episodeNumber, options) {
    const { stylePreset = 'neutral_cinematic' } = options;
    const style = getStylePreset(stylePreset);

    // 创建6个默认片段（90秒 / 15秒）
    const clips = [];
    for (let i = 1; i <= 6; i++) {
      clips.push(this.createDefaultClip(i, stylePreset));
    }

    return {
      episodeNumber,
      mode: options.mode || 'A',
      stylePreset,
      clips,
      rawContent: '',
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 导出分镜为 JSON
   */
  exportAsJSON(storyboard) {
    return JSON.stringify(storyboard, null, 2);
  }

  /**
   * 导出分镜为 CSV（简化版）
   */
  exportAsCSV(storyboard) {
    const headers = ['ID', 'Title', 'Duration', 'Subject', 'Camera', 'Mood', 'Prompt', 'Negative'];
    const rows = [headers.join(',')];

    for (const clip of storyboard.clips) {
      const row = [
        clip.id,
        `"${clip.title}"`,
        `${clip.duration.start}-${clip.duration.end}s`,
        `"${clip.prompt.d1_subject}"`,
        `"${clip.prompt.d4_camera}"`,
        `"${clip.prompt.d5_mood}"`,
        `"${clip.prompt.combined}"`,
        `"${clip.prompt.negative}"`
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * 获取可用风格列表
   */
  getAvailableStyles() {
    return getAllStylePresets();
  }
}

// 导出单例
export const storyboardService = new StoryboardService();

export default StoryboardService;
