/**
 * 长文本分块工具
 * 处理超长小说文本的分块策略
 */

// 默认配置
const DEFAULT_CONFIG = {
  maxChunkSize: 8000,      // 单块最大字符数
  minChunkSize: 3000,      // 单块最小字符数
  overlapSize: 200,        // 块之间的重叠字符数
  respectParagraphs: true, // 尊重段落边界
  respectSentences: true   // 尊重句子边界
};

/**
 * 文本分块器类
 */
export class TextChunker {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 分块主入口
   * @param {string} text - 原始文本
   * @param {Object} options - 分块选项
   * @returns {Array<{index: number, content: string, start: number, end: number}>}
   */
  chunk(text, options = {}) {
    const config = { ...this.config, ...options };

    // 如果文本不够长，直接返回
    if (text.length <= config.maxChunkSize) {
      return [{
        index: 0,
        content: text,
        start: 0,
        end: text.length,
        isComplete: true
      }];
    }

    // 计算需要的块数
    const chunkCount = Math.ceil(text.length / config.maxChunkSize);
    const chunks = [];

    let currentPosition = 0;
    let index = 0;

    while (currentPosition < text.length) {
      const chunk = this.createChunk(text, currentPosition, config, index);
      chunks.push(chunk);
      currentPosition = chunk.end;
      index++;
    }

    return chunks;
  }

  /**
   * 创建单个块
   */
  createChunk(text, start, config, index) {
    let end = Math.min(start + config.maxChunkSize, text.length);

    // 如果不是最后一块，尝试在合适的位置断开
    if (end < text.length) {
      if (config.respectParagraphs) {
        const paragraphBreak = this.findParagraphBreak(text, start, end);
        if (paragraphBreak > start + config.minChunkSize) {
          end = paragraphBreak;
        }
      }

      if (config.respectSentences && end === start + config.maxChunkSize) {
        const sentenceBreak = this.findSentenceBreak(text, start, end);
        if (sentenceBreak > start + config.minChunkSize) {
          end = sentenceBreak;
        }
      }
    }

    return {
      index,
      content: text.slice(start, end),
      start,
      end,
      isComplete: end >= text.length
    };
  }

  /**
   * 查找段落分隔点
   */
  findParagraphBreak(text, start, end) {
    // 在目标范围内查找最后的双换行
    const searchStart = start + Math.floor((end - start) * 0.6);
    const searchRange = text.slice(searchStart, end);

    // 查找段落分隔（双换行或换行+空行）
    const patterns = [/\n\s*\n/g, /\n\n/g];
    let lastMatch = -1;

    for (const pattern of patterns) {
      let match;
      const tempText = searchRange;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(tempText)) !== null) {
        lastMatch = match.index;
      }
    }

    if (lastMatch >= 0) {
      return searchStart + lastMatch + 2; // 包含换行符
    }

    // 没找到段落分隔，查找单换行
    const lastNewline = searchRange.lastIndexOf('\n');
    if (lastNewline >= 0) {
      return searchStart + lastNewline + 1;
    }

    return end;
  }

  /**
   * 查找句子分隔点
   */
  findSentenceBreak(text, start, end) {
    const searchStart = start + Math.floor((end - start) * 0.7);
    const searchRange = text.slice(searchStart, end);

    // 中文和英文句子结束符
    const sentenceEnders = ['。', '！', '？', '…"', '…"', '.', '!', '?', '."'];

    let lastBreak = -1;
    for (const ender of sentenceEnders) {
      const pos = searchRange.lastIndexOf(ender);
      if (pos > lastBreak) {
        lastBreak = pos;
      }
    }

    if (lastBreak >= 0) {
      return searchStart + lastBreak + 1;
    }

    return end;
  }

  /**
   * 按章节分块
   * @param {string} text - 原始文本
   * @returns {Array<{index: number, content: string, title: string}>}
   */
  chunkByChapter(text) {
    // 常见章节标题模式
    const chapterPatterns = [
      /第[一二三四五六七八九十百千\d]+[章节回集][^\n]*/g,
      /Chapter\s*\d+[^\n]*/gi,
      /[一二三四五六七八九十百千]+[、.．][^\n]*/g,
      /【[^\]]+】/g,
      /^.{1,20}$/gm  // 短行可能是标题
    ];

    const chapters = [];
    let currentChapter = { index: 0, content: '', title: '序章' };
    let lastIndex = 0;

    // 尝试匹配章节标题
    const matches = [];

    for (const pattern of chapterPatterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          index: match.index,
          title: match[0].trim()
        });
      }
    }

    // 按位置排序并去重
    matches.sort((a, b) => a.index - b.index);
    const uniqueMatches = matches.filter((m, i, arr) =>
      i === 0 || m.index - arr[i - 1].index > 100
    );

    if (uniqueMatches.length > 1) {
      // 有明确的章节分隔
      for (let i = 0; i < uniqueMatches.length; i++) {
        const start = uniqueMatches[i].index;
        const end = i < uniqueMatches.length - 1 ? uniqueMatches[i + 1].index : text.length;

        chapters.push({
          index: i,
          title: uniqueMatches[i].title,
          content: text.slice(start, end).trim(),
          start,
          end
        });
      }
    } else {
      // 没有明确的章节分隔，使用常规分块
      return this.chunk(text).map((chunk, i) => ({
        ...chunk,
        title: `第${i + 1}部分`
      }));
    }

    return chapters;
  }

  /**
   * 智能分块 - 结合章节和大小限制
   * @param {string} text - 原始文本
   * @returns {Array}
   */
  smartChunk(text) {
    // 先按章节分
    const chapters = this.chunkByChapter(text);

    // 对过长的章节进一步分割
    const result = [];
    let globalIndex = 0;

    for (const chapter of chapters) {
      if (chapter.content.length <= this.config.maxChunkSize) {
        result.push({
          ...chapter,
          index: globalIndex++
        });
      } else {
        // 分割长章节
        const subChunks = this.chunk(chapter.content);
        for (const sub of subChunks) {
          result.push({
            index: globalIndex++,
            content: sub.content,
            title: `${chapter.title} (${sub.index + 1})`,
            start: chapter.start + sub.start,
            end: chapter.start + sub.end,
            parentChapter: chapter.title
          });
        }
      }
    }

    return result;
  }
}

/**
 * 快捷函数
 */
export function chunkText(text, options = {}) {
  const chunker = new TextChunker(options);
  return chunker.chunk(text);
}

export function chunkByChapter(text) {
  const chunker = new TextChunker();
  return chunker.chunkByChapter(text);
}

export function smartChunkText(text, options = {}) {
  const chunker = new TextChunker(options);
  return chunker.smartChunk(text);
}

export default TextChunker;
