import { UNITLESS_PROPERTIES } from '../../config/constants.js';

/**
 * 驼峰命名转换为 CSS 短横线命名
 * 例: fontSize -> font-size
 */
export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * 格式化 CSS 值，自动添加 px 单位
 */
export function formatCssValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    if (value === 0) return '0';
    return UNITLESS_PROPERTIES.has(key) ? String(value) : `${value}px`;
  }

  if (typeof value === 'string') {
    let strValue = value;
    // 处理 rgba 格式
    if (strValue.includes('rgba(')) {
      strValue = strValue.replace(
        /rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g,
        (_, r, g, b, a) => {
          const alpha = a.includes('.') ? parseFloat(a) : parseInt(a, 10);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      );
    }

    // 检查字符串形式的数字
    if (/^\d+$/.test(strValue) && !UNITLESS_PROPERTIES.has(key)) {
      return strValue === '0' ? '0' : `${strValue}px`;
    }
    return strValue;
  }

  return String(value);
}

/**
 * 合并 padding 四边属性
 */
export function mergePadding(styles: Record<string, unknown>): void {
  const pt = styles.paddingTop as number | undefined;
  const pr = styles.paddingRight as number | undefined;
  const pb = styles.paddingBottom as number | undefined;
  const pl = styles.paddingLeft as number | undefined;

  if (pt !== undefined && pr !== undefined && pb !== undefined && pl !== undefined) {
    const ptVal = pt || 0;
    const prVal = pr || 0;
    const pbVal = pb || 0;
    const plVal = pl || 0;

    if (ptVal === pbVal && plVal === prVal) {
      if (ptVal === plVal) {
        styles.padding = `${ptVal}px`;
      } else {
        styles.padding = `${ptVal}px ${prVal}px`;
      }
    } else {
      styles.padding = `${ptVal}px ${prVal}px ${pbVal}px ${plVal}px`;
    }

    delete styles.paddingTop;
    delete styles.paddingRight;
    delete styles.paddingBottom;
    delete styles.paddingLeft;
  }
}

/**
 * 合并 margin 四边属性
 */
export function mergeMargin(styles: Record<string, unknown>): void {
  const mt = styles.marginTop as number | undefined;
  const mr = styles.marginRight as number | undefined;
  const mb = styles.marginBottom as number | undefined;
  const ml = styles.marginLeft as number | undefined;

  if (mt !== undefined || mr !== undefined || mb !== undefined || ml !== undefined) {
    const mtVal = mt || 0;
    const mrVal = mr || 0;
    const mbVal = mb || 0;
    const mlVal = ml || 0;

    if (mtVal === 0 && mrVal === 0 && mbVal === 0 && mlVal === 0) {
      // 全是 0，不输出
    } else if (mtVal === mbVal && mlVal === mrVal) {
      if (mtVal === mlVal) {
        styles.margin = `${mtVal}px`;
      } else {
        styles.margin = `${mtVal}px ${mrVal}px`;
      }
    } else {
      styles.margin = `${mtVal}px ${mrVal}px ${mbVal}px ${mlVal}px`;
    }

    delete styles.marginTop;
    delete styles.marginRight;
    delete styles.marginBottom;
    delete styles.marginLeft;
  }
}
