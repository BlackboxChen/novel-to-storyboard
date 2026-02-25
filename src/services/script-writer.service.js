/**
 * 剧本生成服务
 * 结构化版本 - 输出包含clips数组的JSON格式
 */

import { llmService } from './llm-service.js';
import { parseJSON } from '../utils/json-parser.js';
import { BEAT_TYPES, generateFourStepBeat } from '../config/beat-types.js';
import { getRhythmTemplate, RHYTHM_TEMPLATES } from '../config/rhythm-templates.js';
import { generateScriptPrompt, generateFourStepPrompt } from '../prompts/script.prompt.js';

/**
 * 剧本生成服务类
 */
export class ScriptWriterService {
  constructor(options = {}) {
    this.options = {
      defaultStyle: 'narrated',
      defaultRhythm: 'standard_90',
      batchDelay: 1000,
      ...options
    };
  }

  /**
   * 生成完整剧本
   * @param {Object} storyBible - 故事圣经
   * @param {Object} architecture - 分集架构
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generateFullScript(storyBible, architecture, options = {}) {
    const {
      style = this.options.defaultStyle,
      rhythmTemplate = this.options.defaultRhythm,
      episodeRange = null
    } = options;

    const episodes = architecture.episodes || [];
    const targetEpisodes = episodeRange
      ? episodes.filter(ep => ep.number >= episodeRange[0] && ep.number <= episodeRange[1])
      : episodes;

    console.log(`[ScriptWriter] 计划生成 ${targetEpisodes.length} 集剧本`);

    const generatedEpisodes = [];

    for (const episode of targetEpisodes) {
      console.log(`[ScriptWriter] 生成第 ${episode.number} 集...`);

      try {
        const scriptData = await this.generateEpisodeScript(
          storyBible,
          architecture,
          episode.number,
          { style, rhythmTemplate }
        );

        // 验证内容是否有效
        if (!scriptData || !scriptData.clips || scriptData.clips.length === 0) {
          console.warn(`[ScriptWriter] 第 ${episode.number} 集内容无效，使用 fallback`);
          throw new Error('Script content is empty or invalid');
        }

        generatedEpisodes.push({
          number: episode.number,
          title: scriptData.title || episode.title,
          logline: scriptData.logline || episode.logline,
          clips: scriptData.clips,  // 结构化数据
          content: this.clipsToMarkdown(scriptData),  // Markdown版本（兼容）
          summary: scriptData.summary || {},
          metadata: {
            style,
            rhythmTemplate,
            totalDuration: scriptData.totalDuration,
            generatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error(`[ScriptWriter] 第 ${episode.number} 集生成失败:`, error.message);
        const fallbackData = this.generateFallbackScript(episode, storyBible);
        generatedEpisodes.push({
          number: episode.number,
          title: episode.title,
          clips: fallbackData.clips,
          content: fallbackData.content,
          error: error.message,
          metadata: { fallback: true }
        });
      }

      // 批次延迟
      if (targetEpisodes.indexOf(episode) < targetEpisodes.length - 1) {
        await this.delay(this.options.batchDelay);
      }
    }

    return {
      totalEpisodes: architecture.totalEpisodes,
      style,
      rhythmTemplate,
      episodes: generatedEpisodes,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 生成单集剧本（结构化JSON）
   * @param {Object} storyBible
   * @param {Object} architecture
   * @param {number} episodeNumber
   * @param {Object} options
   * @returns {Promise<Object>} 结构化剧本数据
   */
  async generateEpisodeScript(storyBible, architecture, episodeNumber, options = {}) {
    const {
      style = 'narrated',
      rhythmTemplate = 'standard_90',
      userFeedback = null,
      previousEpisode = null,  // 前集摘要
      nextEpisode = null       // 后集摘要
    } = options;

    const episode = architecture.episodes.find(e => e.number === episodeNumber);

    // 打印传入的上下文信息
    console.log('\n' + '='.repeat(60));
    console.log(`[ScriptWriter] 第 ${episodeNumber} 集剧本生成 - 上下文信息`);
    console.log('='.repeat(60));

    console.log('\n【本集信息】');
    console.log(`- 标题: ${episode?.title || '待定'}`);
    console.log(`- 卖点: ${episode?.logline || '待定'}`);
    console.log(`- 关键角色: ${(episode?.keyCharacters || []).join(', ') || '未指定'}`);

    console.log('\n【本集事件】');
    const episodeEvents = (episode?.assignedEvents || []).map(eventId => {
      const event = storyBible.events?.find(e => e.id === eventId);
      return event ? { id: event.id, summary: event.summary } : null;
    }).filter(Boolean);
    episodeEvents.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.id}] ${e.summary}`);
    });

    console.log('\n【爽点规划】');
    if (episode?.beatMap) {
      Object.entries(episode.beatMap)
        .filter(([_, v]) => v && v.type)
        .forEach(([pos, v]) => {
          console.log(`  - ${pos}: ${v.type}`);
        });
    } else {
      console.log('  未指定');
    }

    console.log('\n【角色列表】');
    (storyBible.characters || []).slice(0, 5).forEach(char => {
      console.log(`  - [${char.id}] ${char.name} (${char.role})`);
    });

    // 打印相邻集信息
    if (previousEpisode) {
      console.log('\n【前集回顾】');
      console.log(`- 第 ${previousEpisode.number} 集: ${previousEpisode.title}`);
      console.log(`- 结尾状态: ${previousEpisode.endingState || '无'}`);
    }

    if (nextEpisode) {
      console.log('\n【后集预告】');
      console.log(`- 第 ${nextEpisode.number} 集: ${nextEpisode.title}`);
      console.log(`- 开头状态: ${nextEpisode.openingState || '无'}`);
    }

    console.log('\n【用户修改建议】');
    if (userFeedback) {
      console.log(`  "${userFeedback}"`);
    } else {
      console.log('  无');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    const prompt = generateScriptPrompt(storyBible, architecture, episodeNumber, {
      style,
      rhythmTemplate,
      userFeedback,
      previousEpisode,
      nextEpisode
    });

    console.log(`[ScriptWriter] 第 ${episodeNumber} 集 prompt 长度: ${prompt.length}`);
    console.log(`[ScriptWriter] 完整 Prompt:\n${prompt.substring(0, 2000)}${prompt.length > 2000 ? '...(截断)' : ''}`);

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 4096 });

    console.log(`[ScriptWriter] 第 ${episodeNumber} 集 response 长度: ${response?.length || 0}`);

    // 解析JSON响应
    const scriptData = this.parseScriptResponse(response);

    if (!scriptData || !scriptData.clips || scriptData.clips.length === 0) {
      throw new Error('Failed to parse script JSON or no clips generated');
    }

    return scriptData;
  }

  /**
   * 提取剧本集摘要（用于传递给相邻集）
   * @param {Object} episode - 已生成的剧本集
   * @returns {Object} 摘要信息
   */
  extractEpisodeSummary(episode) {
    if (!episode) return null;

    // 提取结尾状态（最后一个片段的旁白和画面）
    let endingState = '';
    let openingState = '';

    if (episode.clips && episode.clips.length > 0) {
      const lastClip = episode.clips[episode.clips.length - 1];
      const firstClip = episode.clips[0];

      // 结尾状态：最后片段的旁白（截取前100字）
      endingState = lastClip.narration?.substring(0, 100) || '';

      // 开头状态：第一片段的旁白（截取前100字）
      openingState = firstClip.narration?.substring(0, 100) || '';
    }

    // 提取关键情节（所有片段的标题）
    const keyBeats = (episode.clips || []).map(clip => clip.segmentName).join(' → ');

    return {
      number: episode.number,
      title: episode.title || '',
      logline: episode.logline || '',
      keyBeats,
      endingState,
      openingState,
      summary: episode.summary?.emotionalArc || ''
    };
  }

  /**
   * 从 job.script 中获取相邻集摘要
   * @param {Object} script - 已生成的剧本
   * @param {number} episodeNumber - 当前集数
   * @returns {Object} { previousEpisode, nextEpisode }
   */
  getAdjacentEpisodeSummaries(script, episodeNumber) {
    const result = {
      previousEpisode: null,
      nextEpisode: null
    };

    if (!script || !script.episodes) return result;

    // 获取前集
    const prevEp = script.episodes.find(e => e.number === episodeNumber - 1);
    if (prevEp) {
      result.previousEpisode = this.extractEpisodeSummary(prevEp);
    }

    // 获取后集
    const nextEp = script.episodes.find(e => e.number === episodeNumber + 1);
    if (nextEp) {
      result.nextEpisode = this.extractEpisodeSummary(nextEp);
    }

    return result;
  }

  /**
   * 解析剧本响应（JSON格式）
   * @param {string} response
   * @returns {Object}
   */
  parseScriptResponse(response) {
    if (!response) {
      console.warn('[ScriptWriter] LLM 响应为空');
      return null;
    }

    console.log(`[ScriptWriter] 原始响应长度: ${response.length}`);
    console.log(`[ScriptWriter] 响应前500字符: ${response.substring(0, 500)}`);

    // 尝试直接解析
    try {
      const parsed = JSON.parse(response);
      console.log('[ScriptWriter] JSON 直接解析成功');
      return this.normalizeScriptData(parsed);
    } catch (e) {
      console.warn('[ScriptWriter] JSON 直接解析失败:', e.message);

      // 尝试提取代码块中的 JSON
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const extracted = jsonMatch[1].trim();
          const parsed = JSON.parse(extracted);
          console.log('[ScriptWriter] 从代码块提取 JSON 成功');
          return this.normalizeScriptData(parsed);
        } catch (e2) {
          console.warn('[ScriptWriter] 代码块 JSON 解析失败:', e2.message);
        }
      }

      // 尝试使用增强JSON解析器
      try {
        const repaired = parseJSON(response);
        if (repaired) {
          console.log('[ScriptWriter] JSON 修复解析成功');
          return this.normalizeScriptData(repaired);
        }
      } catch (e3) {
        console.warn('[ScriptWriter] JSON 修复解析失败:', e3.message);
      }
    }

    console.error('[ScriptWriter] 所有 JSON 解析尝试失败');
    return null;
  }

  /**
   * 标准化剧本数据
   * @param {Object} data
   * @returns {Object}
   */
  normalizeScriptData(data) {
    // 确保clips数组存在且格式正确
    const clips = (data.clips || []).map((clip, index) => ({
      id: clip.id || `C${String(index + 1).padStart(2, '0')}`,
      segment: clip.segment || `segment_${index}`,
      segmentName: clip.segmentName || `片段${index + 1}`,
      timeCode: clip.timeCode || { start: index * 15, end: (index + 1) * 15 },
      narration: clip.narration || '',
      visual: clip.visual || '',
      dialogue: clip.dialogue || null,
      emotion: clip.emotion || '中性',
      beatType: clip.beatType || null,
      bgm: clip.bgm || '',
      sfx: clip.sfx || ''
    }));

    // 验证旁白字数（语速5字/秒）
    for (const clip of clips) {
      const duration = clip.timeCode.end - clip.timeCode.start;
      const expectedChars = duration * 5;
      const actualChars = clip.narration?.length || 0;

      if (actualChars < expectedChars * 0.5) {
        console.warn(`[ScriptWriter] 片段 "${clip.segmentName}" 旁白字数不足: ${actualChars}/${expectedChars} 字`);
      }
    }

    return {
      number: data.number,
      title: data.title,
      logline: data.logline,
      totalDuration: data.totalDuration || 90,
      style: data.style,
      clips,
      summary: {
        emotionalArc: data.summary?.emotionalArc || '',
        keyLine: data.summary?.keyLine || ''
        // 移除 nextEpisode
      }
    };
  }

  /**
   * 将结构化clips转换为Markdown（兼容显示）
   * @param {Object} scriptData
   * @returns {string}
   */
  clipsToMarkdown(scriptData) {
    let md = `### 第${scriptData.number}集：${scriptData.title || '待定'}\n\n`;
    md += `**卖点**：${scriptData.logline || '待定'}\n\n`;
    md += `---\n\n`;

    for (const clip of scriptData.clips) {
      const timeCode = clip.timeCode;
      md += `#### 【${clip.segmentName}】${timeCode.start}-${timeCode.end}s\n\n`;

      if (clip.narration) {
        md += `🎙️ **旁白**：\n> ${clip.narration}\n\n`;
      }

      if (clip.visual) {
        md += `🖼️ **画面**：\n- ${clip.visual}\n\n`;
      }

      if (clip.dialogue) {
        const char = clip.dialogue.character || '角色';
        const line = clip.dialogue.line || clip.dialogue;
        md += `💬 **对白**：\n${char}："${line}"\n\n`;
      }

      if (clip.bgm || clip.sfx) {
        md += `🎵 **音频**：${clip.bgm || ''}${clip.sfx ? ' | 音效：' + clip.sfx : ''}\n\n`;
      }

      md += `---\n\n`;
    }

    // 移除下集预告，不再生成

    return md;
  }

  /**
   * 生成降级版剧本（结构化）
   * @param {Object} episode
   * @param {Object} storyBible
   * @returns {Object}
   */
  generateFallbackScript(episode, storyBible) {
    const rhythm = getRhythmTemplate(90);
    const mainChar = storyBible.characters?.find(c => c.role === 'protagonist') || { name: '主角' };
    const events = episode.assignedEvents
      .map(id => storyBible.events?.find(e => e.id === id))
      .filter(Boolean);

    const clips = rhythm.segments.map((segment, index) => {
      let narration = '故事继续...';
      let visual = '待补充画面描述';

      if (segment.name === '开场钩子') {
        narration = `你敢信？${mainChar.name}的故事，就从这里开始...`;
        visual = '开场画面';
      } else if (events.length > 0) {
        const event = events[Math.min(index, events.length - 1)];
        narration = event?.summary || '故事继续发展...';
      }

      return {
        id: `C${String(index + 1).padStart(2, '0')}`,
        segment: segment.id || `segment_${index}`,
        segmentName: segment.name,
        timeCode: { start: segment.timing[0], end: segment.timing[1] },
        narration,
        visual,
        dialogue: null,
        emotion: '中性',
        beatType: null,
        bgm: '',
        sfx: ''
      };
    });

    const content = this.clipsToMarkdown({
      number: episode.number,
      title: episode.title,
      logline: episode.logline,
      clips
    });

    return { clips, content };
  }

  /**
   * 增强剧本 - 添加四步法细节
   * @param {string} scriptContent
   * @param {Object} beatMap
   * @returns {Promise<string>}
   */
  async enhanceScriptWithFourSteps(scriptContent, beatMap) {
    // 找到剧本中的爽点位置
    const beatPositions = ['opening', 'early', 'mid', 'climax', 'closing'];
    let enhanced = scriptContent;

    for (const position of beatPositions) {
      const beat = beatMap[position];
      if (!beat || !beat.type) continue;

      const beatConfig = Object.values(BEAT_TYPES).find(b => b.id === beat.type);
      if (!beatConfig) continue;

      // 检查是否已有四步法内容
      const fourStepPattern = new RegExp(`【.*${position}.*】[\\s\\S]*?⚡.*爽点`, 'i');

      if (!fourStepPattern.test(enhanced)) {
        // 需要添加四步法内容
        const fourStepContent = this.formatFourSteps(beatConfig, position);
        // 在相应位置插入
        enhanced = enhanced.replace(
          new RegExp(`(####\\s*【.*${position}.*】[\\s\\S]*?---)`),
          `$1\n\n**四步法详解**：\n${fourStepContent}\n`
        );
      }
    }

    return enhanced;
  }

  /**
   * 格式化四步法内容
   */
  formatFourSteps(beatConfig, position) {
    const steps = beatConfig.fourSteps;

    return `
1. **立承诺**：${steps.promise}
2. **先压**：${steps.suppress}
3. **后扬**：${steps.elevate}
4. **回报**：${steps.reward}
`.trim();
  }

  /**
   * 解析剧本内容为结构化数据
   * @param {string} scriptContent
   * @returns {Object}
   */
  parseScriptContent(scriptContent) {
    const segments = [];

    // 简单的分割策略
    const sectionPattern = /####\s*【(.+?)】\s*(\d+)-(\d+)s\s*\n([\s\S]*?)(?=####|$)/g;
    let match;

    while ((match = sectionPattern.exec(scriptContent)) !== null) {
      const [_, name, startTime, endTime, content] = match;

      // 提取旁白
      const narrationMatch = content.match(/🎙️\s*\*?\*?旁白\*?\*?:?\s*\n>?\s*([\s\S]*?)(?=\n\n|🖼️|$)/i);
      const narration = narrationMatch ? narrationMatch[1].trim() : '';

      // 提取画面
      const visualMatch = content.match(/🖼️\s*\*?\*?画面\*?\*?:?\s*\n([\s\S]*?)(?=\n\n|💬|⚡|$)/i);
      const visual = visualMatch ? visualMatch[1].trim() : '';

      // 提取对白
      const dialogueMatches = content.matchAll(/💬\s*\*?\*?对白\*?\*?:?\s*\n>?\s*"([^"]+)"/g);
      const dialogues = Array.from(dialogueMatches, m => m[1]);

      // 提取爽点
      const beatMatch = content.match(/⚡\s*\*?\*?爽点\*?\*?:?\s*([^\n]+)/i);
      const beat = beatMatch ? beatMatch[1].trim() : null;

      segments.push({
        name,
        startTime: parseInt(startTime),
        endTime: parseInt(endTime),
        duration: parseInt(endTime) - parseInt(startTime),
        narration,
        visual,
        dialogues,
        beat
      });
    }

    return { segments };
  }

  /**
   * 生成单集剧本（带进度回调）
   * @param {Object} storyBible
   * @param {Object} architecture
   * @param {number} episodeNumber
   * @param {Object} options
   * @param {Function} onProgress
   * @returns {Promise<Object>}
   */
  async generateEpisodeWithProgress(storyBible, architecture, episodeNumber, options = {}, onProgress = null) {
    if (onProgress) onProgress({ stage: 'start', episode: episodeNumber });

    const episode = architecture.episodes.find(e => e.number === episodeNumber);

    try {
      if (onProgress) onProgress({ stage: 'generating', episode: episodeNumber });

      // generateEpisodeScript 返回结构化对象 { number, title, clips, ... }
      const scriptData = await this.generateEpisodeScript(storyBible, architecture, episodeNumber, options);

      // 验证内容是否有效
      if (!scriptData || !scriptData.clips || scriptData.clips.length === 0) {
        console.warn(`[ScriptWriter] 第 ${episodeNumber} 集内容无效，使用 fallback`);
        throw new Error('Script content is empty or has no clips');
      }

      if (onProgress) onProgress({ stage: 'complete', episode: episodeNumber });

      // 生成 Markdown 兼容版本
      const content = this.clipsToMarkdown(scriptData);

      return {
        number: episodeNumber,
        title: scriptData.title || episode?.title,
        logline: scriptData.logline,
        clips: scriptData.clips,
        content,  // Markdown 版本
        summary: scriptData.summary || {},
        metadata: {
          style: options.style,
          totalDuration: scriptData.totalDuration,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      if (onProgress) onProgress({ stage: 'error', episode: episodeNumber, error: error.message });

      const fallbackData = this.generateFallbackScript(episode, storyBible);
      return {
        number: episodeNumber,
        title: episode?.title,
        clips: fallbackData.clips,
        content: fallbackData.content,
        error: error.message,
        metadata: {
          fallback: true,
          generatedAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 批量生成剧本（并发控制）
   * @param {Object} storyBible
   * @param {Object} architecture
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generateBatch(storyBible, architecture, options = {}) {
    const {
      episodeNumbers = architecture.episodes.map(e => e.number),
      concurrency = 2,
      onEpisodeComplete = null
    } = options;

    const results = [];
    const queue = [...episodeNumbers];

    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);

      const batchResults = await Promise.all(
        batch.map(episodeNumber =>
          this.generateEpisodeWithProgress(
            storyBible,
            architecture,
            episodeNumber,
            options
          ).then(result => {
            if (onEpisodeComplete) {
              onEpisodeComplete(result);
            }
            return result;
          })
        )
      );

      results.push(...batchResults);

      // 批次间延迟
      if (queue.length > 0) {
        await this.delay(this.options.batchDelay);
      }
    }

    return {
      totalEpisodes: architecture.totalEpisodes,
      generatedCount: results.length,
      episodes: results.sort((a, b) => a.number - b.number),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 更新单个片段
   * @param {string} scriptContent
   * @param {string} segmentName
   * @param {Object} updates
   * @returns {string}
   */
  updateSegment(scriptContent, segmentName, updates) {
    const pattern = new RegExp(
      `(####\\s*【${segmentName}.*】[\\s\\S]*?)(####|$)`,
      'i'
    );

    return scriptContent.replace(pattern, (match, segment, nextSection) => {
      let updated = segment;

      if (updates.narration) {
        updated = updated.replace(
          /(🎙️\s*\*?\*?旁白\*?\*?:?\s*\n>?\s*)[\s\S]*?(?=\n\n|🖼️)/i,
          `$1${updates.narration}`
        );
      }

      if (updates.visual) {
        updated = updated.replace(
          /(🖼️\s*\*?\*?画面\*?\*?:?\s*\n)[\s\S]*?(?=\n\n|💬|⚡)/i,
          `$1${updates.visual}`
        );
      }

      return updated + nextSection;
    });
  }

  /**
   * 延迟辅助
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const scriptWriterService = new ScriptWriterService();

export default ScriptWriterService;
