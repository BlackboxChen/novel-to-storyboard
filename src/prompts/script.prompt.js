/**
 * 剧本生成提示词模板
 * 结构化输出版本 - 直接输出JSON格式
 */

import { BEAT_TYPES } from '../config/beat-types.js';
import { RHYTHM_TEMPLATES } from '../config/rhythm-templates.js';

/**
 * 生成剧本提示词（结构化JSON输出）
 * @param {Object} storyBible - 故事圣经
 * @param {Object} architecture - 分集架构
 * @param {number} episodeNumber - 集数
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateScriptPrompt(storyBible, architecture, episodeNumber, options = {}) {
  const {
    style = 'narrated',
    rhythmTemplate = 'standard_90',
    userFeedback = null,
    previousEpisode = null,
    nextEpisode = null
  } = options;

  const episode = architecture.episodes.find(e => e.number === episodeNumber);
  if (!episode) {
    throw new Error(`Episode ${episodeNumber} not found in architecture`);
  }

  const rhythm = RHYTHM_TEMPLATES[rhythmTemplate.toUpperCase()] || RHYTHM_TEMPLATES.STANDARD_90;

  // 获取本集相关角色
  const episodeChars = (episode.keyCharacters || storyBible.characters.slice(0, 3).map(c => c.id))
    .map(charId => storyBible.characters.find(c => c.id === charId))
    .filter(Boolean)
    .slice(0, 3)
    .map(c => ({ id: c.id, name: c.name, role: c.role }));

  // 获取本集事件
  const episodeEvents = episode.assignedEvents
    .map(eventId => {
      const event = storyBible.events.find(e => e.id === eventId);
      return event ? { id: event.id, summary: event.summary } : null;
    })
    .filter(Boolean)
    .slice(0, 5);

  // 获取爽点信息
  const beatTypeInfo = episode.beatMap
    ? Object.entries(episode.beatMap)
        .filter(([_, v]) => v && v.type)
        .slice(0, 3)
        .map(([pos, v]) => ({ position: pos, type: v.type }))
    : [];

  // 用户修改建议部分
  const userFeedbackSection = userFeedback
    ? `\n## ⚠️ 用户修改要求（必须优先遵循）\n${userFeedback}\n`
    : '';

  // 相邻集摘要部分
  let adjacentSection = '';
  if (previousEpisode || nextEpisode) {
    adjacentSection = '\n## 相邻集连贯性要求\n';

    if (previousEpisode) {
      adjacentSection += `
### 前集回顾（第 ${previousEpisode.number} 集）
- 标题：${previousEpisode.title}
- 卖点：${previousEpisode.logline}
- 关键情节：${previousEpisode.keyBeats}
- 结尾状态：${previousEpisode.endingState}
- **本集开头必须承接上集结尾，保持剧情连贯**
`;
    }

    if (nextEpisode) {
      adjacentSection += `
### 后集预告（第 ${nextEpisode.number} 集）
- 标题：${nextEpisode.title}
- 卖点：${nextEpisode.logline}
- 开头状态：${nextEpisode.openingState}
- **本集结尾必须为下集做好铺垫，保持剧情连贯**
`;
    }
  }

  return `你是漫剧编剧。为《${storyBible.title || '未命名'}》生成第${episodeNumber}集剧本。
${userFeedbackSection}

## 本集信息
- 标题：${episode.title || '待定'}
- 卖点：${episode.logline || '待定'}
- 时长：${rhythm.duration}秒
- 风格：${style === 'narrated' ? '解说漫(旁白为主)' : '分格漫剧'}

## 角色列表
${JSON.stringify(episodeChars, null, 2)}

## 本集事件
${JSON.stringify(episodeEvents, null, 2)}

## 爽点规划
${JSON.stringify(beatTypeInfo, null, 2)}
${adjacentSection}
## 输出要求
直接输出纯JSON（无代码块），格式如下：

{
  "number": ${episodeNumber},
  "title": "本集标题",
  "logline": "一句话卖点",
  "totalDuration": ${rhythm.duration},
  "style": "${style}",
  "clips": [
    {
      "id": "C01",
      "segment": "opening_hook",
      "segmentName": "开场钩子",
      "timeCode": { "start": 0, "end": 5 },
      "narration": "说书体旁白，硬钩子，3秒内抓住观众（约25字）",
      "visual": "画面描述：镜头、场景、人物动作",
      "dialogue": null,
      "emotion": "悬疑/好奇",
      "beatType": "slap/upgrade/...",
      "bgm": "背景音乐建议",
      "sfx": "音效提示"
    },
    {
      "id": "C02",
      "segment": "background",
      "segmentName": "背景铺垫",
      "timeCode": { "start": 5, "end": 20 },
      "narration": "背景介绍旁白（约75字，包含角色关系、前情提要）",
      "visual": "画面描述",
      "dialogue": { "character": "角色名", "line": "关键人物台词（增加剧情连贯性）" },
      "emotion": "平稳",
      "beatType": null
    },
    {
      "id": "C03",
      "segment": "conflict",
      "segmentName": "冲突展开",
      "timeCode": { "start": 20, "end": 40 },
      "narration": "冲突描述旁白（约100字）",
      "visual": "画面描述",
      "dialogue": { "character": "角色名", "line": "关键台词" },
      "emotion": "紧张",
      "beatType": "upgrade"
    },
    {
      "id": "C04",
      "segment": "twist",
      "segmentName": "升级转折",
      "timeCode": { "start": 40, "end": 60 },
      "narration": "转折描述旁白（约100字，包含意外发展、局势变化）",
      "visual": "画面描述",
      "dialogue": { "character": "角色名", "line": "关键转折台词" },
      "emotion": "惊讶",
      "beatType": "twist"
    },
    {
      "id": "C05",
      "segment": "climax",
      "segmentName": "高潮回报",
      "timeCode": { "start": 60, "end": 80 },
      "narration": "高潮描述旁白（约100字，紧张激烈、情感爆发）",
      "visual": "画面描述",
      "dialogue": { "character": "角色名", "line": "高潮台词（情感爆发）" },
      "emotion": "高潮",
      "beatType": "slap"
    },
    {
      "id": "C06",
      "segment": "closing_hook",
      "segmentName": "悬置钩子",
      "timeCode": { "start": 80, "end": 90 },
      "narration": "结尾悬念旁白（约50字，留下悬念、引发期待）",
      "visual": "画面描述",
      "dialogue": null,
      "emotion": "悬念",
      "beatType": null
    }
  ],
  "summary": {
    "emotionalArc": "情绪弧线描述",
    "keyLine": "本集金句"
  }
}

## ⚠️ 关键要求（必须严格遵守）

### 1. 旁白字数标准（语速5字/秒）
- **5秒片段**：旁白约 20-30 字
- **10秒片段**：旁白约 45-55 字
- **15秒片段**：旁白约 70-80 字
- **20秒片段**：旁白约 95-105 字
- **旁白要连贯**：包含前情衔接、角色关系、情节推进

### 2. 关键人物对白（增加剧情连贯性）
- **背景铺垫片段**：必须有1句对白（角色介绍/关系揭示）
- **冲突展开片段**：必须有1-2句对白（冲突对话）
- **升级转折片段**：必须有1句对白（关键台词）
- **高潮回报片段**：必须有1句对白（高潮台词）
- **开场钩子/悬置钩子**：可以无对白
- **对白字数**：每句 10-30 字

### 3. 其他要求
- **visual**: 详细的画面描述，包括镜头、场景、人物动作
- **emotion**: 该片段的情绪基调
- **bgm/sfx**: 音频建议
- **6个片段**: 开场钩子、背景铺垫、冲突展开、升级转折、高潮回报、悬置钩子

### 4. 禁止事项
- ❌ 不要生成"下集预告"字段
- ❌ 不要生成空的旁白
- ❌ 不要在关键片段省略对白

直接输出JSON，不要任何代码块标记。`;
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
