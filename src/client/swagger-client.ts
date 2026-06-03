import yaml from 'js-yaml';
import type {
  ApiEndpoint, ApiParameter, ApiRequestBody, ApiResponse,
  ApiSchemaRef, ApiSchemaField, ApiTypeDef, ApiDocResult, ApiDocType,
} from '../types/api-doc.js';

interface SwaggerDoc {
  swagger?: string;
  openapi?: string;
  info?: { title?: string; description?: string; version?: string };
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, Record<string, unknown>>;
  definitions?: Record<string, unknown>;
  servers?: Array<{ url?: string }>;
  components?: { schemas?: Record<string, unknown> };
}

/** 解析 $ref 引用路径 "#/definitions/Foo" -> "Foo" */
function resolveRefName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

/**
 * 将 OpenAPI Schema 转换为统一的 ApiSchemaRef
 * 递归处理 $ref、allOf、properties 等
 */
function convertSchema(
  schema: Record<string, unknown> | undefined,
  defs: Record<string, unknown>,
  visited?: Set<string>,
): ApiSchemaRef {
  if (!schema) return { type: 'any' };

  // 防止循环引用
  if (!visited) visited = new Set();
  if (schema.$ref) {
    const name = resolveRefName(schema.$ref as string);
    if (visited.has(name)) {
      return { type: 'object', ref: name, description: '(循环引用)' };
    }
    visited.add(name);
    const resolved = defs[name] as Record<string, unknown> | undefined;
    if (resolved) {
      const inner = convertSchema(resolved, defs, visited);
      inner.ref = name;
      return inner;
    }
    return { type: 'object', ref: name };
  }

  // 处理 allOf
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged: Record<string, ApiSchemaField> = {};
    const requiredFields: string[] = [];
    for (const sub of schema.allOf as Array<Record<string, unknown>>) {
      const subSchema = convertSchema(sub, defs, visited);
      if (subSchema.properties) Object.assign(merged, subSchema.properties);
      if (subSchema.required) requiredFields.push(...subSchema.required);
    }
    return {
      type: 'object',
      properties: merged,
      required: requiredFields.length ? requiredFields : undefined,
    };
  }

  // 处理 oneOf / anyOf
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as Array<Record<string, unknown>>;
    const types = variants.map(v => {
      const s = convertSchema(v, defs, visited);
      return s.ref ?? s.type;
    });
    return { type: 'oneOf', description: types.join(' | ') };
  }

  const result: ApiSchemaRef = {
    type: (schema.type as string) || 'any',
  };
  if (schema.description) result.description = schema.description as string;
  if (schema.format) result.description = `${result.description ?? ''} (format: ${schema.format as string})`.trim();
  if (schema.example !== undefined) result.example = schema.example;

  // array 的 items
  if (schema.type === 'array' && schema.items) {
    result.items = convertSchema(schema.items as Record<string, unknown>, defs, visited);
  }

  // object 的 properties
  if (schema.properties) {
    const props: Record<string, ApiSchemaField> = {};
    const requiredList = (schema.required as string[]) ?? [];
    for (const [name, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      const ref = convertSchema(propSchema as Record<string, unknown>, defs, visited);
      props[name] = {
        type: ref.type,
        description: ref.description,
        required: requiredList.includes(name),
        enum: (propSchema as Record<string, unknown>).enum as string[] | undefined,
        default: (propSchema as Record<string, unknown>).default,
        format: (propSchema as Record<string, unknown>).format as string | undefined,
        items: ref.items,
        properties: ref.properties,
        ref: ref.ref,
        example: ref.example,
      };
    }
    result.properties = props;
    result.required = requiredList.length ? requiredList : undefined;
  }

  return result;
}

/** 将 v2 参数列表转换为 ApiParameter[] + ApiRequestBody */
function convertV2Params(
  params: Array<Record<string, unknown>> | undefined,
  defs: Record<string, unknown>,
): { parameters: ApiParameter[]; requestBody?: ApiRequestBody } {
  if (!params) return { parameters: [] };

  const parameters: ApiParameter[] = [];
  let requestBody: ApiRequestBody | undefined;

  for (const p of params) {
    const inVal = p.in as string;
    if (inVal === 'body') {
      requestBody = {
        contentType: 'application/json',
        required: p.required === true,
        schema: convertSchema(p.schema as Record<string, unknown>, defs),
      };
    } else {
      parameters.push({
        name: p.name as string,
        in: inVal as ApiParameter['in'],
        required: p.required === true,
        type: (p.type as string) ?? 'string',
        description: p.description as string | undefined,
        enum: p.enum as string[] | undefined,
        default: p.default !== undefined ? String(p.default) : undefined,
      });
    }
  }

  return { parameters, requestBody };
}

/** 将 v3 requestBody 转换 */
function convertV3RequestBody(
  rb: Record<string, unknown> | undefined,
  defs: Record<string, unknown>,
): ApiRequestBody | undefined {
  if (!rb) return undefined;
  const content = rb.content as Record<string, Record<string, unknown>> | undefined;
  if (!content) return undefined;

  for (const [contentType, mediaType] of Object.entries(content)) {
    return {
      contentType,
      required: rb.required === true,
      schema: convertSchema(mediaType.schema as Record<string, unknown>, defs),
      example: mediaType.example ? JSON.stringify(mediaType.example, null, 2) : undefined,
    };
  }
  return undefined;
}

/** 将 v2/v3 responses 转换 */
function convertResponses(
  responses: Record<string, unknown>,
  defs: Record<string, unknown>,
): ApiResponse[] {
  const result: ApiResponse[] = [];
  for (const [code, respObj] of Object.entries(responses)) {
    const r = respObj as Record<string, unknown>;
    const apiResp: ApiResponse = {
      statusCode: code,
      description: r.description as string | undefined,
    };
    // v2 response schema
    if (r.schema) {
      apiResp.schema = convertSchema(r.schema as Record<string, unknown>, defs);
    }
    // v3 response content
    if (r.content) {
      const content = r.content as Record<string, Record<string, unknown>>;
      for (const mediaType of Object.values(content)) {
        if (mediaType.schema) {
          apiResp.schema = convertSchema(mediaType.schema as Record<string, unknown>, defs);
        }
        if (mediaType.example) {
          apiResp.example = JSON.stringify(mediaType.example, null, 2);
        }
        break;
      }
    }
    result.push(apiResp);
  }
  return result;
}

/**
 * 获取并解析 Swagger/OpenAPI 文档
 */
export async function fetchAndParseSwagger(url: string): Promise<ApiDocResult> {
  // 1. 获取文档内容
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json, application/yaml, text/yaml, */*' },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} 获取 Swagger 文档失败: ${url}`);
  }

  let docText = await resp.text();
  let doc: SwaggerDoc;

  // JSON 或 YAML 解析
  if (docText.trim().startsWith('{') || docText.trim().startsWith('[')) {
    doc = JSON.parse(docText);
  } else {
    doc = yaml.load(docText) as SwaggerDoc;
  }

  const isV3 = Boolean(doc.openapi);
  const docType: ApiDocType = isV3 ? 'openapi_v3' : 'openapi_v2';

  // 2. 确定 definitions 源
  const defs = isV3
    ? (doc.components?.schemas ?? {}) as Record<string, unknown>
    : (doc.definitions ?? {}) as Record<string, unknown>;

  // 3. 确定 base URL
  let baseUrl = '';
  if (doc.host) {
    const scheme = doc.schemes?.[0] ?? 'https';
    baseUrl = `${scheme}://${doc.host}${doc.basePath ?? ''}`;
  } else if (doc.servers?.[0]?.url) {
    baseUrl = doc.servers[0].url;
  }

  // 4. 遍历 paths 提取端点
  const endpoints: ApiEndpoint[] = [];
  const warnings: string[] = [];

  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;
    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      const op = operation as Record<string, unknown>;
      if (!op || typeof op !== 'object') continue;

      const upperMethod = method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(upperMethod)) continue;

      // v2 参数处理
      const { parameters, requestBody: v2Body } = convertV2Params(
        op.parameters as Array<Record<string, unknown>> | undefined,
        defs,
      );

      // v3 requestBody
      const v3Body = convertV3RequestBody(
        op.requestBody as Record<string, unknown> | undefined,
        defs,
      );

      endpoints.push({
        method: upperMethod as ApiEndpoint['method'],
        path,
        operationId: op.operationId as string | undefined,
        summary: op.summary as string | undefined,
        description: op.description as string | undefined,
        tags: op.tags as string[] | undefined,
        deprecated: op.deprecated === true,
        parameters,
        requestBody: v3Body ?? v2Body,
        responses: convertResponses((op.responses ?? {}) as Record<string, unknown>, defs),
      });
    }
  }

  // 5. 提取类型定义
  const typeDefinitions: ApiTypeDef[] = [];
  for (const [name, schema] of Object.entries(defs)) {
    typeDefinitions.push({
      name,
      schema: convertSchema(schema as Record<string, unknown>, defs),
    });
  }

  return {
    status: 'success',
    docType,
    sourceUrl: url,
    title: doc.info?.title,
    description: doc.info?.description,
    version: doc.info?.version,
    baseUrl: baseUrl || undefined,
    totalEndpoints: endpoints.length,
    endpoints,
    typeDefinitions,
    warnings: warnings.length ? warnings : undefined,
  };
}
