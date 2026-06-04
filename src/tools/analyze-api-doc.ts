import { z } from 'zod';
import { detectApiDocType } from '../client/api-doc-detector.js';
import { fetchAndParseSwagger } from '../client/swagger-client.js';
import { fetchAndParseYapi } from '../client/yapi-client.js';
import { saveApiDocResult } from '../utils/api-doc-markdown.js';
import { getConfig } from '../config/env.js';
import type { ApiDocResult, ApiEndpoint, ApiSchemaRef, ApiSchemaField, ApiTypeDef } from '../types/api-doc.js';

/**
 * 从 ApiSchemaRef 中递归收集所有 ref 引用的类型名
 */
function collectRefsFromSchema(schema: ApiSchemaRef | undefined, refs: Set<string>): void {
  if (!schema) return;
  if (schema.ref) refs.add(schema.ref);
  // 递归 properties
  if (schema.properties) {
    for (const field of Object.values(schema.properties)) {
      collectRefsFromField(field, refs);
    }
  }
  // 递归 items（数组类型）
  if (schema.items) {
    collectRefsFromSchema(schema.items, refs);
  }
}

/**
 * 从 ApiSchemaField 中递归收集所有 ref 引用的类型名
 */
function collectRefsFromField(field: ApiSchemaField | undefined, refs: Set<string>): void {
  if (!field) return;
  if (field.ref) refs.add(field.ref);
  if (field.properties) {
    for (const f of Object.values(field.properties)) {
      collectRefsFromField(f, refs);
    }
  }
  if (field.items) {
    collectRefsFromSchema(field.items, refs);
  }
}

/**
 * 从过滤后的接口列表中收集所有被引用的类型名
 * 包括请求参数、请求体、响应体中的 ref，以及类型间的间接引用
 */
function collectReferencedTypeNames(
  endpoints: ApiEndpoint[],
  typeDefs: ApiTypeDef[],
): Set<string> {
  const refs = new Set<string>();

  // 1. 从接口的 parameters / requestBody / responses 中收集直接引用
  for (const ep of endpoints) {
    for (const param of ep.parameters) {
      // parameters 通常是基本类型，但如果有 properties/items 也递归
      if ((param as unknown as ApiSchemaField).properties) {
        for (const f of Object.values((param as unknown as ApiSchemaField).properties!)) {
          collectRefsFromField(f, refs);
        }
      }
    }
    if (ep.requestBody?.schema) {
      collectRefsFromSchema(ep.requestBody.schema, refs);
    }
    for (const resp of ep.responses) {
      if (resp.schema) {
        collectRefsFromSchema(resp.schema, refs);
      }
    }
  }

  // 2. 递归展开：如果类型 A 引用了类型 B，则 B 也应包含
  const typeDefMap = new Map(typeDefs.map(td => [td.name, td]));
  const toProcess = new Set(refs);
  for (const name of toProcess) {
    const td = typeDefMap.get(name);
    if (td) {
      const before = refs.size;
      collectRefsFromSchema(td.schema, refs);
      // 如果发现了新的 ref，继续处理
      if (refs.size > before) {
        for (const newName of refs) {
          if (!toProcess.has(newName)) {
            toProcess.add(newName);
          }
        }
      }
    }
  }

  return refs;
}

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

  // 4. 按接口过滤类型定义：只保留被过滤后接口引用的类型
  if (result.typeDefinitions.length > 0) {
    if (!include_type_defs) {
      result.typeDefinitions = [];
    } else if (result.endpoints.length > 0) {
      const referencedNames = collectReferencedTypeNames(result.endpoints, result.typeDefinitions);
      result.typeDefinitions = result.typeDefinitions.filter(td => referencedNames.has(td.name));
    }
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
