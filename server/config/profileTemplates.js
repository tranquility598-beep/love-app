/**
 * Готовые шаблоны публичной страницы.
 *
 * Шаблон — это набор оформления в том же виде, что «Свои стили» (снимок для
 * applyPatch): тема, шрифт, цвета, эффекты, детали. Тексты, ссылки, картинки и
 * музыку он не трогает. Тариф шаблона — самый высокий из того, что в нём
 * включено: иначе человек нажал бы «Применить» и получил отказ сервера.
 *
 * preview — только для плитки в редакторе (фон, акцент, цвет имени).
 */

const base = (style = {}) => ({
  linkShape: 'rounded', linkFill: 'glass', linkLayout: 'auto', cardShadow: 'none',
  avatarShape: 'circle', avatarSize: 'md', nameAlign: 'center', nameSize: 'lg', nameEffect: 'none',
  cursor: 'default', entrance: 'none', cardAlpha: 64, cardRadius: 13, cardBorder: true,
  nameGradient: false, nameFill: 'theme', nameColors: [], nameAngle: 90, linkMotion: 'none',
  cursorHotspot: 'corner', cursorColors: [], avatarTilt: false, sounds: false,
  ...style
});
const noGradient = { enabled: false, colors: [], angle: 160, animated: false };
const noPattern = { kind: 'none', opacity: 35 };

const TEMPLATES = Object.freeze([
  {
    id: 'midnight', name: 'Полночь', tier: 'free',
    description: 'Монохром, пылинки и мягкое зерно — спокойная классика Love.',
    preview: { bg: '#090909', bg2: '#1a1a1a', name: ['#f2f2f2'], accent: '#e7e7e7', font: 'Lora, Georgia, serif' },
    data: {
      theme: 'midnight', layout: 'stack', font: 'serif', accent: null, accentTo: null, avatarFrame: 'ring',
      effects: ['particles', 'grain'], effectColors: [], liveBg: 'none',
      style: base({ entrance: 'rise', cardAlpha: 48, linkShape: 'pill' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  },
  {
    id: 'scarlet-snow', name: 'Алый снег', tier: 'premium',
    description: 'Чёрный бархат, белый и алый снег, имя переливом от алого к белому.',
    preview: { bg: '#050505', bg2: '#1c0d0d', name: ['#ff3b3b', '#ffffff'], accent: '#ff3b3b', font: 'Lora, Georgia, serif', dots: ['#ff3b3b', '#f2f2f2'] },
    data: {
      theme: 'midnight', layout: 'stack', font: 'serif', accent: '#e9e9e9', accentTo: null, avatarFrame: 'pulse',
      effects: ['snow', 'grain'], effectColors: ['#ff3b3b', '#f2f2f2'], liveBg: 'none',
      style: base({ nameFill: 'gradient', nameColors: ['#ff3b3b', '#ffffff'], nameAngle: 100, linkShape: 'pill', linkFill: 'outline', cardShadow: 'soft', entrance: 'stagger', linkLayout: 'grid' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: { enabled: true, colors: ['#140707', '#050505', '#0b0b0b'], angle: 170, animated: false }, bgPattern: noPattern
    }
  },
  {
    id: 'neon', name: 'Неон', tier: 'premium',
    description: 'Ультрафиолет, северное сияние и искры, кнопки залиты неоновым градиентом.',
    preview: { bg: '#0d0820', bg2: '#1c1040', name: ['#c084fc', '#22d3ee'], accent: '#a855f7', font: 'Unbounded, sans-serif', dots: ['#22d3ee', '#c084fc'] },
    data: {
      theme: 'ultraviolet', layout: 'stack', font: 'wide', accent: '#a855f7', accentTo: '#22d3ee', avatarFrame: 'orbit',
      effects: ['aurora', 'sparkles'], effectColors: ['#a855f7', '#22d3ee'], liveBg: 'none',
      style: base({ nameFill: 'accent', nameEffect: 'glow', linkShape: 'pill', linkFill: 'accent', cursor: 'ring', linkMotion: 'sweep', entrance: 'stagger', nameSize: 'md' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  },
  {
    id: 'paper', name: 'Бумага', tier: 'free',
    description: 'Тёплая бумага, редакционный шрифт и строгие ссылки — как хороший журнал.',
    preview: { bg: '#efe9dd', bg2: '#fbf7f0', name: ['#221d16'], accent: '#8a5a2b', font: 'Lora, Georgia, serif', light: true },
    data: {
      theme: 'paper', layout: 'stack', font: 'serif', accent: null, accentTo: null, avatarFrame: 'ring',
      effects: [], effectColors: [], liveBg: 'none',
      style: base({ nameAlign: 'left', linkShape: 'square', linkFill: 'outline', linkLayout: 'list', avatarShape: 'squircle', cardRadius: 6 }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: { kind: 'dots', opacity: 28 }
    }
  },
  {
    id: 'sakura', name: 'Сакура', tier: 'premium',
    description: 'Розовые лепестки, рукописное имя и мягкое стекло.',
    preview: { bg: '#1a0f14', bg2: '#2a1620', name: ['#ffb3c8'], accent: '#ff5c8a', font: 'Caveat, cursive', dots: ['#ff8fb0', '#ffd1dc'] },
    data: {
      theme: 'rose', layout: 'stack', font: 'hand', accent: '#ff7aa2', accentTo: null, avatarFrame: 'pulse',
      effects: ['petals'], effectColors: ['#ff8fb0', '#ffd1dc'], liveBg: 'none',
      style: base({ nameFill: 'solid', nameColors: ['#ffb3c8'], nameSize: 'lg', avatarShape: 'squircle', linkShape: 'pill', cardAlpha: 40, entrance: 'rise' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  },
  {
    id: 'cosmos', name: 'Космос', tier: 'premium',
    description: 'Звёздное небо, созвездия тянутся к курсору, имя с бликом.',
    preview: { bg: '#04050c', bg2: '#0a0f22', name: ['#c7d2fe'], accent: '#c7d2fe', font: 'Unbounded, sans-serif', dots: ['#ffffff', '#c7d2fe'] },
    data: {
      theme: 'starfield', layout: 'stack', font: 'wide', accent: null, accentTo: null, avatarFrame: 'orbit',
      effects: ['constellation'], effectColors: [], liveBg: 'none',
      style: base({ nameEffect: 'shimmer', nameSize: 'md', linkShape: 'pill', cardAlpha: 36, cursor: 'spark', entrance: 'stagger' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  },
  {
    id: 'chrome', name: 'Хром', tier: 'premium',
    description: 'Жидкий металл на фоне, широкий шрифт, имя серебряным переливом.',
    preview: { bg: '#08090a', bg2: '#2a2c2e', name: ['#f5f5f5', '#8a8f96'], accent: '#d9dee3', font: 'Unbounded, sans-serif', metal: true },
    data: {
      theme: 'carbon', layout: 'card', font: 'wide', accent: null, accentTo: null, avatarFrame: 'liquid',
      effects: ['grain'], effectColors: [], liveBg: 'metal',
      style: base({ nameFill: 'gradient', nameColors: ['#ffffff', '#8a8f96', '#e6e6e6'], nameAngle: 90, linkFill: 'solid', linkShape: 'square', cardShadow: 'deep', nameSize: 'md', avatarShape: 'square' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  },
  {
    id: 'minimal', name: 'Минимал', tier: 'free',
    description: 'Светлый, чистый, ничего лишнего: ссылки списком, тонкая сетка.',
    preview: { bg: '#f7f6f3', bg2: '#ffffff', name: ['#16161a'], accent: '#1f6feb', font: 'Outfit, sans-serif', light: true },
    data: {
      theme: 'porcelain', layout: 'stack', font: 'system', accent: null, accentTo: null, avatarFrame: 'none',
      effects: [], effectColors: [], liveBg: 'none',
      style: base({ nameAlign: 'left', nameSize: 'md', linkLayout: 'list', linkFill: 'solid', cardBorder: true, cardRadius: 10 }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: { kind: 'grid', opacity: 20 }
    }
  },
  {
    id: 'arcade', name: 'Аркада', tier: 'pro',
    description: 'Пиксельное имя, кислотный акцент, прицел вместо курсора — для геймеров.',
    preview: { bg: '#08090a', bg2: '#111315', name: ['#39ff14'], accent: '#39ff14', font: '"Pixelify Sans", monospace' },
    data: {
      theme: 'carbon', layout: 'stack', font: 'pixel', accent: '#39ff14', accentTo: null, avatarFrame: 'ring',
      effects: ['ripple'], effectColors: [], liveBg: 'none',
      style: base({ nameFill: 'solid', nameColors: ['#39ff14'], linkShape: 'square', linkFill: 'outline', cursor: 'cross', avatarShape: 'square', cardRadius: 2, nameSize: 'md' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: { kind: 'grid', opacity: 30 }
    }
  },
  {
    id: 'retro-tv', name: 'Кинескоп', tier: 'premium',
    description: 'Строки старого телевизора, плёнка и светящееся моноширинное имя.',
    preview: { bg: '#090909', bg2: '#1a1a1a', name: ['#e7e7e7'], accent: '#e7e7e7', font: '"Fira Mono", monospace', scan: true },
    data: {
      theme: 'midnight', layout: 'stack', font: 'mono', accent: null, accentTo: null, avatarFrame: 'corners',
      effects: ['scanlines', 'grain'], effectColors: [], liveBg: 'none',
      style: base({ nameEffect: 'glow', nameSize: 'md', linkShape: 'square', linkFill: 'outline', avatarShape: 'square', entrance: 'fade' }),
      themeMode: 'fixed', altTheme: null,
      bgGradient: noGradient, bgPattern: noPattern
    }
  }
]);

module.exports = { TEMPLATES };
