import type { SketchData } from '../types/design.js';

const NOISE_TYPES = new Set(['color', 'gradient', 'colorStop', 'colorControl']);

interface Dimensions {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getDimensions(obj: Record<string, unknown>): Dimensions {
  const frame =
    (obj.ddsOriginFrame as Record<string, number>) ??
    (obj.layerOriginFrame as Record<string, number>) ??
    {};
  return {
    x: (frame.x ?? (obj.left as number) ?? 0) || 0,
    y: (frame.y ?? (obj.top as number) ?? 0) || 0,
    w: (frame.width ?? (obj.width as number) ?? 0) || 0,
    h: (frame.height ?? (obj.height as number) ?? 0) || 0,
  };
}

function simplifyFill(fill: Record<string, unknown>): string | null {
  if (fill.isEnabled === false) return null;
  const fillType = (fill.fillType as number) ?? 0;

  if (fillType === 0) {
    const color = (fill.color as Record<string, unknown>) ?? {};
    return `solid(${(color.value as string) ?? 'unknown'})`;
  }

  if (fillType === 1) {
    const gradient = (fill.gradient as Record<string, unknown>) ?? {};
    const stops = (gradient.colorStops as Array<Record<string, unknown>>) ?? [];
    const fromPt = (gradient.from as Record<string, number>) ?? {};
    const toPt = (gradient.to as Record<string, number>) ?? {};
    const dx = (toPt.x ?? 0.5) - (fromPt.x ?? 0.5);
    const dy = (toPt.y ?? 0) - (fromPt.y ?? 0);
    const angle = Math.round((Math.atan2(dx, dy) * 180) / Math.PI) % 360;

    const parts = stops.map((s) => {
      const c = ((s.color as Record<string, unknown>)?.value as string) ?? 'unknown';
      const p = (s.position as number) ?? 0;
      return `${c} ${Math.round(p * 100)}%`;
    });

    return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
  }

  return null;
}

function simplifyBorder(border: Record<string, unknown>): string | null {
  if (border.isEnabled === false) return null;
  const color =
    ((border.color as Record<string, unknown>)?.value as string) ?? 'unknown';
  const thickness = (border.thickness as number) ?? 1;
  const posMap: Record<string, string> = {
    '内边框': 'inside',
    '外边框': 'outside',
    '中心边框': 'center',
  };
  const pos =
    posMap[border.position as string] ?? (border.position as string) ?? 'center';
  return `${thickness}px ${pos} ${color}`;
}

function simplifyShadow(shadow: Record<string, unknown>): string | null {
  if (shadow.isEnabled === false) return null;
  const color =
    ((shadow.color as Record<string, unknown>)?.value as string) ?? 'unknown';
  const x = (shadow.offsetX as number) ?? 0;
  const y = (shadow.offsetY as number) ?? 0;
  const blur = (shadow.blurRadius as number) ?? 0;
  const spread = (shadow.spread as number) ?? 0;
  return `${color} ${x}px ${y}px ${blur}px ${spread}px`;
}

function hasOnlyTransparentSolid(fills: Array<Record<string, unknown>>): boolean {
  for (const f of fills) {
    if (f.isEnabled === false) continue;
    if ((f.fillType as number) === 0) {
      const color = (f.color as Record<string, unknown>) ?? {};
      const val = (color.value as string) ?? '';
      if (val.includes('rgba') && val.replace(/\s/g, '').includes(',0)')) continue;
      const alpha = (color.alpha as number) ?? (color.a as number) ?? 1;
      if (alpha === 0) continue;
    }
    return false;
  }
  return true;
}

function isHighRisk(obj: Record<string, unknown>): boolean {
  const objType = (
    (obj.type as string) ?? (obj.ddsType as string) ?? ''
  ).toLowerCase();
  if (NOISE_TYPES.has(objType)) return false;

  const { w, h } = getDimensions(obj);
  if (w < 2 && h < 2) return false;

  const fills = (obj.fills as Array<Record<string, unknown>>) ?? [];
  const hasGradientFill = fills.some(
    (f) => f.isEnabled !== false && (f.fillType as number) === 1
  );
  if (hasGradientFill) return true;

  const borders = (obj.borders as Array<Record<string, unknown>>) ?? [];
  if (borders.some((b) => b.isEnabled !== false)) return true;

  const radius = obj.radius;
  if (Array.isArray(radius) && new Set(radius).size > 1) return true;

  const opacity = obj.opacity as number | undefined;
  if (opacity !== undefined && opacity < 100) {
    if (
      hasOnlyTransparentSolid(fills) &&
      borders.length === 0 &&
      !((obj.shadows as Array<unknown>)?.length > 0)
    ) {
      return false;
    }
    return true;
  }

  const shadows = (obj.shadows as Array<Record<string, unknown>>) ?? [];
  if (shadows.some((s) => s.isEnabled !== false)) return true;

  return false;
}

/**
 * 从 Sketch JSON 中提取高风险元素的设计参数
 */
export function extractDesignTokens(sketchData: SketchData): string {
  const tokens: string[] = [];

  function buildPath(parentPath: string, name: string): string {
    return parentPath ? `${parentPath}/${name}` : name;
  }

  function walk(obj: Record<string, unknown> | null | undefined, parentPath = ''): void {
    if (!obj || typeof obj !== 'object') return;
    if (obj.isVisible === false) return;

    const name = (obj.name as string) ?? '';
    const currentPath = buildPath(parentPath, name);

    if (isHighRisk(obj)) {
      const objType = (obj.type as string) ?? (obj.ddsType as string) ?? 'unknown';
      const { x, y, w, h } = getDimensions(obj);

      const lines = [
        `[${objType}] "${name}" @(${Math.round(x)},${Math.round(y)}) ${Math.round(w)}x${Math.round(h)}`,
      ];
      if (parentPath) {
        lines[0] += `  path: ${currentPath}`;
      }

      const radius = obj.radius;
      if (radius) {
        if (Array.isArray(radius)) {
          if (new Set(radius).size === 1) {
            lines.push(`  radius: ${radius[0]}`);
          } else {
            lines.push(`  radius: ${radius.join(', ')}`);
          }
        } else {
          lines.push(`  radius: ${radius}`);
        }
      }

      for (const f of (obj.fills as Array<Record<string, unknown>>) ?? []) {
        const s = simplifyFill(f);
        if (s) lines.push(`  fill: ${s}`);
      }

      for (const b of (obj.borders as Array<Record<string, unknown>>) ?? []) {
        const s = simplifyBorder(b);
        if (s) lines.push(`  border: ${s}`);
      }

      const opacity = obj.opacity as number | undefined;
      if (opacity !== undefined && opacity < 100) {
        lines.push(`  opacity: ${opacity}%`);
      }

      for (const sh of (obj.shadows as Array<Record<string, unknown>>) ?? []) {
        const s = simplifyShadow(sh);
        if (s) lines.push(`  shadow: ${s}`);
      }

      tokens.push(lines.join('\n'));
    }

    for (const child of (obj.layers as Array<Record<string, unknown>>) ?? []) {
      walk(child, currentPath);
    }
  }

  const artboard = sketchData.artboard;
  if (artboard?.layers) {
    for (const layer of artboard.layers) {
      walk(layer as unknown as Record<string, unknown>);
    }
  } else if (sketchData.info) {
    for (const item of sketchData.info) {
      const itemObj = item as unknown as Record<string, unknown>;
      walk(itemObj);
      for (const value of Object.values(itemObj)) {
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            for (const v of value) {
              if (v && typeof v === 'object') walk(v as Record<string, unknown>);
            }
          } else {
            walk(value as Record<string, unknown>);
          }
        }
      }
    }
  }

  if (tokens.length === 0) return '';
  return tokens.join('\n\n');
}
