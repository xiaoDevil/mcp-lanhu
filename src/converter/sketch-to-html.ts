import type { SketchData, SketchLayer, SketchColor, LayerAnnotation } from '../types/design.js';

interface SketchEffect {
  enabled?: boolean;
  isEnabled?: boolean;
  color?: SketchColor;
  opacity?: { value?: number } | number;
  localLightingAngle?: { value?: number } | number;
  distance?: number;
  blur?: number;
  chokeMatte?: number;
  spread?: number;
  size?: number;
  style?: string;
  x?: number;
  y?: number;
  inset?: boolean;
  [key: string]: unknown;
}

interface SketchTextInfo {
  text?: string;
  color?: SketchColor;
  size?: number;
  fontPostScriptName?: string;
  fontName?: string;
  fontStyleName?: string;
  bold?: boolean;
  italic?: boolean;
  justification?: string;
  leading?: number;
  tracking?: number;
  [key: string]: unknown;
}

interface SketchArtTextStyle {
  font?: {
    size?: number;
    postScriptName?: string;
    name?: string;
    fontWeight?: number;
    type?: string;
    align?: string;
    lineHeight?: { value?: number } | number;
  };
  color?: SketchColor & { value?: string };
}

interface FlattenLayer {
  layer: SketchLayer;
  lframe: { left: number; top: number; width: number; height: number };
}

/**
 * 将 Sketch/PSD JSON 转换为 HTML+CSS
 * 策略：绝对定位元素 + data-css 标注
 * 返回 [html, image_url_mapping, layer_annotations]
 */
export function convertSketchToHtml(
  sketchData: SketchData,
  designScale = 2.0,
  designImgUrl = ''
): [string, Record<string, string>, LayerAnnotation[]] {
  const scale = designScale || 2.0;

  function px(v: unknown): number {
    if (v == null) return 0;
    return Math.round((parseFloat(String(v)) / scale) * 10) / 10;
  }

  function colorCss(c: SketchColor | undefined | null, opacity = 100): string | null {
    if (!c || typeof c !== 'object') return null;
    if ('value' in c && c.value) return c.value;
    const r = Math.round(c.red ?? c.r ?? 0);
    const g = Math.round(c.green ?? c.g ?? 0);
    const b = Math.round(c.blue ?? c.b ?? 0);
    const a = opacity < 100 ? Math.round((opacity / 100) * 100) / 100 : 1;
    return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  }

  function getOpacity(layer: SketchLayer): number {
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

  function extractBorderRadius(layer: SketchLayer): string | null {
    const path = (layer.path ?? {}) as Record<string, unknown>;
    const comps = (path.pathComponents ?? []) as Array<Record<string, unknown>>;
    if (!comps.length) return null;
    const origin = (comps[0].origin ?? {}) as Record<string, unknown>;
    const radii = origin.radii as number[] | undefined;
    if (!radii || !radii.length) return null;
    const r = radii.map((v) => px(v));
    if (new Set(r).size === 1 && r[0] > 0) return `${r[0]}px`;
    if (r.some((v) => v > 0)) return `${r[0]}px ${r[1]}px ${r[2]}px ${r[3]}px`;
    return null;
  }

  function extractShadow(effects: Record<string, unknown>): string | null {
    const shadows: string[] = [];
    for (const key of ['dropShadow', 'innerShadow']) {
      const fx = effects[key] as SketchEffect | undefined;
      if (!fx || !fx.enabled) continue;
      const c = fx.color ?? {};
      let colorStr = colorCss(c);
      if (!colorStr) continue;

      const opObj = fx.opacity;
      const opVal = typeof opObj === 'object' && opObj !== null ? opObj.value ?? 100 : Number(opObj) || 100;
      if (opVal < 100) {
        const r = Math.round(c.red ?? c.r ?? 0);
        const g = Math.round(c.green ?? c.g ?? 0);
        const b = Math.round(c.blue ?? c.b ?? 0);
        colorStr = `rgba(${r},${g},${b},${Math.round((opVal / 100) * 100) / 100})`;
      }

      const angleObj = fx.localLightingAngle;
      const angleDeg = typeof angleObj === 'object' && angleObj !== null ? angleObj.value ?? 90 : Number(angleObj) || 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      const dist = px(fx.distance ?? 0);
      const blur = px(fx.blur ?? 0);
      const spread = px(fx.chokeMatte ?? 0);
      const ox = Math.round(-dist * Math.cos(angleRad) * 10) / 10;
      const oy = Math.round(dist * Math.sin(angleRad) * 10) / 10;

      const inset = key === 'innerShadow' ? 'inset ' : '';
      const spreadStr = spread ? ` ${spread}px` : '';
      shadows.push(`${inset}${ox}px ${oy}px ${blur}px${spreadStr} ${colorStr}`);
    }
    return shadows.length ? shadows.join(',') : null;
  }

  function extractBorder(effects: Record<string, unknown>): string | null {
    const stroke = (effects.frameFX ?? effects.solidFill) as SketchEffect | undefined;
    if (!stroke || !stroke.enabled) return null;
    const size = px(stroke.size ?? 1);
    const c = stroke.color ?? {};
    const colorStr = colorCss(c);
    if (colorStr) return `${size}px solid ${colorStr}`;
    return null;
  }

  function parseFontWeight(styleName: string): number | null {
    if (!styleName) return null;
    const m = styleName.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  // 扁平化图层列表
  const flatLayers: SketchLayer[] = [];
  let boardW = 375;
  let boardH = 667;

  function flattenArtboard(layer: SketchLayer): void {
    if (!layer || typeof layer !== 'object') return;
    if (layer.visible === false) return;
    const lframe = layer.frame ?? layer.realFrame ?? {};
    const w = lframe.width ?? layer.width ?? 0;
    const h = lframe.height ?? layer.height ?? 0;
    if (w === 0 && h === 0) {
      for (const child of [...(layer.layers ?? [])].reverse()) flattenArtboard(child);
      return;
    }
    const ltype = layer.type ?? '';
    if (['layerSection', 'symbolInstence', 'artboard'].includes(ltype)) {
      const images = layer.images ?? {};
      if (images.png_xxxhd || images.svg) {
        flatLayers.push(layer);
      } else {
        for (const child of [...(layer.layers ?? [])].reverse()) flattenArtboard(child);
      }
      return;
    }
    flatLayers.push(layer);
  }

  function flattenBoard(layer: SketchLayer): void {
    if (!layer || typeof layer !== 'object') return;
    if (layer.visible === false) return;
    const w = layer.width ?? 0;
    const h = layer.height ?? 0;
    if (w === 0 && h === 0) {
      for (const child of [...(layer.layers ?? [])].reverse()) flattenBoard(child);
      return;
    }
    if (layer.type === 'layerSection') {
      const images = layer.images ?? {};
      if (images.png_xxxhd || images.svg) {
        flatLayers.push(layer);
      } else {
        for (const child of [...(layer.layers ?? [])].reverse()) flattenBoard(child);
      }
      return;
    }
    flatLayers.push(layer);
  }

  if (sketchData.artboard) {
    const artboard = sketchData.artboard;
    const artFrame = artboard.frame ?? artboard.realFrame ?? {};
    boardW = px(artFrame.width ?? 750);
    boardH = px(artFrame.height ?? 1334);
    for (const l of [...(artboard.layers ?? [])].reverse()) flattenArtboard(l);
  } else if (sketchData.board) {
    const board = sketchData.board;
    boardW = px(board.width ?? 750);
    boardH = px(board.height ?? 1334);
    for (const l of [...(board.layers ?? [])].reverse()) flattenBoard(l);
  }

  const cssRules: string[] = [];
  const htmlParts: string[] = [];
  const imageUrlMapping: Record<string, string> = {};
  const layerAnnotations: LayerAnnotation[] = [];

  for (let idx = 0; idx < flatLayers.length; idx++) {
    const L = flatLayers[idx];
    const cls = `el${idx + 1}`;
    const ltype = L.type ?? '';
    const name = L.name ?? '';
    const lframe = L.frame ?? L.realFrame ?? {};
    const left = px(lframe.left ?? L.left ?? 0);
    const top = px(lframe.top ?? L.top ?? 0);
    const w = px(lframe.width ?? L.width ?? 0);
    const h = px(lframe.height ?? L.height ?? 0);

    const opacity = getOpacity(L);
    const effects = (L.layerEffects ?? L.style ?? {}) as Record<string, unknown>;

    const annot: LayerAnnotation = {
      name,
      type: ltype,
      css: {
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${w}px`,
        height: `${h}px`,
      },
    };

    const props = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${w}px`,
      `height:${h}px`,
    ];

    if (opacity < 100) {
      const opCss = Math.round((opacity / 100) * 100) / 100;
      props.push(`opacity:${opCss}`);
      annot.css.opacity = String(opCss);
    }

    const br = extractBorderRadius(L);
    if (br) {
      props.push(`border-radius:${br}`);
      props.push('overflow:hidden');
      annot.css['border-radius'] = br;
    }

    let shadow = extractShadow(effects);
    // artboard 格式: effects.shadows 直接有 x/y/blur/color 结构
    if (!shadow && typeof effects === 'object') {
      const shadowsList = (effects.shadows ?? []) as SketchEffect[];
      const shadowParts: string[] = [];
      for (const s of shadowsList) {
        if (s.isEnabled === false) continue;
        const sc = s.color ?? {};
        let sColor: string | null = null;
        if (typeof sc === 'object' && 'value' in sc && sc.value) {
          sColor = sc.value;
        } else {
          sColor = colorCss(sc);
        }
        if (!sColor) continue;
        const sx = px(s.x ?? 0);
        const sy = px(s.y ?? 0);
        const sblur = px(s.blur ?? 0);
        const sspread = px(s.spread ?? 0);
        const inset = s.inset ? 'inset ' : '';
        const spreadStr = sspread ? ` ${sspread}px` : '';
        shadowParts.push(`${inset}${sx}px ${sy}px ${sblur}px${spreadStr} ${sColor}`);
      }
      if (shadowParts.length) shadow = shadowParts.join(',');
    }
    if (shadow) {
      annot.css['box-shadow'] = shadow;
    }

    let border = extractBorder(effects);
    // artboard 格式: effects.borders 直接有 size/color 结构
    if (!border && typeof effects === 'object') {
      const bordersList = (effects.borders ?? []) as SketchEffect[];
      for (const b of bordersList) {
        if (b.isEnabled === false) continue;
        const bsize = px(b.size ?? 1);
        const bc = b.color ?? {};
        let bColor: string | null = null;
        if (typeof bc === 'object' && 'value' in bc && bc.value) {
          bColor = bc.value;
        } else {
          bColor = colorCss(bc);
        }
        if (bColor) {
          border = `${bsize}px solid ${bColor}`;
          break;
        }
      }
    }
    if (border) {
      annot.css.border = border;
    }

    // 文本层处理
    let textContent = '';
    let isSlice = false;
    let sliceUrl = '';

    const images = L.images ?? {};
    if (images.png_xxxhd || images.svg) {
      isSlice = true;
      sliceUrl = images.png_xxxhd || images.svg;
      const localName = `${(name || '').replace(/\//g, '_').replace(/ /g, '_')}.png`;
      const localPath = `./assets/slices/${localName}`;
      imageUrlMapping[localPath] = sliceUrl;
      annot.sliceUrl = sliceUrl;
    }

    if (ltype === 'textLayer' && (L.textInfo || L.text)) {
      const ti = L.textInfo as SketchTextInfo | undefined;
      const artText = L.text;

      if (ti) {
        // board 格式处理
        textContent = ti.text ?? '';
        annot.text = textContent;
        props.push('z-index:10');

        const textColor = colorCss(ti.color ?? null, opacity);
        if (textColor) {
          props.push(`color:${textColor}`);
          annot.css.color = textColor;
        }

        const fontSize = px(ti.size ?? 0);
        if (fontSize) {
          props.push(`font-size:${fontSize}px`);
          annot.css['font-size'] = `${fontSize}px`;
        }

        const fontName = ti.fontPostScriptName || ti.fontName || '';
        if (fontName) {
          props.push(
            `font-family:"${fontName}","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`
          );
          annot.css['font-family'] = fontName;
        }

        const fontWeightParsed = parseFontWeight(ti.fontStyleName ?? '');
        if (fontWeightParsed) {
          props.push(`font-weight:${fontWeightParsed}`);
          annot.css['font-weight'] = String(fontWeightParsed);
        } else if (ti.fontStyleName) {
          annot.css['font-weight'] = ti.fontStyleName;
        }
        if (ti.bold && !fontWeightParsed) props.push('font-weight:bold');
        if (ti.italic) props.push('font-style:italic');

        const just = ti.justification ?? 'left';
        if (just !== 'left') {
          props.push(`text-align:${just}`);
          annot.css['text-align'] = just;
        }

        const lines = textContent.split('\r').filter(Boolean);
        const lineCount = Math.max(lines.length, 1);
        if (lineCount > 1 && h > 0 && fontSize > 0) {
          const lh = Math.round((h / lineCount) * 10) / 10;
          props.push(`line-height:${lh}px`);
        } else {
          props.push('line-height:1');
        }
        props.push('white-space:pre-wrap');
        props.push('overflow:hidden');
        props.push('word-break:break-all');
      } else if (artText && typeof artText === 'object') {
        // artboard 格式处理
        textContent = artText.value ?? '';
        annot.text = textContent;
        props.push('z-index:10');

        const artStyle = (artText.style ?? {}) as SketchArtTextStyle;

        // 颜色
        const artColor = artStyle.color;
        if (artColor && typeof artColor === 'object' && 'value' in artColor && artColor.value) {
          props.push(`color:${artColor.value}`);
          annot.css.color = artColor.value;
        }

        // 字体
        const artFont = artStyle.font ?? {};
        const fontSizeVal = artFont.size ?? 0;
        const fontSize = px(fontSizeVal);
        if (fontSize) {
          props.push(`font-size:${fontSize}px`);
          annot.css['font-size'] = `${fontSize}px`;
        }

        const fontPsName = artFont.postScriptName ?? '';
        const fontName = artFont.name ?? fontPsName;
        if (fontName) {
          props.push(
            `font-family:"${fontName}","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`
          );
          annot.css['font-family'] = fontName;
        }

        const fontWeight = artFont.fontWeight ?? 0;
        if (fontWeight) {
          props.push(`font-weight:${fontWeight}`);
          annot.css['font-weight'] = String(fontWeight);
        }

        const fontType = artFont.type ?? '';
        const fwParsed = parseFontWeight(fontType);
        if (fwParsed && !fontWeight) {
          props.push(`font-weight:${fwParsed}`);
          annot.css['font-weight'] = String(fwParsed);
        }

        const align = artFont.align ?? 'left';
        if (align && align !== 'left') {
          props.push(`text-align:${align}`);
          annot.css['text-align'] = align;
        }

        const lineHeight = artFont.lineHeight;
        const lhPx = typeof lineHeight === 'object' && lineHeight !== null
          ? px(lineHeight.value ?? 0)
          : px(lineHeight ?? 0);
        if (lhPx) {
          props.push(`line-height:${lhPx}px`);
        } else {
          props.push('line-height:1');
        }
        props.push('white-space:pre-wrap');
        props.push('overflow:hidden');
        props.push('word-break:break-all');
      }
    } else if (isSlice) {
      props.push('z-index:5');
    } else {
      // 填充色
      const fill = (L.fill ?? {}) as { color?: SketchColor };
      let fillColor = colorCss(fill.color, opacity);
      // artboard 格式: effects.fills
      if (!fillColor && typeof effects === 'object') {
        const fills = (effects.fills ?? []) as Array<{ isEnabled?: boolean; type?: string; color?: SketchColor & { value?: string } }>;
        for (const fItem of fills) {
          if (fItem.isEnabled === false) continue;
          if (fItem.type === 'color') {
            const fc = fItem.color;
            if (fc && typeof fc === 'object' && 'value' in fc && fc.value) {
              fillColor = fc.value;
              break;
            } else if (fc) {
              fillColor = colorCss(fc, opacity);
              if (fillColor) break;
            }
          }
        }
      }
      if (fillColor) {
        annot.css['background-color'] = fillColor;
      }
    }

    // 构建 CSS 属性中的 box-shadow / border
    if (shadow) props.push(`box-shadow:${shadow}`);
    if (border) props.push(`border:${border}`);
    if (annot.css['background-color']) props.push(`background-color:${annot.css['background-color']}`);

    cssRules.push(`.${cls}{${props.join(';')}}`);

    const safeName = (name || '').replace(/"/g, '&quot;');
    const cssData = Object.entries(annot.css)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    const safeCss = cssData.replace(/"/g, '&quot;');

    if (textContent) {
      const safeText = textContent
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r/g, '\n');
      htmlParts.push(
        `<div class="${cls}" title="${safeName}" data-css="${safeCss}">${safeText}</div>`
      );
    } else if (isSlice) {
      htmlParts.push(
        `<img class="${cls}" title="${safeName}" data-css="${safeCss}" src="${sliceUrl}" referrerpolicy="no-referrer" />`
      );
    } else {
      htmlParts.push(
        `<div class="${cls}" title="${safeName}" data-css="${safeCss}"></div>`
      );
    }

    layerAnnotations.push(annot);
  }

  const bgStyle = designImgUrl
    ? `;background:url(${designImgUrl}) no-repeat;background-size:${boardW}px ${boardH}px`
    : '';

  const html =
    `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
    `<meta name="referrer" content="no-referrer">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1.0">` +
    `<title>Design</title><style>` +
    `*{margin:0;padding:0;box-sizing:border-box}img{display:block}` +
    `.design{position:relative;width:${boardW}px;height:${boardH}px;overflow:hidden;margin:0 auto${bgStyle}}\n` +
    cssRules.join('\n') +
    `</style></head><body><div class="design">\n` +
    htmlParts.join('\n') +
    `\n</div></body></html>`;

  return [html, imageUrlMapping, layerAnnotations];
}
