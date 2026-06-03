import { CHINA_TZ_OFFSET } from '../config/constants.js';

/**
 * 将 RFC 2822 日期字符串转换为中国时区格式
 * 例: 'Fri, 09 Jan 2026 10:07:29 GMT' -> '2026-01-09 18:07:29'
 */
export function formatLanhuRfc2822(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return value;
    return formatChinaDate(dt);
  } catch {
    return value;
  }
}

/**
 * 将 ISO 8601 日期字符串转换为中国时区格式
 */
export function formatIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const dt = new Date(value.replace('Z', '+00:00'));
    if (isNaN(dt.getTime())) return value;
    return formatChinaDate(dt);
  } catch {
    return value;
  }
}

/**
 * 将 Date 对象或日期字符串格式化为中国时区字符串
 */
export function formatChinaDate(dt: Date | string): string {
  if (typeof dt === 'string') {
    const parsed = new Date(dt.replace('Z', '+00:00'));
    if (isNaN(parsed.getTime())) return dt;
    dt = parsed;
  }
  const chinaTime = new Date(dt.getTime() + CHINA_TZ_OFFSET);
  const year = chinaTime.getUTCFullYear();
  const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getUTCDate()).padStart(2, '0');
  const hours = String(chinaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(chinaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(chinaTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取当前中国时区时间字符串
 */
export function getNowChinaTime(): string {
  return formatChinaDate(new Date());
}
