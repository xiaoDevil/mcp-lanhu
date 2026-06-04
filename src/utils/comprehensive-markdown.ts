/**
 * 综合需求 Markdown 文档生成器
 *
 * 将原型分析、UI 设计分析、接口文档、Icon 资源整合为一份完整的 Markdown 文档
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComprehensiveResult, PrototypeSummary, DesignSummary, ApiDocSummary } from '../types/comprehensive.js';

/**
 * 生成综合需求 Markdown 文档
 */
export async function generateComprehensiveDocument(
  result: ComprehensiveResult,
): Promise<string> {
  const md = buildMarkdown(result);
  const outputPath = join(result.output_dir, 'requirement-comprehensive.md');
  await writeFile(outputPath, md, 'utf-8');
  return outputPath;
}

/**
 * 构建 Markdown 内容
 */
function buildMarkdown(result: ComprehensiveResult): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines: string[] = [];

  // 文档头
  lines.push(`# ${result.project_name} - 综合需求文档`);
  lines.push('');
  lines.push(`> 生成时间: ${now}`);
  lines.push(`> 来源: 蓝湖设计协作平台 + API 文档`);
  lines.push(`> 文档版本: 自动生成 v1`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 目录
  lines.push('## 📋 目录');
  lines.push('');
  let tocIdx = 1;
  if (result.prototype) {
    lines.push(`${tocIdx}. [原型需求分析](#一原型需求分析)`);
    tocIdx++;
  }
  if (result.design) {
    lines.push(`${tocIdx}. [UI 设计分析](#二ui-设计分析)`);
    tocIdx++;
  }
  if (result.api_doc) {
    lines.push(`${tocIdx}. [接口文档](#三接口文档)`);
    tocIdx++;
  }
  if (result.icons.length > 0) {
    lines.push(`${tocIdx}. [Icon/切片资源清单](#四icon切片资源清单)`);
    tocIdx++;
  }
  lines.push(`${tocIdx}. [开发建议](#五开发建议)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 一、原型需求分析
  if (result.prototype) {
    appendPrototypeSection(lines, result.prototype);
  }

  // 二、UI 设计分析
  if (result.design) {
    appendDesignSection(lines, result.design);
  }

  // 三、接口文档
  if (result.api_doc) {
    appendApiDocSection(lines, result.api_doc);
  }

  // 四、Icon/切片资源清单（由 LLM 分析后通过 lanhu_download_slices 工具下载）
  if (result.design) {
    appendSliceHintsSection(lines);
  }

  // 五、开发建议
  appendDevSuggestions(lines, result);

  return lines.join('\n');
}

/**
 * 原型需求分析段落
 */
function appendPrototypeSection(lines: string[], p: PrototypeSummary): void {
  lines.push('## 一、原型需求分析');
  lines.push('');
  lines.push('### 文档信息');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 文档名 | ${p.document_name} |`);
  lines.push(`| 总页数 | ${p.total_pages} |`);
  lines.push(`| 成功页数 | ${p.success_pages} |`);
  if (p.requirement_md_path) {
    lines.push(`| 整合文件 | \`${p.requirement_md_path}\` |`);
  }
  lines.push('');
  lines.push('### 页面详情');
  lines.push('');

  for (let idx = 0; idx < p.pages.length; idx++) {
    const page = p.pages[idx];
    lines.push(`#### ${idx + 1}. ${page.name}`);
    lines.push('');

    if (page.screenshot_path) {
      lines.push(`> 📷 原型截图: \`${page.screenshot_path}\``);
      lines.push('');
    }

    if (page.text) {
      lines.push('**页面文字内容**:');
      lines.push('');
      lines.push(page.text);
      lines.push('');
    } else {
      lines.push('**页面文字内容**: ⚠️ 未提取到文字');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }
}

/**
 * UI 设计分析段落
 */
function appendDesignSection(lines: string[], d: DesignSummary): void {
  lines.push('## 二、UI 设计分析');
  lines.push('');
  lines.push('### 项目信息');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 项目名 | ${d.project_name} |`);
  lines.push(`| 设计图总数 | ${d.total_designs} |`);
  lines.push(`| 成功分析数 | ${d.success_designs} |`);
  lines.push('');
  lines.push('### 设计图详情');
  lines.push('');

  for (let idx = 0; idx < d.designs.length; idx++) {
    const design = d.designs[idx];
    lines.push(`#### ${idx + 1}. ${design.name}`);
    lines.push('');

    if (design.sectors?.length) {
      lines.push(`**所属分组**: ${design.sectors.join('；')}`);
      lines.push('');
    }

    if (design.screenshot_path) {
      lines.push(`> 📷 设计截图: \`${design.screenshot_path}\``);
      lines.push('');
    }

    // HTML 代码（优先 DDS，fallback Sketch）
    const htmlCode = design.html_code || design.sketch_html;
    if (htmlCode) {
      lines.push('**HTML+CSS 代码**:');
      lines.push('');
      lines.push('```html');
      lines.push(htmlCode);
      lines.push('```');
      lines.push('');
    }

    // 图片资源映射
    if (design.image_url_mapping && Object.keys(design.image_url_mapping).length > 0) {
      lines.push('**图片资源映射**:');
      lines.push('');
      lines.push('| 本地路径 | 远程 URL |');
      lines.push('|---|---|');
      for (const [localPath, remoteUrl] of Object.entries(design.image_url_mapping)) {
        lines.push(`| \`${localPath}\` | ${remoteUrl} |`);
      }
      lines.push('');
    }

    // Design Tokens
    if (design.design_tokens) {
      lines.push('**Design Tokens**:');
      lines.push('');
      lines.push('```');
      lines.push(design.design_tokens);
      lines.push('```');
      lines.push('');
    }

    // Sketch 标注（fallback 时才有）
    if (design.sketch_annotations) {
      lines.push('**设计标注详情**:');
      lines.push('');
      lines.push('```');
      lines.push(design.sketch_annotations);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }
}

/**
 * 接口文档段落
 */
function appendApiDocSection(lines: string[], api: ApiDocSummary): void {
  lines.push('## 三、接口文档');
  lines.push('');
  lines.push('### API 基本信息');
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('|---|---|');
  lines.push(`| 文档标题 | ${api.title ?? '未知'} |`);
  lines.push(`| 文档类型 | ${api.doc_type} |`);
  if (api.source_url) lines.push(`| 来源 URL | ${api.source_url} |`);
  if (api.base_url) lines.push(`| Base URL | ${api.base_url} |`);
  lines.push(`| 接口总数 | ${api.total_endpoints} |`);
  if (api.markdown_path) {
    lines.push(`| 完整文档 | \`${api.markdown_path}\` |`);
  }
  lines.push('');
  lines.push('### 接口列表');
  lines.push('');

  for (let idx = 0; idx < api.endpoints.length; idx++) {
    const ep = api.endpoints[idx];
    lines.push(`#### ${idx + 1}. ${ep.summary ?? ep.operation_id ?? ep.path}`);
    lines.push('');
    lines.push(`- **Method**: \`${ep.method}\``);
    lines.push(`- **Path**: \`${ep.path}\``);
    if (ep.tags?.length) {
      lines.push(`- **标签**: ${ep.tags.join(', ')}`);
    }
    if (ep.operation_id) {
      lines.push(`- **operationId**: ${ep.operation_id}`);
    }
    lines.push('');

    // 请求参数
    const params = ep.parameters as Array<Record<string, unknown>> | undefined;
    if (params && params.length > 0) {
      lines.push('**请求参数**:');
      lines.push('');
      lines.push('| 参数名 | 位置 | 类型 | 必填 | 说明 |');
      lines.push('|---|---|---|---|---|');
      for (const p of params) {
        const name = String(p.name ?? '');
        const loc = String(p.in ?? '');
        const type = String(p.type ?? p.schema_type ?? '');
        const required = p.required ? '是' : '否';
        const desc = String(p.description ?? '');
        lines.push(`| ${name} | ${loc} | ${type} | ${required} | ${desc} |`);
      }
      lines.push('');
    }

    // 请求体
    const reqBody = ep.request_body as Record<string, unknown> | undefined;
    if (reqBody) {
      lines.push('**请求体**:');
      lines.push('');
      lines.push(`- Content-Type: ${reqBody.contentType ?? 'application/json'}`);
      lines.push(`- Required: ${reqBody.required ? '是' : '否'}`);
      lines.push('');
      const schema = reqBody.schema as Record<string, unknown> | undefined;
      if (schema?.properties) {
        const props = schema.properties as Record<string, Record<string, unknown>>;
        lines.push('| 字段 | 类型 | 必填 | 说明 |');
        lines.push('|---|---|---|---|');
        const requiredFields = (schema.required as string[]) ?? [];
        for (const [fieldName, fieldSchema] of Object.entries(props)) {
          const type = String(fieldSchema.type ?? '');
          const req = requiredFields.includes(fieldName) ? '是' : '否';
          const desc = String(fieldSchema.description ?? '');
          lines.push(`| ${fieldName} | ${type} | ${req} | ${desc} |`);
        }
        lines.push('');

        // JSON 示例
        const example: Record<string, unknown> = {};
        for (const [fieldName, fieldSchema] of Object.entries(props)) {
          example[fieldName] = fieldSchema.example ?? getDefaultExample(fieldSchema.type as string);
        }
        lines.push('请求示例:');
        lines.push('```json');
        lines.push(JSON.stringify(example, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    // 响应
    const responses = ep.responses as Array<Record<string, unknown>> | undefined;
    if (responses && responses.length > 0) {
      for (const resp of responses) {
        const status = String(resp.statusCode ?? '');
        const desc = String(resp.description ?? '');
        if (!resp.schema) {
          if (desc) lines.push(`**响应 ${status}**: ${desc}`);
          continue;
        }
        lines.push(`**响应 ${status}** — ${desc}`);
        lines.push('');
        const respSchema = resp.schema as Record<string, unknown>;
        if (respSchema.properties) {
          const props = respSchema.properties as Record<string, Record<string, unknown>>;
          lines.push('| 字段 | 类型 | 说明 |');
          lines.push('|---|---|---|');
          for (const [fieldName, fieldSchema] of Object.entries(props)) {
            const type = String(fieldSchema.type ?? '');
            const desc2 = String(fieldSchema.description ?? '');
            lines.push(`| ${fieldName} | ${type} | ${desc2} |`);
          }
          lines.push('');

          // 响应示例
          const example: Record<string, unknown> = {};
          for (const [fieldName, fieldSchema] of Object.entries(props)) {
            example[fieldName] = getDefaultExample(fieldSchema.type as string);
          }
          lines.push('响应示例:');
          lines.push('```json');
          lines.push(JSON.stringify(example, null, 2));
          lines.push('```');
          lines.push('');
        }
      }
    }

    lines.push('---');
    lines.push('');
  }

  // 类型定义
  if (api.type_definitions && api.type_definitions.length > 0) {
    lines.push('### 类型定义');
    lines.push('');
    const typeDefs = api.type_definitions as Array<Record<string, unknown>>;
    for (const td of typeDefs) {
      const name = String(td.name ?? '');
      lines.push(`#### ${name}`);
      lines.push('');
      const schema = td.schema as Record<string, unknown> | undefined;
      if (schema?.properties) {
        const props = schema.properties as Record<string, Record<string, unknown>>;
        lines.push('| 字段 | 类型 | 必填 | 说明 |');
        lines.push('|---|---|---|---|');
        const requiredFields = (schema.required as string[]) ?? [];
        for (const [fieldName, fieldSchema] of Object.entries(props)) {
          const type = String(fieldSchema.type ?? '');
          const req = requiredFields.includes(fieldName) ? '是' : '否';
          const desc = String(fieldSchema.description ?? '');
          lines.push(`| ${fieldName} | ${type} | ${req} | ${desc} |`);
        }
        lines.push('');
      }
    }
  }
}

/**
 * Icon/切片提示段落（提醒 LLM 分析 UI 后使用 download_slices 工具）
 */
function appendSliceHintsSection(lines: string[]): void {
  lines.push('## 四、Icon/切片资源');
  lines.push('');
  lines.push('设计图中的切片/icon 元数据已收集在综合分析结果中。');
  lines.push('请根据 UI 设计图分析，判断需要下载哪些 icon/切片，给出语义化文件名后调用 `lanhu_download_slices` 工具下载。');
  lines.push('');
  lines.push('---');
  lines.push('');
}

/**
 * 开发建议段落
 */
function appendDevSuggestions(lines: string[], result: ComprehensiveResult): void {
  lines.push('## 五、开发建议');
  lines.push('');
  lines.push('基于以上分析，建议的开发路径：');
  lines.push('');

  const steps: string[] = [];

  if (result.prototype) {
    steps.push('1. **理解需求**: 阅读原型需求分析，理解产品功能和交互流程');
  }

  if (result.design) {
    steps.push(`${steps.length + 1}. **设计还原**: 参考 UI 设计分析中的 HTML+CSS 代码和 Design Tokens，建立设计系统`);
    steps.push(`${steps.length + 1}. **Icon 资源**: 分析 UI 设计图后，使用 lanhu_download_slices 工具下载所需的 icon，按语义化命名保存`);
  }

  if (result.api_doc) {
    steps.push(`${steps.length + 1}. **接口对接**: 根据接口文档定义前后端数据交互，优先开发核心接口`);
  }

  steps.push(`${steps.length + 1}. **组件开发**: 按页面逐个开发，原型理解需求 → 设计图还原 UI → 接口联调`);

  lines.push(steps.join('\n'));
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('### ⚠️ 分析过程中的问题');
    lines.push('');
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`> 📄 本文档由蓝湖 MCP 自动生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
}

/**
 * 根据类型返回默认示例值
 */
function getDefaultExample(type: string): unknown {
  switch (type) {
    case 'string': return '示例字符串';
    case 'integer': return 0;
    case 'number': return 0.0;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
}
