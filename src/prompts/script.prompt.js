/**
 * 剧本生成提示词模板
 */

import { BEAT_TYPES } from '../config/beat-types.js';
import { RHYTHM_TEMPLATES } from '../config/rhythm-templates.js';

/**
 * 生成剧本提示词
 * @param {Object} storyBible - 故事圣经
 * @param {Object} architecture - 分集架构
 * @param {number} episodeNumber - 集数
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateScriptPrompt(storyBible, architecture, episodeNumber, options = {}) {
  const { style = 'narrated', rhythmTemplate = 'standard_90' } = options;

  const episode = architecture.episodes.find(e => e.number === episodeNumber);
  if (!episode) {
    throw new Error(`Episode ${episodeNumber} not found in architecture`);
  }

  const rhythm = RHYTHM_TEMPLATES[rhythmTemplate.toUpperCase()] || RHYTHM_TEMPLATES.STANDARD_90;

  const styleGuide = style === 'narrated'
    ? getNarratedStyleGuide()
    : getStoryboardStyleGuide();

  const beatTypeInfo = episode.beatMap
    ? Object.entries(episode.beatMap)
        .filter(([_, v]) => v && v.type)
        .map(([pos, v]) => {
          const config = Object.values(BEAT_TYPES).find(b => b.id === v.type);
          return `${pos}: ${config?.name || v.type}`;
        })
        .join(', ')
    : '未指定';

  return `你是一个专业漫剧编剧。请根据以下信息，生成第 ${episodeNumber} 集的完整剧本。

## 基本信息
- 集号：第 ${episodeNumber} 集 / 共 ${architecture.totalEpisodes} 集
- 集标题：${episode.title || '待定'}
- 一句话卖点：${episode.logline || '待定'}
- 时长：${rhythm.duration} 秒
- 风格：${style === 'narrated' ? '解说漫' : '分格漫剧'}

## 本集事件
${episode.assignedEvents.map(eventId => {
  const event = storyBible.events.find(e => e.id === eventId);
  return event ? `- ${event.id}: ${event.summary}` : null;
}).filter(Boolean).join('\n')}

## 本集出场角色
${(episode.keyCharacters || storyBible.characters.slice(0, 3).map(c => c.id)).map(charId => {
  const char = storyBible.characters.find(c => c.id === charId);
  return char ? `- ${char.name}(${char.archetype || char.role}): ${char.traits?.slice(0, 2).join(', ')}` : null;
}).filter(Boolean).join('\n')}

## 爽点规划
${beatTypeInfo}

## 角色详细信息
\`\`\`json
${JSON.stringify(storyBible.characters.filter(c =>
  episode.keyCharacters?.includes(c.id) || c.role === 'protagonist'
), null, 2)}
\`\`\`

## 事件详细信息
\`\`\`json
${JSON.stringify(storyBible.events.filter(e =>
  episode.assignedEvents.includes(e.id)
), null, 2)}
\`\`\`

${styleGuide}

## 节奏结构（${rhythm.name}）
${rhythm.segments.map(s => `- ${s.name}(${s.timing[0]}-${s.timing[1]}s): ${s.description}`).join('\n')}

## 输出格式
使用 Markdown 格式输出完整剧本：

### 第${episodeNumber}集：${episode.title || '标题'}

**卖点**：一句话卖点
**主爽点**：类型与描述

---

#### 【开场钩子】0-5s
**时间码**：0.0-5.0s

🎙️ **旁白**：
> [说书体旁白，硬钩子，3秒内抓住观众]

🖼️ **画面**：
- [画面描述]

⚡ **爽点**：[类型] - [描述]

---

#### 【背景铺垫】5-20s
...

#### 【冲突展开】20-40s
...

#### 【升级转折】40-60s
...

#### 【高潮回报】60-80s
...

#### 【悬置钩子】80-90s
...

---

**本集总结**：
- 情绪弧线：[描述]
- 关键台词：[金句]
- 下集预告：[悬念]`;
}

/**
 * 获取解说漫风格指南
 */
function getNarratedStyleGuide() {
  return `## 解说漫风格指南

### 旁白（第一叙事层）
- 说书体风格，带节奏、带悬念
- 使用口语化表达，避免书面语
- 适当使用反问、设问
- 关键信息突出，语速有变化

### 对白（高光穿插）
- 仅在爽点位使用
- 每集 3-5 句金句
- 简短有力，避免长篇

### 画面
- 氛围为主，关键特写为辅
- 配合旁白节奏切换
- 强调情绪传达

### 示例旁白风格
> "你敢信？这个被所有人嘲笑的废材，竟然是..." (开场钩子)
> "就当所有人都以为..." (转折铺垫)
> "但是！" (反转标记)`;
}

/**
 * 获取分格漫剧风格指南
 */
function getStoryboardStyleGuide() {
  return `## 分格漫剧风格指南

### 画面驱动
- 每格承载叙事功能
- 分格构图丰富多变
- 动态效果提示（速度线、震动框）

### 台词设计
- 精简有力
- 配合画面节奏
- 使用气泡设计

### 分格建议
- 景别变化丰富
- 特写用于强调
- 大格用于高潮

### 格式示例
【格1】[大格·特写]
画面：[详细描述]
台词："[角色名]"
效果：[速度线/震动框]`;
}

/**
 * 生成爽点四步法内容提示词
 * @param {string} beatType - 爽点类型
 * @param {Object} context - 上下文
 * @returns {string}
 */
export function generateFourStepPrompt(beatType, context) {
  const beatConfig = Object.values(BEAT_TYPES).find(b => b.id === beatType);

  if (!beatConfig) {
    return '';
  }

  return `为以下场景设计"${beatConfig.name}"爽点的四步法内容：

## 爽点信息
- 类型：${beatConfig.name}(${beatType})
- 描述：${beatConfig.description}
- 强度：${beatConfig.intensity}/10

## 四步法模板
1. **立承诺**(${beatConfig.fourSteps.promise})
2. **先压**(${beatConfig.fourSteps.suppress})
3. **后扬**(${beatConfig.fourSteps.elevate})
4. **回报**(${beatConfig.fourSteps.reward})

## 上下文
${context}

## 输出要求
返回 JSON 格式：
{
  "promise": {
    "narration": "旁白内容",
    "visual": "画面描述",
    "timing": "建议时长"
  },
  "suppress": {...},
  "elevate": {...},
  "reward": {...}
}`;
}

export default {
  generateScriptPrompt,
  generateFourStepPrompt
};
