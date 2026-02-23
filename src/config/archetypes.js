/**
 * 角色原型配置
 * 6种核心角色原型定义
 */

export const ARCHETYPES = {
  // 逆袭型：从底层崛起，实力不断提升
  UNDERDOG: {
    id: 'underdog',
    name: '逆袭型',
    description: '从底层或弱势地位崛起，通过努力或机遇实现实力飞跃',
    traits: ['坚韧', '不屈', '成长性强', '隐藏潜力'],
    arcPattern: '低谷→觉醒→磨砺→爆发→巅峰',
    beatPotential: ['打脸', '复仇', '升级'],
    examples: ['废材逆袭', '弱者崛起', '被轻视后展现实力']
  },

  // 隐身份型：隐藏真实身份/能力
  HIDDEN_IDENTITY: {
    id: 'hidden_identity',
    name: '隐身份型',
    description: '拥有隐藏的身份、能力或背景，关键时刻揭示',
    traits: ['神秘', '双重生活', '强大背景', '低调'],
    arcPattern: '隐忍→暗示→危机→揭示→蜕变',
    beatPotential: ['身份', '打脸', '复仇'],
    examples: ['隐藏大佬', '双重身份', '神秘背景']
  },

  // 灰度型：道德立场模糊，有缺陷的复杂角色
  GRAY: {
    id: 'gray',
    name: '灰度型',
    description: '道德立场不明确，介于正邪之间，具有复杂动机',
    traits: ['复杂', '矛盾', '不可预测', '人性化'],
    arcPattern: '灰色→挣扎→选择→代价→救赎/堕落',
    beatPotential: ['反杀', '情感', '信息'],
    examples: ['反英雄', '亦正亦邪', '道德困境']
  },

  // 压迫者：反派或阻碍者
  OPPRESSOR: {
    id: 'oppressor',
    name: '压迫者',
    description: '制造冲突和压力的反派角色，给主角设置障碍',
    traits: ['强势', '威胁性', '目标明确', '不留情面'],
    arcPattern: '威胁→施压→得意→受挫→败落/反击',
    beatPotential: ['复仇', '打脸', '升级'],
    examples: ['恶霸', '对手', '权力者']
  },

  // 搅局者：意外因素制造者
  WILDCARD: {
    id: 'wildcard',
    name: '搅局者',
    description: '不可预测的角色，常带来意外转折',
    traits: ['任性', '不可控', '意外', '破坏规则'],
    arcPattern: '出现→搅局→混乱→选择→影响',
    beatPotential: ['信息', '情感', '反杀'],
    examples: ['捣乱者', '中立角色', '不可控因素']
  },

  // 盟友：支持者与伙伴
  ALLY: {
    id: 'ally',
    name: '盟友',
    description: '支持主角的伙伴、导师或助手',
    traits: ['可靠', '牺牲精神', '互补能力', '情感纽带'],
    arcPattern: '相遇→信任→并肩→考验→深化/牺牲',
    beatPotential: ['情感', '升级', '复仇'],
    examples: ['挚友', '导师', '伙伴', '助手']
  }
};

/**
 * 根据角色特征识别原型
 * @param {Object} character - 角色信息
 * @returns {string} - 原型ID
 */
export function identifyArchetype(character) {
  const { role, traits = [], desires = '', fears = '' } = character;
  const traitStr = [...traits, desires, fears].join(' ').toLowerCase();

  // 基于角色定位的初步判断
  if (role === 'protagonist') {
    if (matchKeywords(traitStr, ['逆袭', '弱', '废', '底层', '崛起', '成长'])) {
      return ARCHETYPES.UNDERDOG.id;
    }
    if (matchKeywords(traitStr, ['隐藏', '神秘', '双重', '秘密', '身份', '伪装'])) {
      return ARCHETYPES.HIDDEN_IDENTITY.id;
    }
    if (matchKeywords(traitStr, ['灰色', '矛盾', '复杂', '道德', '挣扎'])) {
      return ARCHETYPES.GRAY.id;
    }
    // 默认主角为逆袭型
    return ARCHETYPES.UNDERDOG.id;
  }

  if (role === 'antagonist') {
    return ARCHETYPES.OPPRESSOR.id;
  }

  if (role === 'ally' || role === 'supporting') {
    if (matchKeywords(traitStr, ['不可预测', '任性', '神秘', '捣乱'])) {
      return ARCHETYPES.WILDCARD.id;
    }
    return ARCHETYPES.ALLY.id;
  }

  return ARCHETYPES.ALLY.id;
}

/**
 * 关键词匹配辅助函数
 */
function matchKeywords(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}

/**
 * 获取原型配置
 * @param {string} archetypeId
 * @returns {Object}
 */
export function getArchetypeConfig(archetypeId) {
  return Object.values(ARCHETYPES).find(a => a.id === archetypeId) || ARCHETYPES.ALLY;
}

/**
 * 获取原型的爽点潜力
 * @param {string} archetypeId
 * @returns {string[]}
 */
export function getArchetypeBeatPotential(archetypeId) {
  const config = getArchetypeConfig(archetypeId);
  return config.beatPotential || [];
}

export default ARCHETYPES;
