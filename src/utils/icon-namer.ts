/**
 * Icon 语义化命名引擎
 *
 * 根据设计图切片的上下文信息（图层路径、位置、尺寸、格式等）
 * 推断语义化的文件名，不依赖外部 LLM API 调用。
 */

/** 命名上下文 */
export interface IconNamingContext {
  /** 原始图层名 */
  name: string;
  /** 完整图层路径，如 "首页/底部导航/首页图标" */
  layer_path: string;
  /** 父图层名 */
  parent_name?: string;
  /** 图片格式 */
  format: 'png' | 'svg';
  /** 逻辑尺寸 */
  size: { width: number; height: number };
  /** 在画布上的位置 */
  position?: { x: number; y: number };
  /** 所属设计图名 */
  design_name: string;
}

/** 命名结果 */
export interface NamingResult {
  semantic_name: string;
  confidence: 'high' | 'medium' | 'low';
}

/** 噪声词黑名单：设计工具自动生成的无语义名称 */
const NOISE_WORDS = [
  // 中文噪声
  '编组', '路径', '椭圆', '矩形', '形状', '图层', '组合', '位图',
  '蒙版', '遮罩', '切片', '热区', '标记', '参考线',
  // 英文噪声
  'Group', 'Path', 'Oval', 'Rectangle', 'Shape', 'Layer', 'Bitmap',
  'Mask', 'Slice', 'Hotspot', 'Guide', 'Vector', 'Frame',
  'Component', 'Artboard', 'Board', 'Screen', 'Page',
];

/**
 * 判断名称是否为噪声名（无语义）
 */
function isNoisyName(name: string): boolean {
  const trimmed = name.trim();
  // 纯数字
  if (/^\d+$/.test(trimmed)) return true;
  // 过短
  if (trimmed.length <= 2) return true;
  // 包含噪声词
  for (const noise of NOISE_WORDS) {
    if (trimmed.toLowerCase().includes(noise.toLowerCase())) return true;
  }
  // "编组 23"、"图层 1" 等模式
  if (/^(编组|图层|组合|Group|Layer)\s*\d+$/i.test(trimmed)) return true;
  return false;
}

/**
 * 从图层路径中提取语义关键词（过滤掉噪声段）
 */
function extractKeywordsFromPath(layerPath: string): string[] {
  const segments = layerPath
    .split(/[\/\\|＞>]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !isNoisyName(s));
  return segments;
}

/**
 * 清理名称为合法文件名：只保留字母、数字、下划线、连字符
 */
function sanitize(name: string): string {
  return name
    // 中文常见翻译映射
    .replace(/首页/g, 'home')
    .replace(/我的/g, 'profile')
    .replace(/个人中心/g, 'profile')
    .replace(/消息/g, 'message')
    .replace(/通知/g, 'notification')
    .replace(/搜索/g, 'search')
    .replace(/设置/g, 'settings')
    .replace(/购物车/g, 'cart')
    .replace(/订单/g, 'order')
    .replace(/详情/g, 'detail')
    .replace(/列表/g, 'list')
    .replace(/编辑/g, 'edit')
    .replace(/删除/g, 'delete')
    .replace(/添加/g, 'add')
    .replace(/关闭/g, 'close')
    .replace(/返回/g, 'back')
    .replace(/确认/g, 'confirm')
    .replace(/取消/g, 'cancel')
    .replace(/提交/g, 'submit')
    .replace(/保存/g, 'save')
    .replace(/分享/g, 'share')
    .replace(/收藏/g, 'favorite')
    .replace(/点赞/g, 'like')
    .replace(/评论/g, 'comment')
    .replace(/导航/g, 'nav')
    .replace(/底部导航/g, 'tab')
    .replace(/标签栏/g, 'tab')
    .replace(/顶部/g, 'header')
    .replace(/底部/g, 'footer')
    .replace(/左侧/g, 'left')
    .replace(/右侧/g, 'right')
    .replace(/图标/g, 'icon')
    .replace(/按钮/g, 'btn')
    .replace(/背景/g, 'bg')
    .replace(/头像/g, 'avatar')
    .replace(/箭头/g, 'arrow')
    .replace(/下拉/g, 'dropdown')
    .replace(/刷新/g, 'refresh')
    .replace(/加载/g, 'loading')
    .replace(/成功/g, 'success')
    .replace(/失败/g, 'error')
    .replace(/警告/g, 'warning')
    .replace(/提示/g, 'info')
    // 移除非法字符
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    // 空格转连字符
    .replace(/\s+/g, '-')
    // 连续连字符合并
    .replace(/-+/g, '-')
    // 去除首尾连字符
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * 上下文推断规则
 */
interface ContextRule {
  match: (ctx: IconNamingContext) => boolean;
  generate: (ctx: IconNamingContext, index: number) => string;
}

const CONTEXT_RULES: ContextRule[] = [
  // 规则 1: 小尺寸 + 底部位置 → tab bar icon
  {
    match: (ctx) => {
      const h = ctx.size.height;
      const y = ctx.position?.y ?? 0;
      return h <= 32 && h >= 16 && y > 600;
    },
    generate: (ctx, idx) => {
      const keywords = extractKeywordsFromPath(ctx.layer_path);
      const hint = keywords.length > 0 ? sanitize(keywords[0]) : `tab${idx}`;
      return `icon-tab-${hint}`;
    },
  },
  // 规则 2: 小尺寸 + 顶部位置 → nav bar icon
  {
    match: (ctx) => {
      const h = ctx.size.height;
      const y = ctx.position?.y ?? 0;
      return h <= 32 && h >= 16 && y < 100;
    },
    generate: (ctx, idx) => {
      const keywords = extractKeywordsFromPath(ctx.layer_path);
      const hint = keywords.length > 0 ? sanitize(keywords[0]) : `nav${idx}`;
      return `icon-nav-${hint}`;
    },
  },
  // 规则 3: SVG 格式 → 通常是矢量图标
  {
    match: (ctx) => ctx.format === 'svg',
    generate: (ctx, idx) => {
      if (!isNoisyName(ctx.name)) {
        return `icon-${sanitize(ctx.name)}`;
      }
      const keywords = extractKeywordsFromPath(ctx.layer_path);
      const hint = keywords.length > 0 ? sanitize(keywords[keywords.length - 1]) : `vector${idx}`;
      return `icon-${hint}`;
    },
  },
  // 规则 4: 从 parent_name 中的常见导航关键词推断
  {
    match: (ctx) => {
      const p = ctx.parent_name?.toLowerCase() ?? '';
      return p.includes('tab') || p.includes('导航') || p.includes('标签') || p.includes('底部');
    },
    generate: (ctx, idx) => {
      const keywords = extractKeywordsFromPath(ctx.layer_path);
      const hint = keywords.length > 0 ? sanitize(keywords[keywords.length - 1]) : `item${idx}`;
      return `icon-tab-${hint}`;
    },
  },
];

/**
 * 生成语义化名称
 *
 * @param ctx 命名上下文
 * @param index 序号（用于兜底命名）
 * @param mode 命名模式：auto（规则+上下文）、rule（仅规则）、original（保留原名）
 */
export function generateSemanticName(
  ctx: IconNamingContext,
  index: number,
  mode: 'auto' | 'rule' | 'original' = 'auto',
): NamingResult {
  // original 模式：直接保留原始名
  if (mode === 'original') {
    return {
      semantic_name: sanitize(ctx.name || `icon_${index}`) || `icon_${index}`,
      confidence: 'high',
    };
  }

  // 优先级 1：原始名已经有语义
  if (!isNoisyName(ctx.name) && ctx.name.trim().length >= 3) {
    const cleaned = sanitize(ctx.name);
    if (cleaned.length >= 2) {
      return {
        semantic_name: `icon-${cleaned}`,
        confidence: 'high',
      };
    }
  }

  // 优先级 2：从上下文规则推断
  for (const rule of CONTEXT_RULES) {
    if (rule.match(ctx)) {
      return {
        semantic_name: rule.generate(ctx, index),
        confidence: 'medium',
      };
    }
  }

  // 优先级 3：从路径提取关键词
  const keywords = extractKeywordsFromPath(ctx.layer_path);
  if (keywords.length > 0) {
    // 取最后一段最有语义的关键词
    const best = sanitize(keywords[keywords.length - 1]);
    if (best.length >= 2) {
      return {
        semantic_name: `icon-${best}`,
        confidence: 'medium',
      };
    }
  }

  // 优先级 4：从 design_name 推断
  if (ctx.design_name && !isNoisyName(ctx.design_name)) {
    const cleaned = sanitize(ctx.design_name);
    if (cleaned.length >= 2) {
      return {
        semantic_name: `icon-${cleaned}-${index}`,
        confidence: 'low',
      };
    }
  }

  // 兜底：格式 + 尺寸 + 序号
  const sizeStr = ctx.size.width > 0 && ctx.size.height > 0
    ? `${ctx.size.width}x${ctx.size.height}`
    : 'unknown';
  return {
    semantic_name: `icon-${ctx.format}-${sizeStr}-${String(index).padStart(3, '0')}`,
    confidence: 'low',
  };
}
