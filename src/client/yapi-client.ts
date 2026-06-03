import type {
  ApiEndpoint, ApiParameter, ApiRequestBody, ApiResponse,
  ApiSchemaRef, ApiSchemaField, ApiTypeDef, ApiDocResult,
} from '../types/api-doc.js';

interface YApiConfig {
  baseUrl: string;
  projectId: string;
  interfaceId?: string;
  token?: string;
}

/** 从 URL 解析 YApi 配置 */
export function parseYapiUrl(url: string, token?: string): YApiConfig {
  try {
    const u = new URL(url);
    let projectId = '';
    let interfaceId: string | undefined;

    // /project/{id}/interface/api/{interfaceId}
    const pathMatch = u.pathname.match(/\/project\/(\d+)(?:\/interface\/api\/(?:cat_\d+|(\d+)))?/);
    if (pathMatch) {
      projectId = pathMatch[1];
      if (pathMatch[2]) interfaceId = pathMatch[2];
    }

    // /interface/api/{id}
    if (!projectId) {
      const ifaceMatch = u.pathname.match(/\/interface\/api\/(\d+)/);
      if (ifaceMatch) interfaceId = ifaceMatch[1];
    }

    // ?project_id=xxx
    if (!projectId) {
      projectId = u.searchParams.get('project_id') ?? '';
    }

    // ?id=xxx (单接口)
    if (!interfaceId) {
      interfaceId = u.searchParams.get('id') ?? undefined;
    }

    if (!projectId && !interfaceId) {
      throw new Error('无法从 URL 中提取 YApi project_id 或 interface_id');
    }

    return { baseUrl: u.origin, projectId, interfaceId, token };
  } catch (e) {
    throw new Error(`YApi URL 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 通用 YApi API 请求 */
async function yapiGet<T = unknown>(
  config: YApiConfig,
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    searchParams.set(k, String(v));
  }
  if (config.token) {
    searchParams.set('token', config.token);
  }
  const url = `${config.baseUrl}${path}?${searchParams.toString()}`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`YApi HTTP ${resp.status}: ${url}`);

  const json = await resp.json() as Record<string, unknown>;
  if (json.errcode !== 0) {
    throw new Error(`YApi 错误: ${json.errmsg ?? 'Unknown'} (errcode=${json.errcode})`);
  }
  return json.data as T;
}

/** 将 YApi JSON Schema 字符串转换为 ApiSchemaRef */
function parseYapiSchema(schemaStr: string | null | undefined): ApiSchemaRef | undefined {
  if (!schemaStr) return undefined;
  try {
    const schema = JSON.parse(schemaStr);
    return convertYapiSchemaObj(schema);
  } catch {
    return undefined;
  }
}

function convertYapiSchemaObj(obj: Record<string, unknown>): ApiSchemaRef {
  const result: ApiSchemaRef = {
    type: (obj.type as string) ?? 'any',
  };
  if (obj.description) result.description = obj.description as string;
  if (obj.example !== undefined) result.example = obj.example;

  if (obj.items) {
    result.items = convertYapiSchemaObj(obj.items as Record<string, unknown>);
  }

  if (obj.properties) {
    const props: Record<string, ApiSchemaField> = {};
    const requiredList = (obj.required as string[]) ?? [];
    for (const [name, propObj] of Object.entries(obj.properties as Record<string, unknown>)) {
      const sub = convertYapiSchemaObj(propObj as Record<string, unknown>);
      const p = propObj as Record<string, unknown>;
      props[name] = {
        type: sub.type,
        description: sub.description,
        required: requiredList.includes(name),
        enum: p.enum as string[] | undefined,
        default: p.default,
        format: p.format as string | undefined,
        items: sub.items,
        properties: sub.properties,
        ref: sub.ref,
        example: sub.example,
      };
    }
    result.properties = props;
    result.required = requiredList.length ? requiredList : undefined;
  }

  return result;
}

/** 获取项目信息 */
async function getProjectInfo(config: YApiConfig): Promise<Record<string, unknown>> {
  if (!config.projectId) return {};
  return yapiGet(config, '/api/project/get', { id: config.projectId });
}

/** 获取接口列表（支持分页） */
async function getInterfaceList(
  config: YApiConfig,
): Promise<Array<Record<string, unknown>>> {
  if (!config.projectId) return [];

  const allList: Array<Record<string, unknown>> = [];
  let page = 1;
  const limit = 200;

  while (true) {
    const data = await yapiGet<{ list: Array<Record<string, unknown>>; total: number }>(
      config,
      '/api/interface/list',
      { project_id: config.projectId, page, limit },
    );
    const list = data.list ?? [];
    allList.push(...list);
    if (allList.length >= (data.total ?? 0) || list.length < limit) break;
    page++;
  }

  return allList;
}

/** 获取单个接口详情 */
async function getInterfaceDetail(
  config: YApiConfig,
  id: number | string,
): Promise<Record<string, unknown>> {
  return yapiGet(config, '/api/interface/get', { id });
}

/** 从嵌套 schema 中提取类型定义 */
function extractTypeDefsFromSchema(
  schema: ApiSchemaRef,
  seen: Map<string, ApiTypeDef>,
): void {
  if (schema.ref && !seen.has(schema.ref)) {
    seen.set(schema.ref, { name: schema.ref, schema });
  }
  if (schema.properties) {
    for (const field of Object.values(schema.properties)) {
      if (field.properties || field.items) {
        extractTypeDefsFromSchema(
          { type: field.type, properties: field.properties, items: field.items, ref: field.ref },
          seen,
        );
      }
    }
  }
  if (schema.items) {
    extractTypeDefsFromSchema(schema.items, seen);
  }
}

/** 将 YApi 接口详情转换为 ApiEndpoint */
function convertInterfaceDetail(detail: Record<string, unknown>, defs: Map<string, ApiTypeDef>): ApiEndpoint {
  const method = String(detail.method ?? 'GET').toUpperCase() as ApiEndpoint['method'];
  const parameters: ApiParameter[] = [];

  // 解析 query 参数
  for (const q of (detail.req_query ?? []) as Array<Record<string, unknown>>) {
    parameters.push({
      name: q.name as string,
      in: 'query',
      required: q.required === '1' || q.required === true,
      type: 'string',
      description: (q.desc ?? q.description) as string | undefined,
    });
  }

  // 解析 path 参数
  for (const p of (detail.req_params ?? []) as Array<Record<string, unknown>>) {
    parameters.push({
      name: p.name as string,
      in: 'path',
      required: true,
      type: 'string',
      description: (p.desc ?? p.description) as string | undefined,
    });
  }

  // 解析 header 参数
  for (const h of (detail.req_headers ?? []) as Array<Record<string, unknown>>) {
    parameters.push({
      name: h.name as string,
      in: 'header',
      required: h.required === '1' || h.required === true,
      type: 'string',
      description: (h.desc ?? h.description) as string | undefined,
    });
  }

  // 解析请求体
  let requestBody: ApiRequestBody | undefined;
  if (detail.req_body_type === 'json' && detail.req_body_other) {
    const schema = parseYapiSchema(detail.req_body_other as string);
    if (schema) {
      requestBody = { contentType: 'application/json', required: true, schema };
      extractTypeDefsFromSchema(schema, defs);
    }
  } else if (detail.req_body_type === 'form') {
    const formParams = (detail.req_body_form ?? []) as Array<Record<string, unknown>>;
    const props: Record<string, ApiSchemaField> = {};
    const requiredList: string[] = [];
    for (const f of formParams) {
      const name = f.name as string;
      props[name] = {
        type: (f.type as string) ?? 'string',
        description: (f.desc ?? f.description) as string | undefined,
        required: f.required === '1' || f.required === true,
      };
      if (f.required === '1' || f.required === true) requiredList.push(name);
    }
    requestBody = {
      contentType: 'application/x-www-form-urlencoded',
      required: true,
      schema: {
        type: 'object',
        properties: props,
        required: requiredList.length ? requiredList : undefined,
      },
    };
  }

  // 解析响应
  const responses: ApiResponse[] = [];
  if (detail.res_body) {
    const schema = parseYapiSchema(detail.res_body as string);
    responses.push({ statusCode: '200', description: '成功响应', schema });
    if (schema) extractTypeDefsFromSchema(schema, defs);
  }

  // 标签
  const tags: string[] = [];
  if (detail.catname) tags.push(detail.catname as string);
  if (detail.tag) {
    const tagArr = Array.isArray(detail.tag) ? detail.tag : [detail.tag];
    tags.push(...tagArr.map(String));
  }

  return {
    method,
    path: String(detail.path ?? ''),
    summary: detail.title as string | undefined,
    description: [detail.desc ?? detail.markdown ?? '']
      .filter(Boolean).join('\n') || undefined,
    tags: tags.length ? tags : undefined,
    parameters,
    requestBody,
    responses,
  };
}

/**
 * 获取并解析 YApi 项目全部接口
 */
export async function fetchAndParseYapi(url: string, token?: string): Promise<ApiDocResult> {
  const config = parseYapiUrl(url, token);
  const warnings: string[] = [];

  // 1. 获取项目信息
  let projectInfo: Record<string, unknown> = {};
  try {
    projectInfo = await getProjectInfo(config);
  } catch (e) {
    warnings.push(`获取 YApi 项目信息失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  const seenTypeDefs = new Map<string, ApiTypeDef>();
  const endpoints: ApiEndpoint[] = [];

  // 2. 单接口模式
  if (config.interfaceId) {
    try {
      const detail = await getInterfaceDetail(config, config.interfaceId);
      endpoints.push(convertInterfaceDetail(detail, seenTypeDefs));
    } catch (e) {
      throw new Error(`获取 YApi 接口详情失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // 3. 全量项目模式
    const interfaceList = await getInterfaceList(config);

    // 并发获取接口详情（最多 5 个）
    const batchSize = 5;
    for (let i = 0; i < interfaceList.length; i += batchSize) {
      const batch = interfaceList.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map(item => {
          const id = item._id ?? item.id;
          return getInterfaceDetail(config, Number(id)).catch(e => {
            warnings.push(`接口 ${item.title ?? id} 获取失败: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          });
        }),
      );

      for (const detail of details) {
        if (!detail) continue;
        endpoints.push(convertInterfaceDetail(detail, seenTypeDefs));
      }
    }
  }

  const typeDefinitions = Array.from(seenTypeDefs.values());

  return {
    status: warnings.length ? 'partial' : 'success',
    docType: 'yapi',
    sourceUrl: url,
    title: projectInfo.name as string | undefined,
    description: projectInfo.desc as string | undefined,
    baseUrl: config.baseUrl,
    totalEndpoints: endpoints.length,
    endpoints,
    typeDefinitions,
    warnings: warnings.length ? warnings : undefined,
  };
}
