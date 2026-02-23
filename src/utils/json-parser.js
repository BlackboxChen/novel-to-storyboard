/**
 * JSON 解析增强工具
 * 处理 LLM 返回的各种格式问题
 */

/**
 * 增强的 JSON 解析器
 */
export class JSONParser {
  constructor(options = {}) {
    this.options = {
      maxAttempts: 3,
      repairMode: true,
      ...options
    };
  }

  /**
   * 解析 JSON 字符串
   * @param {string} input - 输入字符串
   * @returns {Object|null}
   */
  parse(input) {
    if (!input || typeof input !== 'string') {
      return null;
    }

    let jsonStr = this.preprocess(input);

    // 尝试直接解析
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // 继续尝试修复
    }

    // 尝试各种修复策略
    const repairStrategies = [
      this.removeMarkdownCodeBlock.bind(this),
      this.escapeControlCharacters.bind(this),
      this.fixTrailingCommas.bind(this),
      this.fixUnquotedKeys.bind(this),
      this.extractJSONFromText.bind(this),
      this.repairBrackets.bind(this)
    ];

    for (const strategy of repairStrategies) {
      try {
        const repaired = strategy(jsonStr);
        if (repaired) {
          return JSON.parse(repaired);
        }
      } catch (e) {
        // 继续尝试下一个策略
      }
    }

    // 所有策略都失败，尝试提取部分内容
    return this.extractPartialContent(jsonStr);
  }

  /**
   * 预处理输入
   */
  preprocess(input) {
    let str = input.trim();

    // 移除 BOM
    if (str.charCodeAt(0) === 0xFEFF) {
      str = str.slice(1);
    }

    return str;
  }

  /**
   * 移除 Markdown 代码块标记
   */
  removeMarkdownCodeBlock(input) {
    let str = input;

    // 移除开头的 ```json 或 ```
    str = str.replace(/^```(?:json)?\s*\n?/i, '');

    // 移除结尾的 ```
    str = str.replace(/\n?```$/g, '');

    return str.trim();
  }

  /**
   * 转义控制字符
   */
  escapeControlCharacters(input) {
    let str = input;

    // 将实际的换行符（在字符串值外部）转换为转义形式
    // 这是一个复杂的操作，需要小心处理

    // 首先保护已经正确转义的序列
    str = str.replace(/\\n/g, '___ESCAPED_N___');
    str = str.replace(/\\r/g, '___ESCAPED_R___');
    str = str.replace(/\\t/g, '___ESCAPED_T___');

    // 处理字符串值中的实际换行符
    // 这个正则会找到 JSON 字符串值中的换行并转义它们
    str = this.escapeNewlinesInStrings(str);

    // 恢复已转义的序列
    str = str.replace(/___ESCAPED_N___/g, '\\n');
    str = str.replace(/___ESCAPED_R___/g, '\\r');
    str = str.replace(/___ESCAPED_T___/g, '\\t');

    return str;
  }

  /**
   * 转义 JSON 字符串中的换行符
   */
  escapeNewlinesInStrings(str) {
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }

    return result;
  }

  /**
   * 修复尾随逗号
   */
  fixTrailingCommas(input) {
    // 移除对象和数组中的尾随逗号
    return input
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
  }

  /**
   * 尝试修复未引用的键
   */
  fixUnquotedKeys(input) {
    // 为未引用的键添加引号
    // 这个正则匹配 {key: 或 ,key: 格式
    return input.replace(/([{,]\s*)([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(\s*:)/g, '$1"$2"$3');
  }

  /**
   * 从文本中提取 JSON
   */
  extractJSONFromText(input) {
    // 尝试找到 JSON 对象的开始和结束
    const startBrace = input.indexOf('{');
    const startBracket = input.indexOf('[');

    let start = -1;
    let endChar = '';

    if (startBrace === -1 && startBracket === -1) {
      return null;
    }

    if (startBrace === -1) {
      start = startBracket;
      endChar = ']';
    } else if (startBracket === -1) {
      start = startBrace;
      endChar = '}';
    } else {
      start = Math.min(startBrace, startBracket);
      endChar = start === startBrace ? '}' : ']';
    }

    // 找到匹配的结束位置
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < input.length; i++) {
      const char = input[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{' || char === '[') {
          depth++;
        } else if (char === '}' || char === ']') {
          depth--;
          if (depth === 0) {
            return input.slice(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * 尝试修复括号不匹配
   */
  repairBrackets(input) {
    const openBraces = (input.match(/{/g) || []).length;
    const closeBraces = (input.match(/}/g) || []).length;
    const openBrackets = (input.match(/\[/g) || []).length;
    const closeBrackets = (input.match(/]/g) || []).length;

    let result = input;

    // 添加缺失的闭合括号
    if (openBraces > closeBraces) {
      result += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      result += ']'.repeat(openBrackets - closeBrackets);
    }

    return result;
  }

  /**
   * 提取部分内容
   */
  extractPartialContent(input) {
    // 尝试提取关键信息
    const result = {
      _parseError: true,
      _rawContent: input.slice(0, 1000)
    };

    // 尝试提取 characters 数组
    const charMatch = input.match(/"characters"\s*:\s*\[([\s\S]*?)\]/);
    if (charMatch) {
      try {
        result.characters = JSON.parse('[' + charMatch[1] + ']');
      } catch (e) {
        result.characters = [];
      }
    }

    // 尝试提取 events 数组
    const eventMatch = input.match(/"events"\s*:\s*\[([\s\S]*?)\]/);
    if (eventMatch) {
      try {
        result.events = JSON.parse('[' + eventMatch[1] + ']');
      } catch (e) {
        result.events = [];
      }
    }

    // 尝试提取 estimatedEpisodes
    const epMatch = input.match(/"estimatedEpisodes"\s*:\s*(\d+)/);
    if (epMatch) {
      result.estimatedEpisodes = parseInt(epMatch[1]);
    }

    // 尝试提取 title
    const titleMatch = input.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      result.title = titleMatch[1];
    }

    return Object.keys(result).length > 2 ? result : null;
  }
}

/**
 * 快捷解析函数
 * @param {string} input
 * @returns {Object|null}
 */
export function parseJSON(input) {
  const parser = new JSONParser();
  return parser.parse(input);
}

/**
 * 安全解析，带默认值
 * @param {string} input
 * @param {Object} defaultValue
 * @returns {Object}
 */
export function safeParseJSON(input, defaultValue = {}) {
  const parser = new JSONParser();
  const result = parser.parse(input);
  return result || defaultValue;
}

/**
 * 检查字符串是否是有效的 JSON
 * @param {string} input
 * @returns {boolean}
 */
export function isValidJSON(input) {
  try {
    JSON.parse(input);
    return true;
  } catch (e) {
    return false;
  }
}

export default JSONParser;
