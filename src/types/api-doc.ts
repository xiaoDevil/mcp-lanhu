/** API 文档类型 */
export type ApiDocType = 'swagger' | 'openapi_v2' | 'openapi_v3' | 'yapi';

/** 文档类型检测结果 */
export interface ApiDocDetectionResult {
  type: ApiDocType;
  baseUrl: string;
  /** 解析出的元数据，如 project_id、interface_id 等 */
  meta: Record<string, string>;
}

/** 统一的 API 接口定义 */
export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  /** Swagger operationId，如 userConfirmUsingPOST */
  operationId?: string;
  /** 请求参数 */
  parameters: ApiParameter[];
  /** 请求体 */
  requestBody?: ApiRequestBody;
  /** 响应定义 */
  responses: ApiResponse[];
}

/** 统一的参数定义 */
export interface ApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  type: string;
  description?: string;
  default?: string;
  enum?: string[];
}

/** 请求体 */
export interface ApiRequestBody {
  contentType: string;
  required: boolean;
  schema: ApiSchemaRef;
  example?: string;
}

/** 响应定义 */
export interface ApiResponse {
  statusCode: string;
  description?: string;
  schema?: ApiSchemaRef;
  example?: string;
}

/** 统一的 schema 表达 */
export interface ApiSchemaRef {
  type: string;
  properties?: Record<string, ApiSchemaField>;
  items?: ApiSchemaRef;
  /** 指向 definitions/components 中的类型名 */
  ref?: string;
  required?: string[];
  description?: string;
  example?: unknown;
}

/** Schema 中的字段 */
export interface ApiSchemaField {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  format?: string;
  items?: ApiSchemaRef;
  properties?: Record<string, ApiSchemaField>;
  ref?: string;
  example?: unknown;
}

/** 类型定义 */
export interface ApiTypeDef {
  name: string;
  schema: ApiSchemaRef;
}

/** 完整的 API 文档解析结果 */
export interface ApiDocResult {
  status: 'success' | 'partial' | 'error';
  docType: ApiDocType;
  sourceUrl: string;
  title?: string;
  description?: string;
  version?: string;
  baseUrl?: string;
  totalEndpoints: number;
  endpoints: ApiEndpoint[];
  typeDefinitions: ApiTypeDef[];
  /** Markdown 文件保存路径 */
  markdownPath?: string;
  /** JSON 数据文件保存路径 */
  jsonPath?: string;
  warnings?: string[];
}
