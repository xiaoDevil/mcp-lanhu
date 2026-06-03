import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ApiDocResult, ApiEndpoint, ApiTypeDef, ApiSchemaRef } from '../types/api-doc.js';
import { getNowChinaTime } from './date.js';

/** 根据 URL 生成哈希目录名 */
function hashUrl(url: string): string {
  return createHash('md5').update(url).digest('hex').slice(0, 12);
}

/** 将 ApiSchemaRef 渲染为 Markdown 表格 */
function renderSchemaTable(schema: ApiSchemaRef, indent = ''): string {
  if (!schema.properties) {
    if (schema.items) {
      return `${indent}类型: Array<${schema.items.ref ?? schema.items.type}>\n`;
    }
    return `${indent}类型: ${schema.type}\n`;
  }

  let md = `${indent}| 字段 | 类型 | 必填 | 说明 |\n`;
  md += `${indent}|------|------|------|------|\n`;

  for (const [name, field] of Object.entries(schema.properties)) {
    const typeStr = field.items
      ? `Array<${field.items.ref ?? field.items.type ?? 'any'}>`
      : field.ref ?? field.type;
    const required = field.required ? 'Y' : 'N';
    const desc = field.description ?? '';
    const enums = field.enum ? ` 枚举: ${field.enum.join(',')}` : '';
    md += `${indent}| ${name} | ${typeStr} | ${required} | ${desc}${enums} |\n`;
  }

  return md;
}

/** 将单个接口渲染为 Markdown */
function renderEndpoint(ep: ApiEndpoint, index: number): string {
  let md = `### ${index + 1}. ${ep.summary ?? ep.path}\n\n`;
  md += `- **Method**: \`${ep.method}\`\n`;
  md += `- **Path**: \`${ep.path}\`\n`;
  if (ep.deprecated) md += '- **已废弃**: 是\n';
  if (ep.tags?.length) md += `- **标签**: ${ep.tags.join(', ')}\n`;
  if (ep.description) md += `- **说明**: ${ep.description}\n`;
  md += '\n';

  // 请求参数
  if (ep.parameters.length) {
    md += '#### 请求参数\n\n';
    md += '| 参数名 | 位置 | 类型 | 必填 | 说明 |\n';
    md += '|--------|------|------|------|------|\n';
    for (const p of ep.parameters) {
      const required = p.required ? 'Y' : 'N';
      const desc = p.description ?? '';
      const enums = p.enum ? ` 枚举: ${p.enum.join(',')}` : '';
      md += `| ${p.name} | ${p.in} | ${p.type} | ${required} | ${desc}${enums} |\n`;
    }
    md += '\n';
  }

  // 请求体
  if (ep.requestBody) {
    md += `#### 请求体 (\`${ep.requestBody.contentType}\`)\n\n`;
    if (ep.requestBody.schema) {
      md += renderSchemaTable(ep.requestBody.schema);
    }
    if (ep.requestBody.example) {
      md += `\n**示例**:\n\`\`\`json\n${ep.requestBody.example}\n\`\`\`\n`;
    }
    md += '\n';
  }

  // 响应
  if (ep.responses.length) {
    md += '#### 响应\n\n';
    for (const resp of ep.responses) {
      md += `**${resp.statusCode}**${resp.description ? ` - ${resp.description}` : ''}\n\n`;
      if (resp.schema) {
        md += renderSchemaTable(resp.schema);
      }
      if (resp.example) {
        md += `\n**示例**:\n\`\`\`json\n${resp.example}\n\`\`\`\n`;
      }
      md += '\n';
    }
  }

  md += '---\n\n';
  return md;
}

/** 将类型定义渲染为 Markdown */
function renderTypeDef(td: ApiTypeDef): string {
  let md = `### ${td.name}\n\n`;
  md += renderSchemaTable(td.schema);
  md += '\n---\n\n';
  return md;
}

/** 生成完整 Markdown 文档 */
export function generateMarkdown(result: ApiDocResult): string {
  let md = '# API 接口文档\n\n';
  md += `> 文档类型: ${result.docType}\n`;
  md += `> 来源: ${result.sourceUrl}\n`;
  md += `> 生成时间: ${getNowChinaTime()}\n`;
  if (result.title) md += `> 标题: ${result.title}\n`;
  if (result.version) md += `> 版本: ${result.version}\n`;
  if (result.baseUrl) md += `> Base URL: ${result.baseUrl}\n`;
  md += `> 接口总数: ${result.totalEndpoints}\n\n`;
  md += '---\n\n';

  // 目录
  md += '## 目录\n\n';
  for (let i = 0; i < result.endpoints.length; i++) {
    const ep = result.endpoints[i];
    const title = ep.summary ?? ep.path;
    md += `${i + 1}. [\`${ep.method}\`] ${title}\n`;
  }
  md += '\n---\n\n';

  // 接口详情
  md += '## 接口列表\n\n';
  for (let i = 0; i < result.endpoints.length; i++) {
    md += renderEndpoint(result.endpoints[i], i);
  }

  // 类型定义
  if (result.typeDefinitions.length) {
    md += '## 类型定义\n\n';
    for (const td of result.typeDefinitions) {
      md += renderTypeDef(td);
    }
  }

  // 警告
  if (result.warnings?.length) {
    md += '## 警告\n\n';
    for (const w of result.warnings) {
      md += `- ${w}\n`;
    }
  }

  return md;
}

/** 保存结果到本地文件 */
export async function saveApiDocResult(
  result: ApiDocResult,
  dataDir: string,
): Promise<{ markdownPath: string; jsonPath: string }> {
  const dirName = `apidoc_${hashUrl(result.sourceUrl)}`;
  const outputDir = join(dataDir, 'api-docs', dirName);
  await mkdir(outputDir, { recursive: true });

  // 保存 Markdown
  const md = generateMarkdown(result);
  const markdownPath = join(outputDir, 'api-doc.md');
  await writeFile(markdownPath, md, 'utf-8');

  // 保存 JSON（去掉文件路径字段避免冗余）
  const jsonPath = join(outputDir, 'api-doc.json');
  const jsonData = { ...result };
  delete (jsonData as Record<string, unknown>).markdownPath;
  delete (jsonData as Record<string, unknown>).jsonPath;
  await writeFile(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');

  return { markdownPath, jsonPath };
}
