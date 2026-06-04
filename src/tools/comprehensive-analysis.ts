/**
 * 综合需求分析工具 - 主编排器
 *
 * 一次性整合原型分析、UI 设计分析、接口文档分析，
 * 收集设计切片元数据供 LLM 判断下载，生成综合需求文档
 */

import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LanhuExtractor } from '../client/lanhu-extractor.js';
import { getConfig } from '../config/env.js';
import { analyzePages } from './analyze-pages.js';
import { analyzeDesigns } from './analyze-designs.js';
import { analyzeApiDoc } from './analyze-api-doc.js';
import { generateComprehensiveDocument } from '../utils/comprehensive-markdown.js';
import type {
  ComprehensiveAnalysisArgs,
  PrototypeSummary,
  DesignSummary,
  ApiDocSummary,
  ComprehensiveResult,
} from '../types/comprehensive.js';
import type { DesignSlice } from '../types/lanhu.js';

// ==================== Schema ====================

export const comprehensiveAnalysisSchema = {
  // 原型 URL（可选）
  prototype_url: z.string().optional().describe(
    '蓝湖 Axure 原型 URL（含 docId）。' +
    'Example: https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx'
  ),
  page_names: z.union([z.string(), z.array(z.string())]).default('all').describe(
    '要分析的原型页面名。"all" = 全部，或指定页面名列表。默认: "all"'
  ),

  // 设计图 URL（可选）
  design_url: z.string().optional().describe(
    '蓝湖 UI 设计图 URL（不含 docId）。' +
    'Example: https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx'
  ),
  design_names: z.union([z.string(), z.array(z.string())]).default('all').describe(
    '设计图名。"all" = 全部，或指定名称/索引。默认: "all"'
  ),

  // API 文档 URL（可选）
  api_doc_url: z.string().optional().describe(
    'API 文档 URL。支持 Swagger/OpenAPI JSON 或 YApi 地址。'
  ),
  api_doc_type: z.enum(['auto', 'swagger', 'yapi']).default('auto').describe(
    '文档类型。默认: "auto"'
  ),

  // 输出控制
  project_name: z.string().optional().describe(
    '项目名称，用于输出目录和文档标题。默认从 URL 中自动推断。'
  ),
  image_mode: z.enum(['auto', 'direct', 'mcp_assisted', 'text_only_images']).default('auto').describe(
    '图片输出模式。与现有工具一致。默认: "auto"'
  ),
};

// ==================== 辅助函数 ====================

/**
 * 从 URL 推断项目名称
 */
function extractProjectName(args: ComprehensiveAnalysisArgs): string {
  if (args.project_name) return args.project_name;

  // 尝试从 design_url 的 pid 参数获取
  if (args.design_url) {
    try {
      const hash = args.design_url.split('#')[1] ?? '';
      const pidMatch = hash.match(/pid=([a-f0-9]+)/);
      if (pidMatch) return `project_${pidMatch[1].slice(0, 8)}`;
    } catch { /* ignore */ }
  }

  // 尝试从 prototype_url 的 pid 参数获取
  if (args.prototype_url) {
    try {
      const hash = args.prototype_url.split('#')[1] ?? '';
      const pidMatch = hash.match(/pid=([a-f0-9]+)/);
      if (pidMatch) return `project_${pidMatch[1].slice(0, 8)}`;
    } catch { /* ignore */ }
  }

  return `project_${Date.now()}`;
}

/**
 * 从 analyzePages 的混合返回值中提取 PrototypeSummary
 */
function parsePrototypeResult(
  rawResult: Array<string | { type: 'image'; data: string; mimeType: string }>,
): PrototypeSummary {
  const pages: PrototypeSummary['pages'] = [];
  let documentName = '未知文档';
  let totalPages = 0;

  let currentPage: { name: string; text: string; screenshot_path?: string } | null = null;

  for (const item of rawResult) {
    if (typeof item === 'string') {
      const text = item;

      // 提取文档名
      const docMatch = text.match(/原型页面内容/);
      if (docMatch) {
        const countMatch = text.match(/共 (\d+)\/(\d+) 页/);
        if (countMatch) {
          totalPages = parseInt(countMatch[2], 10);
        }
      }

      // 提取页面标题
      const pageMatch = text.match(/## \d+\. (.+)/);
      if (pageMatch) {
        if (currentPage) pages.push(currentPage);
        currentPage = { name: pageMatch[1].trim(), text: '' };
      }

      // 提取页面文字
      const textMatch = text.match(/### 页面文字\n+([\s\S]*?)(?=\n---|\n$|$)/);
      if (textMatch && currentPage) {
        currentPage.text = textMatch[1].trim();
      }

      // 提取截图路径（mcp_assisted 模式）
      const screenshotMatch = text.match(/截图路径: `([^`]+)`/);
      if (screenshotMatch && currentPage) {
        currentPage.screenshot_path = screenshotMatch[1];
      }

      // 提取整合文件路径
      const mdMatch = text.match(/整合文件: `([^`]+)`/);
      if (mdMatch) {
        // 存在整合文件
      }
    }
  }

  if (currentPage) pages.push(currentPage);

  return {
    document_name: documentName,
    total_pages: totalPages || pages.length,
    success_pages: pages.length,
    pages,
  };
}

/**
 * 从 analyzeDesigns 的混合返回值中提取 DesignSummary
 */
function parseDesignResult(
  rawResult: Array<string | { type: 'image'; data: string; mimeType: string }>,
): DesignSummary {
  const designs: DesignSummary['designs'] = [];
  let projectName = '未知项目';
  let totalDesigns = 0;

  let currentDesign: DesignSummary['designs'][0] | null = null;
  let inHtmlBlock = false;
  let htmlBuffer = '';
  let inTokensBlock = false;
  let tokensBuffer = '';
  let inAnnotationsBlock = false;
  let annotationsBuffer = '';

  for (const item of rawResult) {
    if (typeof item !== 'string') continue;
    const text = item;

    // 提取项目名
    const projMatch = text.match(/Project: (.+)/);
    if (projMatch) projectName = projMatch[1].trim();

    // 提取统计
    const countMatch = text.match(/(\d+)\/(\d+) images downloaded/);
    if (countMatch) totalDesigns = parseInt(countMatch[2], 10);

    // 提取设计图标题
    const designMatches = [...text.matchAll(/--- 设计图 \d+：(.+?) ---/g)];
    for (const m of designMatches) {
      if (currentDesign) {
        // 保存前一个设计图的缓冲区
        flushBuffers(currentDesign, htmlBuffer, tokensBuffer, annotationsBuffer);
        designs.push(currentDesign);
        htmlBuffer = '';
        tokensBuffer = '';
        annotationsBuffer = '';
        inHtmlBlock = false;
        inTokensBlock = false;
        inAnnotationsBlock = false;
      }
      currentDesign = {
        name: m[1].trim(),
        sectors: [],
      };

      // 提取分组信息
      const sectorMatch = text.match(/所属分组: (.+)/);
      if (sectorMatch && currentDesign) {
        currentDesign.sectors = sectorMatch[1].split('；').map(s => s.trim());
      }
    }

    // 提取 HTML 代码块
    if (text.includes('```html')) {
      inHtmlBlock = true;
      htmlBuffer = '';
      continue;
    }
    if (inHtmlBlock && text.includes('```')) {
      inHtmlBlock = false;
      continue;
    }
    if (inHtmlBlock) {
      htmlBuffer += text;
    }

    // 提取 Design Tokens 块
    if (text.includes('--- Design Tokens ---')) {
      if (text.includes('--- End Design Tokens ---')) {
        const match = text.match(/--- Design Tokens ---\n([\s\S]*?)--- End Design Tokens ---/);
        if (match) tokensBuffer = match[1].trim();
        continue;
      }
      inTokensBlock = true;
      tokensBuffer = '';
      continue;
    }
    if (inTokensBlock && text.includes('--- End Design Tokens ---')) {
      inTokensBlock = false;
      continue;
    }
    if (inTokensBlock) {
      tokensBuffer += text;
    }

    // 提取标注详情块
    if (text.includes('--- 设计标注详情 ---')) {
      inAnnotationsBlock = true;
      annotationsBuffer = '';
      continue;
    }
    if (inAnnotationsBlock && text.includes('--- End ---')) {
      inAnnotationsBlock = false;
      continue;
    }
    if (inAnnotationsBlock) {
      annotationsBuffer += text;
    }

    // 提取图片资源映射
    if (text.includes('资源下载映射:') || text.includes('图片资源下载映射')) {
      const mappingLines = text.match(/assets\/[^\s]+ ← .+/g);
      if (mappingLines && currentDesign) {
        const mapping: Record<string, string> = {};
        for (const line of mappingLines) {
          const [local, remote] = line.split(' ← ');
          if (local && remote) {
            mapping[local.trim()] = remote.trim();
          }
        }
        currentDesign.image_url_mapping = mapping;
      }
    }
  }

  // 处理最后一个设计图
  if (currentDesign) {
    flushBuffers(currentDesign, htmlBuffer, tokensBuffer, annotationsBuffer);
    designs.push(currentDesign);
  }

  return {
    project_name: projectName,
    total_designs: totalDesigns || designs.length,
    success_designs: designs.length,
    designs,
  };
}

/**
 * 将缓冲区内容写入设计图对象
 */
function flushBuffers(
  design: DesignSummary['designs'][0],
  htmlBuffer: string,
  tokensBuffer: string,
  annotationsBuffer: string,
): void {
  if (htmlBuffer.trim()) {
    if (design.html_code) {
      design.sketch_html = htmlBuffer.trim();
    } else {
      design.html_code = htmlBuffer.trim();
    }
  }
  if (tokensBuffer.trim()) {
    design.design_tokens = tokensBuffer.trim();
  }
  if (annotationsBuffer.trim()) {
    design.sketch_annotations = annotationsBuffer.trim();
  }
}

/**
 * 从 analyzeApiDoc 的返回值提取 ApiDocSummary
 */
function parseApiDocResult(rawResult: Record<string, unknown>): ApiDocSummary {
  const endpoints = (rawResult.endpoints as Array<Record<string, unknown>> ?? []).map(ep => ({
    method: String(ep.method ?? ''),
    path: String(ep.path ?? ''),
    summary: ep.summary ? String(ep.summary) : undefined,
    operation_id: ep.operationId ? String(ep.operationId) : undefined,
    tags: ep.tags as string[] | undefined,
    parameters: ep.parameters as unknown[] | undefined,
    request_body: ep.requestBody as unknown,
    responses: ep.responses as unknown[] | undefined,
  }));

  return {
    title: rawResult.title ? String(rawResult.title) : undefined,
    doc_type: String(rawResult.docType ?? 'unknown'),
    source_url: rawResult.sourceUrl ? String(rawResult.sourceUrl) : undefined,
    base_url: rawResult.baseUrl ? String(rawResult.baseUrl) : undefined,
    total_endpoints: Number(rawResult.totalEndpoints ?? endpoints.length),
    endpoints,
    type_definitions: rawResult.typeDefinitions as unknown[],
    markdown_path: rawResult.markdownPath ? String(rawResult.markdownPath) : undefined,
  };
}

/**
 * 收集设计切片元数据（不下载，仅返回信息供 LLM 判断）
 */
async function collectSlicesMetadata(
  designUrl: string,
  designSummary: DesignSummary,
): Promise<Array<Record<string, unknown>>> {
  const extractor = new LanhuExtractor();
  const params = extractor.parseUrl(designUrl);

  // 获取设计图列表（含 design_id）
  const { getDesigns } = await import('./get-designs.js');
  const designsData = await getDesigns({ url: designUrl }) as Record<string, unknown>;
  if (designsData.status !== 'success') {
    return [];
  }

  const allDesigns = designsData.designs as Array<Record<string, unknown>>;

  // 收集所有切片
  const allSlices: Array<Record<string, unknown>> = [];

  for (const design of allDesigns) {
    const designName = design.name as string;
    // 只处理分析成功的设计图
    if (!designSummary.designs.some(d => d.name === designName)) continue;

    try {
      const slicesResult = await extractor.getDesignSlicesInfo(
        design.id as string,
        params.team_id,
        params.project_id,
        false,
      );
      const slices = (slicesResult.slices as DesignSlice[]) ?? [];

      // 去重：同名 + 同尺寸只保留一份
      const seen = new Set<string>();
      for (const s of slices) {
        const key = `${s.name}_${s.size}`;
        if (seen.has(key)) continue;
        seen.add(key);

        allSlices.push({
          name: s.name,
          type: s.type,
          format: s.format,
          size: s.size,
          logical_size: s.logical_size,
          position: s.position,
          layer_path: s.layer_path,
          parent_name: s.parent_name,
          download_url: s.download_url,
          svg_url: s.svg_url,
          scale_urls: s.scale_urls,
          source_design: designName,
        });
      }
    } catch {
      // 单个设计图切片获取失败不影响其他
    }
  }

  return allSlices;
}

// ==================== 主编排器 ====================

/**
 * 混合内容类型
 */
type MixedContent = string | { type: 'image'; data: string; mimeType: string };

export async function comprehensiveAnalysis(
  args: ComprehensiveAnalysisArgs,
): Promise<Array<MixedContent>> {
  const config = getConfig();

  // ========== 阶段 1: 参数验证 & 准备 ==========
  if (!args.prototype_url && !args.design_url && !args.api_doc_url) {
    throw new Error('请至少提供一个 URL: prototype_url, design_url 或 api_doc_url');
  }

  const projectName = extractProjectName(args);
  const outputDir = join(config.dataDir, projectName);
  await mkdir(outputDir, { recursive: true });

  const errors: string[] = [];

  // ========== 阶段 2: 并行执行分析 ==========
  type AnalysisTask = {
    type: 'prototype' | 'design' | 'api_doc';
    promise: Promise<unknown>;
  };

  const tasks: AnalysisTask[] = [];

  if (args.prototype_url) {
    tasks.push({
      type: 'prototype',
      promise: analyzePages({
        url: args.prototype_url,
        page_names: args.page_names ?? 'all',
        mode: 'full',
        image_mode: args.image_mode ?? 'auto',
      }),
    });
  }

  if (args.design_url) {
    tasks.push({
      type: 'design',
      promise: analyzeDesigns({
        url: args.design_url,
        design_names: args.design_names ?? 'all',
        image_mode: args.image_mode ?? 'auto',
      }),
    });
  }

  if (args.api_doc_url) {
    tasks.push({
      type: 'api_doc',
      promise: analyzeApiDoc({
        url: args.api_doc_url,
        doc_type: args.api_doc_type ?? 'auto',
        save_to_local: true,
        include_type_defs: true,
      }),
    });
  }

  // 并行执行，独立容错
  const settled = await Promise.allSettled(tasks.map(t => t.promise));

  let prototypeSummary: PrototypeSummary | undefined;
  let designSummary: DesignSummary | undefined;
  let apiDocSummary: ApiDocSummary | undefined;
  let rawPrototypeResult: Array<MixedContent> | undefined;
  let rawDesignResult: Array<MixedContent> | undefined;

  for (let idx = 0; idx < settled.length; idx++) {
    const task = tasks[idx];
    const result = settled[idx];

    if (result.status === 'rejected') {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`[${task.type}] 分析失败: ${errMsg}`);
      continue;
    }

    try {
      if (task.type === 'prototype') {
        rawPrototypeResult = result.value as Array<MixedContent>;
        prototypeSummary = parsePrototypeResult(rawPrototypeResult);
      } else if (task.type === 'design') {
        rawDesignResult = result.value as Array<MixedContent>;
        designSummary = parseDesignResult(rawDesignResult);
      } else if (task.type === 'api_doc') {
        apiDocSummary = parseApiDocResult(result.value as Record<string, unknown>);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`[${task.type}] 结果解析失败: ${errMsg}`);
    }
  }

  // ========== 阶段 3: 收集切片元数据（不下载，交给 LLM 判断） ==========
  let slicesMetadata: Array<Record<string, unknown>> = [];

  if (args.design_url && designSummary) {
    try {
      slicesMetadata = await collectSlicesMetadata(args.design_url, designSummary);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`[slices] 切片元数据收集失败: ${errMsg}`);
    }
  }

  // ========== 阶段 4: 生成综合文档 ==========
  const comprehensiveResult: ComprehensiveResult = {
    project_name: projectName,
    output_dir: outputDir,
    markdown_path: '',
    prototype: prototypeSummary,
    design: designSummary,
    api_doc: apiDocSummary,
    icons: [],
    errors,
  };

  let markdownPath = '';
  try {
    markdownPath = await generateComprehensiveDocument(comprehensiveResult);
    comprehensiveResult.markdown_path = markdownPath;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    errors.push(`[markdown] 综合文档生成失败: ${errMsg}`);
  }

  // 保存完整 JSON 报告
  try {
    const reportPath = join(outputDir, 'analysis-report.json');
    const reportData = {
      ...comprehensiveResult,
      slices_metadata: slicesMetadata,
    };
    await writeFile(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');
  } catch {
    // JSON 报告保存失败不影响主流程
  }

  // ========== 阶段 5: 构建返回内容 ==========
  const content: Array<MixedContent> = [];

  // 头部摘要
  let header = `📊 综合需求分析结果 | 项目: ${projectName}\n`;
  header += `📁 输出目录: ${outputDir}\n`;
  header += `📄 综合文档: ${markdownPath || '生成失败'}\n\n`;

  header += `分析状态:\n`;
  if (prototypeSummary) {
    header += `  ✅ 原型分析: ${prototypeSummary.success_pages}/${prototypeSummary.total_pages} 页\n`;
  } else if (args.prototype_url) {
    header += `  ❌ 原型分析: 失败\n`;
  }
  if (designSummary) {
    header += `  ✅ 设计分析: ${designSummary.success_designs}/${designSummary.total_designs} 个设计图\n`;
  } else if (args.design_url) {
    header += `  ❌ 设计分析: 失败\n`;
  }
  if (apiDocSummary) {
    header += `  ✅ 接口文档: ${apiDocSummary.total_endpoints} 个接口\n`;
  } else if (args.api_doc_url) {
    header += `  ❌ 接口文档: 失败\n`;
  }
  if (slicesMetadata.length > 0) {
    header += `  📋 可用切片: ${slicesMetadata.length} 个（请分析 UI 设计图后，使用 lanhu_download_slices 工具下载需要的 icon）\n`;
  }

  if (errors.length > 0) {
    header += `\n⚠️ 错误信息:\n`;
    for (const err of errors) {
      header += `  - ${err}\n`;
    }
  }

  // 切片元数据摘要（供 LLM 判断）
  if (slicesMetadata.length > 0) {
    header += `\n---\n\n## 📋 可用切片/Icon 列表\n\n`;
    header += `共 ${slicesMetadata.length} 个切片资源。请分析 UI 设计图后，决定需要下载哪些 icon 并给出语义化文件名。\n`;
    header += `使用 \`lanhu_download_slices\` 工具传入 icons 数组进行下载。\n\n`;
    header += `| # | 名称 | 格式 | 尺寸 | 图层路径 | 来源设计图 | 下载 URL |\n`;
    header += `|---|---|---|---|---|---|---|\n`;
    for (let i = 0; i < slicesMetadata.length; i++) {
      const s = slicesMetadata[i];
      header += `| ${i + 1} | ${s.name} | ${s.format} | ${s.size} | ${s.layer_path} | ${s.source_design} | ${String(s.download_url).slice(0, 60)}... |\n`;
    }
    header += `\n`;

    // 详细 JSON（方便 LLM 直接取 download_url）
    header += `完整切片 JSON 数据:\n\`\`\`json\n`;
    header += JSON.stringify(slicesMetadata.map(s => ({
      name: s.name,
      format: s.format,
      size: s.size,
      layer_path: s.layer_path,
      source_design: s.source_design,
      download_url: s.download_url,
      svg_url: s.svg_url,
    })), null, 2);
    header += `\n\`\`\`\n`;
  }

  content.push(header);

  // 传递各模块的原始图片内容（direct 模式下的内联图片）
  if (rawPrototypeResult) {
    for (const item of rawPrototypeResult) {
      if (typeof item !== 'string') {
        content.push(item);
      }
    }
  }

  if (rawDesignResult) {
    for (const item of rawDesignResult) {
      if (typeof item !== 'string') {
        content.push(item);
      }
    }
  }

  return content;
}
