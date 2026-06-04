/**
 * 综合需求分析 - 类型定义
 */

/** 综合分析输入参数 */
export interface ComprehensiveAnalysisArgs {
  /** 蓝湖 Axure 原型 URL（含 docId） */
  prototype_url?: string;
  /** 要分析的原型页面名，默认 "all" */
  page_names?: string | string[];
  /** 蓝湖 UI 设计图 URL（不含 docId） */
  design_url?: string;
  /** 设计图名，默认 "all" */
  design_names?: string | string[];
  /** API 文档 URL */
  api_doc_url?: string;
  /** 文档类型，默认 "auto" */
  api_doc_type?: 'auto' | 'swagger' | 'yapi';
  /** 项目名称（默认自动推断） */
  project_name?: string;
  /** 图片输出模式 */
  image_mode?: 'auto' | 'direct' | 'mcp_assisted' | 'text_only_images';
}

/** 原型分析结果摘要 */
export interface PrototypeSummary {
  document_name: string;
  total_pages: number;
  success_pages: number;
  pages: Array<{
    name: string;
    text: string;
    screenshot_path?: string;
  }>;
  requirement_md_path?: string;
}

/** 设计分析结果摘要 */
export interface DesignSummary {
  project_name: string;
  total_designs: number;
  success_designs: number;
  designs: Array<{
    name: string;
    sectors?: string[];
    html_code?: string;
    design_tokens?: string;
    screenshot_path?: string;
    sketch_html?: string;
    sketch_annotations?: string;
    image_url_mapping?: Record<string, string>;
  }>;
}

/** API 文档结果摘要 */
export interface ApiDocSummary {
  title?: string;
  doc_type: string;
  source_url?: string;
  base_url?: string;
  total_endpoints: number;
  endpoints: Array<{
    method: string;
    path: string;
    summary?: string;
    operation_id?: string;
    tags?: string[];
    parameters?: unknown[];
    request_body?: unknown;
    responses?: unknown[];
  }>;
  type_definitions?: unknown[];
  markdown_path?: string;
}

/** 综合分析总结果 */
export interface ComprehensiveResult {
  project_name: string;
  output_dir: string;
  markdown_path: string;
  prototype?: PrototypeSummary;
  design?: DesignSummary;
  api_doc?: ApiDocSummary;
  icons: never[]; // 保留字段兼容，但不再自动下载
  errors: string[];
}
