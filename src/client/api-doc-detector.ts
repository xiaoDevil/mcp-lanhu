import type { ApiDocDetectionResult, ApiDocType } from '../types/api-doc.js';

interface DetectionRule {
  type: ApiDocType;
  urlPatterns: RegExp[];
}

const RULES: DetectionRule[] = [
  {
    type: 'yapi',
    urlPatterns: [
      /yapi/i,
      /\/project\/\d+\/interface\/api/i,
      /\/api\/interface\/(list|get)/i,
    ],
  },
  {
    type: 'openapi_v3',
    urlPatterns: [
      /openapi/i,
      /v3\/api-docs/i,
    ],
  },
  {
    type: 'openapi_v2',
    urlPatterns: [
      /v2\/api-docs/i,
      /swagger\.json/i,
      /api-docs/i,
      /doc\.html/i, // Knife4j / Swagger UI 页面
    ],
  },
];

/**
 * 从 URL 提取 YApi 项目元数据
 */
function extractYapiMeta(url: string): Record<string, string> {
  const meta: Record<string, string> = {};
  try {
    const u = new URL(url);
    // /project/{id}/interface/api/{catId} 或 /project/{id}/interface/api/cat_{catId}
    const pathMatch = u.pathname.match(/\/project\/(\d+)/);
    if (pathMatch) {
      meta.project_id = pathMatch[1];
      meta.base_url = `${u.origin}`;
    }
    // 单接口: /interface/api/{id}
    const ifaceMatch = u.pathname.match(/\/interface\/api\/(\d+)/);
    if (ifaceMatch) {
      meta.interface_id = ifaceMatch[1];
      if (!meta.project_id) {
        // 尝试从 query 参数获取 project_id
        const pid = u.searchParams.get('project_id');
        if (pid) meta.project_id = pid;
      }
    }
    // ?project_id=xxx
    if (!meta.project_id) {
      const pid = u.searchParams.get('project_id');
      if (pid) {
        meta.project_id = pid;
        meta.base_url = `${u.origin}`;
      }
    }
    // ?id=xxx (单接口)
    const iid = u.searchParams.get('id');
    if (iid) {
      meta.interface_id = iid;
    }
  } catch { /* ignore */ }
  return meta;
}

/**
 * 从 Swagger UI / Knife4j URL 的 hash fragment 中提取接口标识
 * 例如: doc.html#/default/新版此刻-订单相关接口/userConfirmUsingPOST → userConfirmUsingPOST
 */
export function extractEndpointFilter(url: string): string | undefined {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return undefined;
  const hash = url.slice(hashIndex + 1);
  if (!hash.startsWith('/')) return undefined;
  // 取 hash 路径的最后一段作为接口标识
  const segments = hash.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  return segments[segments.length - 1] || undefined;
}

/**
 * 尝试猜测 Swagger/OpenAPI 文档的 JSON 端点
 */
function guessSwaggerJsonUrls(url: string): string[] {
  const candidates: string[] = [];
  try {
    const u = new URL(url);
    const base = `${u.origin}`;
    candidates.push(url);
    candidates.push(`${base}/swagger.json`);
    candidates.push(`${base}/v2/api-docs`);
    candidates.push(`${base}/v3/api-docs`);
    // 保留 context path
    const pathParts = u.pathname.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      // 移除最后一层（可能是 swagger-ui.html 等），拼接 api-docs
      const ctx = '/' + pathParts.slice(0, -1).join('/');
      candidates.push(`${base}${ctx}/swagger.json`);
      candidates.push(`${base}${ctx}/v2/api-docs`);
      candidates.push(`${base}${ctx}/v3/api-docs`);
    }
  } catch { /* ignore */ }
  return candidates;
}

/**
 * 检测 API 文档类型
 */
export async function detectApiDocType(
  url: string,
  forceType: 'auto' | 'swagger' | 'yapi'
): Promise<ApiDocDetectionResult> {
  // 提取 URL hash 中的接口过滤标识
  const endpointFilter = extractEndpointFilter(url);

  // 1. 用户强制指定类型
  if (forceType === 'yapi') {
    const meta = extractYapiMeta(url);
    if (endpointFilter) meta.endpoint_filter = endpointFilter;
    return { type: 'yapi', baseUrl: url, meta };
  }
  if (forceType === 'swagger') {
    const meta: Record<string, string> = {};
    if (endpointFilter) meta.endpoint_filter = endpointFilter;
    return { type: 'openapi_v3', baseUrl: url, meta };
  }

  // 2. URL 模式匹配
  for (const rule of RULES) {
    for (const pattern of rule.urlPatterns) {
      if (pattern.test(url)) {
        const meta = rule.type === 'yapi' ? extractYapiMeta(url) : {};
        if (endpointFilter) meta.endpoint_filter = endpointFilter;
        return { type: rule.type, baseUrl: url, meta };
      }
    }
  }

  // 3. 内容探针：请求 URL 检查响应内容
  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json, application/yaml, text/yaml, */*' },
      signal: AbortSignal.timeout(10000),
    });
    const text = await resp.text();

    // YAML 格式检测
    if (text.trim().startsWith('openapi:') || text.trim().startsWith('swagger:')) {
      const meta: Record<string, string> = {};
      if (endpointFilter) meta.endpoint_filter = endpointFilter;
      return { type: 'openapi_v3', baseUrl: url, meta };
    }

    // JSON 格式检测
    try {
      const json = JSON.parse(text);
      const meta: Record<string, string> = {};
      if (endpointFilter) meta.endpoint_filter = endpointFilter;
      if (json.openapi) return { type: 'openapi_v3', baseUrl: url, meta };
      if (json.swagger) return { type: 'openapi_v2', baseUrl: url, meta };
      // YApi 典型响应
      if (json.data && typeof json.data === 'object') {
        if (json.data.list || json.data.method || json.data.path) {
          const meta = extractYapiMeta(url);
          if (endpointFilter) meta.endpoint_filter = endpointFilter;
          return { type: 'yapi', baseUrl: url, meta };
        }
      }
    } catch { /* 非 JSON */ }
  } catch { /* 探针失败 */ }

  // 4. 尝试 Swagger 常见路径猜测
  for (const candidate of guessSwaggerJsonUrls(url)) {
    try {
      const resp = await fetch(candidate, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        const meta: Record<string, string> = {};
        if (endpointFilter) meta.endpoint_filter = endpointFilter;
        if (json.openapi) return { type: 'openapi_v3', baseUrl: candidate, meta };
        if (json.swagger) return { type: 'openapi_v2', baseUrl: candidate, meta };
      } catch { /* 非 JSON */ }
    } catch { /* 忽略 */ }
  }

  throw new Error(
    '无法自动识别文档类型。请通过 doc_type 参数手动指定 "swagger" 或 "yapi"。\n' +
    '支持的 URL 格式:\n' +
    '  - Swagger/OpenAPI: /swagger.json, /v2/api-docs, /v3/api-docs\n' +
    '  - YApi: /project/{id}/interface/api, /api/interface/list?project_id={id}'
  );
}
