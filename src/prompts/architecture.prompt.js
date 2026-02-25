/**
 * 分集架构提示词模板
 */

import { BEAT_TYPES, FOUR_STEP_TEMPLATE } from '../config/beat-types.js';
import { RHYTHM_TEMPLATES } from '../config/rhythm-templates.js';

/**
 * 生成分集架构提示词
 * @param {Object} storyBible - 故事圣经
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateArchitecturePrompt(storyBible, options = {}) {
  const { targetEpisodes = null, rhythmTemplate = 'standard_90' } = options;

  const beatTypeList = Object.values(BEAT_TYPES)
    .map(b => `- ${b.name}(${b.id}): ${b.description} [强度:${b.intensity}]`)
    .join('\n');

  const rhythm = RHYTHM_TEMPLATES[rhythmTemplate.toUpperCase()] || RHYTHM_TEMPLATES.STANDARD_90;
  const rhythmInfo = rhythm.segments
    .map(s => `- ${s.name}(${s.timing[0]}-${s.timing[1]}s): ${s.description} [强度:${s.intensity}]`)
    .join('\n');

  const fourStepInfo = FOUR_STEP_TEMPLATE.steps
    .map(s => `${s.name}(${s.timing}): ${s.description}`)
    .join(' → ');

  const targetEpisodesNote = targetEpisodes
    ? `\n**目标集数**：${targetEpisodes} 集`
    : '';

  return `你是一个专业的漫剧分集架构师。请根据以下故事圣经，设计完整的分集架构。${targetEpisodesNote}

## 故事圣经
\`\`\`json
${JSON.stringify(storyBible, null, 2)}
\`\`\`

## 爽点类型
${beatTypeList}

## 四步法结构
${fourStepInfo}

## 节奏模板（${rhythm.name} - ${rhythm.duration}秒）
${rhythmInfo}

## 输出要求
请严格按照以下 JSON 格式返回：

{
  "totalEpisodes": 7,
  "formula": "承重事件数(X) × 1.3 = Y集",
  "overview": {
    "act1": { "episodes": "1-2", "focus": "铺垫与建立" },
    "act2": { "episodes": "3-5", "focus": "冲突升级" },
    "act3": { "episodes": "6-7", "focus": "高潮与解决" }
  },
  "episodes": [
    {
      "number": 1,
      "title": "集标题",
      "logline": "一句话卖点",
      "assignedEvents": ["E01", "E02"],
      "beatMap": {
        "opening": {
          "timing": "0-5s",
          "type": "slap/upgrade/...",
          "hookDescription": "钩子描述",
          "fourSteps": {
            "promise": "立承诺内容",
            "suppress": "先压内容",
            "elevate": "后扬内容",
            "reward": "回报内容"
          }
        },
        "early": { ... },
        "mid": { ... },
        "climax": { ... },
        "closing": { ... }
      },
      "emotionalArc": "情绪弧线",
      "keyCharacters": ["C01"],
      "estimatedDuration": 90
    }
  ],
  "arcs": {
    "miniArcs": [
      {
        "name": "小弧线1",
        "episodes": [1, 2],
        "setup": "建立",
        "climax": "高潮",
        "resolution": "解决"
      }
    ],
    "majorTurningPoints": [
      {
        "episode": 3,
        "type": "midpoint",
        "description": "转折点描述"
      }
    ]
  },
  "beatDistribution": {
    "slap": 2,
    "upgrade": 3,
    "revenge": 2,
    "identity": 1,
    "info": 2,
    "comeback": 1,
    "emotion": 2
  },
  "notes": "架构设计说明"
}

## 分集原则

### 1. 集数计算
- 基于承重事件数量，公式：承重事件 × 1.3 ≈ 集数
- 每集时长 60-120 秒
- 确保关键事件不压缩

### 2. 事件分配（重要！）
- **必须按故事时间顺序分配事件**：第1集分配最早发生的事件，最后一集分配结局事件
- **遵守依赖关系**：如果事件B dependsOn 事件A，那么A必须在B之前或同一集
- 每集 1-3 个主要事件
- 承重事件优先分配
- 考虑情绪节奏的起伏

### 3. 爽点地图
- 每集至少 1 个主爽点
- 开场必须有钩子
- 结尾必须有悬念
- 主爽点放在高潮位置

### 4. 四步法应用
为每个爽点设计完整的四步结构，确保观众情绪体验完整。

### 5. 弧线设计
- 设计跨集的小弧线（2-3集）
- 安排主要转折点
- 确保整体节奏起伏`;
}

/**
 * 生成单集调整的提示词
 * @param {Object} episode - 当前集信息
 * @param {Object} storyBible - 故事圣经
 * @param {Object} adjustments - 调整要求
 * @returns {string}
 */
export function generateEpisodeAdjustPrompt(episode, storyBible, adjustments) {
  return `请调整以下分集设计：

## 当前集设计
\`\`\`json
${JSON.stringify(episode, null, 2)}
\`\`\`

## 故事圣经上下文
角色: ${storyBible.characters.map(c => c.name).join(', ')}
事件: ${storyBible.events.map(e => e.id).join(', ')}

## 调整要求
${adjustments.instruction || '请优化这一集的设计'}

## 输出要求
返回调整后的完整集设计 JSON，保持原有格式。`;
}

/**
 * 生成爽点地图规划提示词
 * @param {Object} storyBible - 故事圣经
 * @param {number} episodeCount - 集数
 * @returns {string}
 */
export function generateBeatMapPrompt(storyBible, episodeCount) {
  const beatTypeList = Object.values(BEAT_TYPES)
    .map(b => `${b.name}(${b.id}): 强度${b.intensity}`)
    .join(', ');

  return `为以下故事设计 ${episodeCount} 集的爽点地图：

## 故事信息
主要事件: ${storyBible.events.filter(e => e.type === 'load_bearing').map(e => e.summary).join('; ')}
可用爽点: ${beatTypeList}

## 输出格式
{
  "beatMap": [
    {
      "episode": 1,
      "mainBeat": { "type": "slap", "intensity": 9 },
      "secondaryBeats": [{ "type": "info", "intensity": 6 }],
      "openingHook": "开场钩子",
      "closingHook": "结尾钩子"
    }
  ],
  "distribution": {
    "slap": 3,
    "upgrade": 2,
    ...
  },
  "intensityCurve": [6, 5, 7, 8, 6, 9, 7]
}`;
}

export default {
  generateArchitecturePrompt,
  generateEpisodeAdjustPrompt,
  generateBeatMapPrompt
};
