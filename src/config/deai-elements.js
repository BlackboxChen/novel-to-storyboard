/**
 * 去AI味元素配置
 * 让生成图像更自然、更有人味
 */

// 不完美描述元素 - 让图像更真实
export const IMPERFECTIONS = {
  // 皮肤不完美
  skin: [
    'subtle skin texture',
    'visible pores',
    'light freckles',
    'natural skin imperfections',
    'slight uneven skin tone',
    'realistic skin translucency',
    'subsurface scattering on skin',
    'natural skin sheen',
    'visible peach fuzz'
  ],

  // 头发不完美
  hair: [
    'stray hairs',
    'natural hair fall',
    'slightly messy hair',
    'hair flyaways',
    'uneven hair strands',
    'natural hair volume',
    'wind-blown hair strands',
    'realistic hair texture'
  ],

  // 服装不完美
  clothing: [
    'natural fabric wrinkles',
    'clothing folds',
    'slightly worn fabric',
    'realistic cloth draping',
    'fabric texture detail',
    'loose threads visible',
    'natural wear on clothes'
  ],

  // 环境不完美
  environment: [
    'dust particles in air',
    'slight weathering',
    'lived-in environment',
    'natural wear and tear',
    'imperfect surfaces',
    'random object placement',
    'organic clutter'
  ]
};

// 随机词库 - 注入到提示词中
export const RANDOM_WORDS = {
  // 氛围词
  atmosphere: [
    'ethereal',
    'moody',
    'serene',
    'contemplative',
    'intimate',
    'tense',
    'nostalgic',
    'melancholic',
    'hopeful',
    'mysterious'
  ],

  // 光线词
  lighting: [
    'volumetric',
    'dappled',
    'diffused',
    'rim lit',
    'backlit',
    'softly illuminated',
    'dramatically lit',
    'naturally lit',
    'golden hour',
    'blue hour'
  ],

  // 质感词
  texture: [
    'grainy',
    'tactile',
    'raw',
    'organic',
    'weathered',
    'smooth',
    'rough',
    'delicate',
    'substantial',
    'gossamer'
  ],

  // 动态词
  motion: [
    'frozen moment',
    'lingering',
    'fleeting',
    'suspended',
    'gentle sway',
    'still',
    'arrested',
    'timeless',
    'transient',
    'momentary'
  ]
};

// 前景层元素 - 增加画面深度
export const FOREGROUND_ELEMENTS = {
  // 物理遮挡
  physical: [
    'out-of-focus foliage in foreground',
    'blurred window frame edge',
    'partial door frame',
    'furniture edge in foreground',
    'curtain blur on side',
    'plant leaves in corner',
    'railing silhouette',
    'archway framing'
  ],

  // 氛围粒子
  particles: [
    'dust motes floating',
    'rain drops on glass',
    'light fog wisps',
    'steam rising',
    'smoke drift',
    'pollen particles',
    'snowflakes falling',
    'misty haze'
  ],

  // 光效层
  light: [
    'lens flare streak',
    'light leak',
    'sunburst edge',
    'bokeh highlights',
    'prismatic light',
    'glowing rim',
    'diffraction spikes'
  ]
};

// Negative Prompt 模板
export const NEGATIVE_TEMPLATES = {
  // 通用 AI 痕迹
  aiArtifacts: [
    '3d render',
    'cgi',
    'digital art',
    'artificial',
    'plastic skin',
    'waxy skin',
    'airbrushed',
    'over-processed',
    'hdr',
    'oversaturated',
    'clipped highlights',
    'crushed blacks',
    'artificial lighting',
    'studio lighting',
    'flat lighting'
  ],

  // 人像特定
  portrait: [
    'symmetrical face',
    'perfect proportions',
    'airbrushed skin',
    'plastic doll appearance',
    'dead eyes',
    'uncanny valley',
    'expressionless',
    'mannequin-like'
  ],

  // 环境特定
  environment: [
    'too clean',
    'sterile',
    ' showroom perfect',
    'artificially staged',
    'catalog photo',
    'stock photo',
    'overly composed'
  ],

  // 风格特定
  style: [
    'anime',
    'cartoon',
    'illustration',
    'painting',
    'sketch',
    'watercolor',
    'oil painting'
  ]
};

/**
 * 生成随机词组合
 * @param {number} count - 数量
 * @returns {string[]}
 */
export function generateRandomWords(count = 3) {
  const allWords = [
    ...RANDOM_WORDS.atmosphere,
    ...RANDOM_WORDS.lighting,
    ...RANDOM_WORDS.texture,
    ...RANDOM_WORDS.motion
  ];

  const shuffled = allWords.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * 获取不完美描述
 * @param {string} category - 类别
 * @param {number} count - 数量
 * @returns {string[]}
 */
export function getImperfections(category = 'skin', count = 2) {
  const imperfections = IMPERFECTIONS[category] || IMPERFECTIONS.skin;
  const shuffled = [...imperfections].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * 获取前景层元素
 * @param {string} type - 类型
 * @returns {string}
 */
export function getForegroundElement(type = 'particles') {
  const elements = FOREGROUND_ELEMENTS[type] || FOREGROUND_ELEMENTS.particles;
  return elements[Math.floor(Math.random() * elements.length)];
}

/**
 * 生成完整的 Negative Prompt
 * @param {Object} options - 选项
 * @returns {string}
 */
export function generateNegativePrompt(options = {}) {
  const { includePortrait = true, includeEnvironment = true, includeStyle = true } = options;

  const parts = [...NEGATIVE_TEMPLATES.aiArtifacts];

  if (includePortrait) {
    parts.push(...NEGATIVE_TEMPLATES.portrait);
  }

  if (includeEnvironment) {
    parts.push(...NEGATIVE_TEMPLATES.environment);
  }

  if (includeStyle) {
    parts.push(...NEGATIVE_TEMPLATES.style);
  }

  // 去重
  return [...new Set(parts)].join(', ');
}

/**
 * 为提示词添加去AI味元素
 * @param {string} basePrompt - 基础提示词
 * @param {Object} options - 选项
 * @returns {string}
 */
export function addDeAIElements(basePrompt, options = {}) {
  const {
    randomWordCount = 3,
    imperfectionCategories = ['skin', 'clothing'],
    foregroundType = 'particles'
  } = options;

  const additions = [];

  // 添加随机词
  additions.push(...generateRandomWords(randomWordCount));

  // 添加不完美描述
  imperfectionCategories.forEach(cat => {
    additions.push(...getImperfections(cat, 1));
  });

  // 添加前景层
  additions.push(getForegroundElement(foregroundType));

  // 组合
  const enhancedPrompt = `${basePrompt}, ${additions.join(', ')}`;

  return enhancedPrompt;
}

/**
 * 获取完整的去AI味增强包
 * @param {Object} options
 * @returns {Object}
 */
export function getDeAIEnhancement(options = {}) {
  return {
    randomWords: generateRandomWords(options.randomWordCount || 3),
    imperfections: {
      skin: getImperfections('skin', 1),
      hair: getImperfections('hair', 1),
      clothing: getImperfections('clothing', 1)
    },
    foregroundLayer: getForegroundElement(options.foregroundType || 'particles'),
    negativePrompt: generateNegativePrompt(options)
  };
}

export default {
  IMPERFECTIONS,
  RANDOM_WORDS,
  FOREGROUND_ELEMENTS,
  NEGATIVE_TEMPLATES,
  generateRandomWords,
  getImperfections,
  getForegroundElement,
  generateNegativePrompt,
  addDeAIElements,
  getDeAIEnhancement
};
