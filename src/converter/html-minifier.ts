/**
 * 压缩 CSS：去掉注释、折叠空白
 */
export function minifyCss(css: string): string {
  let result = css.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\s+/g, ' ');
  return result.trim();
}

/**
 * 压缩 HTML+CSS
 * 用于减少返回体体积和 token 消耗
 */
export function minifyHtml(html: string): string {
  // 先压缩 <style> 内 CSS
  let result = html.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/g,
    (_, inner) => `<style>\n${minifyCss(inner)}\n</style>`
  );

  // 移除 HTML 注释（但保留条件注释）
  result = result.replace(/<!--(?!\[)[\s\S]*?-->/g, '');

  // 折叠多余的空白
  result = result.replace(/>\s+</g, '><');

  // 移除行首行尾空白
  result = result
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return result;
}
