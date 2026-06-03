/** 解析后的蓝湖 URL 参数 */
export interface LanhuUrlParams {
  team_id: string | null;
  project_id: string;
  doc_id: string | null;
  version_id: string | null;
}

/** 产品文档 */
export interface ProductDocument {
  doc_id: string;
  name: string;
  type: string;
  last_version_num?: string;
  latest_version?: string;
  create_time?: string | null;
  update_time?: string | null;
  doc_url: string;
}

/** Axure 页面 */
export interface AxurePage {
  index: number;
  name: string;
  filename: string;
  id: string;
  type: string;
  level: number;
  folder: string;
  path: string;
  has_children: boolean;
}

/** 设计图 */
export interface DesignImage {
  index: number;
  id: string;
  name: string;
  width: number;
  height: number;
  url: string;
  has_comment: boolean;
  update_time: string;
  sectors: string[];
}

/** 设计切片 */
export interface DesignSlice {
  id: string | null;
  name: string;
  type: string;
  download_url: string;
  size: string;
  format: 'png' | 'svg';
  svg_url?: string;
  scale_urls?: Record<string, string>;
  logical_size?: { width: number; height: number; note: string };
  position?: { x: number; y: number };
  parent_name?: string;
  layer_path: string;
  metadata?: Record<string, unknown>;
}

/** 缓存元数据 */
export interface CacheMeta {
  version_id: string;
  document_id: string;
  document_name: string;
  download_time: number;
  pages: string[];
  total_files: number;
}

/** 文档版本信息 */
export interface DocumentVersion {
  id: string;
  version_info?: string;
  json_url?: string;
  create_time?: string;
}

/** 文档信息 */
export interface DocumentInfo {
  name: string;
  type: string;
  versions: DocumentVersion[];
  update_time?: string;
  create_time?: string;
}

/** 项目信息 */
export interface ProjectInfo {
  name?: string;
  folder_name?: string;
  creator_name?: string;
  member_cnt?: number;
  save_path?: string;
}
