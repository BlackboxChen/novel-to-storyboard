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

  // 获取本集相关角色（简化）
  const episodeChars = (episode.keyCharacters || storyBible.characters.slice(0, 3).map(c => c.id))
    .map(charId => storyBible.characters.find(c => c.id === charId))
    .filter(Boolean)
    .slice(0, 3)
    .map(c => `${c.name}(${c.role})`)
    .join(', ');

  // 获取本集事件（简化）
  const episodeEvents = episode.assignedEvents
    .map(eventId => {
      const event = storyBible.events.find(e => e.id === eventId);
      return event ? `${event.id}: ${event.summary}` : null;
    })
    .filter(Boolean)
    .slice(0, 5)
    .join('\n');

  // 获取爽点信息（简化）
  const beatTypeInfo = episode.beatMap
    ? Object.entries(episode.beatMap)
        .filter(([_, v]) => v && v.type)
        .slice(0, 3)
        .map(([pos, v]) => `${pos}: ${v.type}`)
        .join(', ')
    : '未指定';

  // 简化版 prompt
  return `你是漫剧编剧。为《${storyBible.title || '未命名'}》生成第${episodeNumber}集剧本。

## 本集信息
- 标题：${episode.title || '待定'}
- 卖点：${episode.logline || '待定'}
- 时长：${rhythm.duration}秒
- 风格：${style === 'narrated' ? '解说漫(旁白为主)' : '分格漫剧'}

## 角色
${episodeChars}

## 事件
${episodeEvents || '无特定事件'}

## 爽点
${beatTypeInfo}

## 输出格式
直接输出剧本Markdown，格式如下：

### 第${episodeNumber}集：${episode.title || '标题'}

**卖点**：一句话卖点

---

#### 【开场钩子】0-5s
🎙️ 旁白：
> [说书体开场，3秒抓住观众]

🖼️ 画面：
- [画面描述]

---

#### 【背景铺垫】5-20s
🎙️ 旁白：
> [背景介绍]

🖼️ 画面：
- [画面描述]

---

#### 【冲突展开】20-40s
[继续...]

---

#### 【升级转折】40-60s
[继续...]

---

#### 【高潮回报】60-80s
[高潮爽点]

---

#### 【悬置钩子】80-90s
[结尾悬念]

---

**下集预告**：[悬念内容]`;
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
