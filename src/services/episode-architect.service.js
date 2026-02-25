/**
 * 分集架构服务
 * 实现完整的分集架构生成：集数计算、事件分配、爽点地图规划、弧线设计
 */

import { llmService } from './llm-service.js';
import { parseJSON } from '../utils/json-parser.js';
import { BEAT_TYPES, generateFourStepBeat } from '../config/beat-types.js';
import { getRhythmTemplate, RHYTHM_TEMPLATES } from '../config/rhythm-templates.js';
import {
  generateArchitecturePrompt,
  generateEpisodeAdjustPrompt,
  generateBeatMapPrompt
} from '../prompts/architecture.prompt.js';

/**
 * 分集架构服务类
 */
export class EpisodeArchitectService {
  constructor(options = {}) {
    this.options = {
      defaultRhythm: 'standard_90',
      minEventsPerEpisode: 1,
      maxEventsPerEpisode: 3,
      ...options
    };
  }

  /**
   * 生成完整架构
   * @param {Object} storyBible - 故事圣经
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateArchitecture(storyBible, options = {}) {
    const {
      targetEpisodes = null,
      rhythmTemplate = this.options.defaultRhythm
    } = options;

    // 计算集数
    const episodeCount = targetEpisodes || this.calculateEpisodeCount(storyBible);
    console.log(`[EpisodeArchitect] 计划生成 ${episodeCount} 集`);

    // 尝试使用 LLM 生成架构
    try {
      const prompt = generateArchitecturePrompt(storyBible, {
        targetEpisodes: episodeCount,
        rhythmTemplate
      });

      const response = await llmService.chat([
        { role: 'user', content: prompt }
      ], { maxTokens: 8192 });

      const parsed = parseJSON(response);

      if (parsed && parsed.episodes && parsed.episodes.length > 0) {
        return this.validateAndEnhanceArchitecture(parsed, storyBible);
      }
    } catch (error) {
      console.warn('[EpisodeArchitect] LLM 生成失败，使用算法生成:', error.message);
    }

    // 降级为算法生成
    return this.algorithmicArchitecture(storyBible, episodeCount, rhythmTemplate);
  }

  /**
   * 计算集数
   * @param {Object} storyBible
   * @returns {number}
   */
  calculateEpisodeCount(storyBible) {
    const events = storyBible.events || [];

    // 承重事件数
    const loadBearingCount = events.filter(e => e.type === 'load_bearing').length;

    // 公式：承重事件 × 1.3
    let count = Math.ceil(loadBearingCount * 1.3);

    // 确保最小值
    count = Math.max(count, 3);

    // 确保最大值
    count = Math.min(count, 20);

    // 考虑总事件数
    const totalEvents = events.length;
    if (totalEvents > 0) {
      // 每集平均 2-3 个事件
      const eventBased = Math.ceil(totalEvents / 2.5);
      count = Math.max(count, eventBased);
    }

    return count;
  }

  /**
   * 算法生成分集架构
   * @param {Object} storyBible
   * @param {number} episodeCount
   * @param {string} rhythmTemplate
   * @returns {Object}
   */
  algorithmicArchitecture(storyBible, episodeCount, rhythmTemplate) {
    const events = [...(storyBible.events || [])];
    const characters = storyBible.characters || [];
    const rhythm = getRhythmTemplate(rhythmTemplate === 'standard_90' ? 90 : 90);

    // 分配事件到各集
    const eventAssignment = this.assignEventsToEpisodes(events, episodeCount);

    // 规划爽点地图
    const beatMaps = this.planBeatMaps(eventAssignment, storyBible);

    // 设计弧线
    const arcs = this.designArcs(episodeCount, events);

    // 生成集信息
    const episodes = eventAssignment.map((assignedEvents, index) => {
      const episodeNumber = index + 1;
      const beatMap = beatMaps[index] || {};

      // 确定本集主要角色
      const episodeChars = this.identifyEpisodeCharacters(assignedEvents, characters);

      return {
        number: episodeNumber,
        title: this.generateEpisodeTitle(assignedEvents, episodeNumber, storyBible),
        logline: this.generateEpisodeLogline(assignedEvents, storyBible),
        assignedEvents: assignedEvents.map(e => e.id),
        beatMap,
        emotionalArc: this.determineEmotionalArc(episodeNumber, episodeCount),
        keyCharacters: episodeChars,
        estimatedDuration: rhythm.duration
      };
    });

    // 计算爽点分布
    const beatDistribution = this.calculateBeatDistribution(episodes);

    return {
      totalEpisodes: episodeCount,
      formula: `承重事件(${events.filter(e => e.type === 'load_bearing').length}) × 1.3 = ${episodeCount}`,
      overview: this.generateOverview(episodeCount),
      episodes,
      arcs,
      beatDistribution,
      rhythmTemplate,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 分配事件到各集
   * @param {Array} events
   * @param {number} episodeCount
   * @returns {Array<Array>}
   */
  assignEventsToEpisodes(events, episodeCount) {
    // 按依赖关系排序
    const sortedEvents = this.topologicalSort(events);

    // 分配
    const assignments = Array.from({ length: episodeCount }, () => []);
    const eventsPerEpisode = Math.ceil(sortedEvents.length / episodeCount);

    // 确保承重事件优先分配
    const loadBearingEvents = sortedEvents.filter(e => e.type === 'load_bearing');
    const otherEvents = sortedEvents.filter(e => e.type !== 'load_bearing');

    // 先分配承重事件
    loadBearingEvents.forEach((event, index) => {
      const episodeIndex = Math.min(
        Math.floor((index / loadBearingEvents.length) * episodeCount),
        episodeCount - 1
      );
      assignments[episodeIndex].push(event);
    });

    // 再分配其他事件
    otherEvents.forEach(event => {
      // 找到关联事件所在的集
      const relatedEpisode = this.findRelatedEpisode(event, assignments);

      if (relatedEpisode !== -1 && assignments[relatedEpisode].length < this.options.maxEventsPerEpisode) {
        assignments[relatedEpisode].push(event);
      } else {
        // 找到最少事件的集
        const minIndex = assignments.reduce((minIdx, curr, idx, arr) =>
          curr.length < arr[minIdx].length ? idx : minIdx, 0);
        assignments[minIndex].push(event);
      }
    });

    return assignments;
  }

  /**
   * 拓扑排序事件（改进版，检测循环依赖）
   * @param {Array} events
   * @returns {Array}
   */
  topologicalSort(events) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set(); // 用于检测循环
    const eventMap = new Map(events.map(e => [e.id, e]));
    let hasCycle = false;

    const visit = (event, path = []) => {
      if (visited.has(event.id)) return;
      if (visiting.has(event.id)) {
        // 检测到循环依赖
        console.warn(`[EpisodeArchitect] 检测到循环依赖: ${[...path, event.id].join(' → ')}`);
        hasCycle = true;
        return;
      }

      visiting.add(event.id);

      // 先访问依赖
      if (event.dependsOn && event.dependsOn.length > 0) {
        for (const depId of event.dependsOn) {
          const dep = eventMap.get(depId);
          if (dep) visit(dep, [...path, event.id]);
        }
      }

      visiting.delete(event.id);
      visited.add(event.id);
      sorted.push(event);
    };

    for (const event of events) {
      visit(event);
    }

    // 如果检测到循环依赖，回退到原始顺序
    if (hasCycle) {
      console.warn('[EpisodeArchitect] 存在循环依赖，使用原始事件顺序');
      return events;
    }

    // 检查是否有未访问的事件（引用了不存在的事件）
    if (sorted.length !== events.length) {
      console.warn(`[EpisodeArchitect] 排序结果不完整: ${sorted.length}/${events.length}，使用原始顺序`);
      return events;
    }

    return sorted;
  }

  /**
   * 找到事件关联的集
   * @param {Object} event
   * @param {Array} assignments
   * @returns {number}
   */
  findRelatedEpisode(event, assignments) {
    // 检查依赖关系
    if (event.dependsOn) {
      for (const depId of event.dependsOn) {
        for (let i = 0; i < assignments.length; i++) {
          if (assignments[i].some(e => e.id === depId)) {
            return i;
          }
        }
      }
    }

    // 检查启用关系
    if (event.enables) {
      for (const enableId of event.enables) {
        for (let i = 0; i < assignments.length; i++) {
          if (assignments[i].some(e => e.id === enableId)) {
            return Math.max(0, i - 1);
          }
        }
      }
    }

    return -1;
  }

  /**
   * 规划爽点地图
   * @param {Array} eventAssignments
   * @param {Object} storyBible
   * @returns {Array}
   */
  planBeatMaps(eventAssignments, storyBible) {
    return eventAssignments.map((events, episodeIndex) => {
      const beatMap = {
        opening: null,
        early: null,
        mid: null,
        climax: null,
        closing: null
      };

      // 提取本集的爽点潜力
      const beatPotentials = events
        .filter(e => e.beatPotential && e.beatPotential.length > 0)
        .flatMap(e => e.beatPotential);

      // 分配爽点到各个位置
      const positions = ['opening', 'climax', 'closing', 'early', 'mid'];
      const usedBeats = new Set();

      for (const position of positions) {
        // 选择合适的爽点类型
        const beatType = this.selectBeatForPosition(position, beatPotentials, usedBeats, episodeIndex);

        if (beatType) {
          usedBeats.add(beatType);
          beatMap[position] = {
            type: beatType,
            hookDescription: this.generateBeatHook(beatType, events, position),
            fourSteps: generateFourStepBeat(beatType, { events })
          };
        }
      }

      // 确保有开场钩子
      if (!beatMap.opening) {
        beatMap.opening = {
          type: 'info',
          hookDescription: '揭示关键信息，吸引观众',
          fourSteps: generateFourStepBeat('info', { events })
        };
      }

      // 确保有高潮爽点
      if (!beatMap.climax) {
        beatMap.climax = {
          type: 'slap',
          hookDescription: '关键转折，情绪高潮',
          fourSteps: generateFourStepBeat('slap', { events })
        };
      }

      // 确保有结尾钩子
      if (!beatMap.closing) {
        beatMap.closing = {
          type: 'info',
          hookDescription: '留下悬念，引导下一集',
          fourSteps: generateFourStepBeat('info', { events })
        };
      }

      return beatMap;
    });
  }

  /**
   * 为位置选择爽点类型
   */
  selectBeatForPosition(position, potentials, usedBeats, episodeIndex) {
    const preferredByPosition = {
      opening: ['identity', 'info', 'slap'],
      early: ['info', 'upgrade', 'emotion'],
      mid: ['upgrade', 'emotion', 'revenge'],
      climax: ['slap', 'revenge', 'comeback', 'identity'],
      closing: ['info', 'emotion', 'identity']
    };

    const preferred = preferredByPosition[position] || [];

    // 优先使用已有潜力且未使用的
    for (const type of preferred) {
      if (potentials.includes(type) && !usedBeats.has(type)) {
        return type;
      }
    }

    // 使用任何可用的
    for (const type of potentials) {
      if (!usedBeats.has(type)) {
        return type;
      }
    }

    // 返回位置偏好的第一个
    return preferred[0];
  }

  /**
   * 生成爽点钩子描述
   */
  generateBeatHook(beatType, events, position) {
    const config = Object.values(BEAT_TYPES).find(b => b.id === beatType);
    const eventDesc = events.length > 0 ? events[0].summary : '';

    const templates = {
      opening: `开场${config?.name || '钩子'}：通过${eventDesc || '关键信息'}吸引观众`,
      early: `早期铺垫：为${config?.name || '后续'}做准备`,
      mid: `中段升级：${config?.name || '情节'}深入发展`,
      climax: `高潮${config?.name || '爆发'}：${eventDesc || '情绪顶点'}`,
      closing: `结尾钩子：留下${config?.name || '悬念'}引导下集`
    };

    return templates[position] || `${config?.name || '爽点'}点`;
  }

  /**
   * 设计弧线
   * @param {number} episodeCount
   * @param {Array} events
   * @returns {Object}
   */
  designArcs(episodeCount, events) {
    // 小弧线（2-3集）
    const miniArcs = [];
    const miniArcLength = 3;
    for (let i = 0; i < episodeCount; i += miniArcLength) {
      const end = Math.min(i + miniArcLength, episodeCount);
      if (end - i >= 2) {
        miniArcs.push({
          name: `小弧线 ${miniArcs.length + 1}`,
          episodes: Array.from({ length: end - i }, (_, j) => i + j + 1),
          setup: `第${i + 1}集建立`,
          climax: `第${Math.floor((i + end) / 2) + 1}集高潮`,
          resolution: `第${end}集解决`
        });
      }
    }

    // 主要转折点
    const majorTurningPoints = [];

    // 中点转折
    const midpoint = Math.ceil(episodeCount / 2);
    if (midpoint > 1 && midpoint < episodeCount) {
      majorTurningPoints.push({
        episode: midpoint,
        type: 'midpoint',
        description: '故事中点，局势反转'
      });
    }

    // 低谷点
    const lowpoint = Math.ceil(episodeCount * 0.75);
    if (lowpoint !== midpoint && lowpoint < episodeCount) {
      majorTurningPoints.push({
        episode: lowpoint,
        type: 'all_is_lost',
        description: '至暗时刻，最大危机'
      });
    }

    return {
      miniArcs,
      majorTurningPoints
    };
  }

  /**
   * 生成概览
   */
  generateOverview(episodeCount) {
    const act1End = Math.ceil(episodeCount * 0.25);
    const act2End = Math.ceil(episodeCount * 0.75);

    return {
      act1: {
        episodes: `1-${act1End}`,
        focus: '铺垫与建立'
      },
      act2: {
        episodes: `${act1End + 1}-${act2End}`,
        focus: '冲突升级'
      },
      act3: {
        episodes: `${act2End + 1}-${episodeCount}`,
        focus: '高潮与解决'
      }
    };
  }

  /**
   * 确定情绪弧线
   */
  determineEmotionalArc(episodeNumber, totalEpisodes) {
    const progress = episodeNumber / totalEpisodes;

    if (progress <= 0.25) return '建立 -> 期待';
    if (progress <= 0.5) return '期待 -> 紧张';
    if (progress <= 0.75) return '紧张 -> 危机';
    return '危机 -> 释放';
  }

  /**
   * 识别集的主要角色
   */
  identifyEpisodeCharacters(events, characters) {
    const charIds = new Set();
    events.forEach(e => {
      if (e.characters) {
        e.characters.forEach(c => charIds.add(c));
      }
    });

    // 确保主角在列表中
    const protagonist = characters.find(c => c.role === 'protagonist');
    if (protagonist) {
      charIds.add(protagonist.id);
    }

    return Array.from(charIds).slice(0, 3);
  }

  /**
   * 生成集标题
   */
  generateEpisodeTitle(events, episodeNumber, storyBible) {
    if (events.length > 0) {
      const mainEvent = events.find(e => e.type === 'load_bearing') || events[0];
      return `第${episodeNumber}集：${mainEvent.summary?.slice(0, 10) || '未命名'}`;
    }
    return `第${episodeNumber}集`;
  }

  /**
   * 生成集卖点
   */
  generateEpisodeLogline(events, storyBible) {
    if (events.length > 0) {
      const summaries = events.slice(0, 2).map(e => e.summary).join('；');
      return summaries.slice(0, 50);
    }
    return '故事继续展开';
  }

  /**
   * 计算爽点分布
   */
  calculateBeatDistribution(episodes) {
    const distribution = {};

    for (const ep of episodes) {
      const positions = ['opening', 'early', 'mid', 'climax', 'closing'];
      for (const pos of positions) {
        const beat = ep.beatMap?.[pos];
        if (beat?.type) {
          distribution[beat.type] = (distribution[beat.type] || 0) + 1;
        }
      }
    }

    return distribution;
  }

  /**
   * 验证和增强架构
   */
  validateAndEnhanceArchitecture(architecture, storyBible) {
    // 确保所有必需字段存在
    if (!architecture.overview) {
      architecture.overview = this.generateOverview(architecture.totalEpisodes);
    }

    if (!architecture.arcs) {
      architecture.arcs = this.designArcs(architecture.totalEpisodes, storyBible.events);
    }

    if (!architecture.beatDistribution) {
      architecture.beatDistribution = this.calculateBeatDistribution(architecture.episodes);
    }

    // 验证并修复每集的结构
    architecture.episodes = architecture.episodes.map((ep, index) => {
      if (!ep.beatMap) {
        ep.beatMap = {
          opening: { type: 'info', hookDescription: '开场钩子' },
          climax: { type: 'slap', hookDescription: '高潮点' },
          closing: { type: 'info', hookDescription: '结尾钩子' }
        };
      }

      if (!ep.emotionalArc) {
        ep.emotionalArc = this.determineEmotionalArc(index + 1, architecture.totalEpisodes);
      }

      return ep;
    });

    architecture.generatedAt = new Date().toISOString();

    return architecture;
  }

  /**
   * 调整单集设计
   * @param {Object} architecture
   * @param {number} episodeNumber
   * @param {Object} adjustments
   * @param {Object} storyBible
   * @returns {Promise<Object>}
   */
  async adjustEpisode(architecture, episodeNumber, adjustments, storyBible) {
    const episode = architecture.episodes.find(e => e.number === episodeNumber);
    if (!episode) {
      throw new Error(`Episode ${episodeNumber} not found`);
    }

    // 应用直接调整
    if (adjustments.title) episode.title = adjustments.title;
    if (adjustments.logline) episode.logline = adjustments.logline;
    if (adjustments.assignedEvents) episode.assignedEvents = adjustments.assignedEvents;
    if (adjustments.beatMap) episode.beatMap = { ...episode.beatMap, ...adjustments.beatMap };

    // 如果需要 LLM 调整
    if (adjustments.useLLM) {
      try {
        const prompt = generateEpisodeAdjustPrompt(episode, storyBible, adjustments);
        const response = await llmService.chat([
          { role: 'user', content: prompt }
        ], { maxTokens: 4096 });

        const parsed = parseJSON(response);
        if (parsed) {
          const episodeIndex = architecture.episodes.findIndex(e => e.number === episodeNumber);
          architecture.episodes[episodeIndex] = {
            ...episode,
            ...parsed
          };
        }
      } catch (error) {
        console.warn('[EpisodeArchitect] LLM 调整失败:', error.message);
      }
    }

    // 更新爽点分布
    architecture.beatDistribution = this.calculateBeatDistribution(architecture.episodes);

    return architecture;
  }
}

// 导出单例
export const episodeArchitectService = new EpisodeArchitectService();

export default EpisodeArchitectService;
