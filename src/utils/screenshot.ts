import { createServer, type Server } from 'node:http';
import { readdir, readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { getConfig } from '../config/env.js';

interface ScreenshotResult {
  page_name: string;
  success: boolean;
  screenshot_path?: string;
  page_text?: string;
  page_design_info?: Record<string, unknown>;
  size?: string;
  from_cache?: boolean;
  base64?: string;
  mime_type?: string;
  error?: string;
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '_');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function startHttpServer(dir: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = req.url ?? '/';
      let filePath = join(dir, decodeURIComponent(url));
      if (filePath.endsWith('/')) filePath = join(filePath, 'index.html');

      readFile(filePath)
        .then((data) => {
          const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
          const mimeTypes: Record<string, string> = {
            html: 'text/html',
            css: 'text/css',
            js: 'application/javascript',
            png: 'image/png',
            jpg: 'image/jpeg',
            svg: 'image/svg+xml',
            json: 'application/json',
          };

          // Axure HTML 预处理：将 data-src 懒加载转为直接加载
          if (ext === 'html') {
            let html = data.toString('utf-8');

            // link/img/script data-src → href/src（CSS/JS/图片直接加载）
            html = html.replace(/(<link\b[^>]*?)\bdata-src=/g, '$1href=');
            html = html.replace(/(<img\b[^>]*?)\bdata-src=/g, '$1src=');
            html = html.replace(/(<script\b[^>]*?)\bdata-src=/g, '$1src=');

            // 移除 body 的隐藏样式
            html = html.replace(
              /<body\s+style="display:\s*none;\s*opacity:\s*0;\s*">/,
              '<body>'
            );

            // 移除 loadJS + 外部 CDN 加载代码
            html = html.replace(
              /<script>\s*function loadJS[\s\S]*?<\/script>\s*<script>\s*loadJS\([\s\S]*?<\/script>\s*<\/head>/,
              '</head>'
            );

            data = Buffer.from(html, 'utf-8');
          }

          res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('Not found');
        });
    });

    // 随机端口
    const port = 8800 + Math.floor(Math.random() * 100);
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
  });
}

const PAGE_EVAL_SCRIPT = `() => {
  let sections = [];

  // 1. 红色文本（产品关键提示）
  const redTexts = Array.from(document.querySelectorAll('*')).filter(el => {
    const style = window.getComputedStyle(el);
    const color = style.color;
    return color && (
      color.includes('rgb(255, 0, 0)') ||
      color.includes('rgb(255,0,0)') ||
      color === 'red'
    );
  });
  if (redTexts.length > 0) {
    const redContent = redTexts
      .map(el => el.textContent.trim())
      .filter(t => t.length > 0 && t.length < 200)
      .filter((v, i, a) => a.indexOf(v) === i);
    if (redContent.length > 0) {
      sections.push("[Important Tips/Warnings]\\n" + redContent.join("\\n"));
    }
  }

  // 2. Axure形状文本
  const axureShapes = document.querySelectorAll('[id^="u"], .ax_shape, .shape, [class*="shape"]');
  const shapeTexts = [];
  axureShapes.forEach(el => {
    const text = el.textContent.trim();
    if (text && text.length > 0 && text.length < 100) {
      shapeTexts.push(text);
    }
  });
  if (shapeTexts.length > 5) {
    const uniqueShapes = [...new Set(shapeTexts)];
    sections.push("[Flowchart/Component Text]\\n" + uniqueShapes.slice(0, 20).join(" | "));
  }

  // 3. 全页面文本
  const bodyText = document.body.innerText || '';
  if (bodyText.trim()) {
    sections.push("[Full Page Text]\\n" + bodyText.trim());
  }

  if (sections.length === 0) {
    return "⚠️ Page text is empty or cannot be extracted (please refer to visual output)";
  }
  return sections.join("\\n\\n");
}`;

const DESIGN_INFO_SCRIPT = `() => {
  const allEls = document.querySelectorAll('*');
  const textColors = {};
  const bgColors = {};
  const fontSpecs = {};
  const images = [];

  allEls.forEach(el => {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const hasDirectText = Array.from(el.childNodes).some(
      n => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (hasDirectText) {
      const color = cs.color;
      if (color) textColors[color] = (textColors[color] || 0) + 1;
      const key = cs.fontSize + '|' + cs.fontWeight + '|' + color;
      fontSpecs[key] = (fontSpecs[key] || 0) + 1;
    }

    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      bgColors[bg] = (bgColors[bg] || 0) + 1;
    }

    const bgImg = cs.backgroundImage;
    if (bgImg && bgImg !== 'none') {
      const m = bgImg.match(/url\\("?([^"\\)]*)"?\\)/);
      if (m && !m[1].startsWith('data:')) {
        images.push({ src: m[1], type: 'bg', w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    }
  });

  document.querySelectorAll('img').forEach(img => {
    if (img.src && img.naturalWidth > 0 && !img.src.startsWith('data:')) {
      images.push({ src: img.src, type: 'img', w: img.naturalWidth, h: img.naturalHeight });
    }
  });

  const sortObj = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return {
    textColors: sortObj(textColors).slice(0, 15),
    bgColors: sortObj(bgColors).slice(0, 10),
    fontSpecs: sortObj(fontSpecs).slice(0, 15),
    images: images.slice(0, 30)
  };
}`;

export async function screenshotPages(
  resourceDir: string,
  pageNames: string[],
  outputDir: string,
  returnBase64 = false,
  versionId?: string
): Promise<ScreenshotResult[]> {
  const config = getConfig();
  await mkdir(outputDir, { recursive: true });

  // 缓存元数据
  const cacheMetaPath = join(outputDir, '.screenshot_cache.json');
  let cacheMeta: Record<string, unknown> = {};
  try {
    const content = await readFile(cacheMetaPath, 'utf-8');
    cacheMeta = JSON.parse(content);
  } catch {
    cacheMeta = {};
  }

  const cachedVersion = cacheMeta.version_id as string | undefined;
  const pagesToRender: string[] = [];
  const cachedResults: ScreenshotResult[] = [];

  // 页面名 → 文件名映射（用 index 避免中文路径冲突）
  const safeNameMap = new Map<string, string>();
  for (let i = 0; i < pageNames.length; i++) {
    safeNameMap.set(pageNames[i], `page_${String(i + 1).padStart(3, '0')}`);
  }

  for (let i = 0; i < pageNames.length; i++) {
    const pageName = pageNames[i];
    const safeName = safeNameMap.get(pageName)!;
    const screenshotFile = join(outputDir, `${safeName}.png`);
    const textFile = join(outputDir, `${safeName}.txt`);
    const stylesFile = join(outputDir, `${safeName}_styles.json`);

    if (versionId && cachedVersion === versionId && await fileExists(screenshotFile)) {
      let pageText = '';
      try {
        pageText = await readFile(textFile, 'utf-8');
      } catch {
        pageText = '(Cached result)';
      }

      let pageDesignInfo: Record<string, unknown> | undefined;
      try {
        const content = await readFile(stylesFile, 'utf-8');
        pageDesignInfo = JSON.parse(content);
      } catch {
        // ignore
      }

      cachedResults.push({
        page_name: pageName,
        success: true,
        screenshot_path: screenshotFile,
        page_text: pageText,
        page_design_info: pageDesignInfo,
        from_cache: true,
      });
    } else {
      pagesToRender.push(pageName);
    }
  }

  const results = [...cachedResults];
  if (!pagesToRender.length) return results;

  // 启动HTTP服务器
  const { server, port } = await startHttpServer(resourceDir);

  let browser: Browser | null = null;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (launchErr) {
      const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
      if (msg.includes('Executable') || msg.includes('browser') || msg.includes('not found') || msg.includes('launch')) {
        throw new Error(
          'Playwright 浏览器未安装，请执行: npx playwright install chromium\n' +
          `原始错误: ${msg}`
        );
      }
      throw launchErr;
    }
    const page = await browser.newPage({
      viewport: { width: config.viewportWidth, height: config.viewportHeight },
    });

    for (const pageName of pagesToRender) {
      try {
        // 查找HTML文件
        const files = await readdir(resourceDir);
        let htmlFile: string | null = null;
        for (const f of files) {
          if (f.endsWith('.html') && f.replace('.html', '') === pageName) {
            htmlFile = f;
            break;
          }
        }

        if (!htmlFile) {
          results.push({ page_name: pageName, success: false, error: `Page ${pageName} does not exist` });
          continue;
        }

        const url = `http://localhost:${port}/${htmlFile}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // 提取文本
        const pageText = await page.evaluate(`(${PAGE_EVAL_SCRIPT})()`) as string;

        // 提取设计样式信息
        const pageDesignInfo = await page.evaluate(`(${DESIGN_INFO_SCRIPT})()`) as Record<string, unknown>;

        // 截图
        const safeName = safeNameMap.get(pageName) ?? sanitizeName(pageName);
        const screenshotPath = join(outputDir, `${safeName}.png`);
        const textPath = join(outputDir, `${safeName}.txt`);
        const stylesPath = join(outputDir, `${safeName}_styles.json`);

        const screenshotBuffer = await page.screenshot({ fullPage: true });

        await writeFile(screenshotPath, screenshotBuffer);
        try {
          await writeFile(textPath, pageText, 'utf-8');
        } catch {
          // ignore
        }
        try {
          await writeFile(stylesPath, JSON.stringify(pageDesignInfo), 'utf-8');
        } catch {
          // ignore
        }

        const result: ScreenshotResult = {
          page_name: pageName,
          success: true,
          screenshot_path: screenshotPath,
          page_text: pageText,
          page_design_info: pageDesignInfo,
          size: `${(screenshotBuffer.length / 1024).toFixed(1)}KB`,
          from_cache: false,
        };

        if (returnBase64) {
          result.base64 = screenshotBuffer.toString('base64');
          result.mime_type = 'image/png';
        }

        results.push(result);
      } catch (e) {
        results.push({
          page_name: pageName,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await browser.close();
  } finally {
    server.close();
  }

  // 更新缓存元数据
  if (versionId) {
    try {
      const nameMapping: Record<string, string> = {};
      for (const [k, v] of safeNameMap) nameMapping[k] = v;
      await writeFile(cacheMetaPath, JSON.stringify({ version_id: versionId, cached_pages: pageNames, name_mapping: nameMapping }, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  return results;
}
