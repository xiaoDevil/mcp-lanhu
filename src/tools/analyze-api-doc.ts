import { z } from 'zod';
import { detectApiDocType } from '../client/api-doc-detector.js';
import { fetchAndParseSwagger } from '../client/swagger-client.js';
import { fetchAndParseYapi } from '../client/yapi-client.js';
import { saveApiDocResult } from '../utils/api-doc-markdown.js';
import { getConfig } from '../config/env.js';
import type { ApiDocResult } from '../types/api-doc.js';

export const analyzeApiDocSchema = {
  url: z.string().describe(
    'API 文档 URL。支持 Swagger/OpenAPI JSON 地址（如 /swagger.json, /v2/api-docs, /v3/api-docs）' +
    '或 YApi 项目地址（如 http://yapi.xxx.com/project/123/interface/api）。' +
    '也可直接传入 OpenAPI JSON/YAML 文件的完整 URL。'
  ),
  doc_type: z.enum(['auto', 'swagger', 'yapi']).default('auto').describe(
    '文档类型。"auto" = 自动检测（默认）；"swagger" = 强制按 Swagger/OpenAPI 解析；' +
    '"yapi" = 强制按 YApi 解析。默认: "auto"'
  ),
  save_to_local: z.boolean().default(true).describe(
    '是否保存解析结果到本地 data/api-docs/ 目录（Markdown + JSON）。默认: true'
  ),
  include_type_defs: z.boolean().default(true).describe(
    '是否在结果中包含完整的类型定义（definitions / components/schemas）。默认: true'
  ),
};

export async function analyzeApiDoc(
  args: {
    url: string;
    doc_type: 'auto' | 'swagger' | 'yapi';
    save_to_local: boolean;
    include_type_defs: boolean;
  },
): Promise<Record<string, unknown>> {
  const { url, doc_type, save_to_local, include_type_defs } = args;
  const config = getConfig();

  // 1. 检测文档类型
  const detection = await detectApiDocType(url, doc_type);

  // 2. 根据类型获取并解析文档
  let result: ApiDocResult;
  if (detection.type === 'yapi') {
    result = await fetchAndParseYapi(url, config.yapiToken);
  } else {
    result = await fetchAndParseSwagger(detection.baseUrl);
  }

  // 3. 按 URL 中指定的接口过滤
  const endpointFilter = detection.meta.endpoint_filter;
  if (endpointFilter) {
    const filter = endpointFilter;
    result.endpoints = result.endpoints.filter(ep =>
      ep.operationId === filter ||
      ep.summary === filter ||
      ep.path.includes(filter) ||
      // 模糊匹配：operationId 或 summary 包含过滤词
      (ep.operationId && ep.operationId.toLowerCase().includes(filter.toLowerCase())) ||
      (ep.summary && ep.summary.toLowerCase().includes(filter.toLowerCase()))
    );
    result.totalEndpoints = result.endpoints.length;
  }

  // 4. 可选：移除类型定义
  if (!include_type_defs) {
    result.typeDefinitions = [];
  }

  // 5. 可选：保存到本地
  if (save_to_local) {
    const paths = await saveApiDocResult(result, config.dataDir);
    result.markdownPath = paths.markdownPath;
    result.jsonPath = paths.jsonPath;
  }

  // 6. 构建输出（不包含巨型 schema 的精简摘要 + 完整数据）
  const output: Record<string, unknown> = {
    status: result.status,
    docType: result.docType,
    sourceUrl: result.sourceUrl,
    title: result.title,
    description: result.description,
    version: result.version,
    baseUrl: result.baseUrl,
    totalEndpoints: result.totalEndpoints,
    endpoints: result.endpoints.map(ep => ({
      method: ep.method,
      path: ep.path,
      operationId: ep.operationId,
      summary: ep.summary,
      tags: ep.tags,
      deprecated: ep.deprecated,
      parameters: ep.parameters,
      requestBody: ep.requestBody,
      responses: ep.responses,
    })),
  };

  if (include_type_defs) {
    output.typeDefinitions = result.typeDefinitions;
  }
  if (result.markdownPath) output.markdownPath = result.markdownPath;
  if (result.jsonPath) output.jsonPath = result.jsonPath;
  if (result.warnings?.length) output.warnings = result.warnings;

  return output;
}
