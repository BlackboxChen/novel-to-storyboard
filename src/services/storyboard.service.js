/**
 * 分镜生成服务
 * 完整实现：5D框架、去AI味元素、Negative Prompt、流式生成
 * 新增：时长决策逻辑、{@}锚点系统、关键帧参考图、语速验证
 * 新增：LLM增强的5D框架提示词合成（混合方案）
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
 * 5D框架 LLM 增强合成提示词模板（英文版）
 * 包含完整风格信息、禁止衣着描述（用于人物一致性）
 */
const PROMPT_SYNTHESIS_TEMPLATE = `你是一个专业的视频提示词合成专家。请根据以下信息生成5D框架的各个字段。

## 输入信息
- 基础主体：{subject}
- 基础环境：{environment}
- 基础材质：{material}
- 基础镜头：{camera}
- 基础氛围：{mood}
- 场景描述：{sceneDescription}
- 动作描述：{action}
- 情绪类型：{emotionType}
- 情绪强度：{emotionIntensity}

## 导演风格指导
- 导演：{director}
- 风格特征：{characteristics}
- 镜头偏好：{cameraPreference}
- 光线偏好：{lightingPreference}
- 调色风格：{colorStyle}

## 5D框架字段要求

### D1 主体（Subject）
- ⚠️ IMPORTANT: Character description MUST NOT include any clothing, apparel, or costume modifiers. Clothing is managed separately for character consistency.
- Character: Only describe gender, age features, posture, expression, action
- Props: shape, color, position, state
- Use anchor format: {@CharacterName} to represent characters
- Example: "{@Sarah} looks down with furrowed brows, hands clasped" (NOT "Sarah wearing red dress")
- Describe in English, visually concrete

### D2 环境光线（Environment）
- 场景：室内/室外、具体环境
- 光线：类型、方向、色温
- 天气/时间/氛围

### D3 材质细节（Material）
- 皮肤质感、环境纹理
- 水/烟/雾/灰尘的质感
- ⚠️ Do NOT describe clothing/fabric materials

### D4 拍摄风格（Camera）
- 景别：EWS/WS/FS/MS/MCU/CU/ECU
- 运动：static/dolly in/pan/track/handheld
- 焦段：wide angle/telephoto/50mm

### D5 氛围情感（Mood）
- 情绪标签（英文）
- 风格关键词

### Negative Prompt
- 负面提示词，包含：worst quality, low quality, perfect skin, airbrushed, plastic, artificial 等

## 输出格式（JSON）
只输出以下字段，不要输出 combined：

{
  "d1_subject": "英文主体描述（不含衣着）",
  "d2_environment": "英文环境光线描述",
  "d3_material": "英文材质细节描述（不含服装材质）",
  "d4_camera": "英文镜头风格描述",
  "d5_mood": "英文氛围情感描述",
  "negative": "负面提示词"
}

直接输出JSON，不要代码块，不要输出 combined 字段。`;

/**
 * 5D框架 LLM 增强合成提示词模板（中文版）
 * 包含完整风格信息、音频元素、禁止衣着描述（用于人物一致性）
 */
const CHINESE_PROMPT_SYNTHESIS_TEMPLATE = `你是一个专业的视频提示词合成专家。请根据以下信息生成5D框架的中文版本。

## 输入信息
- 基础主体：{subject}
- 基础环境：{environment}
- 基础材质：{material}
- 基础镜头：{camera}
- 基础氛围：{mood}
- 场景描述：{sceneDescription}
- 动作描述：{action}
- 情绪类型：{emotionType}
- 情绪强度：{emotionIntensity}

## 导演风格指导
- 导演：{director}
- 风格特征：{characteristics}
- 镜头偏好：{cameraPreference}
- 光线偏好：{lightingPreference}
- 调色风格：{colorStyle}

## 音频元素
- 旁白内容：{narration}
- 对白内容：{dialogue}
- 背景音乐：{bgm}
- 音效：{sfx}

## 5D框架字段要求

### D1 主体（Subject）
- ⚠️ 重要：人物描述【禁止包含任何衣着、服装、服饰相关的修饰词】，衣着由角色锚点系统统一管理以确保人物一致性
- 人物：仅描述性别、年龄特征、姿态、表情、动作
- 道具：形状、颜色、位置、状态
- 使用锚点格式：{@角色名} 表示人物
- 示例："{@林婉儿} 微微低头，眉头紧锁，双手紧握"（不要写"身穿红裙的林婉儿"）
- ⚠️ 必须使用纯中文描述，不要包含任何英文

### D2 环境光线（Environment）
- 场景：室内/室外、具体环境
- 光线：类型、方向、色温
- 天气/时间/氛围
- ⚠️ 必须使用纯中文描述

### D3 材质细节（Material）
- 皮肤质感、环境纹理
- 水/烟/雾/灰尘的质感
- ⚠️ 不描述服装材质
- ⚠️ 必须使用纯中文描述

### D4 拍摄风格（Camera）
- 景别：超大远景、远景、全景、中景、中近景、特写、大特写
- 运镜：固定镜头、推镜头、拉镜头、摇镜头、跟拍、手持摄影
- 焦段：广角镜头、长焦镜头、标准镜头
- ⚠️ 必须使用纯中文描述，禁止出现任何英文单词

### D5 氛围情感（Mood）
- 情绪标签（中文）
- 风格关键词
- ⚠️ 必须使用纯中文描述

### Negative Prompt
- 负面提示词：最差画质、低质量、完美皮肤、磨皮、塑料感、人工痕迹等
- ⚠️ 必须使用纯中文

### 音频元素
- 旁白、对白、BGM、音效的描述
- ⚠️ 必须使用纯中文

## 输出格式（JSON）
{
  "d1_subject": "纯中文主体描述（不含衣着，不含英文）",
  "d2_environment": "纯中文环境光线描述",
  "d3_material": "纯中文材质细节描述（不含服装材质）",
  "d4_camera": "纯中文镜头风格描述（如：中景，推镜头，广角镜头）",
  "d5_mood": "纯中文氛围情感描述",
  "negative": "纯中文负面提示词",
  "narration": "旁白内容",
  "dialogue": "对白内容",
  "bgm": "背景音乐描述",
  "sfx": "音效描述"
}

⚠️ 重要：所有字段必须使用纯中文，禁止出现任何英文单词或字母！
直接输出JSON，不要代码块。`;

/**
 * 5D框架 批量合成提示词模板（中文版）
 * 一次 LLM 调用处理整集的所有 clips，输出纯中文
 */
const BATCH_CHINESE_PROMPT_SYNTHESIS_TEMPLATE = `你是一个专业的视频提示词合成专家。请为以下所有片段生成5D框架的中文版本。

## 导演风格指导
- 导演：{director}
- 风格特征：{characteristics}
- 镜头偏好：{cameraPreference}
- 光线偏好：{lightingPreference}
- 调色风格：{colorStyle}

## 片段列表
{clipsInfo}

## 5D框架字段要求

### D1 主体（Subject）
- ⚠️ 重要：人物描述【禁止包含任何衣着、服装、服饰相关的修饰词】
- 人物：仅描述性别、年龄特征、姿态、表情、动作
- 使用锚点格式：{@角色名} 表示人物
- ⚠️ 必须使用纯中文描述，不要包含任何英文

### D2 环境光线（Environment）
- 场景：室内/室外、具体环境
- 光线：类型、方向、色温
- ⚠️ 必须使用纯中文描述

### D3 材质细节（Material）
- 皮肤质感、环境纹理
- ⚠️ 不描述服装材质，必须使用纯中文

### D4 拍摄风格（Camera）
- 景别：超大远景、远景、全景、中景、中近景、特写、大特写
- 运镜：固定镜头、推镜头、拉镜头、摇镜头、跟拍、手持摄影
- 焦段：广角镜头、长焦镜头、标准镜头
- ⚠️ 必须使用纯中文描述，禁止出现任何英文单词

### D5 氛围情感（Mood）
- 情绪标签、风格关键词
- ⚠️ 必须使用纯中文描述

## 输出格式（JSON数组）
[
  {
    "clipIndex": 0,
    "d1_subject": "纯中文主体描述（不含衣着）",
    "d2_environment": "纯中文环境光线描述",
    "d3_material": "纯中文材质细节描述",
    "d4_camera": "纯中文镜头风格描述（如：中景，推镜头）",
    "d5_mood": "纯中文氛围情感描述",
    "negative": "纯中文负面提示词"
  },
  ...
]

⚠️ 重要：所有字段必须使用纯中文，禁止出现任何英文！
要求：
1. clipIndex 从 0 开始，按顺序对应上面的片段列表
2. 每个片段都必须有完整的5个字段
3. 直接输出JSON数组，不要代码块`;

/**
 * 5D框架 批量合成提示词模板
 * 一次 LLM 调用处理整集的所有 clips
 */
const BATCH_PROMPT_SYNTHESIS_TEMPLATE = `你是一个专业的视频提示词合成专家。请为以下所有片段生成5D框架。

## 导演风格指导
- 导演：{director}
- 风格特征：{characteristics}
- 镜头偏好：{cameraPreference}
- 光线偏好：{lightingPreference}
- 调色风格：{colorStyle}

## 片段列表
{clipsInfo}

## 5D框架字段要求

### D1 主体（Subject）
- ⚠️ IMPORTANT: Character description MUST NOT include any clothing, apparel, or costume modifiers. Clothing is managed separately for character consistency.
- Character: Only describe gender, age features, posture, expression, action
- Props: shape, color, position, state
- Use anchor format: {@CharacterName} to represent characters
- Describe in English, visually concrete

### D2 环境光线（Environment）
- 场景：室内/室外、具体环境
- 光线：类型、方向、色温
- 天气/时间/氛围

### D3 材质细节（Material）
- 皮肤质感、环境纹理
- 水/烟/雾/灰尘的质感
- ⚠️ Do NOT describe clothing/fabric materials

### D4 拍摄风格（Camera）
- 景别：EWS/WS/FS/MS/MCU/CU/ECU
- 运动：static/dolly in/pan/track/handheld
- 焦段：wide angle/telephoto/50mm

### D5 氛围情感（Mood）
- 情绪标签（英文）
- 风格关键词

## 输出格式（JSON数组）
输出一个数组，每个元素对应一个片段的5D框架：

[
  {
    "clipIndex": 0,
    "d1_subject": "英文主体描述（不含衣着）",
    "d2_environment": "英文环境光线描述",
    "d3_material": "英文材质细节描述（不含服装材质）",
    "d4_camera": "英文镜头风格描述",
    "d5_mood": "英文氛围情感描述",
    "negative": "负面提示词"
  },
  ...
]

要求：
1. clipIndex 从 0 开始，按顺序对应上面的片段列表
2. 每个片段都必须有完整的5个字段
3. 直接输出JSON数组，不要代码块
4. 不要输出 combined 字段
5. 人物描述禁止包含任何衣着、服装相关的修饰词`;

/**
 * 时长决策配置
 * 默认选项：5s / 10s / 15s
 * 根据情绪激烈程度选择
 */
const DURATION_OPTIONS = {
  SHORT: 5,    // 激烈情绪：高潮、打脸、反转
  MEDIUM: 10,  // 中等情绪：冲突、铺垫
  LONG: 15     // 平缓情绪：介绍、过渡
};

/**
 * 情绪到时长的映射
 */
const EMOTION_DURATION_MAP = {
  // 激烈情绪 -> 短时长 (5s)
  '高潮': DURATION_OPTIONS.SHORT,
  '打脸': DURATION_OPTIONS.SHORT,
  '反转': DURATION_OPTIONS.SHORT,
  '爆发': DURATION_OPTIONS.SHORT,
  '惊吓': DURATION_OPTIONS.SHORT,
  '震撼': DURATION_OPTIONS.SHORT,

  // 中等情绪 -> 中时长 (10s)
  '紧张': DURATION_OPTIONS.MEDIUM,
  '冲突': DURATION_OPTIONS.MEDIUM,
  '悬念': DURATION_OPTIONS.MEDIUM,
  '惊喜': DURATION_OPTIONS.MEDIUM,
  '愤怒': DURATION_OPTIONS.MEDIUM,
  '悲伤': DURATION_OPTIONS.MEDIUM,
  '期待': DURATION_OPTIONS.MEDIUM,

  // 平缓情绪 -> 长时长 (15s)
  '平静': DURATION_OPTIONS.LONG,
  '介绍': DURATION_OPTIONS.LONG,
  '铺垫': DURATION_OPTIONS.LONG,
  '过渡': DURATION_OPTIONS.LONG,
  '回忆': DURATION_OPTIONS.LONG,
  '温馨': DURATION_OPTIONS.LONG,
  '中性': DURATION_OPTIONS.MEDIUM
};

/**
 * 语速验证常量 (Mode B)
 * 单位：字/秒
 */
const SPEECH_RATE = {
  MIN: 2.5,   // 最慢语速
  MAX: 5.5,   // 最快语速
  OPTIMAL: 3.5 // 最佳语速
};

/**
 * 分镜生成服务类
 */
export class StoryboardService {
  constructor(options = {}) {
    this.options = {
      defaultMode: 'A',
      defaultStyle: 'neutral_cinematic',
      useLLMEnhancement: true, // 默认启用LLM增强
      ...options
    };
    this.abortController = null; // 用于停止生成
    this.llmCache = new Map(); // LLM结果缓存
  }

  /**
   * 停止生成
   */
  abort() {
    this.abortController = true;
    console.log('[Storyboard] 用户请求停止生成');
  }

  /**
   * 智能时长决策
   * @param {string} emotion - 情绪类型
   * @param {string} beatType - 爽点类型
   * @param {number} maxDuration - 用户自定义最大时长 (可选)
   * @returns {number} 推荐时长 (5/10/15)
   */
  decideDuration(emotion = '', beatType = '', maxDuration = null) {
    // 基础时长选择
    let baseDuration = DURATION_OPTIONS.MEDIUM; // 默认10秒

    // 根据情绪选择
    for (const [emotionKey, duration] of Object.entries(EMOTION_DURATION_MAP)) {
      if (emotion.includes(emotionKey)) {
        baseDuration = duration;
        break;
      }
    }

    // 根据爽点类型调整
    const intenseBeats = ['slap', 'comeback', 'revenge'];
    const moderateBeats = ['upgrade', 'identity', 'emotion'];
    const calmBeats = ['info'];

    if (beatType) {
      if (intenseBeats.includes(beatType)) {
        baseDuration = DURATION_OPTIONS.SHORT;
      } else if (calmBeats.includes(beatType)) {
        baseDuration = DURATION_OPTIONS.LONG;
      } else if (moderateBeats.includes(beatType)) {
        baseDuration = DURATION_OPTIONS.MEDIUM;
      }
    }

    // 如果用户指定了最大时长，确保不超过
    if (maxDuration !== null && maxDuration > 0) {
      const options = [DURATION_OPTIONS.SHORT, DURATION_OPTIONS.MEDIUM, DURATION_OPTIONS.LONG]
        .filter(d => d <= maxDuration);

      if (options.length > 0) {
        // 选择不超过maxDuration的最接近选项
        baseDuration = options.reduce((prev, curr) =>
          Math.abs(curr - baseDuration) < Math.abs(prev - baseDuration) ? curr : prev
        );
      } else {
        baseDuration = Math.min(maxDuration, DURATION_OPTIONS.LONG);
      }
    }

    return baseDuration;
  }

  /**
   * 验证语速 (Mode B)
   * @param {string} text - 旁白或对白文本
   * @param {number} duration - 片段时长(秒)
   * @returns {Object} { valid, rate, suggestion }
   */
  validateSpeechRate(text, duration) {
    if (!text || duration <= 0) {
      return { valid: true, rate: 0, suggestion: null };
    }

    // 计算字数 (中文按字符计算，忽略标点和空格)
    const charCount = text.replace(/[\s\p{P}]/gu, '').length;
    const rate = charCount / duration;

    const result = {
      charCount,
      duration,
      rate: Math.round(rate * 10) / 10,
      valid: rate >= SPEECH_RATE.MIN && rate <= SPEECH_RATE.MAX,
      suggestion: null
    };

    if (rate < SPEECH_RATE.MIN) {
      result.suggestion = `语速过慢 (${result.rate}字/秒)，建议增加到 ${(SPEECH_RATE.MIN * duration).toFixed(0)} 字以上`;
    } else if (rate > SPEECH_RATE.MAX) {
      result.suggestion = `语速过快 (${result.rate}字/秒)，建议减少到 ${(SPEECH_RATE.MAX * duration).toFixed(0)} 字以内`;
    }

    return result;
  }

  /**
   * 生成锚点标识符
   * @param {string} type - 类型 (char/loc/prop)
   * @param {string} name - 名称
   * @returns {string} 锚点标识符
   */
  generateAnchor(type, name) {
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    return `{@${type}_${safeName}}`;
  }

  /**
   * 解析锚点标识符
   * @param {string} anchor - 锚点字符串
   * @returns {Object} { type, name }
   */
  parseAnchor(anchor) {
    const match = anchor.match(/\{@(\w+)_(.+?)\}/);
    if (match) {
      return { type: match[1], name: match[2] };
    }
    return null;
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
      stylePreset = this.options.defaultStyle,
      onProgress = null // 进度回调
    } = options;

    this.abortController = false;
    console.log(`[Storyboard] 生成第 ${episodeNumber} 集分镜，模式: ${mode}, 风格: ${stylePreset}`);

    const prompt = generateStoryboardPrompt(scriptContent, episodeNumber, {
      mode,
      stylePreset
    });

    try {
      if (onProgress) onProgress({ stage: 'generating', episode: episodeNumber });

      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 8192 });

      // 检查是否被中止
      if (this.abortController) {
        console.log('[Storyboard] 生成已被中止');
        return { episodeNumber, clips: [], aborted: true };
      }

      // 解析分镜内容
      const clips = this.parseStoryboardResponse(response, stylePreset);

      if (onProgress) onProgress({ stage: 'complete', episode: episodeNumber, clipsCount: clips.length });

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
   * 从结构化剧本数据生成分镜（直接使用clips数组）
   * @param {Object} scriptEpisode - 结构化剧本数据 { clips: [], title, logline, ... }
   * @param {number} episodeNumber - 集数
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateStoryboardFromStructuredScript(scriptEpisode, episodeNumber, options = {}) {
    const {
      mode = this.options.defaultMode,
      stylePreset = this.options.defaultStyle,
      maxDuration = null, // 用户自定义最大时长
      useLLM = this.options.useLLMEnhancement, // LLM增强开关
      useBatch = true, // 批量处理开关（默认启用）
      onProgress = null
    } = options;

    this.abortController = false;
    console.log(`[Storyboard] 从结构化剧本生成第 ${episodeNumber} 集分镜，最大时长: ${maxDuration || '无限制'}，批量模式: ${useBatch}`);

    const scriptClips = scriptEpisode.clips || [];

    if (scriptClips.length === 0) {
      console.warn('[Storyboard] 剧本无clips数据，回退到普通模式');
      return this.generateStoryboard(scriptEpisode.content || '', episodeNumber, options);
    }

    // 收集所有锚点用于跨片段一致性
    const globalAnchors = this.collectGlobalAnchors(scriptClips);
    const style = getStylePreset(stylePreset);
    const deai = getDeAIEnhancement({ randomWordCount: 3 });

    // 批量 LLM 处理（如果启用）
    let llmResults = [];
    let chineseLlmResults = [];
    if (useLLM && useBatch) {
      console.log(`[Storyboard] 第 ${episodeNumber} 集开始批量处理，共 ${scriptClips.length} 个 clips`);
      const batchStartTime = Date.now();

      // 英文批量LLM
      llmResults = await this.synthesizeBatchWithLLM(scriptClips, stylePreset, {
        maxDuration,
        anchors: globalAnchors
      });

      // 中文批量LLM
      chineseLlmResults = await this.synthesizeBatchChineseWithLLM(scriptClips, stylePreset, {
        anchors: globalAnchors
      });

      console.log(`[Storyboard] 批量处理完成，耗时 ${Date.now() - batchStartTime}ms`);
    }

    // 为每个剧本clip生成视觉提示词
    const storyboardClips = [];
    const speechRateWarnings = []; // Mode B 语速警告

    console.log(`[Storyboard] 第 ${episodeNumber} 集开始构建分镜对象，共 ${scriptClips.length} 个 clips`);

    for (let i = 0; i < scriptClips.length; i++) {
      if (this.abortController) {
        console.log('[Storyboard] 生成已被中止');
        break;
      }

      const startTime = Date.now();
      const scriptClip = scriptClips[i];

      // 智能时长决策
      const clipDuration = this.decideDuration(
        scriptClip.emotion,
        scriptClip.beatType,
        maxDuration
      );

      // Mode B 语速验证
      let speechRateResult = null;
      if (mode === 'B') {
        const textToCheck = [scriptClip.narration, scriptClip.dialogue?.line || scriptClip.dialogue]
          .filter(Boolean)
          .join('');

        speechRateResult = this.validateSpeechRate(textToCheck, clipDuration);
        if (!speechRateResult.valid) {
          speechRateWarnings.push({
            clipIndex: i,
            clipId: `V${String(i + 1).padStart(2, '0')}`,
            ...speechRateResult
          });
        }
      }

      // 生成视觉提示词
      let visualPrompt;
      if (useLLM && useBatch && llmResults[i]) {
        // 使用批量 LLM 结果
        const llmResult = llmResults[i];
        const chineseLlmResult = chineseLlmResults[i];
        const finalD5 = {
          d1_subject: this.preserveAnchors(
            this.generateSubjectEnglish(scriptClip.visual || '', globalAnchors),
            llmResult.d1_subject,
            globalAnchors
          ),
          d2_environment: llmResult.d2_environment,
          d3_material: llmResult.d3_material,
          d4_camera: llmResult.d4_camera,
          d5_mood: llmResult.d5_mood
        };

        // 使用中文LLM结果构建中文提示词
        const chinesePrompt = chineseLlmResult
          ? this.buildChinesePromptFromLLMResult(chineseLlmResult, clipDuration, globalAnchors)
          : this.buildComprehensiveChinesePrompt(scriptClip, finalD5, clipDuration, globalAnchors);

        visualPrompt = {
          ...finalD5,
          duration: clipDuration,
          imperfections: deai.imperfections,
          randomWords: deai.randomWords,
          foregroundLayer: deai.foregroundLayer,
          combined: this.buildFullPrompt(finalD5, deai, style, globalAnchors),
          negative: llmResult.negative || deai.negativePrompt,
          chinese: chinesePrompt,
          keyframeRef: this.generateKeyframeReference(finalD5, style, scriptClip, chineseLlmResult),
          anchors: this.extractAnchorsFromClip(scriptClip),
          _meta: { useLLMEnhancement: true, useBatch: true, stylePreset }
        };
      } else {
        // 单独处理（非批量模式或无 LLM 结果）
        visualPrompt = await this.generateVisualPrompt(scriptClip, stylePreset, {
          maxDuration,
          anchors: globalAnchors,
          useLLM: useLLM && !useBatch // 批量模式下不再单独调用 LLM
        });
      }

      // 直接使用剧本中的结构化数据
      const storyboardClip = {
        id: `V${String(i + 1).padStart(2, '0')}`,
        title: scriptClip.segmentName || `片段${i + 1}`,
        // 使用智能决策的时长
        duration: {
          start: i * clipDuration,
          end: (i + 1) * clipDuration,
          total: clipDuration
        },
        intent: `${scriptClip.segmentName || '片段'}：${scriptClip.emotion || ''}`,
        emotion: `${scriptClip.emotion || '中性'} · ${this.getEmotionIntensity(scriptClip.beatType)}`,
        transition: this.getDefaultTransition(i, scriptClips.length),
        camera: `${i * clipDuration}-${(i + 1) * clipDuration}s: ${this.getCameraSuggestion(scriptClip.segment)}`,
        // 直接从剧本获取（100%准确）
        narration: scriptClip.narration || '',
        dialogue: scriptClip.dialogue ? (typeof scriptClip.dialogue === 'string' ? scriptClip.dialogue : `${scriptClip.dialogue.character}：${scriptClip.dialogue.line}`) : '',
        bgm: scriptClip.bgm || this.suggestBGM(scriptClip.emotion),
        sfx: scriptClip.sfx || '',
        // 使用新的提示词生成
        prompt: visualPrompt,
        // 语速验证结果 (Mode B)
        speechRate: speechRateResult
      };

      storyboardClips.push(storyboardClip);

      const elapsed = Date.now() - startTime;
      console.log(`[Storyboard] clip ${i + 1}/${scriptClips.length} 构建完成，耗时 ${elapsed}ms`);

      if (onProgress) {
        onProgress({
          stage: 'generating',
          episode: episodeNumber,
          clipIndex: i,
          totalClips: scriptClips.length,
          clip: storyboardClip
        });
      }
    }

    const result = {
      episodeNumber,
      mode,
      stylePreset,
      maxDuration,
      clips: storyboardClips,
      anchors: globalAnchors,
      generatedAt: new Date().toISOString()
    };

    // 添加语速警告 (Mode B)
    if (mode === 'B' && speechRateWarnings.length > 0) {
      result.speechRateWarnings = speechRateWarnings;
      console.warn(`[Storyboard] Mode B 语速警告: ${speechRateWarnings.length} 个片段需要调整`);
    }

    return result;
  }

  /**
   * 收集全局锚点
   */
  collectGlobalAnchors(scriptClips) {
    const anchors = {
      characters: new Map(),
      locations: new Map(),
      props: new Map()
    };

    for (const clip of scriptClips) {
      // 收集角色
      if (clip.dialogue && typeof clip.dialogue === 'object' && clip.dialogue.character) {
        const charName = clip.dialogue.character;
        if (!anchors.characters.has(charName)) {
          anchors.characters.set(charName, {
            name: charName,
            anchor: this.generateAnchor('char', charName)
          });
        }
      }

      // 收集场景（从visual提取）
      if (clip.visual) {
        const locationPatterns = [
          /在(.+?)(?:中|里|上|下)/,
          /(.+?)场景/,
          /背景是(.+?)(?:，|。|$)/
        ];

        for (const pattern of locationPatterns) {
          const match = clip.visual.match(pattern);
          if (match) {
            const locName = match[1];
            if (!anchors.locations.has(locName)) {
              anchors.locations.set(locName, {
                name: locName,
                anchor: this.generateAnchor('loc', locName)
              });
            }
          }
        }
      }
    }

    return {
      characters: Array.from(anchors.characters.values()),
      locations: Array.from(anchors.locations.values()),
      props: Array.from(anchors.props.values())
    };
  }

  /**
   * 为剧本clip生成视觉提示词
   * 混合方案：模板映射（一致性）+ LLM增强（创造性）
   * 方案 A：LLM 只输出 5D 字段，combined 由代码拼接
   * @param {Object} scriptClip - 剧本片段
   * @param {string} stylePreset - 风格预设
   * @param {Object} options - 额外选项 (maxDuration, anchors, useLLM)
   * @returns {Object}
   */
  async generateVisualPrompt(scriptClip, stylePreset, options = {}) {
    const { maxDuration = null, anchors = {}, useLLM = this.options.useLLMEnhancement } = options;
    const style = getStylePreset(stylePreset);
    const deai = getDeAIEnhancement({ randomWordCount: 3 });

    // 基于剧本的visual字段生成5D框架
    const visual = scriptClip.visual || '';
    const emotion = scriptClip.emotion || '';
    const beatType = scriptClip.beatType || '';

    // 智能时长决策
    const duration = this.decideDuration(emotion, beatType, maxDuration);

    // 生成基础5D框架（模板映射，保证一致性）
    const baseD5 = {
      d1_subject: this.generateSubjectEnglish(visual, anchors),
      d2_environment: this.generateEnvironmentEnglish(visual, style, anchors),
      d3_material: this.generateMaterialEnglish(visual),
      d4_camera: this.generateCameraEnglish(scriptClip.segment, style),
      d5_mood: this.generateMoodEnglish(emotion, style)
    };

    let finalD5 = baseD5;
    let negative = deai.negativePrompt;

    // 如果启用LLM增强，使用LLM进行5D字段增强
    if (useLLM) {
      const llmResult = await this.synthesizePromptWithLLM(scriptClip, baseD5, style, {
        duration,
        anchors
      });

      // LLM结果覆盖基础框架，但保留锚点一致性
      finalD5 = {
        d1_subject: this.preserveAnchors(baseD5.d1_subject, llmResult.d1_subject, anchors),
        d2_environment: llmResult.d2_environment,
        d3_material: llmResult.d3_material,
        d4_camera: llmResult.d4_camera,
        d5_mood: llmResult.d5_mood
      };
      negative = llmResult.negative || deai.negativePrompt;
    }

    // 锚点标识符
    const clipAnchors = this.extractAnchorsFromClip(scriptClip);

    // 代码拼接 combined（方案 A），传入锚点用于 {@xx} 标识
    const combined = this.buildFullPrompt(finalD5, deai, style, anchors);

    // 生成中文提示词和中文5D
    let chinese;
    let chineseD5 = null; // 中文5D框架，用于关键帧
    if (useLLM) {
      // 使用LLM增强生成中文提示词（包含5D框架 + 音频元素）
      const chineseLLMResult = await this.synthesizeChinesePromptWithLLM(scriptClip, baseD5, style, { anchors });
      chinese = this.buildChinesePromptFromLLMResult(chineseLLMResult, duration, anchors);
      // 保存中文5D用于关键帧
      chineseD5 = chineseLLMResult;
    } else {
      // 降级为本地构建
      chinese = this.buildComprehensiveChinesePrompt(scriptClip, finalD5, duration, anchors);
    }

    // 生成关键帧参考图提示词（传入中文5D）
    const keyframeRef = this.generateKeyframeReference(finalD5, style, scriptClip, chineseD5);

    return {
      ...finalD5,
      duration,
      imperfections: deai.imperfections,
      randomWords: deai.randomWords,
      foregroundLayer: deai.foregroundLayer,
      combined,
      negative,
      chinese,
      keyframeRef,
      anchors: clipAnchors,
      _meta: {
        useLLMEnhancement: useLLM,
        stylePreset
      }
    };
  }

  /**
   * 使用LLM增强合成提示词
   * 基于原始skill的prompt_templates.md规则
   * @param {Object} scriptClip - 剧本片段
   * @param {Object} baseD5 - 基础5D框架（模板生成）
   * @param {Object} style - 风格预设
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   * @throws {Error} LLM调用或解析失败时抛出错误
   */
  async synthesizePromptWithLLM(scriptClip, baseD5, style, options = {}) {
    const { duration, anchors } = options;

    // 检查缓存
    const cacheKey = this.generateCacheKey(scriptClip, style.name);
    if (this.llmCache.has(cacheKey)) {
      console.log('[Storyboard] 使用缓存的LLM结果');
      return this.llmCache.get(cacheKey);
    }

    // 构建完整风格信息
    const styleInfo = this.buildStyleInfo(style);

    // 构建LLM提示词
    const prompt = PROMPT_SYNTHESIS_TEMPLATE
      .replace('{subject}', baseD5.d1_subject)
      .replace('{environment}', baseD5.d2_environment)
      .replace('{material}', baseD5.d3_material)
      .replace('{camera}', baseD5.d4_camera)
      .replace('{mood}', baseD5.d5_mood)
      .replace('{sceneDescription}', scriptClip.visual || '场景描述')
      .replace('{action}', this.extractAction(scriptClip.visual || ''))
      .replace('{emotionType}', scriptClip.emotion || '中性')
      .replace('{emotionIntensity}', String(this.getEmotionIntensity(scriptClip.beatType)))
      .replace('{director}', styleInfo.director)
      .replace('{characteristics}', styleInfo.characteristics)
      .replace('{cameraPreference}', styleInfo.cameraPreference)
      .replace('{lightingPreference}', styleInfo.lightingPreference)
      .replace('{colorStyle}', styleInfo.colorStyle);

    console.log('[Storyboard] 调用 LLM 增强（英文）...');
    const llmStartTime = Date.now();

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 4096, // 增加 token 限制，避免 JSON 被截断
      temperature: 0.7 // 适中的创造性
    });

    console.log(`[Storyboard] LLM 响应完成，耗时 ${Date.now() - llmStartTime}ms，响应长度: ${response.length} 字符`);

    // 解析JSON响应（失败会抛出错误）
    const result = this.parseLLMSynthesisResponse(response);

    // 缓存结果
    this.llmCache.set(cacheKey, result);
    console.log('[Storyboard] LLM增强合成成功');

    return result;
  }

  /**
   * 使用LLM增强合成中文提示词
   * 包含5D框架 + 音频元素
   * @param {Object} scriptClip - 剧本片段
   * @param {Object} baseD5 - 基础5D框架
   * @param {Object} style - 风格预设
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async synthesizeChinesePromptWithLLM(scriptClip, baseD5, style, options = {}) {
    const { anchors } = options;

    // 检查缓存
    const cacheKey = `cn_${this.generateCacheKey(scriptClip, style.name)}`;
    if (this.llmCache.has(cacheKey)) {
      console.log('[Storyboard] 使用缓存的中文LLM结果');
      return this.llmCache.get(cacheKey);
    }

    // 构建完整风格信息
    const styleInfo = this.buildStyleInfo(style);

    // 构建LLM提示词
    const prompt = CHINESE_PROMPT_SYNTHESIS_TEMPLATE
      .replace('{subject}', baseD5.d1_subject)
      .replace('{environment}', baseD5.d2_environment)
      .replace('{material}', baseD5.d3_material)
      .replace('{camera}', baseD5.d4_camera)
      .replace('{mood}', baseD5.d5_mood)
      .replace('{sceneDescription}', scriptClip.visual || '场景描述')
      .replace('{action}', this.extractAction(scriptClip.visual || ''))
      .replace('{emotionType}', scriptClip.emotion || '中性')
      .replace('{emotionIntensity}', String(this.getEmotionIntensity(scriptClip.beatType)))
      .replace('{director}', styleInfo.director)
      .replace('{characteristics}', styleInfo.characteristics)
      .replace('{cameraPreference}', styleInfo.cameraPreference)
      .replace('{lightingPreference}', styleInfo.lightingPreference)
      .replace('{colorStyle}', styleInfo.colorStyle)
      .replace('{narration}', scriptClip.narration || '无')
      .replace('{dialogue}', this.formatDialogue(scriptClip.dialogue) || '无')
      .replace('{bgm}', scriptClip.bgm || '无')
      .replace('{sfx}', scriptClip.sfx || '无');

    console.log('[Storyboard] 调用 LLM 增强（中文）...');
    const llmStartTime = Date.now();

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 4096,
      temperature: 0.7
    });

    console.log(`[Storyboard] 中文LLM 响应完成，耗时 ${Date.now() - llmStartTime}ms`);

    // 解析JSON响应
    const result = this.parseChineseLLMSynthesisResponse(response);

    // 缓存结果
    this.llmCache.set(cacheKey, result);
    console.log('[Storyboard] 中文LLM增强合成成功');

    return result;
  }

  /**
   * 构建风格信息字符串
   * @param {Object} style - 风格预设
   * @returns {Object}
   */
  buildStyleInfo(style) {
    return {
      director: style.director || '通用',
      characteristics: style.characteristics?.join('、') || '自然电影感',
      cameraPreference: style.cameraStyle?.shots?.join('、') || '标准景别',
      lightingPreference: style.lighting?.examples?.join('、') || '自然光',
      colorStyle: `${style.colorGrading?.palette || '中性'}，饱和度${style.colorGrading?.saturation || '中等'}`
    };
  }

  /**
   * 格式化对白内容
   * @param {string|Object} dialogue - 对白
   * @returns {string}
   */
  formatDialogue(dialogue) {
    if (!dialogue) return '';
    if (typeof dialogue === 'string') return dialogue;
    return `${dialogue.character}："${dialogue.line}"`;
  }

  /**
   * 解析中文LLM合成响应
   * @param {string} response - LLM响应
   * @returns {Object}
   */
  parseChineseLLMSynthesisResponse(response) {
    // 尝试提取JSON
    let jsonStr = response;

    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`中文LLM响应JSON解析失败: ${e.message}\n原始响应: ${response.substring(0, 500)}...`);
    }

    const requiredFields = ['d1_subject', 'd2_environment', 'd3_material', 'd4_camera', 'd5_mood'];
    const missingFields = requiredFields.filter(field => !parsed[field]);

    if (missingFields.length > 0) {
      throw new Error(`中文LLM响应缺少必要字段: ${missingFields.join(', ')}`);
    }

    return {
      d1_subject: parsed.d1_subject,
      d2_environment: parsed.d2_environment,
      d3_material: parsed.d3_material,
      d4_camera: parsed.d4_camera,
      d5_mood: parsed.d5_mood,
      negative: parsed.negative || '',
      narration: parsed.narration || '',
      dialogue: parsed.dialogue || '',
      bgm: parsed.bgm || '',
      sfx: parsed.sfx || ''
    };
  }

  /**
   * 解析LLM合成响应
   * @param {string} response - LLM响应
   * @returns {Object}
   * @throws {Error} 解析失败时抛出错误
   */
  parseLLMSynthesisResponse(response) {
    // 尝试提取JSON
    let jsonStr = response;

    // 如果包含代码块，提取内容
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // 解析JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`LLM响应JSON解析失败: ${e.message}\n原始响应: ${response.substring(0, 500)}...`);
    }

    // 验证必要字段（不再需要 combined）
    const requiredFields = ['d1_subject', 'd2_environment', 'd3_material', 'd4_camera', 'd5_mood'];
    const missingFields = requiredFields.filter(field => !parsed[field]);

    if (missingFields.length > 0) {
      throw new Error(`LLM响应缺少必要字段: ${missingFields.join(', ')}\n解析结果: ${JSON.stringify(parsed).substring(0, 500)}...`);
    }

    return {
      d1_subject: parsed.d1_subject,
      d2_environment: parsed.d2_environment,
      d3_material: parsed.d3_material,
      d4_camera: parsed.d4_camera,
      d5_mood: parsed.d5_mood,
      negative: parsed.negative || ''
    };
  }

  /**
   * 批量合成：一次 LLM 调用处理整集的所有 clips
   * @param {Array} scriptClips - 剧本片段数组
   * @param {string} stylePreset - 风格预设
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   * @throws {Error} LLM调用或解析失败时抛出错误
   */
  async synthesizeBatchWithLLM(scriptClips, stylePreset, options = {}) {
    const { maxDuration = null, anchors = {} } = options;
    const style = getStylePreset(stylePreset);

    // 检查缓存
    const cacheKey = this.generateBatchCacheKey(scriptClips, style.name);
    if (this.llmCache.has(cacheKey)) {
      console.log('[Storyboard] 使用缓存的批量LLM结果');
      return this.llmCache.get(cacheKey);
    }

    // 构建完整风格信息
    const styleInfo = this.buildStyleInfo(style);

    // 构建片段信息
    const clipsInfo = scriptClips.map((clip, index) => {
      const emotion = clip.emotion || '中性';
      const visual = clip.visual || '';
      const segmentName = clip.segmentName || `片段${index + 1}`;

      return `[片段 ${index}] ${segmentName}
- 情绪: ${emotion}
- 场景: ${visual.substring(0, 200)}${visual.length > 200 ? '...' : ''}`;
    }).join('\n\n');

    // 构建 prompt
    const prompt = BATCH_PROMPT_SYNTHESIS_TEMPLATE
      .replace('{director}', styleInfo.director)
      .replace('{characteristics}', styleInfo.characteristics)
      .replace('{cameraPreference}', styleInfo.cameraPreference)
      .replace('{lightingPreference}', styleInfo.lightingPreference)
      .replace('{colorStyle}', styleInfo.colorStyle)
      .replace('{clipsInfo}', clipsInfo);

    console.log(`[Storyboard] 批量调用 LLM，共 ${scriptClips.length} 个 clips...`);
    const llmStartTime = Date.now();

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 8192, // 批量处理需要更多 tokens
      temperature: 0.7
    });

    console.log(`[Storyboard] 批量 LLM 响应完成，耗时 ${Date.now() - llmStartTime}ms，响应长度: ${response.length} 字符`);

    // 解析批量响应
    const results = this.parseBatchLLMResponse(response, scriptClips.length);

    // 缓存结果
    this.llmCache.set(cacheKey, results);
    console.log(`[Storyboard] 批量 LLM 合成成功，处理了 ${results.length} 个 clips`);

    return results;
  }

  /**
   * 批量合成中文5D框架：一次 LLM 调用处理整集的所有 clips
   * 输出纯中文内容
   * @param {Array} scriptClips - 剧本片段数组
   * @param {string} stylePreset - 风格预设
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async synthesizeBatchChineseWithLLM(scriptClips, stylePreset, options = {}) {
    const style = getStylePreset(stylePreset);

    // 检查缓存
    const cacheKey = `cn_batch_${this.generateBatchCacheKey(scriptClips, style.name)}`;
    if (this.llmCache.has(cacheKey)) {
      console.log('[Storyboard] 使用缓存的批量中文LLM结果');
      return this.llmCache.get(cacheKey);
    }

    // 构建完整风格信息
    const styleInfo = this.buildStyleInfo(style);

    // 构建片段信息（包含音频元素）
    const clipsInfo = scriptClips.map((clip, index) => {
      const emotion = clip.emotion || '中性';
      const visual = clip.visual || '';
      const segmentName = clip.segmentName || `片段${index + 1}`;
      const narration = clip.narration || '无';
      const dialogue = this.formatDialogue(clip.dialogue) || '无';
      const bgm = clip.bgm || '无';

      return `[片段 ${index}] ${segmentName}
- 情绪: ${emotion}
- 场景: ${visual.substring(0, 200)}${visual.length > 200 ? '...' : ''}
- 旁白: ${narration}
- 对白: ${dialogue}
- BGM: ${bgm}`;
    }).join('\n\n');

    // 构建 prompt
    const prompt = BATCH_CHINESE_PROMPT_SYNTHESIS_TEMPLATE
      .replace('{director}', styleInfo.director)
      .replace('{characteristics}', styleInfo.characteristics)
      .replace('{cameraPreference}', styleInfo.cameraPreference)
      .replace('{lightingPreference}', styleInfo.lightingPreference)
      .replace('{colorStyle}', styleInfo.colorStyle)
      .replace('{clipsInfo}', clipsInfo);

    console.log(`[Storyboard] 批量调用中文 LLM，共 ${scriptClips.length} 个 clips...`);
    const llmStartTime = Date.now();

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], {
      maxTokens: 8192,
      temperature: 0.7
    });

    console.log(`[Storyboard] 批量中文 LLM 响应完成，耗时 ${Date.now() - llmStartTime}ms`);

    // 解析批量响应
    const results = this.parseBatchChineseLLMResponse(response, scriptClips.length);

    // 缓存结果
    this.llmCache.set(cacheKey, results);
    console.log(`[Storyboard] 批量中文 LLM 合成成功，处理了 ${results.length} 个 clips`);

    return results;
  }

  /**
   * 解析批量中文 LLM 响应
   */
  parseBatchChineseLLMResponse(response, expectedCount) {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`批量中文LLM响应JSON解析失败: ${e.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`批量中文LLM响应不是数组格式`);
    }

    const requiredFields = ['d1_subject', 'd2_environment', 'd3_material', 'd4_camera', 'd5_mood'];
    const results = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const missingFields = requiredFields.filter(field => !item[field]);

      if (missingFields.length > 0) {
        console.warn(`[Storyboard] 中文片段 ${i} 缺少字段: ${missingFields.join(', ')}`);
      }

      results.push({
        clipIndex: item.clipIndex ?? i,
        d1_subject: item.d1_subject || '角色',
        d2_environment: item.d2_environment || '室内环境',
        d3_material: item.d3_material || '自然质感',
        d4_camera: item.d4_camera || '中景',
        d5_mood: item.d5_mood || '中性氛围',
        negative: item.negative || ''
      });
    }

    if (results.length !== expectedCount) {
      console.warn(`[Storyboard] 批量中文结果数量不匹配: 期望 ${expectedCount}，实际 ${results.length}`);
    }

    return results;
  }

  /**
   * 解析批量 LLM 响应
   * @param {string} response - LLM 响应
   * @param {number} expectedCount - 期望的片段数量
   * @returns {Array}
   * @throws {Error} 解析失败时抛出错误
   */
  parseBatchLLMResponse(response, expectedCount) {
    // 尝试提取 JSON
    let jsonStr = response;

    // 如果包含代码块，提取内容
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // 解析 JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`批量LLM响应JSON解析失败: ${e.message}\n原始响应: ${response.substring(0, 500)}...`);
    }

    // 确保是数组
    if (!Array.isArray(parsed)) {
      throw new Error(`批量LLM响应不是数组格式\n解析结果: ${JSON.stringify(parsed).substring(0, 500)}...`);
    }

    // 验证每个元素
    const requiredFields = ['d1_subject', 'd2_environment', 'd3_material', 'd4_camera', 'd5_mood'];
    const results = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const missingFields = requiredFields.filter(field => !item[field]);

      if (missingFields.length > 0) {
        console.warn(`[Storyboard] 片段 ${i} 缺少字段: ${missingFields.join(', ')}，将使用默认值`);
      }

      results.push({
        clipIndex: item.clipIndex ?? i,
        d1_subject: item.d1_subject || 'subject in scene',
        d2_environment: item.d2_environment || 'natural lighting',
        d3_material: item.d3_material || 'natural texture',
        d4_camera: item.d4_camera || 'medium shot',
        d5_mood: item.d5_mood || 'cinematic mood',
        negative: item.negative || ''
      });
    }

    // 检查数量是否匹配
    if (results.length !== expectedCount) {
      console.warn(`[Storyboard] 批量结果数量不匹配: 期望 ${expectedCount}，实际 ${results.length}`);
    }

    return results;
  }

  /**
   * 生成批量缓存键
   */
  generateBatchCacheKey(scriptClips, styleName) {
    const content = scriptClips.map(c => `${c.segmentName || ''}_${c.emotion || ''}`).join('_') + '_' + styleName;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `batch_${hash}`;
  }

  /**
   * 生成缓存键
   */
  generateCacheKey(scriptClip, styleName) {
    const content = `${scriptClip.visual || ''}_${scriptClip.emotion || ''}_${styleName}`;
    // 简单hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `clip_${hash}`;
  }

  /**
   * 保留锚点一致性
   * 确保LLM生成的描述中保留原始锚点
   */
  preserveAnchors(original, llmGenerated, anchors) {
    // 如果有角色锚点，确保保留
    if (anchors.characters && anchors.characters.length > 0) {
      const charAnchor = anchors.characters[0].anchor;
      if (!llmGenerated.includes(charAnchor) && !llmGenerated.includes('{@')) {
        return `{@${charAnchor}}: ${llmGenerated}`;
      }
    }
    return llmGenerated || original;
  }

  /**
   * 从视觉描述中提取动作
   */
  extractAction(visual) {
    const actionPatterns = [
      /走|行|跑|跳|坐|站|躺|爬|跪|蹲/,
      /看|望|凝视|注视|盯着/,
      /说|喊|叫|哭|笑/,
      /拿|握|抓|扔|放/
    ];

    for (const pattern of actionPatterns) {
      if (pattern.test(visual)) {
        // 提取包含动作的句子片段
        const match = visual.match(new RegExp(`[^。,，]*${pattern.source}[^。,，]*`));
        if (match) return match[0];
      }
    }

    return '角色动作';
  }

  /**
   * 生成主体英文描述（纯英文）
   */
  generateSubjectEnglish(visual, anchors = {}) {
    // 提取角色相关描述并翻译为英文
    const subjectPatterns = [
      { pattern: /主角|男主角|女主角/g, en: 'protagonist' },
      { pattern: /男子|男人|男性/g, en: 'man' },
      { pattern: /女子|女人|女性/g, en: 'woman' },
      { pattern: /老人/g, en: 'elderly person' },
      { pattern: /小孩|儿童/g, en: 'child' },
      { pattern: /穿着|身着/g, en: 'wearing' },
      { pattern: /站|立/g, en: 'standing' },
      { pattern: /坐/g, en: 'sitting' },
      { pattern: /走|行走/g, en: 'walking' },
      { pattern: /跑|奔跑/g, en: 'running' }
    ];

    let subjectEn = 'subject in scene';

    if (visual) {
      // 简单的描述转换
      const visualLower = visual.toLowerCase();

      // 尝试保留已有的英文描述
      if (/[a-zA-Z]/.test(visual)) {
        // 如果已有英文，提取英文部分
        const englishParts = visual.match(/[a-zA-Z][a-zA-Z\s,]+/g);
        if (englishParts && englishParts.length > 0) {
          subjectEn = englishParts.slice(0, 3).join(', ');
        }
      } else {
        // 全中文，进行基础翻译
        subjectEn = 'person in scene, detailed appearance';
      }
    }

    // 添加锚点引用（使用正确的 {@xx} 格式）
    if (anchors.characters && anchors.characters.length > 0) {
      const charAnchor = anchors.characters[0].anchor;
      subjectEn = `{@${charAnchor}}: ${subjectEn}`;
    } else if (anchors.character) {
      // 兼容旧格式
      subjectEn = `${anchors.character}, ${subjectEn}`;
    }

    return subjectEn;
  }

  /**
   * 生成环境英文描述（纯英文）
   */
  generateEnvironmentEnglish(visual, style, anchors = {}) {
    const lighting = style.lighting?.examples?.[0] || 'natural lighting';

    // 场景关键词翻译
    const locationPatterns = [
      { pattern: /街道|街/g, en: 'street' },
      { pattern: /房间|室内/g, en: 'indoor room' },
      { pattern: /办公室/g, en: 'office' },
      { pattern: /夜晚|夜间/g, en: 'night' },
      { pattern: /白天|日间/g, en: 'daytime' },
      { pattern: /城市/g, en: 'city' },
      { pattern: /森林/g, en: 'forest' },
      { pattern: /海边|海滩/g, en: 'beach' },
      { pattern: /山/g, en: 'mountain' }
    ];

    let environmentEn = lighting;

    if (visual) {
      // 提取场景元素
      for (const { pattern, en } of locationPatterns) {
        if (pattern.test(visual)) {
          environmentEn = `${en}, ${lighting}`;
          break;
        }
      }
    }

    // 添加锚点引用（使用正确的 {@xx} 格式）
    if (anchors.locations && anchors.locations.length > 0) {
      const locAnchor = anchors.locations[0].anchor;
      environmentEn = `{@${locAnchor}}: ${environmentEn}`;
    } else if (anchors.location) {
      // 兼容旧格式
      environmentEn = `${anchors.location}, ${environmentEn}`;
    }

    return environmentEn;
  }

  /**
   * 生成材质英文描述
   */
  generateMaterialEnglish(visual) {
    return 'natural skin texture, realistic fabric details, environmental textures, fine details';
  }

  /**
   * 生成镜头英文描述
   */
  generateCameraEnglish(segment, style) {
    const cameraMap = {
      'opening_hook': 'wide shot to close-up, fast dolly in, dynamic movement, 24mm to 50mm',
      'background': 'medium shot, slow pan, establishing shot, 35mm lens',
      'conflict': 'close-up, handheld camera, tension building, 85mm portrait',
      'twist': 'dramatic zoom, rack focus, reveal shot, 50mm',
      'climax': 'extreme close-up, rapid cuts, intense movement, macro details',
      'closing_hook': 'pull back, wide shot, mysterious fade, 24mm wide'
    };

    const styleCamera = style.cameraStyle?.shots?.[0] || '';
    const baseCamera = cameraMap[segment] || 'medium shot, smooth movement, 50mm';

    return styleCamera ? `${baseCamera}, ${styleCamera}` : baseCamera;
  }

  /**
   * 生成氛围英文描述
   */
  generateMoodEnglish(emotion, style) {
    const emotionEnMap = {
      '悬疑': 'suspenseful, mysterious atmosphere',
      '紧张': 'tense, nervous atmosphere',
      '高潮': 'climactic, intense emotion',
      '悲伤': 'melancholic, sad mood',
      '喜悦': 'joyful, happy atmosphere',
      '愤怒': 'angry, furious mood',
      '惊喜': 'surprised, amazed',
      '平静': 'calm, peaceful atmosphere',
      '温馨': 'warm, heartwarming mood',
      '神秘': 'mysterious, enigmatic'
    };

    let moodEn = 'cinematic mood';

    for (const [cn, en] of Object.entries(emotionEnMap)) {
      if (emotion && emotion.includes(cn)) {
        moodEn = en;
        break;
      }
    }

    // 添加风格特征
    if (style.characteristics?.length > 0) {
      moodEn += `, ${style.characteristics.slice(0, 2).join(', ')}`;
    }

    return moodEn;
  }

  /**
   * 从LLM返回的中文结果构建最终提示词
   * @param {Object} llmResult - LLM返回的中文5D框架 + 音频元素
   * @param {number} duration - 时长
   * @param {Object} anchors - 锚点信息
   * @returns {string}
   */
  buildChinesePromptFromLLMResult(llmResult, duration, anchors = null) {
    const parts = [];

    // 1. D1 主体描述（已包含锚点格式）
    if (llmResult.d1_subject) {
      let subject = llmResult.d1_subject;
      // 如果LLM没有添加锚点，手动添加（注意：charAnchor 已经是完整格式 {@char_xxx}）
      if (anchors && anchors.characters && anchors.characters.length > 0 && !subject.includes('{@')) {
        const charAnchor = anchors.characters[0].anchor;
        subject = `${charAnchor}: ${subject}`;
      }
      parts.push(subject);
    }

    // 2. D2 环境光线描述
    if (llmResult.d2_environment) {
      let env = llmResult.d2_environment;
      // 如果LLM没有添加锚点，手动添加
      if (anchors && anchors.locations && anchors.locations.length > 0 && !env.includes('{@')) {
        const locAnchor = anchors.locations[0].anchor;
        env = `${locAnchor}: ${env}`;
      }
      parts.push(env);
    }

    // 3. D3 材质细节描述
    if (llmResult.d3_material) {
      parts.push(llmResult.d3_material);
    }

    // 4. D4 镜头风格描述（LLM已输出纯中文，无需翻译）
    if (llmResult.d4_camera) {
      parts.push(llmResult.d4_camera);
    }

    // 5. D5 氛围情感描述
    if (llmResult.d5_mood) {
      parts.push(llmResult.d5_mood);
    }

    // 6. 时长信息
    parts.push(`【${duration}秒片段】`);

    // 7. 音频元素
    const audioParts = [];
    if (llmResult.narration) {
      audioParts.push(`旁白："${llmResult.narration}"`);
    }
    if (llmResult.dialogue) {
      audioParts.push(`对白：${llmResult.dialogue}`);
    }
    if (llmResult.bgm) {
      audioParts.push(`BGM：${llmResult.bgm}`);
    }
    if (llmResult.sfx) {
      audioParts.push(`音效：${llmResult.sfx}`);
    }
    if (audioParts.length > 0) {
      parts.push(audioParts.join(' | '));
    }

    return parts.join(' | ');
  }

  /**
   * 构建完整的中文提示词
   * 直接使用原始剧本中的中文描述，避免翻译问题
   * @param {Object} scriptClip - 剧本片段
   * @param {Object} d5 - 5D框架（英文版本）
   * @param {number} duration - 时长
   * @param {Object} anchors - 锚点信息（可选）
   */
  buildComprehensiveChinesePrompt(scriptClip, d5, duration, anchors = null) {
    const parts = [];

    // 直接使用原始剧本的中文视觉描述
    const visualDesc = scriptClip.visual || '';

    // 1. 主体描述 - 从原始中文视觉描述中提取
    let subjectChinese = this.extractChineseSubject(visualDesc);
    if (anchors && anchors.characters && anchors.characters.length > 0) {
      const charAnchor = anchors.characters[0].anchor;  // 已经是完整格式 {@char_xxx}
      subjectChinese = `${charAnchor}: ${subjectChinese}`;
    }
    if (subjectChinese) parts.push(subjectChinese);

    // 2. 环境描述 - 从原始中文视觉描述中提取
    let envChinese = this.extractChineseEnvironment(visualDesc);
    if (anchors && anchors.locations && anchors.locations.length > 0) {
      const locAnchor = anchors.locations[0].anchor;  // 已经是完整格式 {@loc_xxx}
      envChinese = `${locAnchor}: ${envChinese}`;
    }
    if (envChinese) parts.push(envChinese);

    // 3. 镜头描述 - 转换英文镜头术语为中文
    if (d5.d4_camera) {
      const cameraChinese = this.translateCameraTerms(d5.d4_camera);
      if (cameraChinese) parts.push(cameraChinese);
    }

    // 4. 情绪氛围 - 使用原始情绪标签
    if (scriptClip.emotion) {
      parts.push(`情绪：${scriptClip.emotion}`);
    }

    // 5. 时长信息
    parts.push(`【${duration}秒片段】`);

    // 6. 音频信息
    const audioParts = [];
    if (scriptClip.narration) {
      audioParts.push(`旁白："${scriptClip.narration}"`);
    }
    if (scriptClip.dialogue) {
      const dialogue = typeof scriptClip.dialogue === 'string'
        ? scriptClip.dialogue
        : `${scriptClip.dialogue.character}："${scriptClip.dialogue.line}"`;
      audioParts.push(`对白：${dialogue}`);
    }
    if (scriptClip.bgm) {
      audioParts.push(`BGM：${scriptClip.bgm}`);
    }
    if (audioParts.length > 0) {
      parts.push(audioParts.join(' | '));
    }

    return parts.join(' | ');
  }

  /**
   * 从中文视觉描述中提取主体部分
   */
  extractChineseSubject(visualDesc) {
    if (!visualDesc) return '';

    // 尝试提取人物相关的描述
    // 模式1：人物动作描述
    const actionMatch = visualDesc.match(/([^，。]+?(?:站在|坐在|躺在|走|跑|站立|端坐|出现|身影)[^，。]*)/);
    if (actionMatch) return actionMatch[1];

    // 模式2：人物外貌描述
    const appearanceMatch = visualDesc.match(/((?:一个|一名|身穿|穿着|披着)[^，。]{5,30})/);
    if (appearanceMatch) return appearanceMatch[1];

    // 模式3：直接取第一句作为主体描述
    const firstSentence = visualDesc.split(/[，。]/)[0];
    if (firstSentence && firstSentence.length > 3) return firstSentence;

    return visualDesc.slice(0, 50) || '人物';
  }

  /**
   * 从中文视觉描述中提取环境部分
   */
  extractChineseEnvironment(visualDesc) {
    if (!visualDesc) return '';

    // 尝试提取场景环境描述
    // 模式1：明确的环境描述
    const envMatch = visualDesc.match(/(?:背景是|身处|位于|在|环境|场景)([^，。]+)/);
    if (envMatch) return envMatch[1];

    // 模式2：光线描述
    const lightMatch = visualDesc.match(/([^，。]*(?:光线|灯光|阳光|月光|阴影|昏暗|明亮)[^，。]*)/);
    if (lightMatch) return lightMatch[1];

    // 模式3：室内外场景
    const sceneMatch = visualDesc.match(/([^，。]*(?:房间|室内|室外|街道|建筑|大厅|走廊)[^，。]*)/);
    if (sceneMatch) return sceneMatch[1];

    return '';
  }

  /**
   * 翻译镜头术语为中文（扩展版）
   * 更彻底地翻译英文术语，避免中英混杂
   */
  translateCameraTerms(englishCamera) {
    if (!englishCamera) return '';

    const termMap = {
      // 景别（需要先匹配长的，避免部分匹配）
      'extreme wide shot': '超大远景',
      'extreme close-up': '大特写',
      'medium close-up': '中近景',
      'medium shot': '中景',
      'wide shot': '远景',
      'full shot': '全景',
      'close-up': '特写',
      'EWS': '超大远景',
      'WS': '远景',
      'FS': '全景',
      'MS': '中景',
      'MCU': '中近景',
      'CU': '特写',
      'ECU': '大特写',
      // 运镜
      'static shot': '固定镜头',
      'static': '固定镜头',
      'dolly in': '推镜头',
      'dolly out': '拉镜头',
      'dolly zoom': '滑动变焦',
      'dolly': '推拉镜头',
      'pan left': '左摇',
      'pan right': '右摇',
      'pan': '摇镜头',
      'tracking shot': '跟拍',
      'tracking': '跟拍',
      'handheld': '手持摄影',
      'crane shot': '摇臂镜头',
      'crane': '摇臂镜头',
      'steadicam': '稳定器拍摄',
      'slow motion': '慢动作',
      'tilting up to': '上仰至',
      'tilting down to': '下俯至',
      'tilt up': '上仰',
      'tilt down': '下俯',
      'tilt': '俯仰',
      // 焦段
      'wide angle lens': '广角镜头',
      'wide angle': '广角',
      'telephoto lens': '长焦镜头',
      'telephoto': '长焦',
      'lens': '镜头',
      '50mm': '50mm标准镜头',
      '35mm': '35mm镜头',
      '85mm': '85mm人像镜头',
      '24mm': '24mm广角镜头',
      // 连接词和介词
      ' on ': ' 于 ',
      ' to ': ' 至 ',
      ' from ': ' 从 ',
      ' with ': ' 带 ',
      ' and ': ' 和 ',
      // 动作描述
      'focuses on': '聚焦于',
      'focus on': '聚焦于',
      'focusing on': '聚焦于',
      'focus': '聚焦',
      'zooming in': '推进',
      'zooming out': '拉远',
      'zoom in': '推进',
      'zoom out': '拉远',
      'pull back': '拉远',
      'push in': '推进',
      'moving to': '移动至',
      'moving from': '移动自',
      'moving': '移动',
      // 常用词汇
      'hands': '双手',
      'hand': '手',
      'face': '面部',
      'eyes': '眼睛',
      'eye': '眼睛',
      'body': '身体',
      'head': '头部',
      'shoulders': '肩膀',
      'shadows': '阴影',
      'shadow': '阴影',
      'silhouette': '剪影',
      'profile': '侧影',
      'camera': '',
      'shot': '',
      'movement': '运动',
      'angle': '角度',
      'frame': '画面',
      'composition': '构图',
      'cinematic': '电影感',
      'dramatic': '戏剧性',
      'soft': '柔和',
      'hard': '硬朗',
      'smooth': '平滑',
      'shallow depth of field': '浅景深',
      'deep focus': '深焦',
      'rack focus': '变焦',
      'zoom': '变焦'
    };

    let result = englishCamera;

    // 按长度排序，优先替换长的术语（避免部分匹配问题）
    const sortedTerms = Object.entries(termMap).sort((a, b) => b[0].length - a[0].length);

    for (const [en, zh] of sortedTerms) {
      // 对于短词使用单词边界匹配，对于带空格的短语直接替换
      if (en.includes(' ')) {
        result = result.split(en).join(zh);
      } else {
        const regex = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        result = result.replace(regex, zh);
      }
    }

    // 清理多余空格和标点
    result = result
      .replace(/\s+/g, '')
      .replace(/，+/g, '，')
      .replace(/^，|，$/g, '')
      .trim();

    return result || englishCamera;
  }

  /**
   * 翻译主体描述为中文（兼容方法）
   */
  translateSubjectToChinese(englishSubject, scriptClip) {
    if (scriptClip && scriptClip.visual) {
      return this.extractChineseSubject(scriptClip.visual);
    }
    return '人物';
  }

  /**
   * 翻译环境描述为中文（兼容方法）
   */
  translateEnvironmentToChinese(englishEnv, scriptClip) {
    if (scriptClip && scriptClip.visual) {
      return this.extractChineseEnvironment(scriptClip.visual);
    }
    return '场景环境';
  }

  /**
   * 翻译材质描述为中文
   */
  translateMaterialToChinese(englishMaterial) {
    const translations = {
      'skin texture': '皮肤质感',
      'fabric': '布料',
      'natural': '自然',
      'realistic': '写实',
      'detailed': '细节丰富'
    };

    let chinese = englishMaterial || '';
    for (const [en, zh] of Object.entries(translations)) {
      chinese = chinese.replace(new RegExp(en, 'gi'), zh);
    }

    return chinese;
  }

  /**
   * 翻译镜头描述为中文（兼容方法）
   */
  translateCameraToChinese(englishCamera) {
    return this.translateCameraTerms(englishCamera) || '中景';
  }

  /**
   * 翻译氛围描述为中文
   */
  translateMoodToChinese(englishMood, originalEmotion) {
    // 优先使用原始情绪
    if (originalEmotion) return originalEmotion;

    const translations = {
      // 基础情绪
      'tense': '紧张',
      'calm': '平静',
      'mysterious': '神秘',
      'dramatic': '戏剧性',
      'cinematic': '电影感',
      'atmospheric': '氛围感',
      // 更多情绪词汇
      'suspenseful': '悬疑',
      'suspense': '悬疑',
      'intense': '激烈',
      'peaceful': '平和',
      'romantic': '浪漫',
      'melancholic': '忧郁',
      'sad': '悲伤',
      'happy': '快乐',
      'joyful': '喜悦',
      'angry': '愤怒',
      'fearful': '恐惧',
      'surprised': '惊讶',
      'nostalgic': '怀旧',
      'hopeful': '充满希望',
      'desperate': '绝望',
      'lonely': '孤独',
      'warm': '温暖',
      'cold': '冷漠',
      'dark': '黑暗',
      'bright': '明亮',
      'steady': '平稳',
      'focused': '专注',
      'narrative': '叙事感',
      'vintage': '复古',
      'modern': '现代',
      'classic': '经典',
      'epic': '史诗感',
      'intimate': '亲密',
      'detached': '疏离',
      // 连接词
      ', ': '，',
      ' and ': '和',
      ' with ': '带'
    };

    let chinese = englishMood || '';
    // 按长度排序，优先替换长的
    const sortedTranslations = Object.entries(translations).sort((a, b) => b[0].length - a[0].length);
    for (const [en, zh] of sortedTranslations) {
      chinese = chinese.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), zh);
    }

    return chinese || '中性';
  }

  /**
   * 获取中文镜头建议
   */
  getCameraSuggestionChinese(segment) {
    const suggestionMap = {
      'opening_hook': '远景→特写+急推',
      'background': '中景+缓摇',
      'conflict': '近景+手持晃动',
      'twist': '特写+变焦',
      'climax': '大特写+快切',
      'closing_hook': '拉远+淡出'
    };

    return suggestionMap[segment] || '中景+固定';
  }

  /**
   * 生成关键帧参考图提示词
   * 输出一个完整的画面描述提示词，用于图像生成
   * @param {Object} d5 - 英文5D框架
   * @param {Object} style - 风格预设
   * @param {Object} scriptClip - 剧本片段
   * @param {Object|null} chineseD5 - 中文5D框架（可选，由中文LLM生成）
   */
  generateKeyframeReference(d5, style, scriptClip, chineseD5 = null) {
    // 构建完整的关键帧画面描述
    const sceneDescription = scriptClip.visual || '';

    // 提取核心画面元素（用于英文）
    const keyElements = this.extractKeyVisualElements(sceneDescription, d5, scriptClip);

    // 构建英文关键帧提示词（完整，可直接用于图像生成）
    const keyframePrompt = this.buildKeyframePrompt(keyElements, d5, style, scriptClip);

    // 构建中文关键帧描述 - 优先使用中文5D
    let chinesePrompt;
    if (chineseD5) {
      // 使用中文LLM生成的5D框架
      chinesePrompt = this.buildChineseKeyframePromptFromD5(chineseD5, scriptClip);
    } else {
      // 降级：从英文翻译
      chinesePrompt = this.buildChineseKeyframePrompt(keyElements, d5, style, scriptClip);
    }

    // 提取构图信息
    const composition = this.extractComposition(d5, keyElements);

    // 提取色调信息
    const colorPalette = this.extractColorPalette(style, d5);

    // 提取光线参考 - 优先使用中文5D
    const lightingRef = chineseD5
      ? (chineseD5.d2_environment || '自然光')
      : this.extractLightingRef(d5, keyElements);

    // 提取氛围参考 - 优先使用中文5D
    const moodBoard = chineseD5
      ? (chineseD5.d5_mood || scriptClip.emotion || '中性氛围')
      : this.extractMoodBoard(d5, scriptClip);

    // 提取风格参考
    const styleRef = this.extractStyleRef(style);

    return {
      description: `关键帧: ${scriptClip.segmentName || '片段'}`,
      // 完整的英文提示词，可直接用于图像生成
      prompt: keyframePrompt,
      // 中文提示词（来自中文LLM生成的5D）
      chinesePrompt: chinesePrompt,
      // 前端显示需要的字段
      composition,
      colorPalette,
      lightingRef,
      moodBoard,
      styleRef,
      // 关键元素分解
      elements: {
        subject: keyElements.subject || '未指定',
        action: keyElements.action || '无',
        location: keyElements.location || '未指定',
        lighting: keyElements.lighting || '自然光',
        mood: keyElements.mood || '中性'
      }
    };
  }

  /**
   * 提取构图信息
   */
  extractComposition(d5, keyElements) {
    const parts = [];
    if (d5.d4_camera) {
      // 翻译镜头术语
      const camera = this.translateCameraTerms(d5.d4_camera);
      parts.push(camera);
    }
    if (keyElements.subject) {
      parts.push(`主体位于画面中心`);
    }
    return parts.join('，') || '标准构图';
  }

  /**
   * 提取色调信息
   */
  extractColorPalette(style, d5) {
    if (style.colorGrading) {
      const { palette, saturation, contrast } = style.colorGrading;
      const parts = [];
      if (palette) parts.push(palette);
      if (saturation) parts.push(`饱和度${saturation}`);
      if (contrast) parts.push(`对比度${contrast}`);
      return parts.join('，') || '中性色调';
    }
    return '中性色调';
  }

  /**
   * 提取光线参考
   */
  extractLightingRef(d5, keyElements) {
    if (keyElements.lighting) {
      // 翻译为中文
      return this.translateLightingToChinese(keyElements.lighting);
    }
    // 从 d2_environment 提取光线信息
    const lighting = this.extractLighting(d5.d2_environment);
    if (lighting) {
      return lighting;
    }
    return '自然光';
  }

  /**
   * 提取氛围参考
   */
  extractMoodBoard(d5, scriptClip) {
    const parts = [];
    // 优先使用原始情绪标签（中文）
    if (scriptClip.emotion) {
      parts.push(`情绪：${scriptClip.emotion}`);
    }
    // 如果有 d5_mood，翻译为中文
    if (d5.d5_mood && !scriptClip.emotion) {
      const moodChinese = this.translateMoodToChinese(d5.d5_mood, null);
      parts.push(moodChinese);
    }
    return parts.join('，') || '中性氛围';
  }

  /**
   * 提取风格参考
   */
  extractStyleRef(style) {
    const parts = [];
    if (style.director) {
      parts.push(`${style.director}风格`);
    }
    if (style.characteristics && style.characteristics.length > 0) {
      parts.push(style.characteristics.slice(0, 3).join('、'));
    }
    return parts.join('，') || '电影风格';
  }

  /**
   * 从场景描述中提取关键视觉元素（增强版）
   */
  extractKeyVisualElements(sceneDescription, d5, scriptClip) {
    const elements = {
      subject: '',      // 主体（人物/道具）
      action: '',       // 动作
      location: '',     // 场景
      lighting: '',     // 光线
      timeOfDay: '',    // 时间
      weather: '',      // 天气
      mood: '',         // 情绪
      props: []         // 道具
    };

    // 从 d5 提取主体信息
    elements.subject = d5.d1_subject || scriptClip.visual?.substring(0, 100) || '场景画面';

    // 从 d5 提取环境信息
    elements.location = d5.d2_environment || '室内环境';
    elements.lighting = this.extractLighting(d5.d2_environment);

    // 从 d5 提取氛围
    elements.mood = d5.d5_mood || scriptClip.emotion || '中性';

    // 从场景描述提取动作关键词
    if (sceneDescription) {
      const actionPatterns = [
        { pattern: /站|站立/, action: 'standing' },
        { pattern: /坐|坐着/, action: 'sitting' },
        { pattern: /走|行走/, action: 'walking' },
        { pattern: /跑|奔跑/, action: 'running' },
        { pattern: /看|望|凝视|注视/, action: 'looking' },
        { pattern: /拿着|握着/, action: 'holding' },
        { pattern: /转身/, action: 'turning' },
        { pattern: /低头/, action: 'looking down' },
        { pattern: /抬头/, action: 'looking up' }
      ];

      for (const { pattern, action } of actionPatterns) {
        if (pattern.test(sceneDescription)) {
          elements.action = action;
          break;
        }
      }

      // 提取时间
      const timeMatch = sceneDescription.match(/(早晨|上午|中午|下午|傍晚|夜晚|深夜|黎明|黄昏)/);
      if (timeMatch) elements.timeOfDay = timeMatch[1];

      // 提取天气
      const weatherMatch = sceneDescription.match(/(雨天|晴天|阴天|雾|雪|暴风雨)/);
      if (weatherMatch) elements.weather = weatherMatch[1];

      // 提取道具
      const propPatterns = [/书|书籍/, /剑|刀/, /手机|电话/, /信|信件/, /钥匙/];
      for (const pattern of propPatterns) {
        const match = sceneDescription.match(pattern);
        if (match) elements.props.push(match[0]);
      }
    }

    return elements;
  }

  /**
   * 从环境描述中提取光线信息
   */
  extractLighting(environment) {
    if (!environment) return '自然光';

    const lightingPatterns = [
      { pattern: /sunlight|阳光|日光/, lighting: '阳光' },
      { pattern: /moonlight|月光/, lighting: '月光' },
      { pattern: /candle|烛光/, lighting: '烛光' },
      { pattern: /neon|霓虹/, lighting: '霓虹灯' },
      { pattern: /lamplight|灯光/, lighting: '灯光' },
      { pattern: /shafts of light|光束/, lighting: '光束' },
      { pattern: /backlight|逆光/, lighting: '逆光' },
      { pattern: /rim light|轮廓光/, lighting: '轮廓光' },
      { pattern: /soft light|柔光/, lighting: '柔光' },
      { pattern: /harsh light|硬光/, lighting: '硬光' }
    ];

    for (const { pattern, lighting } of lightingPatterns) {
      if (pattern.test(environment)) {
        return lighting;
      }
    }

    return '自然光';
  }

  /**
   * 构建关键帧提示词（英文，可直接用于图像生成）
   * 必须包含完整的画面描述
   */
  buildKeyframePrompt(elements, d5, style, scriptClip) {
    const parts = [];

    // 1. 主体描述（最关键，必须有）
    const subject = elements.subject || 'A person in scene';
    parts.push(subject);

    // 2. 动作/姿态
    if (elements.action) {
      parts.push(elements.action);
    }

    // 3. 场景环境
    const location = elements.location || 'interior scene';
    parts.push(location);

    // 4. 光线描述
    const lighting = this.extractLightingFromEnglish(d5.d2_environment);
    if (lighting) parts.push(lighting);

    // 5. 时间/天气
    if (elements.timeOfDay) {
      parts.push(elements.timeOfDay);
    }
    if (elements.weather) {
      parts.push(elements.weather);
    }

    // 6. 材质细节
    if (d5.d3_material) {
      parts.push(d5.d3_material);
    }

    // 7. 氛围情感
    if (elements.mood) {
      parts.push(elements.mood);
    }

    // 8. 风格和质量标签（必须有）
    if (style.director) {
      parts.push(`in the style of ${style.director}`);
    }
    parts.push('cinematic composition');
    parts.push('professional color grading');
    parts.push('8K resolution');
    parts.push('photorealistic');
    parts.push('highly detailed');

    return parts.join(', ');
  }

  /**
   * 从英文环境描述中提取光线
   */
  extractLightingFromEnglish(environment) {
    if (!environment) return '';

    const patterns = [
      /sunlight|daylight|natural light/gi,
      /moonlight|night light/gi,
      /candlelight|candle/gi,
      /neon|neon light/gi,
      /lamplight|lamp/gi,
      /shafts of light|light beams/gi,
      /backlight|backlit/gi,
      /rim light/gi,
      /soft light|diffused light/gi,
      /harsh light|hard light/gi,
      /dramatic lighting/gi,
      /ambient light/gi
    ];

    for (const pattern of patterns) {
      const match = environment.match(pattern);
      if (match) return match[0];
    }

    return '';
  }

  /**
   * 构建中文关键帧提示词
   * 使用中文内容，避免英文混入
   */
  buildChineseKeyframePrompt(elements, d5, style, scriptClip) {
    const parts = [];

    // 主体 - 使用原始剧本的中文视觉描述
    const subjectChinese = scriptClip.visual
      ? this.extractChineseSubject(scriptClip.visual)
      : '角色';
    parts.push(`主体: ${subjectChinese}`);

    // 动作 - 翻译为中文
    if (elements.action) {
      const actionChinese = this.translateActionToChinese(elements.action);
      parts.push(`动作: ${actionChinese}`);
    }

    // 场景 - 使用原始剧本的中文视觉描述
    const locationChinese = scriptClip.visual
      ? this.extractChineseEnvironment(scriptClip.visual)
      : '室内';
    parts.push(`场景: ${locationChinese}`);

    // 光线 - 使用中文
    const lightingChinese = this.translateLightingToChinese(elements.lighting || d5.d2_environment);
    parts.push(`光线: ${lightingChinese}`);

    // 氛围 - 使用原始情绪标签
    const moodChinese = scriptClip.emotion || this.translateMoodToChinese(d5.d5_mood, null);
    parts.push(`氛围: ${moodChinese}`);

    // 时间/天气
    if (elements.timeOfDay) parts.push(`时间: ${elements.timeOfDay}`);
    if (elements.weather) parts.push(`天气: ${elements.weather}`);

    // 道具
    if (elements.props.length > 0) {
      parts.push(`道具: ${elements.props.join('，')}`);
    }

    return parts.join(' | ');
  }

  /**
   * 从中文5D框架构建中文关键帧提示词
   * 直接使用中文LLM生成的5D内容，无需翻译
   * @param {Object} chineseD5 - 中文5D框架
   * @param {Object} scriptClip - 剧本片段
   */
  buildChineseKeyframePromptFromD5(chineseD5, scriptClip) {
    const parts = [];

    // 主体 - 直接使用中文d1_subject
    if (chineseD5.d1_subject) {
      parts.push(`主体: ${chineseD5.d1_subject}`);
    }

    // 环境 - 直接使用中文d2_environment
    if (chineseD5.d2_environment) {
      parts.push(`场景: ${chineseD5.d2_environment}`);
    }

    // 材质 - 直接使用中文d3_material
    if (chineseD5.d3_material) {
      parts.push(`材质: ${chineseD5.d3_material}`);
    }

    // 镜头 - 直接使用中文d4_camera
    if (chineseD5.d4_camera) {
      parts.push(`镜头: ${chineseD5.d4_camera}`);
    }

    // 氛围 - 直接使用中文d5_mood
    if (chineseD5.d5_mood) {
      parts.push(`氛围: ${chineseD5.d5_mood}`);
    }

    // 音频元素
    if (chineseD5.narration) {
      parts.push(`旁白: ${chineseD5.narration}`);
    }
    if (chineseD5.dialogue) {
      parts.push(`对白: ${chineseD5.dialogue}`);
    }

    return parts.join(' | ');
  }

  /**
   * 翻译动作描述为中文
   */
  translateActionToChinese(action) {
    const actionMap = {
      'standing': '站立',
      'sitting': '坐着',
      'walking': '行走',
      'running': '奔跑',
      'looking': '观看',
      'holding': '拿着',
      'turning': '转身',
      'looking down': '低头',
      'looking up': '抬头',
      'lying': '躺着',
      'kneeling': '跪着',
      'jumping': '跳跃',
      'falling': '跌落',
      'reaching': '伸手',
      'grasping': '抓住',
      'pointing': '指向',
      'nodding': '点头',
      'shaking head': '摇头',
      'smiling': '微笑',
      'crying': '哭泣',
      'laughing': '大笑'
    };
    return actionMap[action.toLowerCase()] || action;
  }

  /**
   * 翻译光线描述为中文
   */
  translateLightingToChinese(lighting) {
    if (!lighting) return '自然光';

    const lightingMap = {
      'natural light': '自然光',
      'sunlight': '阳光',
      'moonlight': '月光',
      'candlelight': '烛光',
      'neon light': '霓虹灯',
      'lamplight': '灯光',
      'ambient light': '环境光',
      'soft light': '柔光',
      'hard light': '硬光',
      'backlight': '逆光',
      'rim light': '轮廓光',
      'warm light': '暖光',
      'cold light': '冷光',
      'dramatic lighting': '戏剧性光线',
      'dim light': '昏暗光线',
      'bright light': '明亮光线'
    };

    let result = lighting;
    for (const [en, zh] of Object.entries(lightingMap)) {
      result = result.replace(new RegExp(en, 'gi'), zh);
    }
    return result || '自然光';
  }

  /**
   * 从片段提取锚点标识符
   */
  extractAnchorsFromClip(scriptClip) {
    const anchors = {
      characters: [],
      locations: [],
      props: []
    };

    // 从对白提取角色
    if (scriptClip.dialogue && typeof scriptClip.dialogue === 'object') {
      const charAnchor = this.generateAnchor('char', scriptClip.dialogue.character);
      anchors.characters.push({
        name: scriptClip.dialogue.character,
        anchor: charAnchor
      });
    }

    // 从视觉描述提取场景
    if (scriptClip.visual) {
      // 简单提取，可以后续增强
      const locationMatch = scriptClip.visual.match(/在(.+?)(?:中|里|上|下)/);
      if (locationMatch) {
        const locAnchor = this.generateAnchor('loc', locationMatch[1]);
        anchors.locations.push({
          name: locationMatch[1],
          anchor: locAnchor
        });
      }
    }

    return anchors;
  }


  /**
   * 获取镜头建议（中文）
   */
  getCameraSuggestion(segment) {
    const suggestionMap = {
      'opening_hook': '[远景→特写+急推] 硬钩子开场',
      'background': '[中景+缓摇] 铺垫介绍',
      'conflict': '[近景+手持] 冲突紧张',
      'twist': '[特写+变焦] 转折揭示',
      'climax': '[大特写+快切] 高潮爆发',
      'closing_hook': '[拉远+淡出] 悬念收尾'
    };

    return suggestionMap[segment] || '[中景+固定] 标准镜头';
  }

  /**
   * 获取情绪强度
   */
  getEmotionIntensity(beatType) {
    const intensityMap = {
      'slap': 9,
      'upgrade': 7,
      'revenge': 8,
      'identity': 6,
      'comeback': 9,
      'emotion': 7,
      'info': 4
    };

    return intensityMap[beatType] || 5;
  }

  /**
   * 获取默认转场
   */
  getDefaultTransition(index, total) {
    if (index === 0) return '← 淡入 | → 切换';
    if (index === total - 1) return '← 切换 | → 淡出';
    return '← 切换 | → 切换';
  }

  /**
   * 建议BGM
   */
  suggestBGM(emotion) {
    const bgmMap = {
      '悬疑': '低频弦乐，悬疑氛围',
      '紧张': '急促节奏，打击乐',
      '高潮': '交响乐高潮，强节奏',
      '悲伤': '钢琴独奏，抒情',
      '喜悦': '轻快旋律，明快节奏',
      '神秘': '电子音效，空灵'
    };

    return bgmMap[emotion] || '背景音乐，适中节奏';
  }

  /**
   * 流式生成分镜（逐个片段生成）
   * @param {string} scriptContent - 剧本内容
   * @param {number} episodeNumber - 集数
   * @param {Object} options - 选项
   * @param {Function} onClipGenerated - 单个片段生成完成回调
   * @returns {Promise<Object>}
   */
  async generateStoryboardStreaming(scriptContent, episodeNumber, options = {}, onClipGenerated = null) {
    const {
      mode = this.options.defaultMode,
      stylePreset = this.options.defaultStyle
    } = options;

    this.abortController = false;
    console.log(`[Storyboard] 流式生成第 ${episodeNumber} 集分镜`);

    // 先整体生成，然后逐步返回
    const result = await this.generateStoryboard(scriptContent, episodeNumber, {
      ...options,
      onProgress: null
    });

    if (result.aborted) {
      return result;
    }

    // 逐个返回片段
    const clips = result.clips || [];
    for (let i = 0; i < clips.length; i++) {
      if (this.abortController) {
        console.log('[Storyboard] 流式生成已被中止');
        break;
      }

      if (onClipGenerated) {
        onClipGenerated({
          episode: episodeNumber,
          clip: clips[i],
          index: i,
          total: clips.length,
          isLast: i === clips.length - 1
        });
      }

      // 短暂延迟，让前端有时间渲染
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return result;
  }

  /**
   * 解析分镜响应（支持新的JSON格式）
   * @param {string} response
   * @param {string} stylePreset
   * @returns {Array}
   */
  parseStoryboardResponse(response, stylePreset) {
    // 尝试解析为JSON
    const jsonResult = this.tryParseJSON(response, stylePreset);
    if (jsonResult.length > 0) {
      return jsonResult;
    }

    // 回退到旧的Markdown解析
    return this.parseMarkdownResponse(response, stylePreset);
  }

  /**
   * 尝试解析JSON格式
   */
  tryParseJSON(response, stylePreset) {
    try {
      // 提取JSON
      let jsonStr = response;

      // 如果包含代码块，提取内容
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // 尝试直接解析
      const parsed = JSON.parse(jsonStr);

      // 处理 { clips: [...] } 格式
      const clips = parsed.clips || (Array.isArray(parsed) ? parsed : []);

      return clips.map((clip, index) => this.normalizeClip(clip, index, stylePreset));
    } catch (e) {
      // JSON解析失败，返回空数组
      return [];
    }
  }

  /**
   * 标准化片段数据
   */
  normalizeClip(clip, index, stylePreset) {
    const prompt = clip.prompt || {};

    return {
      id: clip.id || `V${String(index + 1).padStart(2, '0')}`,
      title: clip.title || `片段 ${index + 1}`,
      duration: clip.duration || { start: index * 10, end: (index + 1) * 10, total: 10 },
      intent: clip.intent || '',
      emotion: clip.emotion || '',
      transition: clip.transition || '',
      camera: clip.camera || '',
      // 新增：音频相关字段
      narration: clip.narration || '',
      dialogue: clip.dialogue || '',
      bgm: clip.bgm || '',
      sfx: clip.sfx || '',
      prompt: {
        d1_subject: prompt.d1_subject || '',
        d2_environment: prompt.d2_environment || '',
        d3_material: prompt.d3_material || '',
        d4_camera: prompt.d4_camera || '',
        d5_mood: prompt.d5_mood || '',
        imperfections: prompt.imperfections || [],
        randomWords: prompt.randomWords || [],
        foregroundLayer: prompt.foregroundLayer || '',
        combined: prompt.combined || '',
        negative: prompt.negative || generateNegativePrompt(),
        chinese: prompt.chinese || '' // 新增：中文提示词
      }
    };
  }

  /**
   * 解析Markdown格式（兼容旧格式）
   */
  parseMarkdownResponse(response, stylePreset) {
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

    // 提取旁白
    const narrationMatch = content.match(/🎙️\s*旁白[：:]\s*["""]([^"""]+)["""]/);
    const narration = narrationMatch ? narrationMatch[1].trim() : '';

    // 提取对白
    const dialogueMatch = content.match(/💬\s*对白[：:]\s*([^\n]+)/);
    const dialogue = dialogueMatch ? dialogueMatch[1].trim() : '';

    // 提取BGM
    const bgmMatch = content.match(/🎵\s*BGM[：:]\s*([^\n]+)/);
    const bgm = bgmMatch ? bgmMatch[1].trim() : '';

    // 提取音效
    const sfxMatch = content.match(/🔊\s*音效[：:]\s*([^\n]+)/);
    const sfx = sfxMatch ? sfxMatch[1].trim() : '';

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

    // 生成中文提示词
    const chinese = this.buildChinesePrompt(intent, narration, dialogue, emotion);

    return {
      intent,
      emotion,
      transition,
      camera,
      narration,
      dialogue,
      bgm,
      sfx,
      prompt: {
        ...d5,
        ...deai,
        combined: combinedPrompt || this.combinePrompt(d5, deai, stylePreset),
        negative,
        chinese
      }
    };
  }

  /**
   * 构建中文提示词
   */
  buildChinesePrompt(intent, narration, dialogue, emotion) {
    const parts = [];

    if (intent) parts.push(`意图：${intent}`);
    if (narration) parts.push(`旁白："${narration}"`);
    if (dialogue) parts.push(`对白：${dialogue}`);
    if (emotion) parts.push(`情绪：${emotion}`);

    return parts.join('。');
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
   * @param {Object} d5 - 5D框架
   * @param {Object} deai - 去AI味元素
   * @param {Object} style - 风格预设
   * @param {Object} anchors - 锚点信息（可选）
   */
  buildFullPrompt(d5, deai, style, anchors = null) {
    // 如果有锚点信息，为主体添加 {@xx} 标识
    let subjectWithAnchors = d5.d1_subject || '';
    let environmentWithAnchors = d5.d2_environment || '';

    if (anchors) {
      // 为角色添加锚点标识
      if (anchors.characters && anchors.characters.length > 0) {
        const charAnchor = anchors.characters[0].anchor;
        // 在主体描述前添加锚点标识（检查是否已有锚点）
        if (subjectWithAnchors && !subjectWithAnchors.includes('{@')) {
          subjectWithAnchors = `{@${charAnchor}}: ${subjectWithAnchors}`;
        }
      }

      // 为场景添加锚点标识
      if (anchors.locations && anchors.locations.length > 0) {
        const locAnchor = anchors.locations[0].anchor;
        if (environmentWithAnchors && !environmentWithAnchors.includes('{@')) {
          environmentWithAnchors = `{@${locAnchor}}: ${environmentWithAnchors}`;
        }
      }
    }

    const parts = [
      subjectWithAnchors,
      environmentWithAnchors,
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
