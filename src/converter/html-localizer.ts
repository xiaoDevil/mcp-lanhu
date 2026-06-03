import { URL } from 'node:url';

/**
 * 将生成的 HTML 中的远程图片 URL 替换为本地路径占位符
 * 返回 [替换后的HTML, 下载映射表]
 */
export function localizeImageUrls(
  htmlCode: string,
  designName: string
): [string, Record<string, string>] {
  const urlToLocalpath = new Map<string, string>();
  const urlMapping: Record<string, string> = {};
  const usedNames = new Set<string>();
  let counter = 0;

  function getExt(remoteUrl: string): string {
    try {
      const url = new URL(remoteUrl);
      const path = url.pathname;
      const lastPart = path.split('/').pop() ?? '';
      if (lastPart.includes('.')) {
        const ext = '.' + lastPart.split('.').pop()!.toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
          return ext;
        }
      }
    } catch {
      // ignore
    }
    return '.png';
  }

  function sanitize(name: string): string {
    return name.replace(/-\d+$/, '');
  }

  function uniqueName(base: string, ext: string): string {
    let candidate = `${base}${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    let i = 2;
    while (true) {
      candidate = `${base}_${i}${ext}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
      i++;
    }
  }

  function getLocalpath(remoteUrl: string, hintClass?: string): string {
    const existing = urlToLocalpath.get(remoteUrl);
    if (existing) return existing;

    const ext = getExt(remoteUrl);
    const base = hintClass ? sanitize(hintClass) : `img_${++counter}`;
    const name = uniqueName(base, ext);
    const localPath = `./assets/slices/${name}`;

    urlMapping[localPath] = remoteUrl;
    urlToLocalpath.set(remoteUrl, localPath);
    return localPath;
  }

  // Step 1: 从 CSS 规则中收集 url -> class_name 映射
  const urlToCssClass = new Map<string, string>();
  const cssBlock = htmlCode.match(/<style>([\s\S]*?)<\/style>/);
  if (cssBlock) {
    const ruleRegex = /\.([\w-]+)\s*\{([^}]*)\}/g;
    let ruleMatch;
    while ((ruleMatch = ruleRegex.exec(cssBlock[1])) !== null) {
      const cls = ruleMatch[1];
      const urlRegex = /url\(['"]?(https?:\/\/[^'") ]+)['"]?/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(ruleMatch[2])) !== null) {
        if (!urlToCssClass.has(urlMatch[1])) {
          urlToCssClass.set(urlMatch[1], cls);
        }
      }
    }
  }

  // Step 2: 替换 <img src="...">
  function replaceImgTag(tagMatch: string): string {
    const srcMatch = tagMatch.match(/src=["']?(https?:\/\/[^"'\s>]+)["']?/);
    if (!srcMatch) return tagMatch;

    const url = srcMatch[1];
    const clsMatch =
      tagMatch.match(/class="([^"]+)"/) ?? tagMatch.match(/class=([^\s>]+)/);
    const hint = clsMatch
      ? clsMatch[1].split(' ')[0]
      : urlToCssClass.get(url);
    const localPath = getLocalpath(url, hint);

    return (
      tagMatch.substring(0, srcMatch.index!) +
      `src="${localPath}"` +
      tagMatch.substring(srcMatch.index! + srcMatch[0].length)
    );
  }

  let result = htmlCode.replace(/<img\b[^>]*>/g, replaceImgTag);

  // Step 3: 替换 CSS url(...) 背景图
  result = result.replace(
    /url\((['"]*https?:\/\/[^)]*)\)/g,
    (match, urlStr) => {
      const url = urlStr.replace(/['"]/g, '').trim();
      if (!url || !url.startsWith('http')) return match;
      const hint = urlToCssClass.get(url);
      const localPath = getLocalpath(url, hint);
      return `url('${localPath}')`;
    }
  );

  return [result, urlMapping];
}
