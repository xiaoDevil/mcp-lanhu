import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LanhuExtractor } from '../client/lanhu-extractor.js';
import { createHttpClient } from '../client/http.js';
import { convertLanhuToHtml } from '../converter/design-to-html.js';
import { extractDesignTokens } from '../converter/design-tokens.js';
import { convertSketchToHtml } from '../converter/sketch-to-html.js';
import { extractFullAnnotationsFromSketch } from '../converter/sketch-annotations.js';
import { localizeImageUrls } from '../converter/html-localizer.js';
import { minifyHtml } from '../converter/html-minifier.js';

import { getConfig } from '../config/env.js';
import type { DesignNode, SketchData, LayerAnnotation } from '../types/design.js';

export const analyzeDesignsSchema = {
  url: z.string().describe(
    'Lanhu URL WITHOUT docId. Example: https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx.'
  ),
  design_names: z.union([z.string(), z.array(z.string())]).describe(
    'Design name(s) or index number(s). "all" = all. Number = by index. Exact name = by full name. Get from lanhu_get_designs first.'
  ),
  image_mode: z.enum(['auto', 'direct', 'mcp_assisted', 'text_only_images']).default('auto').describe(
    'How to handle design images. "auto" = resolve from config (default direct); "direct" = inline base64 for multimodal LLM; "mcp_assisted" = merge images + return MCP instructions; "text_only_images" = skip images. Default: "auto"'
  ),
  image_mcp_tool: z.string().optional().describe(
    'MCP tool name for image analysis when image_mode=mcp_assisted. Overrides IMAGE_MCP_TOOL env var.'
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

interface DesignResult {
  success: boolean;
  design_name: string;
  design_id?: string;
  sectors?: string[];
  screenshot_path?: string;
  html_path?: string;
  html_code?: string;
  image_url_mapping?: Record<string, string>;
  design_tokens?: string;
  sketch_html?: string;
  sketch_annotations?: string;
  layer_css_annotations?: LayerAnnotation[];
  error?: string;
}

export async function analyzeDesigns(
  args: {
    url: string;
    design_names: string | string[];
    image_mode?: 'auto' | 'direct' | 'mcp_assisted' | 'text_only_images';
    image_mcp_tool?: string;
  }
): Promise<Array<string | { type: 'image'; data: string; mimeType: string }>> {
  const extractor = new LanhuExtractor();
  const client = createHttpClient(false);
  const config = getConfig();
  const params = extractor.parseUrl(args.url);

  // 获取设计图列表
  const { getDesigns } = await import('./get-designs.js');
  const designsData = await getDesigns({ url: args.url }) as Record<string, unknown>;

  if (designsData.status !== 'success') {
    return [`❌ Failed to get design list: ${designsData.message ?? 'Unknown error'}`];
  }

  const designs = designsData.designs as Array<Record<string, unknown>>;

  // 确定目标设计图
  let targetDesigns: Array<Record<string, unknown>>;

  if (typeof args.design_names === 'string' && args.design_names.toLowerCase() === 'all') {
    targetDesigns = designs;
  } else {
    const names = typeof args.design_names === 'string' ? [args.design_names] : args.design_names;
    const seenIds = new Set<string>();
    targetDesigns = [];

    const imageIdFromUrl = params.doc_id;

    for (const name of names) {
      const nameStr = String(name).trim();
      if (/^\d+$/.test(nameStr)) {
        const n = parseInt(nameStr, 10);
        const found = designs.find((d) => d.index === n && !seenIds.has(d.id as string));
        if (found) {
          targetDesigns.push(found);
          seenIds.add(found.id as string);
        }
      } else {
        const found = designs.find((d) => d.name === nameStr && !seenIds.has(d.id as string));
        if (found) {
          targetDesigns.push(found);
          seenIds.add(found.id as string);
        }
      }
    }

    if (!targetDesigns.length && imageIdFromUrl) {
      const found = designs.find((d) => d.id === imageIdFromUrl);
      if (found) targetDesigns.push(found);
    }
  }

  if (!targetDesigns.length) {
    const available = designs.map((d) => {
      const sectors = d.sectors as string[] | undefined;
      return sectors?.length ? `${d.name} [${sectors.join(', ')}]` : (d.name as string);
    });
    return [
      `⚠️ No matching design found\n\nAvailable designs:\n${available.map((n) => `  • ${n}`).join('\n')}`,
    ];
  }

  const outputDir = join(config.dataDir, 'lanhu_designs', params.project_id);
  await mkdir(outputDir, { recursive: true });

  const imageResults: DesignResult[] = [];
  const htmlResults: DesignResult[] = [];

  for (const design of targetDesigns) {
    const designName = design.name as string;

    // 1. 下载图片
    try {
      const imgUrl = (design.url as string).split('?')[0];
      const imgBuffer = await client.getBytes(imgUrl);
      const imgFilename = `${designName.replace(/\//g, '_')}.png`;
      const imgFilepath = join(outputDir, imgFilename);
      await writeFile(imgFilepath, imgBuffer);

      imageResults.push({
        success: true,
        design_name: designName,
        design_id: design.id as string,
        sectors: (design.sectors as string[]) ?? [],
        screenshot_path: imgFilepath,
      });
    } catch (e) {
      imageResults.push({
        success: false,
        design_name: designName,
        sectors: (design.sectors as string[]) ?? [],
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 2. 获取Schema并生成HTML
    try {
      const schemaJson = await extractor.getDesignSchemaJson(
        design.id as string,
        params.team_id,
        params.project_id
      );

      let htmlCode = minifyHtml(convertLanhuToHtml(schemaJson as unknown as DesignNode));
      const [localizedHtml, imageUrlMapping] = localizeImageUrls(htmlCode, designName);
      htmlCode = localizedHtml;

      // 下载映射的图片资源到本地
      if (Object.keys(imageUrlMapping).length > 0) {
        const assetsDir = join(outputDir, 'assets', 'slices');
        await mkdir(assetsDir, { recursive: true });
        for (const [localPath, remoteUrl] of Object.entries(imageUrlMapping)) {
          const filename = localPath.replace('./assets/slices/', '');
          const filePath = join(assetsDir, filename);
          try {
            const buffer = await client.getBytes(remoteUrl);
            await writeFile(filePath, buffer);
          } catch {
            // 单个图片下载失败不影响整体
          }
        }
      }

      const htmlFilename = `${designName.replace(/\//g, '_')}.html`;
      const htmlFilepath = join(outputDir, htmlFilename);
      await writeFile(htmlFilepath, htmlCode, 'utf-8');

      htmlResults.push({
        success: true,
        design_name: designName,
        html_path: htmlFilepath,
        html_code: htmlCode,
        image_url_mapping: imageUrlMapping,
      });
    } catch (e) {
      htmlResults.push({
        success: false,
        design_name: designName,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 3. 获取Sketch JSON提取Design Tokens / Fallback HTML
    try {
      const sketchJson = await extractor.getSketchJson(
        design.id as string,
        params.team_id,
        params.project_id
      );
      const designTokens = extractDesignTokens(sketchJson as unknown as import('../types/design.js').SketchData);

      const htmlSucceeded = htmlResults.some(
        (hr) => hr.design_name === designName && hr.success
      );

      if (htmlSucceeded && designTokens) {
        const hr = htmlResults.find(
          (r) => r.design_name === designName && r.success
        );
        if (hr) hr.design_tokens = designTokens;
      } else if (!htmlSucceeded) {
        const deviceStr = (sketchJson.device as string) ?? '';
        let designScale = 2.0;
        if (deviceStr.includes('@3x')) designScale = 3.0;
        else if (deviceStr.includes('@1x')) designScale = 1.0;

        const designImgUrl = (design.url as string).split('?')[0];
        const [fallbackHtml, fallbackImgMapping, fallbackLayerAnnots] = convertSketchToHtml(
          sketchJson as unknown as SketchData,
          designScale,
          designImgUrl
        );
        fallbackImgMapping['./assets/designs/design.png'] = designImgUrl;
        const minifiedFallback = minifyHtml(fallbackHtml);

        // 下载 Sketch fallback 分支的图片资源
        if (Object.keys(fallbackImgMapping).length > 0) {
          const fallbackAssetsDir = join(outputDir, 'assets', 'slices');
          await mkdir(fallbackAssetsDir, { recursive: true });
          // design.png 放在 assets/designs/ 下
          const designsDir = join(outputDir, 'assets', 'designs');
          await mkdir(designsDir, { recursive: true });
          for (const [localPath, remoteUrl] of Object.entries(fallbackImgMapping)) {
            const filename = localPath.replace(/^\.\//, '');
            const filePath = join(outputDir, filename);
            try {
              const buffer = await client.getBytes(remoteUrl);
              await writeFile(filePath, buffer);
            } catch {
              // 单个图片下载失败不影响整体
            }
          }
        }

        const fallbackAnnotations = extractFullAnnotationsFromSketch(
          sketchJson as unknown as SketchData,
          designScale
        );

        const hr = htmlResults.find(
          (r) => r.design_name === designName && !r.success
        );
        if (hr) {
          hr.sketch_html = minifiedFallback;
          hr.sketch_annotations = fallbackAnnotations;
          hr.image_url_mapping = fallbackImgMapping;
          hr.layer_css_annotations = fallbackLayerAnnots;
          if (designTokens) hr.design_tokens = designTokens;
        }
      }
    } catch {
      // 忽略Sketch JSON获取失败
    }
  }

  // 构建返回内容
  const content: Array<string | { type: 'image'; data: string; mimeType: string }> = [];

  const htmlSuccessCount = htmlResults.filter((r) => r.success).length;
  const sketchFallbackCount = htmlResults.filter((r) => !r.success && r.sketch_html).length;

  let summaryText = `📊 Design Analysis Results\n`;
  summaryText += `📁 Project: ${designsData.project_name}\n`;
  summaryText += `✓ ${imageResults.filter((r) => r.success).length}/${imageResults.length} images downloaded\n`;
  summaryText += `✓ ${htmlSuccessCount}/${htmlResults.length} HTML codes generated\n`;
  if (sketchFallbackCount > 0) {
    summaryText += `✓ ${sketchFallbackCount} design(s) using Sketch annotation fallback\n`;
  }
  summaryText += '\n';

  summaryText += '📋 Design List:\n';
  summaryText += '下方图片顺序与列表中「设计图 1」「设计图 2」… 一一对应\n\n';

  const successImageResults = imageResults.filter((r) => r.success);
  const successHtmlMap = new Map(htmlResults.filter((r) => r.success).map((r) => [r.design_name, r]));
  const failedHtmlMap = new Map(htmlResults.filter((r) => !r.success).map((r) => [r.design_name, r]));

  for (let idx = 0; idx < successImageResults.length; idx++) {
    const imgR = successImageResults[idx];
    summaryText += `\n--- 设计图 ${idx + 1}：${imgR.design_name} ---\n`;
    if (imgR.sectors?.length) {
      summaryText += `   🗂️ 所属分组: ${imgR.sectors.join('；')}\n`;
    }

    const htmlR = successHtmlMap.get(imgR.design_name);
    if (htmlR) {
      summaryText += `   📄 完整代码:\n   \`\`\`html\n${htmlR.html_code}\n   \`\`\`\n`;

      const mapping = htmlR.image_url_mapping;
      if (mapping && Object.keys(mapping).length) {
        summaryText += `\n   📥 图片资源下载映射（共 ${Object.keys(mapping).length} 个）:\n`;
        for (const [localPath, remoteUrl] of Object.entries(mapping)) {
          summaryText += `     ${localPath} ← ${remoteUrl}\n`;
        }
      }

      if (htmlR.design_tokens) {
        summaryText += `\n   --- Design Tokens ---\n${htmlR.design_tokens}\n   --- End Design Tokens ---\n`;
      }
    } else {
      const failedR = failedHtmlMap.get(imgR.design_name);
      if (failedR?.sketch_html) {
        summaryText += `\n   ⚠️ DDS Schema 不可用，已使用 Sketch 标注方案\n`;
        summaryText += `   📄 HTML+CSS 代码:\n   \`\`\`html\n${failedR.sketch_html}\n   \`\`\`\n`;

        if (failedR.image_url_mapping) {
          summaryText += `\n   📥 资源下载映射:\n`;
          for (const [localPath, remoteUrl] of Object.entries(failedR.image_url_mapping)) {
            summaryText += `     ${localPath} ← ${remoteUrl}\n`;
          }
        }

        if (failedR.sketch_annotations) {
          summaryText += `\n   --- 设计标注详情 ---\n${failedR.sketch_annotations}\n   --- End ---\n`;
        }

        if (failedR.design_tokens) {
          summaryText += `\n   --- Design Tokens ---\n${failedR.design_tokens}\n   --- End ---\n`;
        }
      }
    }
  }

  // 失败项
  const failedImageResults = imageResults.filter((r) => !r.success);
  if (failedImageResults.length) {
    summaryText += `\n⚠️ Failed to download ${failedImageResults.length} images:\n`;
    for (const r of failedImageResults) {
      summaryText += `  ✗ ${r.design_name}: ${r.error ?? 'Unknown'}\n`;
    }
  }

  content.push(summaryText);

  // 处理图片
  const effectiveImageMode = resolveImageMode(args.image_mode ?? 'auto');
  const successImageResults2 = imageResults.filter((r) => r.success && r.screenshot_path);

  if (successImageResults2.length > 0 && effectiveImageMode !== 'text_only_images') {
    if (effectiveImageMode === 'mcp_assisted') {
      const mcpToolName = args.image_mcp_tool || config.imageMcpTool;

      let mcpAction = '\n📷 可使用 "' + mcpToolName + '" 分析以下设计图：\n\n';
      for (let idx = 0; idx < successImageResults2.length; idx++) {
        const r = successImageResults2[idx];
        mcpAction += `${idx + 1}. ${r.design_name}\n`;
        mcpAction += `   - image_source: "${r.screenshot_path}"\n\n`;
      }
      content.push(mcpAction);
    } else {
      // direct 模式：内联 base64 图片（多模态模型直接识别）
      for (const r of successImageResults2) {
        const fs = await import('node:fs/promises');
        const buffer = await fs.readFile(r.screenshot_path!);
        content.push({
          type: 'image',
          data: buffer.toString('base64'),
          mimeType: 'image/png',
        });
      }
    }
  }

  return content;
}
