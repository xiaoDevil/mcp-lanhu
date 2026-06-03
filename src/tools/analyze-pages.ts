import { z } from 'zod';
import { join, basename } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { LanhuExtractor } from '../client/lanhu-extractor.js';
import { screenshotPages } from '../utils/screenshot.js';
import { getConfig } from '../config/env.js';

export const analyzePagesSchema = {
  url: z.string().describe(
    'Lanhu URL with docId parameter. Example: https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx.'
  ),
  page_names: z.union([z.string(), z.array(z.string())]).describe(
    'Page name(s) to analyze. Use "all" for all pages, single name, or list. Get exact names from lanhu_get_pages first!'
  ),
  mode: z.enum(['text_only', 'full']).default('full').describe(
    'Analysis mode: "text_only" (text only) or "full" (screenshots + text). Default: "full"'
  ),
  image_mode: z.enum(['auto', 'direct', 'mcp_assisted', 'text_only_images']).default('auto').describe(
    'How to handle screenshots in full mode. "auto" = resolve from config (default direct); "direct" = inline base64 for multimodal LLM; "mcp_assisted" = return file paths for external image MCP tool; "text_only_images" = skip images. Default: "auto"'
  ),
  image_mcp_tool: z.string().optional().describe(
    'MCP tool name for image analysis when image_mode=mcp_assisted. Example: "mcp__zai-mcp-server__analyze_image"'
  ),
};

type ImageMode = 'direct' | 'mcp_assisted' | 'text_only_images';

function resolveImageMode(imageMode: string): ImageMode {
  if (imageMode === 'direct' || imageMode === 'mcp_assisted' || imageMode === 'text_only_images') {
    return imageMode;
  }
  const config = getConfig();
  if (config.imageMode === 'auto') return 'direct';
  return config.imageMode;
}

interface ScreenshotResult {
  page_name: string;
  success: boolean;
  screenshot_path?: string;
  page_text?: string;
  from_cache?: boolean;
  error?: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成整合 Markdown 文件：所有页面的截图（base64 嵌入）+ 文本按顺序合并到一个文件
 */
async function generateConsolidatedDocument(
  results: ScreenshotResult[],
  outputDir: string,
  documentName: string,
  filenameToDisplay: Map<string, string>,
  versionId: string,
): Promise<string> {
  const successResults = results.filter((r) => r.success);

  let md = `# ${documentName}\n\n`;
  md += `> Version: ${versionId.slice(0, 8)}...\n`;
  md += `> 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
  md += `> 总页数: ${successResults.length}\n\n`;
  md += `---\n\n`;

  for (let idx = 0; idx < successResults.length; idx++) {
    const r = successResults[idx];
    const displayName = filenameToDisplay.get(r.page_name) ?? r.page_name;

    md += `## ${idx + 1}. ${displayName}\n\n`;

    // 引用截图文件路径（相对路径）
    if (r.screenshot_path) {
      const screenshotFilename = basename(r.screenshot_path);
      md += `![${displayName}](${screenshotFilename})\n\n`;
      md += `> 📷 截图文件: \`${screenshotFilename}\`\n\n`;
    }

    // 页面文字
    if (r.page_text) {
      md += `### 页面文字\n\n${r.page_text}\n\n`;
    } else {
      md += `### 页面文字\n\n⚠️ 未提取到文字内容\n\n`;
    }

    md += `---\n\n`;
  }

  // 失败页面
  const failedPages = results.filter((r) => !r.success);
  if (failedPages.length) {
    md += `## ⚠️ 失败的页面\n\n`;
    for (const r of failedPages) {
      const displayName = filenameToDisplay.get(r.page_name) ?? r.page_name;
      md += `- **${displayName}**: ${r.error ?? '未知错误'}\n`;
    }
    md += '\n';
  }

  const outputPath = join(outputDir, 'requirement_full.md');
  await writeFile(outputPath, md, 'utf-8');
  return outputPath;
}

export async function analyzePages(
  args: {
    url: string;
    page_names: string | string[];
    mode: 'text_only' | 'full';
    image_mode: 'auto' | 'direct' | 'mcp_assisted' | 'text_only_images';
    image_mcp_tool?: string;
  },
): Promise<Array<string | { type: 'image'; data: string; mimeType: string }>> {
  const extractor = new LanhuExtractor();
  const config = getConfig();

  const params = extractor.parseUrl(args.url);
  const docId = params.doc_id;

  const resourceDir = join(config.dataDir, `axure_extract_${docId!.slice(0, 8)}`);
  const outputDir = join(config.dataDir, `axure_extract_${docId!.slice(0, 8)}_screenshots`);

  // 下载资源
  const downloadResult = await extractor.downloadResources(args.url, resourceDir);

  // 获取页面列表
  const pagesInfo = await extractor.getPagesList(args.url);
  const allPages = (pagesInfo.pages ?? []) as Array<{ name: string; filename: string }>;
  const documentName = (pagesInfo.document_name ?? 'Unknown') as string;

  // 处理 page_names 参数
  const pageMap = new Map<string, string>();
  for (const p of allPages) {
    pageMap.set(p.name, p.filename.replace('.html', ''));
  }

  let targetPages: string[];
  let targetPageNames: string[];

  if (typeof args.page_names === 'string') {
    if (args.page_names.toLowerCase() === 'all') {
      targetPages = allPages.map((p) => p.filename.replace('.html', ''));
      targetPageNames = allPages.map((p) => p.name);
    } else if (pageMap.has(args.page_names)) {
      targetPages = [pageMap.get(args.page_names)!];
      targetPageNames = [args.page_names];
    } else {
      targetPages = [args.page_names];
      targetPageNames = [args.page_names];
    }
  } else {
    targetPages = [];
    targetPageNames = [];
    for (const pn of args.page_names) {
      if (pageMap.has(pn)) {
        targetPages.push(pageMap.get(pn)!);
        targetPageNames.push(pn);
      } else {
        targetPages.push(pn);
        targetPageNames.push(pn);
      }
    }
  }

  // 文件名 → 显示名映射
  const filenameToDisplay = new Map<string, string>();
  for (const p of allPages) {
    filenameToDisplay.set(p.filename.replace('.html', ''), p.name);
  }

  // 截图 + 文字提取
  const versionId = downloadResult.version_id ?? '';
  const results = await screenshotPages(resourceDir, targetPages, outputDir, false, versionId);

  // 生成整合文件（截图 base64 + 文本，按页面顺序合并到单个 Markdown）
  const consolidatedPath = join(outputDir, 'requirement_full.md');
  await generateConsolidatedDocument(
    results, outputDir, documentName, filenameToDisplay, versionId,
  );

  const isTextOnly = args.mode === 'text_only';
  const effectiveImageMode = isTextOnly ? ('text_only_images' as ImageMode) : resolveImageMode(args.image_mode);

  const successResults = results.filter((r) => r.success);
  const failedPages = results.filter((r) => !r.success);
  const cachedCount = results.filter((r) => r.from_cache).length;
  const cacheIndicator = cachedCount === targetPages.length && cachedCount > 0 ? '⚡' : '✓';

  const content: Array<string | { type: 'image'; data: string; mimeType: string }> = [];

  // 头部信息
  let header = `${cacheIndicator} 📸 原型页面内容 | Version: ${versionId.slice(0, 8)}...\n`;
  header += `📊 共 ${successResults.length}/${targetPages.length} 页`;
  if (isTextOnly) {
    header += ` | 模式: 仅文字`;
  } else if (effectiveImageMode === 'direct') {
    header += ` | 模式: 截图+文字`;
  } else if (effectiveImageMode === 'mcp_assisted') {
    header += ` | 模式: MCP辅助图片`;
  } else {
    header += ` | 模式: 仅文字（跳过图片）`;
  }
  header += `\n\n📁 整合文件: \`${consolidatedPath}\`\n\n`;
  content.push(header);

  // 按页面顺序输出
  for (let idx = 0; idx < successResults.length; idx++) {
    const r = successResults[idx];
    const displayName = filenameToDisplay.get(r.page_name) ?? r.page_name;

    content.push(`---\n\n## ${idx + 1}. ${displayName}\n\n`);

    // mcp_assisted 模式：列出每个页面的截图路径
    if (!isTextOnly && effectiveImageMode === 'mcp_assisted' && r.screenshot_path) {
      const mcpToolName = args.image_mcp_tool || config.imageMcpTool;
      content.push(
        `📷 截图路径: \`${r.screenshot_path}\`\n` +
        `> 可使用 "${mcpToolName}" 工具分析此截图\n\n`
      );
    }

    // direct 模式：内联 base64 图片
    if (!isTextOnly && effectiveImageMode === 'direct' && r.screenshot_path) {
      const buffer = await readFile(r.screenshot_path);
      content.push({
        type: 'image',
        data: buffer.toString('base64'),
        mimeType: 'image/png',
      });
      content.push('\n\n');
    }

    // 页面文字
    if (r.page_text) {
      content.push(`### 页面文字\n\n${r.page_text}\n\n`);
    } else {
      content.push(`### 页面文字\n\n⚠️ 未提取到文字内容\n\n`);
    }
  }

  // 失败页面
  if (failedPages.length) {
    let failureText = `---\n\n## ⚠️ 失败的页面\n\n`;
    for (const r of failedPages) {
      const displayName = filenameToDisplay.get(r.page_name) ?? r.page_name;
      failureText += `- **${displayName}**: ${r.error ?? '未知错误'}\n`;
    }
    content.push(failureText);
  }

  return content;
}
