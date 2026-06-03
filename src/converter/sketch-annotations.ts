import type { SketchData, SketchLayer, SketchColor } from '../types/design.js';

interface TextLayerEntry {
  name: string;
  path: string;
  text: string;
  x: string;
  y: string;
  w: string;
  h: string;
  color: string | null;
  fontSize: string | null;
  font: string;
  bold: boolean;
  italic: boolean;
  justify: string;
  leading: string | null;
  tracking: number | undefined;
  stroke: string | null;
  shadow: string | null;
}

interface ShapeLayerEntry {
  name: string;
  path: string;
  x: string;
  y: string;
  w: string;
  h: string;
  fill: string | null;
  opacity: number | null;
  stroke: string | null;
  shadows: string[];
  innerShadows: string[];
  effects: string[];
}

interface ImageLayerEntry {
  name: string;
  path: string;
  x: string;
  y: string;
  w: string;
  h: string;
  opacity: number | null;
}

interface GroupEntry {
  name: string;
  depth: number;
  x: string;
  y: string;
  w: string;
  h: string;
}

/**
 * 从 Sketch JSON 中提取完整标注信息
 * 生成结构化文本供 AI 还原设计
 */
export function extractFullAnnotationsFromSketch(
  sketchData: SketchData,
  designScale = 2.0
): string {
  const scale = designScale || 2.0;

  function rgbStr(color: Record<string, number>): string {
    const r = Math.round(color.red ?? color.r ?? 0);
    const g = Math.round(color.green ?? color.g ?? 0);
    const b = Math.round(color.blue ?? color.b ?? 0);
    return `rgb(${r},${g},${b})`;
  }

  function rgbaStr(color: Record<string, number>, opacityVal = 100): string {
    const r = Math.round(color.red ?? color.r ?? 0);
    const g = Math.round(color.green ?? color.g ?? 0);
    const b = Math.round(color.blue ?? color.b ?? 0);
    const a = opacityVal < 100 ? Math.round((opacityVal / 100) * 100) / 100 : 1;
    return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  }

  function toPx(val: unknown): string {
    if (val == null) return '0';
    return String(Math.round((parseFloat(String(val)) / scale) * 10) / 10);
  }

  function extractOpacity(layer: SketchLayer): number {
    const bo = (layer.blendOptions ?? {}) as Record<string, unknown>;
    if ('opacity' in bo) {
      const op = bo.opacity;
      if (typeof op === 'object' && op !== null) {
        return (op as { value?: number }).value ?? 100;
      }
      return Number(op) || 100;
    }
    return 100;
  }

  function extractFillColor(layer: SketchLayer): string | null {
    const fill = (layer.fill ?? {}) as { color?: SketchColor };
    if (!fill?.color) return null;
    const opacity = extractOpacity(layer);
    return rgbaStr(fill.color as Record<string, number>, opacity);
  }

  function extractShadowStr(shadowData: Record<string, unknown>): string | null {
    if (shadowData.enabled === false) return null;
    const color = (shadowData.color ?? {}) as Record<string, number>;
    const opacity = shadowData.opacity;
    const opVal = typeof opacity === 'object' && opacity !== null
      ? (opacity as { value?: number }).value ?? 100
      : Number(opacity) || 100;
    const distance = Number(shadowData.distance ?? 0);
    const blur = Number(shadowData.blur ?? 0);
    const spread = Number(shadowData.chokeMatte ?? 0);
    const angleRaw = shadowData.localLightingAngle;
    const angle = typeof angleRaw === 'object' && angleRaw !== null
      ? (angleRaw as { value?: number }).value ?? 120
      : Number(angleRaw) || 120;
    const rad = (angle * Math.PI) / 180;
    const xOff = Math.round(distance * Math.cos(rad) * 10) / 10;
    const yOff = Math.round(distance * Math.sin(rad) * 10) / 10;
    const colorStr = rgbaStr(color, opVal);
    return `${colorStr} ${toPx(xOff)}px ${toPx(yOff)}px ${toPx(blur)}px ${toPx(spread)}px`;
  }

  function extractStrokeStr(frameFx: Record<string, unknown>): string | null {
    if (frameFx.enabled === false) return null;
    const size = Number(frameFx.size ?? 0);
    const color = (frameFx.color ?? {}) as Record<string, number>;
    const opacity = frameFx.opacity;
    const opVal = typeof opacity === 'object' && opacity !== null
      ? (opacity as { value?: number }).value ?? 100
      : Number(opacity) || 100;
    const style = String(frameFx.style ?? 'outsetFrame');
    const posMap: Record<string, string> = {
      outsetFrame: 'outside',
      insetFrame: 'inside',
      centeredFrame: 'center',
    };
    const pos = posMap[style] ?? 'outside';
    const colorStr = rgbaStr(color, opVal);
    return `${toPx(size)}px ${pos} ${colorStr}`;
  }

  const lines: string[] = [];
  const board = (sketchData.board ?? {}) as Record<string, unknown>;
  const device = sketchData.device ?? '';
  const psdName = sketchData.psdName ?? '';
  const boardW = Number(board.width ?? 0);
  const boardH = Number(board.height ?? 0);
  const boardFill = (board.fill ?? {}) as { color?: SketchColor };
  const boardColor = boardFill.color ? rgbStr(boardFill.color as Record<string, number>) : '#FFFFFF';

  lines.push('='.repeat(60));
  lines.push('设计标注信息（从原始 Sketch/PSD 数据提取）');
  lines.push('='.repeat(60));
  lines.push(`设计稿名称: ${psdName}`);
  lines.push(`设备: ${device}  |  缩放: @${Math.round(scale)}x`);
  lines.push(`画布尺寸: ${toPx(boardW)}x${toPx(boardH)} (逻辑像素)`);
  lines.push(`画布背景色: ${boardColor}`);
  lines.push('');
  lines.push(`以下所有尺寸/坐标均为逻辑像素（已除以 @${Math.round(scale)}x）`);
  lines.push('-'.repeat(60));

  const textLayers: TextLayerEntry[] = [];
  const shapeLayers: ShapeLayerEntry[] = [];
  const imageLayers: ImageLayerEntry[] = [];
  const groupStructure: GroupEntry[] = [];

  function walkLayer(layer: SketchLayer, depth = 0, parentPath = ''): void {
    if (!layer || typeof layer !== 'object') return;
    if (layer.visible === false) return;

    const name = layer.name ?? '?';
    const ltype = layer.type ?? '?';
    const w = layer.width ?? 0;
    const h = layer.height ?? 0;
    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;

    if (w === 0 && h === 0) {
      for (const child of layer.layers ?? []) walkLayer(child, depth, currentPath);
      return;
    }

    const opacity = extractOpacity(layer);

    if (ltype === 'textLayer') {
      const ti = (layer.textInfo ?? {}) as Record<string, unknown>;
      const text = String(ti.text ?? '');
      const color = ti.color as SketchColor | undefined;
      const size = ti.size as number | undefined;
      const font = String(ti.fontPostScriptName ?? '');
      const bold = Boolean(ti.bold);
      const italic = Boolean(ti.italic);
      const justify = String(ti.justification ?? 'left');
      const leading = ti.leading as number | undefined;
      const tracking = ti.tracking as number | undefined;
      const le = (layer.layerEffects ?? {}) as Record<string, unknown>;

      const entry: TextLayerEntry = {
        name,
        path: currentPath,
        text,
        x: toPx(left),
        y: toPx(top),
        w: toPx(w),
        h: toPx(h),
        color: color ? rgbaStr(color as Record<string, number>, opacity) : null,
        fontSize: size ? toPx(size) : null,
        font,
        bold,
        italic,
        justify,
        leading: leading ? toPx(leading) : null,
        tracking,
        stroke: null,
        shadow: null,
      };
      if (le.frameFX) {
        entry.stroke = extractStrokeStr(le.frameFX as Record<string, unknown>);
      }
      if (le.dropShadow) {
        entry.shadow = extractShadowStr(le.dropShadow as Record<string, unknown>);
      }
      textLayers.push(entry);
    } else if (ltype === 'shapeLayer') {
      const fillColor = extractFillColor(layer);
      const le = (layer.layerEffects ?? {}) as Record<string, unknown>;

      const entry: ShapeLayerEntry = {
        name,
        path: currentPath,
        x: toPx(left),
        y: toPx(top),
        w: toPx(w),
        h: toPx(h),
        fill: fillColor,
        opacity: opacity < 100 ? opacity : null,
        stroke: null,
        shadows: [],
        innerShadows: [],
        effects: [],
      };

      if (le.frameFX) {
        entry.stroke = extractStrokeStr(le.frameFX as Record<string, unknown>);
      }

      for (const shadowKey of ['dropShadow', 'dropShadowMulti']) {
        const sd = le[shadowKey];
        if (!sd) continue;
        if (Array.isArray(sd)) {
          for (const s of sd) {
            const ss = extractShadowStr(s as Record<string, unknown>);
            if (ss) entry.shadows.push(ss);
          }
        } else if (typeof sd === 'object') {
          const ss = extractShadowStr(sd as Record<string, unknown>);
          if (ss) entry.shadows.push(ss);
        }
      }

      for (const shadowKey of ['innerShadow', 'innerShadowMulti']) {
        const sd = le[shadowKey];
        if (!sd) continue;
        if (Array.isArray(sd)) {
          for (const s of sd) {
            const ss = extractShadowStr(s as Record<string, unknown>);
            if (ss) entry.innerShadows.push(`inset ${ss}`);
          }
        } else if (typeof sd === 'object') {
          const ss = extractShadowStr(sd as Record<string, unknown>);
          if (ss) entry.innerShadows.push(`inset ${ss}`);
        }
      }

      for (const fxName of ['bevelEmboss', 'outerGlow', 'innerGlow', 'patternFill']) {
        const fx = le[fxName] as Record<string, unknown> | undefined;
        if (fx && fx.enabled !== false) {
          entry.effects.push(fxName);
        }
      }

      shapeLayers.push(entry);
    } else if (ltype === 'layer') {
      if (w > 10 && h > 10) {
        imageLayers.push({
          name,
          path: currentPath,
          x: toPx(left),
          y: toPx(top),
          w: toPx(w),
          h: toPx(h),
          opacity: opacity < 100 ? opacity : null,
        });
      }
    } else if (ltype === 'layerSection') {
      groupStructure.push({
        name,
        depth,
        x: toPx(left),
        y: toPx(top),
        w: toPx(w),
        h: toPx(h),
      });
    }

    for (const child of layer.layers ?? []) {
      walkLayer(child, depth + 1, currentPath);
    }
  }

  for (const layer of (board.layers ?? []) as SketchLayer[]) {
    walkLayer(layer);
  }

  // 图层组结构
  if (groupStructure.length) {
    lines.push('');
    lines.push('📂 图层组结构 (布局参考):');
    for (const g of groupStructure) {
      const indent = '  '.repeat(g.depth);
      lines.push(`  ${indent}[组] "${g.name}" @(${g.x},${g.y}) ${g.w}x${g.h}`);
    }
  }

  // 文本图层
  if (textLayers.length) {
    lines.push('');
    lines.push('📝 文本图层:');
    for (const t of textLayers) {
      lines.push(`  "${t.text}"`);
      lines.push(`    位置: (${t.x},${t.y}) ${t.w}x${t.h}`);
      const parts: string[] = [];
      if (t.fontSize) parts.push(`font-size: ${t.fontSize}px`);
      if (t.font) parts.push(`font-family: ${t.font}`);
      if (t.bold) parts.push('font-weight: bold');
      if (t.italic) parts.push('font-style: italic');
      if (t.color) parts.push(`color: ${t.color}`);
      if (t.justify && t.justify !== 'left') parts.push(`text-align: ${t.justify}`);
      if (t.leading) parts.push(`line-height: ${t.leading}px`);
      if (t.tracking) parts.push(`letter-spacing: ${t.tracking}`);
      if (parts.length) lines.push(`    样式: ${parts.join('; ')}`);
      if (t.stroke) lines.push(`    描边: ${t.stroke}`);
      if (t.shadow) lines.push(`    阴影: ${t.shadow}`);
    }
  }

  // 形状图层
  if (shapeLayers.length) {
    lines.push('');
    lines.push('🔷 形状图层:');
    for (const s of shapeLayers) {
      lines.push(`  "${s.name}" (${s.path})`);
      lines.push(`    位置: (${s.x},${s.y}) ${s.w}x${s.h}`);
      const parts: string[] = [];
      if (s.fill) parts.push(`fill: ${s.fill}`);
      if (s.opacity !== null) parts.push(`opacity: ${s.opacity}%`);
      if (s.stroke) parts.push(`border: ${s.stroke}`);
      if (parts.length) lines.push(`    样式: ${parts.join('; ')}`);
      const allShadows = [...s.shadows, ...s.innerShadows];
      if (allShadows.length) lines.push(`    box-shadow: ${allShadows.join(', ')}`);
      if (s.effects.length) lines.push(`    特效: ${s.effects.join(', ')}`);
    }
  }

  // 图片图层
  if (imageLayers.length) {
    lines.push('');
    lines.push('🖼️ 图片/位图图层 (需切图资源):');
    for (const img of imageLayers) {
      lines.push(`  "${img.name}" (${img.path})`);
      lines.push(`    位置: (${img.x},${img.y}) ${img.w}x${img.h}`);
      if (img.opacity !== null) lines.push(`    opacity: ${img.opacity}%`);
    }
  }

  // 设计汇总
  const colorSet = new Set<string>();
  const fontSet = new Set<string>();
  for (const t of textLayers) {
    if (t.color) colorSet.add(t.color);
    if (t.font) fontSet.add(t.font);
    if (t.fontSize) fontSet.add(`${t.fontSize}px`);
  }
  for (const s of shapeLayers) {
    if (s.fill) colorSet.add(s.fill);
  }

  if (colorSet.size || fontSet.size) {
    lines.push('');
    lines.push('🎨 设计汇总:');
    if (colorSet.size) lines.push(`  使用颜色: ${[...colorSet].sort().join(', ')}`);
    if (fontSet.size) lines.push(`  字体/字号: ${[...fontSet].sort().join(', ')}`);
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
