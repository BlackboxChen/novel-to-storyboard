/**
 * 节奏模板配置
 * 不同时长的节奏模板
 */

export const RHYTHM_TEMPLATES = {
  // 90秒标准模板
  STANDARD_90: {
    id: 'standard_90',
    name: '90秒标准版',
    duration: 90,
    description: '解说漫标准90秒节奏，适合单爽点完整呈现',
    segments: [
      { name: '开场钩子', timing: [0, 5], percentage: 5, description: '硬钩子，3秒内抓住观众', intensity: 8 },
      { name: '背景铺垫', timing: [5, 20], percentage: 17, description: '交代背景，建立情境', intensity: 3 },
      { name: '冲突展开', timing: [20, 40], percentage: 22, description: '矛盾显现，张力上升', intensity: 5 },
      { name: '升级转折', timing: [40, 60], percentage: 22, description: '局势变化，铺垫高潮', intensity: 7 },
      { name: '高潮回报', timing: [60, 80], percentage: 22, description: '主爽点爆发，满足感', intensity: 10 },
      { name: '悬置钩子', timing: [80, 90], percentage: 11, description: '留悬念，引导下一集', intensity: 6 }
    ],
    beatSlots: ['opening', 'early', 'mid', 'climax', 'closing'],
    recommendedBeatCount: 3
  },

  // 60秒快节奏模板
  FAST_60: {
    id: 'fast_60',
    name: '60秒快节奏',
    duration: 60,
    description: '快节奏短视频版本，强化爽点密度',
    segments: [
      { name: '爆炸开场', timing: [0, 3], percentage: 5, description: '直接抛出最强钩子', intensity: 10 },
      { name: '快速铺垫', timing: [3, 15], percentage: 20, description: '最简背景交代', intensity: 4 },
      { name: '连续冲突', timing: [15, 35], percentage: 33, description: '冲突叠加', intensity: 6 },
      { name: '高潮爆发', timing: [35, 50], percentage: 25, description: '主爽点+次爽点', intensity: 10 },
      { name: '悬念收尾', timing: [50, 60], percentage: 17, description: '快速收尾+钩子', intensity: 7 }
    ],
    beatSlots: ['opening', 'mid', 'climax'],
    recommendedBeatCount: 2
  },

  // 120秒扩展模板
  EXTENDED_120: {
    id: 'extended_120',
    name: '120秒扩展版',
    duration: 120,
    description: '双爽点扩展版本，适合复杂剧情',
    segments: [
      { name: '开场钩子', timing: [0, 5], percentage: 4, description: '吸引注意力', intensity: 7 },
      { name: '背景铺垫', timing: [5, 25], percentage: 17, description: '完整背景交代', intensity: 3 },
      { name: '第一冲突', timing: [25, 50], percentage: 21, description: '首个矛盾展开', intensity: 5 },
      { name: '第一高潮', timing: [50, 70], percentage: 17, description: '次爽点爆发', intensity: 8 },
      { name: '升级转折', timing: [70, 90], percentage: 17, description: '事态升级', intensity: 7 },
      { name: '主高潮', timing: [90, 110], percentage: 17, description: '主爽点爆发', intensity: 10 },
      { name: '悬置钩子', timing: [110, 120], percentage: 8, description: '留悬念', intensity: 6 }
    ],
    beatSlots: ['opening', 'early', 'mid', 'late', 'climax', 'closing'],
    recommendedBeatCount: 4
  },

  // 45秒超快模板
  ULTRA_FAST_45: {
    id: 'ultra_fast_45',
    name: '45秒超快版',
    duration: 45,
    description: '极致精简，单爽点快速呈现',
    segments: [
      { name: '钩子', timing: [0, 2], percentage: 4, description: '最强钩子', intensity: 10 },
      { name: '铺垫', timing: [2, 12], percentage: 22, description: '最小背景', intensity: 4 },
      { name: '冲突', timing: [12, 28], percentage: 36, description: '快速冲突', intensity: 6 },
      { name: '高潮', timing: [28, 40], percentage: 27, description: '爽点爆发', intensity: 10 },
      { name: '钩子', timing: [40, 45], percentage: 11, description: '快速收尾', intensity: 6 }
    ],
    beatSlots: ['opening', 'climax'],
    recommendedBeatCount: 1
  }
};

/**
 * 根据时长获取推荐模板
 * @param {number} duration - 时长（秒）
 * @returns {Object}
 */
export function getRhythmTemplate(duration) {
  if (duration <= 50) return RHYTHM_TEMPLATES.ULTRA_FAST_45;
  if (duration <= 70) return RHYTHM_TEMPLATES.FAST_60;
  if (duration <= 100) return RHYTHM_TEMPLATES.STANDARD_90;
  return RHYTHM_TEMPLATES.EXTENDED_120;
}

/**
 * 获取指定时间点的节奏强度
 * @param {Object} template - 节奏模板
 * @param {number} time - 时间点（秒）
 * @returns {number}
 */
export function getIntensityAt(template, time) {
  for (const segment of template.segments) {
    if (time >= segment.timing[0] && time < segment.timing[1]) {
      return segment.intensity;
    }
  }
  return 5;
}

/**
 * 生成节奏时间线
 * @param {Object} template - 节奏模板
 * @returns {Array}
 */
export function generateTimeline(template) {
  return template.segments.map(seg => ({
    ...seg,
    duration: seg.timing[1] - seg.timing[0],
    formatted: `${seg.timing[0]}s-${seg.timing[1]}s`
  }));
}

export default RHYTHM_TEMPLATES;
