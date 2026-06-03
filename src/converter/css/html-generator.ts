import type { DesignNode } from '../../types/design.js';
import { getFlexClasses } from './flex-utils.js';

/**
 * 解析 loop 占位符
 * this.item.xxx -> loopItem['xxx']
 */
function resolveLoopPlaceholder(
  value: string,
  loopItem: Record<string, unknown>
): string {
  if (!value || !loopItem) return value || '';
  const s = String(value).trim();
  const m = s.match(/^this\.item\.(\w+)$/);
  return m ? String(loopItem[m[1]] ?? '') : value;
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
 * 递归生成 HTML 结构
 */
export function generateHtml(
  node: DesignNode | null | undefined,
  indent: number = 2,
  loopContext?: [unknown[], number] | null
): string {
  if (!node) return '';

  const loopItem = loopContext ? (loopContext[0][loopContext[1]] as Record<string, unknown>) : null;
  const loopIndex = loopContext ? loopContext[1] : null;

  const spaces = ' '.repeat(indent);
  const flexClasses = getFlexClasses(node);
  const nodeProps = node.props ?? {};
  let className = (nodeProps.className as string) ?? '';

  if (loopIndex !== null && className) {
    className = `${className}-${loopIndex}`;
  }

  const allClasses = [className, ...flexClasses].filter(Boolean).join(' ');
  const nodeType = node.type;

  // lanhutext -> span
  if (nodeType === 'lanhutext') {
    let text =
      (node.data?.value as string) ?? (nodeProps.text as string) ?? '';
    if (loopItem && text && /^this\.item\.\w+$/.test(text.trim())) {
      text = resolveLoopPlaceholder(text, loopItem);
    } else if (text && /^this\.item\.\w+$/.test(text.trim())) {
      text = '';
    }
    return `${spaces}<span class="${allClasses}">${text}</span>`;
  }

  // lanhuimage -> img
  if (nodeType === 'lanhuimage') {
    let src =
      (node.data?.value as string) ?? (nodeProps.src as string) ?? '';
    if (loopItem && src && /^this\.item\.\w+$/.test(src.trim())) {
      src = resolveLoopPlaceholder(src, loopItem);
    } else if (src && /^this\.item\.\w+$/.test(src.trim())) {
      src = '';
    }
    return `${spaces}<img\n${spaces}  class="${allClasses}"\n${spaces}  referrerpolicy="no-referrer"\n${spaces}  src="${src}"\n${spaces}/>`;
  }

  // lanhubutton -> button
  if (nodeType === 'lanhubutton') {
    const children = node.children ?? [];
    const childrenHtml = children
      .map((c) => generateHtml(c, indent + 2, loopContext))
      .join('\n');
    return `${spaces}<button class="${allClasses}">\n${childrenHtml}\n${spaces}</button>`;
  }

  // 默认 -> div
  const tag = 'div';
  const children = node.children ?? [];
  const loopArr = node.loopType ? getLoopArr(node) : [];

  // 处理循环
  if (loopArr.length > 0 && !loopContext) {
    const parts: string[] = [];
    for (let i = 0; i < loopArr.length; i++) {
      const ctx: [unknown[], number] = [loopArr, i];
      for (const child of children) {
        parts.push(generateHtml(child, indent + 2, ctx));
      }
    }
    const childrenHtml = parts.join('\n');
    return `${spaces}<${tag} class="${allClasses}">\n${childrenHtml}\n${spaces}</${tag}>`;
  }

  // 普通子节点
  if (children.length > 0) {
    const childrenHtml = children
      .map((c) => generateHtml(c, indent + 2, loopContext))
      .join('\n');
    return `${spaces}<${tag} class="${allClasses}">\n${childrenHtml}\n${spaces}</${tag}>`;
  }

  return `${spaces}<${tag} class="${allClasses}"></${tag}>`;
}
