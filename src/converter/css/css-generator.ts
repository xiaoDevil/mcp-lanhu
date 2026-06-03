import type { DesignNode } from '../../types/design.js';
import { camelToKebab, formatCssValue, mergePadding, mergeMargin } from './css-utils.js';
import { getFlexClasses } from './flex-utils.js';

/**
 * 清理样式，移除被 flex 类覆盖的标准值
 */
export function cleanStyles(
  node: DesignNode,
  flexClasses: string[]
): Record<string, unknown> {
  const nodeProps = node.props ?? {};
  const propsStyle = (nodeProps.style as Record<string, unknown>) ?? {};
  const styles: Record<string, unknown> = {};

  // 定义被 flex 类完全覆盖的标准值
  const standardJustify = new Set([
    'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly',
  ]);
  const standardAlign = new Set(['flex-start', 'center', 'flex-end']);

  for (const [key, value] of Object.entries(propsStyle)) {
    // 跳过 display 和 flexDirection（由 flex-col/flex-row 类完全覆盖）
    if (key === 'display' || key === 'flexDirection') {
      if (flexClasses.length > 0) continue;
    }

    // justifyContent: 只跳过标准值
    if (key === 'justifyContent' && flexClasses.length > 0) {
      if (standardJustify.has(value as string)) continue;
    }

    // alignItems: 只跳过标准值
    if (key === 'alignItems' && flexClasses.length > 0) {
      if (standardAlign.has(value as string)) continue;
    }

    // 跳过 static 定位
    if (key === 'position' && value === 'static') continue;

    // 跳过 visible 溢出
    if (key === 'overflow' && value === 'visible') continue;

    styles[key] = value;
  }

  // 合并 padding 和 margin
  if (
    ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some(
      (k) => k in styles
    )
  ) {
    mergePadding(styles);
  }
  if (
    ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].some(
      (k) => k in styles
    )
  ) {
    mergeMargin(styles);
  }

  return styles;
}

/**
 * 获取节点的 loop 数据
 */
function getLoopArr(node: DesignNode): unknown[] {
  if (!node) return [];
  const arr = node.loop ?? node.loopData;
  return Array.isArray(arr) ? arr : [];
}

/**
 * 递归生成 CSS 规则
 */
export function generateCss(
  node: DesignNode | null | undefined,
  cssRules: Record<string, string>,
  loopSuffixes?: string[] | null
): void {
  if (!node) return;

  let currentLoopSuffixes = loopSuffixes;
  const loopArr = node.loopType ? getLoopArr(node) : [];
  if (loopArr.length > 0 && !currentLoopSuffixes) {
    currentLoopSuffixes = loopArr.map((_, i) => String(i));
  }

  const nodeProps = node.props ?? {};
  const className = nodeProps.className as string | undefined;

  if (className) {
    const flexClasses = getFlexClasses(node);
    const styles = cleanStyles(node, flexClasses);
    const styleEntries = Object.entries(styles);

    if (styleEntries.length > 0 || node.type === 'lanhutext') {
      const cssProps: string[] = [];
      for (const [key, value] of styleEntries) {
        const cssKey = camelToKebab(key);
        const cssValue = formatCssValue(key, value);
        if (cssValue) {
          cssProps.push(`  ${cssKey}: ${cssValue};`);
        }
      }
      const content = cssProps.length > 0 ? cssProps.join('\n') : '';

      if (currentLoopSuffixes && currentLoopSuffixes.length > 0) {
        for (const suf of currentLoopSuffixes) {
          cssRules[`${className}-${suf}`] = content;
        }
      } else {
        cssRules[className] = content;
      }
    }
  }

  const children = node.children ?? [];
  for (const child of children) {
    generateCss(child, cssRules, currentLoopSuffixes);
  }
}
