/**
 * 剧本生成服务
 * 增强版剧本生成，支持爽点四步法、节奏模板、分批生成
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
        const script = await this.generateEpisodeScript(
          storyBible,
          architecture,
          episode.number,
          { style, rhythmTemplate }
        );

        generatedEpisodes.push({
          number: episode.number,
          title: episode.title,
          content: script,
          metadata: {
            style,
            rhythmTemplate,
            generatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error(`[ScriptWriter] 第 ${episode.number} 集生成失败:`, error.message);
        generatedEpisodes.push({
          number: episode.number,
          title: episode.title,
          content: this.generateFallbackScript(episode, storyBible),
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
   * 生成单集剧本
   * @param {Object} storyBible
   * @param {Object} architecture
   * @param {number} episodeNumber
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async generateEpisodeScript(storyBible, architecture, episodeNumber, options = {}) {
    const { style = 'narrated', rhythmTemplate = 'standard_90' } = options;

    const prompt = generateScriptPrompt(storyBible, architecture, episodeNumber, {
      style,
      rhythmTemplate
    });

    const response = await llmService.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 4096 });

    return response;
  }

  /**
   * 生成降级版剧本
   * @param {Object} episode
   * @param {Object} storyBible
   * @returns {string}
   */
  generateFallbackScript(episode, storyBible) {
    const rhythm = getRhythmTemplate(90);
    const mainChar = storyBible.characters?.find(c => c.role === 'protagonist') || { name: '主角' };
    const events = episode.assignedEvents
      .map(id => storyBible.events?.find(e => e.id === id))
      .filter(Boolean);

    let script = `### 第${episode.number}集：${episode.title || '待定'}\n\n`;
    script += `**卖点**：${episode.logline || '故事继续'}\n\n`;
    script += `---\n\n`;

    // 生成基本结构
    for (const segment of rhythm.segments) {
      script += `#### 【${segment.name}】${segment.timing[0]}-${segment.timing[1]}s\n\n`;
      script += `**时间码**：${segment.timing[0]}.0-${segment.timing[1]}.0s\n\n`;

      // 根据段落类型生成内容
      if (segment.name === '开场钩子') {
        script += `🎙️ **旁白**：\n> 你敢信？${mainChar.name}的故事，就从这里开始...\n\n`;
      } else if (events.length > 0) {
        const event = events[Math.min(rhythm.segments.indexOf(segment), events.length - 1)];
        script += `🎙️ **旁白**：\n> ${event.summary || '故事继续发展...'}\n\n`;
      } else {
        script += `🎙️ **旁白**：\n> 故事还在继续...\n\n`;
      }

      script += `🖼️ **画面**：\n- [待补充画面描述]\n\n`;
      script += `---\n\n`;
    }

    script += `**注意**：这是自动生成的降级版剧本，请手动完善。\n`;

    return script;
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

    try {
      if (onProgress) onProgress({ stage: 'generating', episode: episodeNumber });

      const content = await this.generateEpisodeScript(storyBible, architecture, episodeNumber, options);

      if (onProgress) onProgress({ stage: 'parsing', episode: episodeNumber });

      const parsed = this.parseScriptContent(content);

      if (onProgress) onProgress({ stage: 'complete', episode: episodeNumber });

      return {
        number: episodeNumber,
        content,
        parsed,
        success: true
      };
    } catch (error) {
      if (onProgress) onProgress({ stage: 'error', episode: episodeNumber, error: error.message });

      const episode = architecture.episodes.find(e => e.number === episodeNumber);
      return {
        number: episodeNumber,
        content: this.generateFallbackScript(episode, storyBible),
        success: false,
        error: error.message
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
