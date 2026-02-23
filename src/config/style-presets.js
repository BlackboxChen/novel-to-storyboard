/**
 * 风格预设配置
 * 6种视觉风格预设
 */

export const STYLE_PRESETS = {
  // 中性电影风格
  NEUTRAL_CINEMATIC: {
    id: 'neutral_cinematic',
    name: 'Neutral Cinematic',
    description: '中性电影风格，适合大多数场景',
    director: null,
    characteristics: [
      '自然光感',
      '电影级色彩',
      '标准景别',
      '适度对比'
    ],
    cameraStyle: {
      shots: ['medium shot', 'close-up', 'wide shot'],
      movements: ['static', 'slow pan', 'dolly'],
      angles: ['eye level', 'slight low angle']
    },
    lighting: {
      type: 'natural',
      quality: 'soft',
      direction: 'front-side',
      examples: ['soft ambient light', 'natural daylight', 'golden hour']
    },
    colorGrading: {
      palette: 'neutral',
      saturation: 'medium',
      contrast: 'medium',
      highlights: 'preserved',
      shadows: 'lifted'
    },
    promptModifiers: [
      'cinematic lighting',
      'film grain',
      'professional color grading',
      '8K resolution',
      'photorealistic'
    ],
    negativePrompt: [
      'cartoon',
      'anime',
      '3d render',
      'oversaturated',
      'flat lighting'
    ]
  },

  // 希区柯克风格
  HITCHCOCK: {
    id: 'hitchcock',
    name: 'Hitchcock',
    description: '悬疑大师风格，紧张感和心理压迫',
    director: 'Alfred Hitchcock',
    characteristics: [
      '心理悬疑',
      '精心构图',
      '阴影运用',
      '紧张氛围'
    ],
    cameraStyle: {
      shots: ['extreme close-up', 'dutch angle', 'long shot'],
      movements: ['slow zoom', 'tracking shot', 'dolly zoom'],
      angles: ['high angle', 'low angle', 'tilted']
    },
    lighting: {
      type: 'dramatic chiaroscuro',
      quality: 'hard',
      direction: 'side-back',
      examples: ['harsh shadows', 'single light source', 'noir lighting']
    },
    colorGrading: {
      palette: 'desaturated cool',
      saturation: 'low',
      contrast: 'high',
      highlights: 'controlled',
      shadows: 'deep'
    },
    promptModifiers: [
      'Hitchcockian suspense',
      'dramatic shadows',
      'psychological tension',
      'precise framing',
      'noir aesthetic',
      'vertigo effect'
    ],
    negativePrompt: [
      'bright colors',
      'cheerful',
      'casual',
      'warm tones',
      'soft lighting'
    ]
  },

  // 塔科夫斯基风格
  TARKOVSKY: {
    id: 'tarkovsky',
    name: 'Tarkovsky',
    description: '诗意电影风格，长镜头和自然元素',
    director: 'Andrei Tarkovsky',
    characteristics: [
      '诗意氛围',
      '自然元素',
      '长镜头美学',
      '哲学深度'
    ],
    cameraStyle: {
      shots: ['long take', 'tracking shot', 'slow zoom'],
      movements: ['very slow', 'floating', 'meditative'],
      angles: ['eye level', 'slightly elevated']
    },
    lighting: {
      type: 'natural ambient',
      quality: 'very soft',
      direction: 'diffused',
      examples: ['diffused sunlight', 'candlelight', 'misty atmosphere']
    },
    colorGrading: {
      palette: 'earthy muted',
      saturation: 'low',
      contrast: 'low',
      highlights: 'soft',
      shadows: 'soft'
    },
    promptModifiers: [
      'Tarkovsky style',
      'poetic atmosphere',
      'natural elements',
      'water reflections',
      'long take aesthetic',
      'spiritual mood',
      'meditative pacing',
      'sepia tones'
    ],
    negativePrompt: [
      'fast cuts',
      'action',
      'bright colors',
      'modern',
      'crisp detail'
    ]
  },

  // 王家卫风格
  WONG_KAR_WAI: {
    id: 'wong_kar_wai',
    name: 'Wong Kar-wai',
    description: '港式文艺风格，浪漫与都市感',
    director: '王家卫',
    characteristics: [
      '都市浪漫',
      '色彩浓郁',
      '慢镜头',
      '情感氛围'
    ],
    cameraStyle: {
      shots: ['close-up', 'medium shot', 'handheld'],
      movements: ['step printing', 'slow motion', 'freeform handheld'],
      angles: ['intimate', 'through objects']
    },
    lighting: {
      type: 'neon ambient',
      quality: 'colorful',
      direction: 'multi-colored',
      examples: ['neon lights', 'rain reflections', 'urban night']
    },
    colorGrading: {
      palette: 'rich saturated',
      saturation: 'high',
      contrast: 'medium-high',
      highlights: 'blooming',
      shadows: 'colored'
    },
    promptModifiers: [
      'Wong Kar-wai style',
      'Christopher Doyle cinematography',
      'neon lights',
      'urban melancholy',
      'step printing effect',
      'rain-soaked streets',
      'romantic blur',
      'saturated colors',
      'In the Mood for Love aesthetic'
    ],
    negativePrompt: [
      'clean',
      'daytime',
      'suburban',
      'bright',
      'documentary'
    ]
  },

  // 库布里克风格
  KUBRICK: {
    id: 'kubrick',
    name: 'Kubrick',
    description: '精准对称风格，冷峻与完美主义',
    director: 'Stanley Kubrick',
    characteristics: [
      '完美对称',
      '广角镜头',
      '冷峻氛围',
      '精心设计'
    ],
    cameraStyle: {
      shots: ['one-point perspective', 'wide angle', 'symmetric framing'],
      movements: ['steady tracking', 'slow zoom', 'precise'],
      angles: ['centered', 'one-point perspective']
    },
    lighting: {
      type: 'practical sources',
      quality: 'controlled',
      direction: 'balanced',
      examples: ['practical lighting', 'candlelit scenes', 'cold fluorescent']
    },
    colorGrading: {
      palette: 'cold controlled',
      saturation: 'controlled',
      contrast: 'precise',
      highlights: 'balanced',
      shadows: 'detailed'
    },
    promptModifiers: [
      'Kubrick style',
      'one-point perspective',
      'symmetric composition',
      'wide angle lens',
      'cold atmosphere',
      'meticulous framing',
      'bathroom tiles',
      'overlook hotel aesthetic'
    ],
    negativePrompt: [
      'warm',
      'casual',
      'handheld',
      'imperfect',
      'organic'
    ]
  },

  // 黑泽明风格
  KUROSAWA: {
    id: 'kurosawa',
    name: 'Kurosawa',
    description: '武士电影风格，力量与动态',
    director: 'Akira Kurosawa',
    characteristics: [
      '力量感',
      '动态构图',
      '自然元素',
      '史诗感'
    ],
    cameraStyle: {
      shots: ['telephoto compression', 'weather shots', 'group compositions'],
      movements: ['dynamic tracking', 'weather movement', 'epic sweeps'],
      angles: ['low angle heroic', 'high angle commanding']
    },
    lighting: {
      type: 'natural dramatic',
      quality: 'hard',
      direction: 'back-side',
      examples: ['stormy skies', 'harsh sunlight', 'wind and rain']
    },
    colorGrading: {
      palette: 'earthy bold',
      saturation: 'bold',
      contrast: 'high',
      highlights: 'dramatic',
      shadows: 'deep'
    },
    promptModifiers: [
      'Kurosawa style',
      'epic composition',
      'weather elements',
      'telephoto lens',
      'dynamic movement',
      'samurai aesthetic',
      'widescreen',
      'natural forces',
      'rain and wind'
    ],
    negativePrompt: [
      'static',
      'indoor',
      'modern',
      'subtle',
      'quiet'
    ]
  }
};

/**
 * 获取风格预设
 * @param {string} presetId
 * @returns {Object}
 */
export function getStylePreset(presetId) {
  return STYLE_PRESETS[presetId.toUpperCase()] || STYLE_PRESETS.NEUTRAL_CINEMATIC;
}

/**
 * 获取风格的提示词修饰语
 * @param {string} presetId
 * @returns {string}
 */
export function getStylePromptModifiers(presetId) {
  const preset = getStylePreset(presetId);
  return preset.promptModifiers.join(', ');
}

/**
 * 获取风格的 Negative Prompt
 * @param {string} presetId
 * @returns {string}
 */
export function getStyleNegativePrompt(presetId) {
  const preset = getStylePreset(presetId);
  return preset.negativePrompt.join(', ');
}

/**
 * 获取所有风格列表
 * @returns {Array}
 */
export function getAllStylePresets() {
  return Object.values(STYLE_PRESETS).map(preset => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    director: preset.director
  }));
}

export default STYLE_PRESETS;
