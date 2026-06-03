import type { DesignNode } from '../types/design.js';
import { COMMON_CSS_FOR_DESIGN } from '../config/constants.js';
import { generateCss } from './css/css-generator.js';
import { generateHtml } from './css/html-generator.js';

/**
 * 将蓝湖设计图 JSON 转换为 HTML+CSS
 */
export function convertLanhuToHtml(jsonData: DesignNode): string {
  const cssRules: Record<string, string> = {};

  // 生成 CSS
  generateCss(jsonData, cssRules);

  // 组装 CSS 字符串
  const cssParts: string[] = [];
  for (const [className, props] of Object.entries(cssRules)) {
    if (props) {
      cssParts.push(`.${className} {\n${props}\n}`);
    } else {
      cssParts.push(`.${className} {\n}`);
    }
  }

  const cssString = cssParts.join('\n\n') + COMMON_CSS_FOR_DESIGN;

  // 生成 HTML
  const bodyHtml = generateHtml(jsonData, 4);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
${cssString}
    </style>
  </head>
  <body>
${bodyHtml}
  </body>
</html>`;
}
