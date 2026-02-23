/**
 * 爽点类型配置
 * 7种核心爽点类型及其四步法结构
 */

export const BEAT_TYPES = {
  // 打脸爽：被轻视后展现真正实力
  SLAP: {
    id: 'slap',
    name: '打脸',
    description: '被轻视、质疑后展现真正实力，让对手震惊',
    intensity: 9,
    fourSteps: {
      promise: '立承诺：提前暗示主角有隐藏实力或即将展现',
      suppress: '先压：让对手/旁观者继续轻视，制造压力',
      elevate: '后扬：出其不意展现真正实力',
      reward: '回报：对手震惊、道歉或后悔，观众满足'
    },
    triggers: ['轻视', '质疑', '嘲讽', '不屑'],
    visualCues: ['震惊表情', '沉默', '倒吸冷气', '后退']
  },

  // 升级爽：实力/地位/财富的突然提升
  UPGRADE: {
    id: 'upgrade',
    name: '升级',
    description: '实力、地位、财富或能力的显著提升',
    intensity: 8,
    fourSteps: {
      promise: '立承诺：暗示即将有突破或机遇',
      suppress: '先压：遇到瓶颈或困难，似乎无法突破',
      elevate: '后扬：突破成功，获得新能力或资源',
      reward: '回报：展示新实力带来的改变'
    },
    triggers: ['瓶颈', '机缘', '顿悟', '获得'],
    visualCues: ['光芒', '特效', '变化', '提升']
  },

  // 复仇爽：对敌人的惩罚
  REVENGE: {
    id: 'revenge',
    name: '复仇',
    description: '对曾经伤害过自己的人进行惩罚或报复',
    intensity: 9,
    fourSteps: {
      promise: '立承诺：铺垫仇恨，建立复仇动机',
      suppress: '先压：敌人得意，主角隐忍',
      elevate: '后扬：反击成功，敌人受到惩罚',
      reward: '回报：仇恨得报，心理满足'
    },
    triggers: ['仇恨', '隐忍', '报复', '惩罚'],
    visualCues: ['痛快', '惊恐', '求饶', '报应']
  },

  // 身份爽：隐藏身份的揭示
  IDENTITY: {
    id: 'identity',
    name: '身份',
    description: '隐藏的身份、背景或能力被揭示，震惊全场',
    intensity: 10,
    fourSteps: {
      promise: '立承诺：留下身份相关的暗示或线索',
      suppress: '先压：继续隐藏，他人误解加深',
      elevate: '后扬：身份揭示，所有人震惊',
      reward: '回报：地位改变，态度反转'
    },
    triggers: ['误解', '小看', '隐藏', '揭示'],
    visualCues: ['震惊', '难以置信', '重新审视', '恭敬']
  },

  // 信息爽：关键信息的获取或揭示
  INFO: {
    id: 'info',
    name: '信息',
    description: '获取关键信息或揭示重要真相',
    intensity: 7,
    fourSteps: {
      promise: '立承诺：暗示存在重要信息或秘密',
      suppress: '先压：信息获取困难或被误导',
      elevate: '后扬：成功获取或揭示真相',
      reward: '回报：局面因此改变'
    },
    triggers: ['秘密', '真相', '线索', '发现'],
    visualCues: ['恍然大悟', '震惊', '真相大白', '重新理解']
  },

  // 反杀爽：绝境中的逆转
  COMEBACK: {
    id: 'comeback',
    name: '反杀',
    description: '处于绝境时实现逆转，反败为胜',
    intensity: 10,
    fourSteps: {
      promise: '立承诺：铺垫主角的隐藏底牌或计划',
      suppress: '先压：绝境，似乎必败',
      elevate: '后扬：底牌揭示，形势逆转',
      reward: '回报：反败为胜，敌人震惊'
    },
    triggers: ['绝境', '必败', '底牌', '逆转'],
    visualCues: ['惊愕', '反转', '不可置信', '扭转']
  },

  // 情感爽：情感关系的突破
  EMOTION: {
    id: 'emotion',
    name: '情感',
    description: '情感关系的突破或确认，打动观众',
    intensity: 8,
    fourSteps: {
      promise: '立承诺：铺垫情感线索或张力',
      suppress: '先压：情感障碍或误会',
      elevate: '后扬：情感突破或确认',
      reward: '回报：关系升华，观众共情'
    },
    triggers: ['暗恋', '误会', '守护', '表白'],
    visualCues: ['感动', '泪水', '拥抱', '告白']
  }
};

/**
 * 爽点四步法模板
 */
export const FOUR_STEP_TEMPLATE = {
  name: '四步法结构',
  steps: [
    { name: '立承诺', timing: '15%', description: '提前埋下伏笔，暗示即将发生的事' },
    { name: '先压', timing: '35%', description: '制造压力或低谷，让观众/对手低估' },
    { name: '后扬', timing: '45%', description: '出其不意的反转或揭示' },
    { name: '回报兑现', timing: '5%', description: '完整展示结果，给观众满足感' }
  ]
};

/**
 * 根据事件内容识别爽点类型
 * @param {string} eventSummary - 事件摘要
 * @param {string[]} keywords - 关键词列表
 * @returns {string|null}
 */
export function identifyBeatType(eventSummary, keywords = []) {
  const text = (eventSummary + ' ' + keywords.join(' ')).toLowerCase();

  const typeMatchers = [
    { type: BEAT_TYPES.IDENTITY, keywords: ['身份', '揭示', '隐藏', '真实', '大佬', '背景'] },
    { type: BEAT_TYPES.REVENGE, keywords: ['复仇', '报复', '仇恨', '血债', '讨回'] },
    { type: BEAT_TYPES.COMEBACK, keywords: ['反杀', '逆转', '绝境', '翻盘', '底牌'] },
    { type: BEAT_TYPES.SLAP, keywords: ['打脸', '轻视', '质疑', '嘲讽', '震惊'] },
    { type: BEAT_TYPES.UPGRADE, keywords: ['升级', '突破', '实力', '获得', '觉醒'] },
    { type: BEAT_TYPES.INFO, keywords: ['真相', '秘密', '发现', '得知', '揭示'] },
    { type: BEAT_TYPES.EMOTION, keywords: ['情感', '爱情', '友情', '守护', '牺牲'] }
  ];

  for (const matcher of typeMatchers) {
    if (matcher.keywords.some(kw => text.includes(kw))) {
      return matcher.type.id;
    }
  }

  return null;
}

/**
 * 获取爽点类型配置
 * @param {string} beatId
 * @returns {Object}
 */
export function getBeatConfig(beatId) {
  return Object.values(BEAT_TYPES).find(b => b.id === beatId) || null;
}

/**
 * 生成爽点四步法内容
 * @param {string} beatId
 * @param {Object} context - 上下文信息
 * @returns {Object}
 */
export function generateFourStepBeat(beatId, context = {}) {
  const config = getBeatConfig(beatId);
  if (!config) return null;

  return {
    type: beatId,
    name: config.name,
    steps: {
      promise: {
        label: '立承诺',
        timing: '15%',
        template: config.fourSteps.promise,
        content: ''
      },
      suppress: {
        label: '先压',
        timing: '35%',
        template: config.fourSteps.suppress,
        content: ''
      },
      elevate: {
        label: '后扬',
        timing: '45%',
        template: config.fourSteps.elevate,
        content: ''
      },
      reward: {
        label: '回报',
        timing: '5%',
        template: config.fourSteps.reward,
        content: ''
      }
    },
    intensity: config.intensity,
    triggers: config.triggers,
    visualCues: config.visualCues
  };
}

export default BEAT_TYPES;
