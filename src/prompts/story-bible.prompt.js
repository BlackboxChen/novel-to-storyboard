/**
 * 故事圣经解析提示词模板
 */

import { ARCHETYPES } from '../config/archetypes.js';
import { BEAT_TYPES } from '../config/beat-types.js';

/**
 * 生成故事圣经解析提示词
 * @param {string} novelContent - 小说内容
 * @param {string} title - 标题
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateStoryBiblePrompt(novelContent, title = '未命名', options = {}) {
  const { chunkInfo = null, previousContext = '' } = options;

  const chunkNote = chunkInfo
    ? `\n\n**注意**：这是小说的第 ${chunkInfo.index + 1}/${chunkInfo.total} 部分。请只分析这部分内容。`
    : '';

  const contextNote = previousContext
    ? `\n\n**前文上下文**：\n${previousContext.slice(-300)}\n\n请保持一致性。`
    : '';

  // 改进版 prompt - 强调事件顺序和依赖关系
  return `你是漫剧剧本分析师。分析《${title}》提取故事圣经。${chunkNote}${contextNote}

## 输出格式（纯JSON，无代码块）
{
  "title": "标题",
  "mainTheme": "主题",
  "toneKeywords": ["氛围词"],
  "characters": [
    {"id": "C01", "name": "角色名", "role": "protagonist/antagonist/ally", "archetype": "原型", "traits": ["特征1", "特征2"], "desires": "核心欲望", "fears": "核心恐惧"}
  ],
  "events": [
    {"id": "E01", "summary": "事件摘要", "type": "事件类型", "dependsOn": ["E00"], "enables": ["E02"], "beatPotential": ["爽点类型"]}
  ],
  "turningPoints": [{"position": "位置描述", "description": "转折点说明"}],
  "estimatedEpisodes": 5
}

## 事件要求（重要！）

### 1. 按故事时间顺序排列
事件必须按故事发生的先后顺序列出！
- E01 应该是最早发生的事件
- 最后的 E** 应该是结局

### 2. 依赖关系说明
- **dependsOn**: 此事件发生前必须已经发生的事件ID列表
  - 例：E05"合租" dependsOn=["E04"]，因为必须先相识才能合租
  - 开头事件 dependsOn=[]
- **enables**: 此事件发生后才可能发生的事件ID列表
  - 例：E04"相识" enables=["E05","E06"]
  - 结局事件 enables=[]

### 3. 事件类型
- **load_bearing**: 承重事件，推动主线发展的关键节点
- **reinforcing**: 强化事件，加深角色或主题
- **decorative**: 装饰事件，丰富细节但非必要

### 4. 爽点类型
slap打脸, upgrade升级, revenge复仇, identity身份揭露, info信息揭露, comeback反杀, emotion情感

### 5. 角色原型
underdog逆袭型, hidden_identity隐身份型, gray灰度型, oppressor压迫者, wildcard搅局者, ally盟友

---
小说内容：
${novelContent.slice(0, 12000)}`;
}

/**
 * 生成合并故事圣经的提示词
 * @param {Array} partialBibles - 部分故事圣经列表
 * @returns {string}
 */
export function generateMergePrompt(partialBibles) {
  return `你是一个专业的剧本分析师。请将以下多个部分的故事圣经合并成一个完整的故事圣经。

## 输入的部分故事圣经
${partialBibles.map((pb, i) => `
### 第 ${i + 1} 部分
\`\`\`json
${JSON.stringify(pb, null, 2)}
\`\`\`
`).join('\n')}

## 合并要求
1. **角色去重**：合并重复的角色，保留最完整的描述
2. **事件整合**：按时间顺序整合事件，修复依赖关系
3. **原型统一**：确保同一角色的原型一致
4. **依赖链完整**：确保事件的 dependsOn 和 enables 引用正确

## 输出格式
返回完整的 JSON 格式故事圣经，结构与输入相同。`;
}

/**
 * 生成角色原型识别的提示词
 * @param {Object} character - 角色信息
 * @returns {string}
 */
export function generateArchetypePrompt(character) {
  const archetypeList = Object.values(ARCHETYPES)
    .map(a => `- ${a.name}(${a.id}): ${a.description}\n  特征: ${a.traits.join(', ')}\n  弧线: ${a.arcPattern}`)
    .join('\n');

  return `分析以下角色，确定其原型：

## 角色信息
${JSON.stringify(character, null, 2)}

## 可选原型
${archetypeList}

## 输出要求
返回 JSON 格式：
{
  "archetype": "原型ID",
  "confidence": 0.8,
  "reasoning": "判断理由",
  "suggestedArc": "建议的弧线方向"
}`;
}

/**
 * 生成事件依赖链构建的提示词
 * @param {Array} events - 事件列表
 * @returns {string}
 */
export function generateDependencyPrompt(events) {
  return `分析以下事件的因果依赖关系，构建事件依赖链：

## 事件列表
${events.map(e => `- ${e.id}: ${e.summary}`).join('\n')}

## 输出要求
返回 JSON 格式：
{
  "events": [
    {
      "id": "E01",
      "dependsOn": ["E00"],
      "enables": ["E02", "E03"],
      "narrativeFunction": "叙事功能说明"
    }
  ],
  "chains": [
    {
      "name": "主链条",
      "events": ["E01", "E02", "E05"]
    }
  ],
  "parallelEvents": [
    ["E03", "E04"]
  ]
}`;
}

export default {
  generateStoryBiblePrompt,
  generateMergePrompt,
  generateArchetypePrompt,
  generateDependencyPrompt
};
