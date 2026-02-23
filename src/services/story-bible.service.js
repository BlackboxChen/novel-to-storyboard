/**
 * 故事圣经服务
 * 增强版小说解析，支持长文本分块、角色原型识别、事件依赖链构建
 */

import { llmService } from './llm-service.js';
import { TextChunker, smartChunkText } from '../utils/text-chunker.js';
import { JSONParser, parseJSON } from '../utils/json-parser.js';
import { identifyArchetype, getArchetypeConfig } from '../config/archetypes.js';
import { identifyBeatType } from '../config/beat-types.js';
import {
  generateStoryBiblePrompt,
  generateMergePrompt,
  generateArchetypePrompt,
  generateDependencyPrompt
} from '../prompts/story-bible.prompt.js';

/**
 * 故事圣经服务类
 */
export class StoryBibleService {
  constructor(options = {}) {
    this.chunker = new TextChunker(options.chunkConfig);
    this.jsonParser = new JSONParser();
    this.options = options;
  }

  /**
   * 解析小说 - 总入口
   * @param {string} content - 小说内容
   * @param {string} title - 标题
   * @returns {Promise<Object>}
   */
  async parseNovelFull(content, title = '未命名') {
    const wordCount = content.length;

    // 判断是否需要分块
    if (wordCount <= 8000) {
      // 短文本直接解析
      return await this.parseNovelChunk(content, title);
    }

    // 长文本分块处理
    console.log(`[StoryBible] 长文本处理: ${wordCount} 字，启用分块策略`);
    return await this.parseWithChunking(content, title);
  }

  /**
   * 解析单块小说内容
   * @param {string} chunk - 文本块
   * @param {string} title - 标题
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async parseNovelChunk(chunk, title, options = {}) {
    const prompt = generateStoryBiblePrompt(chunk, title, options);

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 8192 });

      const parsed = parseJSON(response);

      if (!parsed) {
        console.warn('[StoryBible] JSON 解析失败，返回基础结构');
        return this.createFallbackBible(chunk, title, response);
      }

      // 后处理：识别原型和爽点
      return this.enhanceStoryBible(parsed);
    } catch (error) {
      console.error('[StoryBible] 解析错误:', error.message);
      return this.createFallbackBible(chunk, title, error.message);
    }
  }

  /**
   * 分块解析长文本
   * @param {string} content - 完整内容
   * @param {string} title - 标题
   * @returns {Promise<Object>}
   */
  async parseWithChunking(content, title) {
    // 智能分块
    const chunks = smartChunkText(content, this.options.chunkConfig);
    console.log(`[StoryBible] 分块结果: ${chunks.length} 块`);

    const partialBibles = [];
    let previousContext = '';

    // 逐块解析
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[StoryBible] 解析第 ${i + 1}/${chunks.length} 块...`);

      const options = {
        chunkInfo: { index: i, total: chunks.length },
        previousContext: previousContext.slice(-500) // 保留最后500字作为上下文
      };

      const partial = await this.parseNovelChunk(chunk.content, title, options);

      // 标记来源
      partial._chunkIndex = i;
      partialBibles.push(partial);

      // 更新上下文
      previousContext = chunk.content;

      // 短暂延迟，避免 API 限流
      if (i < chunks.length - 1) {
        await this.delay(500);
      }
    }

    // 合并结果
    if (partialBibles.length === 1) {
      return partialBibles[0];
    }

    return await this.mergeStoryBibles(partialBibles, title);
  }

  /**
   * 合并多个部分故事圣经
   * @param {Array<Object>} partialBibles - 部分故事圣经
   * @param {string} title - 标题
   * @returns {Promise<Object>}
   */
  async mergeStoryBibles(partialBibles, title) {
    console.log(`[StoryBible] 合并 ${partialBibles.length} 个部分...`);

    // 如果块数较少，直接逻辑合并
    if (partialBibles.length <= 3) {
      return this.logicalMerge(partialBibles, title);
    }

    // 块数较多，使用 LLM 合并
    const prompt = generateMergePrompt(partialBibles);

    try {
      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 8192 });

      const merged = parseJSON(response);

      if (merged) {
        return this.enhanceStoryBible(merged);
      }
    } catch (error) {
      console.warn('[StoryBible] LLM 合并失败，使用逻辑合并:', error.message);
    }

    return this.logicalMerge(partialBibles, title);
  }

  /**
   * 逻辑合并（不使用 LLM）
   * @param {Array<Object>} partialBibles
   * @param {string} title
   * @returns {Object}
   */
  logicalMerge(partialBibles, title) {
    // 合并角色（去重）
    const characterMap = new Map();
    for (const partial of partialBibles) {
      if (!partial.characters) continue;
      for (const char of partial.characters) {
        const key = char.name;
        if (!characterMap.has(key)) {
          characterMap.set(key, char);
        } else {
          // 合并信息，保留更完整的
          const existing = characterMap.get(key);
          characterMap.set(key, {
            ...existing,
            ...char,
            traits: [...new Set([...(existing.traits || []), ...(char.traits || [])])],
            _mergedFrom: (existing._mergedFrom || 0) + 1
          });
        }
      }
    }

    // 合并事件（重新编号，修复依赖）
    const allEvents = [];
    let eventIndex = 1;
    const eventIdMap = new Map();

    for (const partial of partialBibles) {
      if (!partial.events) continue;
      for (const event of partial.events) {
        const oldId = event.id;
        const newId = `E${String(eventIndex).padStart(2, '0')}`;
        eventIdMap.set(oldId, newId);

        allEvents.push({
          ...event,
          id: newId,
          _originalId: oldId
        });
        eventIndex++;
      }
    }

    // 修复事件依赖
    for (const event of allEvents) {
      if (event.dependsOn) {
        event.dependsOn = event.dependsOn
          .map(id => eventIdMap.get(id) || id)
          .filter(id => allEvents.some(e => e.id === id));
      }
      if (event.enables) {
        event.enables = event.enables
          .map(id => eventIdMap.get(id) || id)
          .filter(id => allEvents.some(e => e.id === id));
      }
    }

    // 合并转折点
    const allTurningPoints = partialBibles
      .filter(p => p.turningPoints)
      .flatMap(p => p.turningPoints);

    // 合并世界信息
    const worldInfo = {
      setting: partialBibles.find(p => p.worldInfo?.setting)?.worldInfo?.setting || '',
      rules: [...new Set(partialBibles.filter(p => p.worldInfo?.rules).flatMap(p => p.worldInfo.rules))],
      uniqueElements: [...new Set(partialBibles.filter(p => p.worldInfo?.uniqueElements).flatMap(p => p.worldInfo.uniqueElements))]
    };

    // 估算集数
    const loadBearingCount = allEvents.filter(e => e.type === 'load_bearing').length;
    const estimatedEpisodes = Math.ceil(loadBearingCount * 1.3) || Math.ceil(partialBibles.reduce((sum, p) => sum + (p.estimatedEpisodes || 0), 0) / partialBibles.length);

    return this.enhanceStoryBible({
      title,
      mainTheme: partialBibles.find(p => p.mainTheme)?.mainTheme || '',
      toneKeywords: [...new Set(partialBibles.filter(p => p.toneKeywords).flatMap(p => p.toneKeywords))].slice(0, 5),
      characters: Array.from(characterMap.values()),
      events: allEvents,
      turningPoints: allTurningPoints,
      worldInfo,
      estimatedEpisodes,
      analysis: {
        mainConflict: partialBibles.find(p => p.analysis?.mainConflict)?.analysis?.mainConflict || '',
        stakes: partialBibles.find(p => p.analysis?.stakes)?.analysis?.stakes || '',
        tone: partialBibles.find(p => p.analysis?.tone)?.analysis?.tone || ''
      },
      _mergedFromChunks: partialBibles.length
    });
  }

  /**
   * 增强故事圣经
   * @param {Object} storyBible
   * @returns {Object}
   */
  enhanceStoryBible(storyBible) {
    // 识别角色原型
    if (storyBible.characters) {
      storyBible.characters = storyBible.characters.map(char => {
        if (!char.archetype) {
          char.archetype = identifyArchetype(char);
        }
        const archetypeConfig = getArchetypeConfig(char.archetype);
        if (archetypeConfig) {
          char._archetypeName = archetypeConfig.name;
          char._arcPattern = archetypeConfig.arcPattern;
          char._beatPotential = archetypeConfig.beatPotential;
        }
        return char;
      });
    }

    // 识别事件爽点潜力
    if (storyBible.events) {
      storyBible.events = storyBible.events.map(event => {
        if (!event.beatPotential || event.beatPotential.length === 0) {
          const beatType = identifyBeatType(event.summary || event.description || '', event.keywords || []);
          if (beatType) {
            event.beatPotential = [beatType];
          }
        }
        return event;
      });
    }

    // 构建事件依赖链
    if (storyBible.events && storyBible.events.length > 0) {
      storyBible = this.buildEventDependencies(storyBible);
    }

    return storyBible;
  }

  /**
   * 构建事件依赖链
   * @param {Object} storyBible
   * @returns {Object}
   */
  buildEventDependencies(storyBible) {
    const events = storyBible.events;
    const eventMap = new Map(events.map(e => [e.id, e]));

    // 为没有依赖关系的事件推断基本依赖
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // 如果没有 enables，推断后续事件
      if (!event.enables || event.enables.length === 0) {
        // 承重事件通常启用下一个事件
        if (event.type === 'load_bearing' && i < events.length - 1) {
          event.enables = [events[i + 1].id];
        }
      }

      // 如果没有 dependsOn，推断前置事件
      if (!event.dependsOn || event.dependsOn.length === 0) {
        // 非首事件通常依赖前一个承重事件
        if (i > 0) {
          const prevLoadBearing = events.slice(0, i).reverse().find(e => e.type === 'load_bearing');
          if (prevLoadBearing) {
            event.dependsOn = [prevLoadBearing.id];
          }
        }
      }
    }

    // 识别事件链
    storyBible._eventChains = this.identifyEventChains(events);

    return storyBible;
  }

  /**
   * 识别事件链
   * @param {Array} events
   * @returns {Array}
   */
  identifyEventChains(events) {
    const chains = [];
    const visited = new Set();

    for (const event of events) {
      if (visited.has(event.id)) continue;

      const chain = [];
      let current = event;

      while (current) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        chain.push(current.id);

        // 找下一个事件
        if (current.enables && current.enables.length > 0) {
          current = events.find(e => e.id === current.enables[0]);
        } else {
          current = null;
        }
      }

      if (chain.length > 1) {
        chains.push({
          events: chain,
          length: chain.length
        });
      }
    }

    return chains.sort((a, b) => b.length - a.length);
  }

  /**
   * 创建降级版故事圣经
   * @param {string} content
   * @param {string} title
   * @param {string} error
   * @returns {Object}
   */
  createFallbackBible(content, title, error) {
    return {
      title,
      characters: [
        {
          id: 'C01',
          name: '主角',
          role: 'protagonist',
          archetype: 'underdog',
          traits: [],
          _parseError: true
        }
      ],
      events: [],
      turningPoints: [],
      estimatedEpisodes: Math.ceil(content.length / 1000),
      _fallback: true,
      _error: error
    };
  }

  /**
   * 延迟辅助函数
   * @param {number} ms
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const storyBibleService = new StoryBibleService();

export default StoryBibleService;
