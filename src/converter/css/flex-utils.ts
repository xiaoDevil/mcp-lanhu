import type { DesignNode } from '../../types/design.js';

/**
 * 判断节点是否使用 flex 布局
 */
export function shouldUseFlex(node: DesignNode | null | undefined): boolean {
  if (!node) return false;

  const nodeStyle = node.style ?? {};
  const nodeProps = node.props ?? {};
  const nodePropsStyle = (nodeProps.style as Record<string, unknown>) ?? {};
  const style = { ...nodeStyle, ...nodePropsStyle };

  return style.display === 'flex' || style.flexDirection !== undefined;
}

/**
 * 获取 flex 相关的 CSS 类名列表
 */
export function getFlexClasses(node: DesignNode | null | undefined): string[] {
  const classes: string[] = [];
  if (!shouldUseFlex(node)) return classes;

  const nodeStyle = node!.style ?? {};
  const nodeProps = node!.props ?? {};
  const nodePropsStyle = (nodeProps.style as Record<string, unknown>) ?? {};
  const style = { ...nodeStyle, ...nodePropsStyle };
  const className = (nodeProps.className as string) ?? '';

  // Flex 方向
  const flexDirection = style.flexDirection as string;
  if (flexDirection === 'column' || className.includes('flex-col')) {
    classes.push('flex-col');
  } else if (flexDirection === 'row' || className.includes('flex-row')) {
    classes.push('flex-row');
  }

  // 主轴对齐
  const alignJustify = node!.alignJustify as Record<string, string> | undefined;
  const justify = alignJustify?.justifyContent ?? (style.justifyContent as string);
  if (justify === 'space-between') {
    classes.push('justify-between');
  } else if (justify === 'center') {
    classes.push('justify-center');
  } else if (justify === 'flex-end') {
    classes.push('justify-end');
  } else if (justify === 'flex-start') {
    classes.push('justify-start');
  } else if (justify === 'space-around') {
    classes.push('justify-around');
  } else if (justify === 'space-evenly') {
    classes.push('justify-evenly');
  }

  // 交叉轴对齐
  const align = alignJustify?.alignItems ?? (style.alignItems as string);
  if (align === 'flex-start') {
    classes.push('align-start');
  } else if (align === 'center') {
    classes.push('align-center');
  } else if (align === 'flex-end') {
    classes.push('align-end');
  }

  return classes;
}
