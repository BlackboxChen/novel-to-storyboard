/**
 * LLM 服务封装 - 完整版
 * 支持智谱 GLM API
 */

// 使用 Node.js 内置 fetch（Node 18+）
const fetch = globalThis.fetch;

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '7bb3307a265a4331b3e1e550d3312318.ur46BnAFpgdH7vPa';
const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

export class LLMService {
  constructor() {
    this.apiKey = ZHIPU_API_KEY;
    this.baseUrl = ZHIPU_BASE_URL;
  }

  /**
   * 调用 LLM API (智谱原生格式)
   */
  async chat(messages, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: options.model || 'glm-5',
          max_tokens: options.maxTokens || 4096,
          messages,
          ...options
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('LLM API call failed:', error);
      throw error;
    }
  }

  /**
   * 解析小说 → 故事圣经
   */
  async parseNovel(novelContent, title = '未命名') {
    const prompt = `你是一个专业的剧本分析师。请分析以下小说《${title}》的内容，提取故事圣经。

## 输出要求
请严格按照以下 JSON 格式返回（不要包含 markdown 代码块标记）：

{
  "title": "作品标题",
  "characters": [
    {
      "id": "C01",
      "name": "角色名",
      "role": "protagonist/antagonist/ally/supporting",
      "traits": ["特征1", "特征2"],
      "desires": "核心欲望",
      "fears": "核心恐惧"
    }
  ],
  "events": [
    {
      "id": "E01",
      "summary": "事件摘要（一句话）",
      "type": "load_bearing/reinforcing/decorative",
      "depends_on": [],
      "enables": ["E02"]
    }
  ],
  "turningPoints": [
    {
      "position": "第X章/第Y段",
      "description": "转折点描述"
    }
  ],
  "estimatedEpisodes": 7,
  "mainTheme": "主题",
  "toneKeywords": ["悬疑", "推理"]
}

## 小说内容
${novelContent.slice(0, 15000)}`;

    const response = await this.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 4096 });

    // 尝试解析 JSON
    try {
      // 移除可能的 markdown 代码块标记
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();
      
      // 修复 JSON 中的控制字符（\n, \t 等）
      // 将实际的换行符替换为 \\n（字符串形式）
      jsonStr = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      // 然后恢复 JSON 字符串值内部的转义
      jsonStr = jsonStr.replace(/\\\\n/g, '\\n').replace(/\\\\r/g, '\\r').replace(/\\\\t/g, '\\t');
      
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', e.message);
      console.log('Raw response:', response.slice(0, 500));
      
      // 尝试从 raw 中提取关键信息
      try {
        // 提取 characters
        const charMatch = response.match(/"characters":\s*\[([\s\S]*?)\]/);
        const eventMatch = response.match(/"events":\s*\[([\s\S]*?)\]/);
        const epMatch = response.match(/"estimatedEpisodes":\s*(\d+)/);
        const themeMatch = response.match(/"mainTheme":\s*"([^"]+)"/);
        
        return {
          title,
          characters: charMatch ? [] : [{ id: 'C01', name: '主角', role: 'protagonist', traits: [] }],
          events: [],
          turningPoints: [],
          estimatedEpisodes: epMatch ? parseInt(epMatch[1]) : Math.ceil(novelContent.length / 1000),
          mainTheme: themeMatch ? themeMatch[1] : '',
          raw: response,
          parseError: e.message
        };
      } catch (e2) {
        // 返回基础结构
        return {
          title,
          characters: [],
          events: [],
          turningPoints: [],
          estimatedEpisodes: Math.ceil(novelContent.length / 1000),
          raw: response,
          parseError: e.message
        };
      }
    }
  }

  /**
   * 生成单集剧本
   */
  async generateEpisode(storyBible, episodeNumber, totalEpisodes, style = 'narrated') {
    const styleGuide = style === 'narrated' 
      ? `解说漫模式：
- 旁白是第一叙事层（说书体，带节奏、带悬念）
- 对白只在爽点位高光穿插（每集3-5句）
- 画面偏氛围+关键特写
- 使用模板NA（90秒解说漫标准版）`
      : `分格漫剧模式：
- 画面驱动，分格构图承载主要叙事
- 每格包含画面描述+台词+分格建议
- 动态效果提示（速度线、震动框等）`;

    const prompt = `你是一个专业漫剧编剧。请根据以下故事圣经，生成第 ${episodeNumber} 集剧本。

## 故事圣经
${JSON.stringify(storyBible, null, 2)}

## 剧本要求
- 总集数：${totalEpisodes} 集
- 当前集：第 ${episodeNumber} 集
- 时长：90 秒
- ${styleGuide}

## 时间结构
- 0-5s: 开场钩子（硬钩子，必须在3秒内抓住观众）
- 5-20s: 背景铺设
- 20-40s: 冲突展开
- 40-60s: 升级与转折
- 60-80s: 高潮回报（主爽点）
- 80-90s: 悬置钩子（留悬念）

## 输出格式
使用 Markdown 格式输出完整剧本，包含：
- 集号与标题
- 一句话卖点
- 角色出场表
- 每个时间段的：
  - 🎙️ 旁白（说书体）
  - 🖼️ 画面描述
  - 💬 对白（仅爽点位）
  - ⚡ 爽点标记`;

    return await this.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 4096 });
  }

  /**
   * 生成视频分镜提示词
   */
  async generateStoryboard(episodeContent, episodeNumber, mode = 'A') {
    const modeGuide = mode === 'A'
      ? `电影分镜模式：
- 纯视觉分镜 + 视频生成提示词
- 每个片段包含时间码设计、景别、运动、英文提示词`
      : `解说漫剧模式：
- 视觉分镜 + 音频脚本层
- 额外包含旁白和对白的时间码同步`;

    const prompt = `你是一个专业分镜师。请根据以下第${episodeNumber}集剧本内容，生成视频分镜提示词。

## 剧本内容
${episodeContent}

## 分镜要求
- ${modeGuide}
- 每个片段时长：5-15 秒
- 总时长约 90 秒

## 输出格式
为每个片段输出：

### V{编号} | {描述标题} | {时长}
**段落意图**：一句话说明叙事功能
**情绪**：{类型} · {强度0-10}
**转场**：← {入场方式} | → {出场方式}

**镜头与节奏**：
0.0-X.Xs: [景别+运动] 画面描述
X.X-X.Xs: ...

**视频生成提示词（英文）**：
[5D框架: 主体→环境光线→材质细节→拍摄风格→氛围情感]
[包含去AI味元素: 不完美描述+随机词+前景层]

**Negative prompt**: ...

**关键帧参考图提示词**: ...`;

    return await this.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 8192 });
  }
}

export const llmService = new LLMService();
