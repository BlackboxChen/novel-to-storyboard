/**
 * 分镜生成提示词模板
 * 优化版：明确分离中英文提示词，添加关键帧参考
 */

import { STYLE_PRESETS } from '../config/style-presets.js';
import { IMPERFECTIONS, RANDOM_WORDS, FOREGROUND_ELEMENTS } from '../config/deai-elements.js';

/**
 * 时长选项配置
 */
const DURATION_OPTIONS = {
  SHORT: 5,    // 激烈情绪
  MEDIUM: 10,  // 中等情绪
  LONG: 15     // 平缓情绪
};

/**
 * 生成分镜提示词
 * @param {string} scriptContent - 剧本内容
 * @param {number} episodeNumber - 集数
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateStoryboardPrompt(scriptContent, episodeNumber, options = {}) {
  const { mode = 'A', stylePreset = 'neutral_cinematic', maxDuration = null } = options;

  const style = STYLE_PRESETS[stylePreset.toUpperCase()] || STYLE_PRESETS.NEUTRAL_CINEMATIC;

  const styleInfo = `**预设**：${style.name}
**特点**：${style.characteristics.join(', ')}
**导演风格**：${style.director || '通用'}`;

  const durationGuide = maxDuration
    ? `用户自定义最大时长: ${maxDuration}秒`
    : `智能时长决策: 根据情绪选择 5s/10s/15s (激烈=5s, 中等=10s, 平缓=15s)`;

  return `你是专业分镜师。为第${episodeNumber}集生成视频分镜。

## 剧本内容
${scriptContent}

## 视觉风格
${styleInfo}

## 时长规则
${durationGuide}

## 输出JSON格式（每个片段）
{
  "clips": [
    {
      "id": "V01",
      "title": "片段标题",
      "duration": { "start": 0, "end": 5, "total": 5 },
      "intent": "意图说明",
      "emotion": "情绪类型 · 强度(1-10)",
      "transition": "← 入场 | → 出场",
      "camera": "镜头与节奏（中文，含时间码和画面描述）",
      "narration": "旁白内容（如有）",
      "dialogue": "对白内容（如有，格式：角色名：台词）",
      "bgm": "背景音乐建议",
      "sfx": "音效提示",
      "prompt": {
        "d1_subject": "Subject description in ENGLISH only (character appearance, pose, action)",
        "d2_environment": "Environment and lighting in ENGLISH only (scene, light source, atmosphere)",
        "d3_material": "Material details in ENGLISH only (texture, fabric, skin details)",
        "d4_camera": "Camera work in ENGLISH only (shot type, movement, lens)",
        "d5_mood": "Mood and emotion in ENGLISH only (emotional tone, cinematic style)",
        "imperfections": ["imperfection 1", "imperfection 2"],
        "randomWords": ["random word 1", "random word 2"],
        "foregroundLayer": "Foreground element description in ENGLISH",
        "combined": "COMBINED ENGLISH PROMPT - Pure visual description, NO CHINESE",
        "negative": "Negative prompt in English",
        "chinese": "【中文提示词】5秒片段 | 画面：xxx | 镜头：xxx | 情绪：xxx | 旁白：xxx | 对白：xxx"
      },
      "keyframeRef": {
        "composition": "Composition reference",
        "colorPalette": "Color palette suggestion",
        "moodBoard": "Mood reference"
      }
    }
  ]
}

## 关键要求
1. **音频字段**: narration, dialogue, bgm, sfx 必须从剧本提取
2. **英文提示词**: prompt.combined 必须是纯英文视觉描述，不能包含任何中文
3. **中文提示词**: prompt.chinese 必须包含完整的中文描述，格式：
   "【X秒片段】画面：xxx | 镜头：xxx | 情绪：xxx | 旁白：'xxx' | 对白：xxx"
4. **5D框架**: d1-d5 必须都是纯英文描述
5. **关键帧参考**: 为每个片段提供构图和色彩参考

直接输出JSON，不要代码块。`;
}

/**
 * 获取模式 A 指南
 */
function getModeAGuide() {
  return `### 电影分镜模式 (Mode A)
- 纯视觉分镜 + 视频生成提示词
- 每个片段 5-15 秒
- 总时长约 90 秒
- 聚焦画面叙事
- 包含完整的 5D 框架提示词
- 包含去 AI 味元素
- 英文提示词供 AI 视频生成使用`;
}

/**
 * 获取模式 B 指南
 */
function getModeBGuide() {
  return `### 解说漫剧模式 (Mode B)
- 视觉分镜 + 音频脚本层
- 每个片段 5-15 秒
- 包含旁白和对白的时间码同步
- 额外输出：
  - 🎙️ 旁白时间码
  - 💬 对白时间码
  - 🎵 BGM 建议
  - 🔊 音效提示`;
}

/**
 * 获取 5D 框架说明
 */
function getFiveDFramework() {
  return `## 5D 框架系统

### D1 - 主体 (Subject)
描述画面中的主要元素：
- **角色**：外貌、服装、姿态、表情、动作
- **道具**：形状、颜色、位置、状态
- **要点**：具体、可视觉化的描述

示例：
- "年轻女性，黑色长发，穿着红色旗袍，优雅站立，微微侧身，表情坚毅"
- "古铜色手枪，握在手中，枪口微抬，金属光泽"

### D2 - 环境光线 (Environment & Lighting)
描述场景和光线：
- **场景**：室内/室外、具体环境、背景元素
- **光源**：自然光/人造光、光源位置、光质
- **光效**：阴影、高光、氛围光、特殊效果

示例：
- "夜晚城市天台，远处霓虹灯闪烁，冷色调环境光，面光来自左侧，轮廓光打在发丝"
- "昏暗仓库，单一顶灯，硬光投射，强烈阴影对比"

### D3 - 材质细节 (Material & Texture)
描述物体表面质感：
- **皮肤**：质感、毛孔、光泽
- **服装**：面料、褶皱、图案
- **环境**：墙壁、地面、物体的纹理

示例：
- "皮肤自然光泽，可见细微毛孔，衣服丝绸质感，流动褶皱"
- "粗糙水泥墙面，金属锈迹，地面水渍反光"

### D4 - 拍摄风格 (Camera & Style)
描述镜头语言：
- **景别**：大特写/特写/中景/全景/远景
- **运动**：固定/推/拉/摇/移/跟/升降
- **焦段**：广角/标准/长焦
- **构图**：对称/三分/引导线/框架

示例：
- "中近景，缓慢推进，50mm 镜头，三分构图，眼睛位于上三分之一线"
- "大远景，无人机视角，缓慢前移，广角镜头，城市全景"

### D5 - 氛围情感 (Mood & Emotion)
描述情绪氛围：
- **情绪**：角色的情绪状态
- **氛围**：场景的整体感觉
- **风格**：电影感、导演风格参考

示例：
- "紧张压抑，悬疑氛围，希区柯克式构图"
- "浪漫温馨，王家卫式色调，暧昧光影"`;
}

/**
 * 获取去 AI 味元素指南
 */
function getDeAIElementsGuide() {
  const skinImperfections = IMPERFECTIONS.skin.slice(0, 5);
  const hairImperfections = IMPERFECTIONS.hair.slice(0, 3);
  const clothingImperfections = IMPERFECTIONS.clothing.slice(0, 3);
  const atmosphereWords = RANDOM_WORDS.atmosphere.slice(0, 5);
  const lightingWords = RANDOM_WORDS.lighting.slice(0, 5);
  const foregroundElements = FOREGROUND_ELEMENTS.particles.slice(0, 4);

  return `## 去 AI 味元素系统

### 不完美描述
**皮肤**：
${skinImperfections.map(i => `- ${i}`).join('\n')}

**头发**：
${hairImperfections.map(i => `- ${i}`).join('\n')}

**服装**：
${clothingImperfections.map(i => `- ${i}`).join('\n')}

### 随机词库
**氛围词**：${atmosphereWords.join(', ')}
**光线词**：${lightingWords.join(', ')}

### 前景层元素
${foregroundElements.map(f => `- ${f}`).join('\n')}

### 使用原则
1. 每条提示词添加 2-3 个不完美描述
2. 注入 3-5 个随机氛围词
3. 70% 的镜头添加前景层
4. 始终包含完整的 Negative Prompt`;
}

/**
 * 生成单个片段的提示词
 * @param {Object} segment - 片段信息
 * @param {string} stylePreset - 风格预设
 * @returns {string}
 */
export function generateClipPrompt(segment, stylePreset = 'neutral_cinematic') {
  const style = STYLE_PRESETS[stylePreset.toUpperCase()] || STYLE_PRESETS.NEUTRAL_CINEMATIC;

  return `为以下片段生成完整的 5D 框架视频提示词：

## 片段信息
${JSON.stringify(segment, null, 2)}

## 风格要求
${style.name}: ${style.promptModifiers.join(', ')}

## 输出要求
返回 JSON 格式：
{
  "clipId": "V01",
  "duration": 10,
  "d1_subject": "主体描述",
  "d2_environment": "环境光线描述",
  "d3_material": "材质细节描述",
  "d4_camera": "拍摄风格描述",
  "d5_mood": "氛围情感描述",
  "imperfections": ["不完美1", "不完美2"],
  "randomWords": ["随机词1", "随机词2", "随机词3"],
  "foregroundLayer": "前景层描述",
  "combined": "完整组合提示词(英文)",
  "negative": "Negative Prompt"
}`;
}

export default {
  generateStoryboardPrompt,
  generateClipPrompt
};
