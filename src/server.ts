import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig } from './config/env.js';

// 工具实现
import { resolveInviteLink, resolveInviteLinkSchema } from './tools/resolve-invite-link.js';
import { listProductDocuments, listProductDocumentsSchema } from './tools/list-product-documents.js';
import { getPages, getPagesSchema } from './tools/get-pages.js';
import { analyzePages, analyzePagesSchema } from './tools/analyze-pages.js';
import { getDesigns, getDesignsSchema } from './tools/get-designs.js';
import { analyzeDesigns, analyzeDesignsSchema } from './tools/analyze-designs.js';
import { getDesignSlices, getDesignSlicesSchema } from './tools/get-design-slices.js';
import { analyzeApiDoc, analyzeApiDocSchema } from './tools/analyze-api-doc.js';
import { comprehensiveAnalysis, comprehensiveAnalysisSchema } from './tools/comprehensive-analysis.js';
import { downloadSlices, downloadSlicesSchema } from './tools/download-slices.js';

function formatToolError(toolName: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const hints: string[] = [];

  if (msg.includes('Cookie') || msg.includes('cookie') || msg.includes('登录') || msg.includes('过期')) {
    hints.push('蓝湖 Cookie 可能已过期，请重新登录: https://lanhuapp.com');
  }
  if (msg.includes('Playwright') || msg.includes('browser') || msg.includes('chromium')) {
    hints.push('请安装 Playwright 浏览器: npx playwright install chromium');
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
    hints.push('网络请求失败，请检查网络连接');
  }

  let result = `[${toolName}] 错误: ${msg}`;
  if (hints.length > 0) {
    result += '\n排查建议:\n' + hints.map((h, i) => `  ${i + 1}. ${h}`).join('\n');
  }
  return result;
}

export function createServer(): McpServer {
  const config = getConfig();

  const server = new McpServer({
    name: 'lanhu-mcp-server',
    version: '1.0.0',
  });

  // 1. 解析邀请链接
  server.tool(
    'lanhu_resolve_invite_link',
    'Resolve Lanhu invite/share link to actual project URL. USE WHEN: User provides invite link (lanhuapp.com/link/#/invite?sid=xxx)',
    resolveInviteLinkSchema,
    async (args) => {
      try {
        const result = await resolveInviteLink(args as { invite_url: string }, config.cookie);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_resolve_invite_link', err) }] };
      }
    }
  );

  // 2. 列出产品文档
  server.tool(
    'lanhu_list_product_documents',
    '[PRD/Requirement Document Discovery] List all product documents (PRD/prototype) in a Lanhu project. USE WHEN: 有哪些需求文档, 列出项目的文档, 项目下的PRD列表',
    listProductDocumentsSchema,
    async (args) => {
      try {
        const result = await listProductDocuments(args as { url: string });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_list_product_documents', err) }] };
      }
    }
  );

  // 3. 获取页面列表
  server.tool(
    'lanhu_get_pages',
    '[PRD/Requirement Document] Get page list of Lanhu Axure prototype - CALL THIS FIRST before analyzing. USE WHEN: 需求文档, 需求, PRD, 产品文档, 原型, 交互稿, Axure',
    getPagesSchema,
    async (args) => {
      try {
        const result = await getPages(args as { url: string });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_get_pages', err) }] };
      }
    }
  );

  // 4. AI 分析页面
  server.tool(
    'lanhu_get_ai_analyze_page_result',
    '[PRD/Requirement Document] Analyze Lanhu Axure prototype pages - GET VISUAL CONTENT. Returns each page\'s screenshot and text organized in order. Supports image_mode for non-multimodal models: "direct" (inline images), "mcp_assisted" (return file paths for external MCP tool), "text_only_images" (skip images).',
    analyzePagesSchema,
    async (args) => {
      try {
        const result = await analyzePages(
          args as { url: string; page_names: string | string[]; mode: 'text_only' | 'full'; image_mode: 'auto' | 'direct' | 'mcp_assisted' | 'text_only_images'; image_mcp_tool?: string }
        );

        const content = result.map((item) => {
          if (typeof item === 'string') {
            return { type: 'text' as const, text: item };
          }
          return {
            type: 'image' as const,
            data: item.data,
            mimeType: item.mimeType,
          };
        });

        return { content };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_get_ai_analyze_page_result', err) }] };
      }
    }
  );

  // 5. 获取设计图列表
  server.tool(
    'lanhu_get_designs',
    '[UI Design] Get Lanhu UI design image list - CALL THIS FIRST. USE WHEN: UI设计图, 设计图, 设计稿, 视觉设计, UI稿',
    getDesignsSchema,
    async (args) => {
      try {
        const result = await getDesigns(args as { url: string });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_get_designs', err) }] };
      }
    }
  );

  // 6. AI 分析设计图
  server.tool(
    'lanhu_get_ai_analyze_design_result',
    '[UI Design] Analyze Lanhu UI design images - GET VISUAL CONTENT + HTML CODE. USE WHEN: UI设计图, 设计图, 设计稿, 视觉设计, UI稿. Workflow: First call lanhu_get_designs, then call this. Supports image_mode for non-multimodal models: "direct" (inline images), "mcp_assisted" (merge images + single MCP call), "text_only_images" (skip images).',
    analyzeDesignsSchema,
    async (args) => {
      try {
        const result = await analyzeDesigns(
          args as { url: string; design_names: string | string[]; image_mode?: 'auto' | 'direct' | 'mcp_assisted' | 'text_only_images'; image_mcp_tool?: string }
        );

        const content = result.map((item) => {
          if (typeof item === 'string') {
            return { type: 'text' as const, text: item };
          }
          return {
            type: 'image' as const,
            data: item.data,
            mimeType: item.mimeType,
          };
        });

        return { content };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_get_ai_analyze_design_result', err) }] };
      }
    }
  );

  // 7. 获取设计切图
  server.tool(
    'lanhu_get_design_slices',
    '[UI Design] Get all slice/export asset info for a design image (icons, images, etc). Returns metadata + download URLs. USE WHEN: 切图, 图标, 素材, export, slice',
    getDesignSlicesSchema,
    async (args) => {
      try {
        const result = await getDesignSlices(
          args as { url: string; design_name: string; include_metadata: boolean }
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_get_design_slices', err) }] };
      }
    }
  );

  // 8. API 接口文档分析
  server.tool(
    'lanhu_analyze_api_doc',
    '[API Documentation] Analyze Swagger/OpenAPI or YApi documentation. Extracts all API endpoints with methods, parameters, request/response schemas. USE WHEN: API文档, 接口文档, Swagger, YApi, OpenAPI, 接口分析',
    analyzeApiDocSchema,
    async (args) => {
      try {
        const result = await analyzeApiDoc(
          args as {
            url: string;
            doc_type: 'auto' | 'swagger' | 'yapi';
            save_to_local: boolean;
            include_type_defs: boolean;
          }
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_analyze_api_doc', err) }] };
      }
    }
  );

  // 9. 综合需求分析
  server.tool(
    'lanhu_comprehensive_analysis',
    '[Comprehensive Requirement Analysis] One-stop requirement analysis tool. ' +
    'Accepts prototype URL + design URL + API doc URL (all optional), runs analyses in parallel, ' +
    'collects icon/slice metadata for LLM to review, and generates a comprehensive requirement document. ' +
    'USE WHEN: 综合分析, 需求分析, 一键分析, 全量分析, 完整需求, 需求+UI+接口',
    comprehensiveAnalysisSchema,
    async (args) => {
      try {
        const result = await comprehensiveAnalysis(
          args as import('./types/comprehensive.js').ComprehensiveAnalysisArgs
        );

        const content = result.map((item) => {
          if (typeof item === 'string') {
            return { type: 'text' as const, text: item };
          }
          return {
            type: 'image' as const,
            data: item.data,
            mimeType: item.mimeType,
          };
        });

        return { content };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_comprehensive_analysis', err) }] };
      }
    }
  );

  // 10. 下载切片（LLM 指定文件名）
  server.tool(
    'lanhu_download_slices',
    '[Icon/Slice Download] Download design slices/icons with LLM-specified semantic filenames. ' +
    'LLM analyzes UI designs first, then calls this tool with chosen filenames. ' +
    'USE WHEN: 下载icon, 下载切片, 下载图标, download icons, 保存切图',
    downloadSlicesSchema,
    async (args) => {
      try {
        const result = await downloadSlices(
          args as {
            icons: Array<{ download_url: string; filename: string; svg_url?: string }>;
            output_dir?: string;
            prefer_svg?: boolean;
          }
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatToolError('lanhu_download_slices', err) }] };
      }
    }
  );

  return server;
}
