import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHttpClient, type HttpClient } from './http.js';
import { BASE_URL, DDS_BASE_URL, CDN_URL } from '../config/constants.js';
import { formatLanhuRfc2822, formatChinaDate } from '../utils/date.js';
import type { LanhuUrlParams, ProductDocument } from '../types/lanhu.ts';

interface CacheMeta {
  version_id: string;
  document_id: string;
  document_name: string;
  download_time: number;
  pages: string[];
  total_files: number;
}

interface SitemapNode {
  pageName?: string;
  url?: string;
  type?: string;
  id?: string;
  children?: SitemapNode[];
}

interface ProjectMapping {
  sitemap?: { rootNodes?: SitemapNode[] };
  pages?: Record<string, Record<string, unknown>>;
}

interface SliceInfo {
  id: unknown;
  name: string;
  type: string;
  download_url: string;
  size: string;
  format: string;
  svg_url?: string;
  scale_urls?: Record<string, string>;
  logical_size?: { width: number; height: number; note: string };
  position?: { x: number; y: number };
  parent_name?: string;
  layer_path: string;
  metadata?: Record<string, unknown>;
  base_size?: { width: number; height: number; note: string };
}

function isAuthError(code: unknown, msg: unknown): boolean {
  const codeStr = String(code ?? '').toLowerCase();
  const msgStr = String(msg ?? '').toLowerCase();
  const authKeywords = ['auth', 'login', 'token', 'unauthorized', '401', '403'];
  const authMsgKeywords = ['登录', '过期', '未授权', '认证', 'cookie', 'session', 'expired', 'unauthorized'];
  return authKeywords.some(k => codeStr.includes(k)) || authMsgKeywords.some(k => msgStr.includes(k));
}

function formatApiError(msg: unknown, code: unknown): string {
  const base = `API Error: ${msg} (code=${code})`;
  if (isAuthError(code, msg)) {
    return `${base}\n蓝湖 Cookie 可能已过期，请重新登录获取: https://lanhuapp.com\n获取方式: 登录后按 F12 → Network → 复制任意请求的 Cookie`;
  }
  return base;
}

export class LanhuExtractor {
  private client: HttpClient;
  private ddsClient: HttpClient;

  constructor() {
    this.client = createHttpClient(false);
    this.ddsClient = createHttpClient(true);
  }

  parseUrl(url: string): LanhuUrlParams {
    let target = url;

    // 完整URL提取fragment部分
    if (target.startsWith('http')) {
      const hashIdx = target.indexOf('#');
      if (hashIdx === -1) {
        throw new Error('Invalid Lanhu URL: missing fragment part');
      }
      const fragment = target.slice(hashIdx + 1);
      const qIdx = fragment.indexOf('?');
      target = qIdx !== -1 ? fragment.slice(qIdx + 1) : fragment;
    }

    if (target.startsWith('?')) target = target.slice(1);

    const params: Record<string, string> = {};
    for (const part of target.split('&')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        params[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
      }
    }

    const teamId = params.tid;
    const projectId = params.pid;
    const docId = params.docId || params.image_id;
    const versionId = params.versionId;

    if (!projectId) {
      throw new Error('URL parsing failed: missing required param pid (project_id)');
    }

    return {
      team_id: teamId || null,
      project_id: projectId,
      doc_id: docId || null,
      version_id: versionId || null,
    };
  }

  async getDocumentInfo(projectId: string, docId: string): Promise<Record<string, unknown>> {
    if (!docId) {
      throw new Error(
        'URL 缺少 docId（或 image_id）参数，无法定位 PRD/原型文档。' +
        '请先调用 lanhu_list_product_documents 获取 doc_url，' +
        '或使用带 docId 的链接，例如：' +
        '.../item/project/product?tid=xxx&pid=xxx&docId=xxx'
      );
    }
    const apiUrl = `${BASE_URL}/api/project/image`;
    const resp = await this.client.get<Record<string, unknown>>(apiUrl, {
      pid: projectId,
      image_id: docId,
    });
    const data = resp.data;
    const code = data.code;
    const success = code === 0 || code === '0' || code === '00000';
    if (!success) {
      throw new Error(formatApiError(data.msg, code));
    }
    return (data.data ?? data.result ?? {}) as Record<string, unknown>;
  }

  async listProductDocuments(teamId: string | null, projectId: string): Promise<Record<string, unknown>> {
    const apiUrl = `${BASE_URL}/api/project/product_documents`;
    const params: Record<string, string | number> = { project_id: projectId };
    if (teamId) params.team_id = teamId;

    const resp = await this.client.get<Record<string, unknown>>(apiUrl, params);
    const data = resp.data;
    const code = data.code;
    const success = code === 0 || code === '0' || code === '00000';
    if (!success) {
      throw new Error(formatApiError(data.msg, code));
    }

    const result = (data.data ?? data.result ?? {}) as Record<string, unknown>;
    const resources = (result.resources ?? []) as Array<Record<string, unknown>>;

    const documents: ProductDocument[] = [];
    for (const item of resources) {
      const docId = item.id as string | undefined;
      if (!docId) continue;
      documents.push({
        doc_id: docId,
        name: item.name as string,
        type: (item.type as string) ?? 'axure',
        last_version_num: item.last_version_num as string | undefined,
        latest_version: item.latest_version as string | undefined,
        create_time: formatLanhuRfc2822(item.create_time as string | undefined),
        update_time: formatLanhuRfc2822(item.update_time as string | undefined),
        doc_url: `${BASE_URL}/web/#/item/project/product?tid=${teamId}&pid=${projectId}&docId=${docId}`,
      });
    }

    return {
      default_group_id: result.default_group_id,
      doc_can_download: result.doc_can_download,
      need_group: result.need_group,
      total: documents.length,
      documents,
    };
  }

  async getPagesList(url: string): Promise<Record<string, unknown>> {
    const params = this.parseUrl(url);
    const docInfo = await this.getDocumentInfo(params.project_id, params.doc_id!);

    // 获取项目详细信息
    let projectInfo: Record<string, unknown> | null = null;
    try {
      const multiInfoParams: Record<string, string | number> = {
        project_id: params.project_id,
        doc_info: 1,
      };
      if (params.team_id) multiInfoParams.team_id = params.team_id;
      const resp = await this.client.get<Record<string, unknown>>(
        `${BASE_URL}/api/project/multi_info`,
        multiInfoParams
      );
      if (resp.data.code === '00000') {
        projectInfo = (resp.data.result ?? {}) as Record<string, unknown>;
      }
    } catch {
      // 忽略错误
    }

    const versions = (docInfo.versions ?? []) as Array<Record<string, unknown>>;
    if (!versions.length) {
      throw new Error('Document version info not found');
    }

    const latestVersion = versions[0];
    const jsonUrl = latestVersion.json_url as string;
    if (!jsonUrl) {
      throw new Error('Mapping JSON URL not found');
    }

    const mappingResp = await this.client.get<ProjectMapping>(jsonUrl);
    const projectMapping = mappingResp.data;

    // 从sitemap获取页面列表
    const sitemap = projectMapping.sitemap ?? {};
    const rootNodes = sitemap.rootNodes ?? [];

    interface PageInfo {
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

    const pagesList: PageInfo[] = [];

    function extractPages(
      nodes: SitemapNode[],
      parentPath = '',
      level = 0,
      parentFolder: string | null = null
    ): void {
      for (const node of nodes) {
        const pageName = node.pageName ?? '';
        const nodeUrl = node.url ?? '';
        const nodeType = node.type ?? 'Wireframe';
        const nodeId = node.id ?? '';
        const currentPath = parentPath ? `${parentPath}/${pageName}` : pageName;
        const isPureFolder = nodeType === 'Folder' && !nodeUrl;

        if (pageName && nodeUrl) {
          pagesList.push({
            index: pagesList.length + 1,
            name: pageName,
            filename: nodeUrl,
            id: nodeId,
            type: nodeType,
            level,
            folder: parentFolder ?? '根目录',
            path: currentPath,
            has_children: Boolean(node.children?.length),
          });
        }

        const children = node.children ?? [];
        if (children.length) {
          const nextFolder = isPureFolder ? pageName : parentFolder;
          extractPages(children, currentPath, level + 1, nextFolder);
        }
      }
    }

    extractPages(rootNodes);

    // 统计分组信息
    const folderStats: Record<string, number> = {};
    let maxLevel = 0;
    let pagesWithChildren = 0;
    for (const page of pagesList) {
      folderStats[page.folder] = (folderStats[page.folder] ?? 0) + 1;
      maxLevel = Math.max(maxLevel, page.level);
      if (page.has_children) pagesWithChildren++;
    }

    const result: Record<string, unknown> = {
      document_id: params.doc_id,
      document_name: docInfo.name ?? 'Unknown',
      document_type: docInfo.type ?? 'axure',
      total_pages: pagesList.length,
      max_level: maxLevel,
      pages_with_children: pagesWithChildren,
      folder_statistics: folderStats,
      pages: pagesList,
    };

    if (docInfo.create_time) result.create_time = formatChinaDate(docInfo.create_time as string);
    if (docInfo.update_time) result.update_time = formatChinaDate(docInfo.update_time as string);

    result.total_versions = versions.length;
    if (latestVersion.version_info) result.latest_version = latestVersion.version_info;

    if (projectInfo) {
      if (projectInfo.creator_name) result.creator_name = projectInfo.creator_name;
      if (projectInfo.folder_name) result.folder_name = projectInfo.folder_name;
      if (projectInfo.save_path) result.project_path = projectInfo.save_path;
      if (projectInfo.member_cnt) result.member_count = projectInfo.member_cnt;
    }

    return result;
  }

  private async loadCacheMeta(outputDir: string): Promise<Record<string, unknown>> {
    const metaPath = join(outputDir, '.lanhu_cache.json');
    try {
      await access(metaPath);
      const content = await readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async saveCacheMeta(outputDir: string, meta: CacheMeta): Promise<void> {
    await mkdir(outputDir, { recursive: true });
    const metaPath = join(outputDir, '.lanhu_cache.json');
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  private shouldUpdateCache(
    currentVersionId: string,
    cacheMeta: Record<string, unknown>
  ): boolean {
    return cacheMeta.version_id !== currentVersionId;
  }

  async downloadResources(
    url: string,
    outputDir: string,
    forceUpdate = false
  ): Promise<{ status: string; version_id: string; reason: string; output_dir: string }> {
    const params = this.parseUrl(url);
    const docInfo = await this.getDocumentInfo(params.project_id, params.doc_id!);

    const versions = (docInfo.versions ?? []) as Array<Record<string, unknown>>;
    const versionInfo = versions[0];
    const versionId = versionInfo.id as string;
    const jsonUrl = versionInfo.json_url as string;

    const mappingResp = await this.client.get<ProjectMapping>(jsonUrl);
    const projectMapping = mappingResp.data;

    // 检查缓存
    if (!forceUpdate) {
      try {
        await access(outputDir);
        const cacheMeta = await this.loadCacheMeta(outputDir);
        if (!this.shouldUpdateCache(versionId, cacheMeta)) {
          return { status: 'cached', version_id: versionId, reason: 'up_to_date', output_dir: outputDir };
        }
      } catch {
        // 目录不存在，继续下载
      }
    }

    await mkdir(outputDir, { recursive: true });

    const pages = projectMapping.pages ?? {};
    let isFirstPage = true;
    const downloadedFiles: string[] = [];

    for (const [htmlFilename, pageInfo] of Object.entries(pages)) {
      const htmlData = (pageInfo.html ?? {}) as Record<string, unknown>;
      const htmlFileWithMd5 = htmlData.sign_md5 as string;
      const pageMappingMd5 = pageInfo.mapping_md5 as string;

      if (!htmlFileWithMd5) continue;

      // 下载HTML
      const htmlUrl = htmlFileWithMd5.startsWith('http') ? htmlFileWithMd5 : `${CDN_URL}/${htmlFileWithMd5}`;
      const htmlResp = await this.client.request<string>(htmlUrl);
      const htmlContent = htmlResp.text;

      // 下载页面级mapping JSON
      if (pageMappingMd5) {
        const mappingUrl = pageMappingMd5.startsWith('http') ? pageMappingMd5 : `${CDN_URL}/${pageMappingMd5}`;
        const pageMappingResp = await this.client.get<Record<string, Record<string, Record<string, string>>>>(mappingUrl);
        await this.downloadPageResources(pageMappingResp.data, outputDir, !isFirstPage);
        isFirstPage = false;
      }

      // 保存HTML
      const htmlPath = join(outputDir, htmlFilename);
      await writeFile(htmlPath, htmlContent, 'utf-8');
      downloadedFiles.push(htmlFilename);
    }

    // 保存缓存元数据
    await this.saveCacheMeta(outputDir, {
      version_id: versionId,
      document_id: params.doc_id!,
      document_name: (docInfo.name as string) ?? 'Unknown',
      download_time: Date.now(),
      pages: Object.keys(pages),
      total_files: downloadedFiles.length,
    });

    return {
      status: 'downloaded',
      version_id: versionId,
      reason: 'first_download',
      output_dir: outputDir,
    };
  }

  private async downloadPageResources(
    pageMapping: Record<string, Record<string, Record<string, string>>>,
    outputDir: string,
    skipDocumentJs = false
  ): Promise<void> {
    const tasks: Promise<void>[] = [];

    const downloadFile = async (url: string, localPath: string): Promise<void> => {
      try {
        const dir = dirname(localPath);
        await mkdir(dir, { recursive: true });
        const resp = await this.client.getBytes(url);
        await writeFile(localPath, resp);
      } catch {
        // 忽略单个文件下载失败
      }
    };

    // CSS
    for (const [localPath, info] of Object.entries(pageMapping.styles ?? {})) {
      const signMd5 = info.sign_md5;
      if (signMd5) {
        const fileUrl = signMd5.startsWith('http') ? signMd5 : `${CDN_URL}/${signMd5}`;
        tasks.push(downloadFile(fileUrl, join(outputDir, localPath)));
      }
    }

    // JS
    for (const [localPath, info] of Object.entries(pageMapping.scripts ?? {})) {
      if (skipDocumentJs && localPath === 'data/document.js') continue;
      const signMd5 = info.sign_md5;
      if (signMd5) {
        const fileUrl = signMd5.startsWith('http') ? signMd5 : `${CDN_URL}/${signMd5}`;
        tasks.push(downloadFile(fileUrl, join(outputDir, localPath)));
      }
    }

    // Images
    for (const [localPath, info] of Object.entries(pageMapping.images ?? {})) {
      const signMd5 = info.sign_md5;
      if (signMd5) {
        const fileUrl = signMd5.startsWith('http') ? signMd5 : `${CDN_URL}/${signMd5}`;
        tasks.push(downloadFile(fileUrl, join(outputDir, localPath)));
      }
    }

    await Promise.all(tasks);
  }

  static buildScaleUrls(
    imageUrl: string,
    logicalW: number,
    logicalH: number,
    sliceScale: number
  ): Record<string, string> {
    if (!imageUrl || !logicalW || !logicalH) return {};

    const lw = Math.max(1, Math.round(logicalW));
    const lh = Math.max(1, Math.round(logicalH));
    const storedW = lw * sliceScale;
    const storedH = lh * sliceScale;

    const jsRound = (v: number) => Math.floor(v + 0.5);

    const makeUrl = (w: number, h: number): string => {
      w = Math.max(1, w);
      h = Math.max(1, h);
      if (w === storedW && h === storedH) return imageUrl;
      return `${imageUrl}?x-oss-process=image/resize,w_${w},h_${h}/format,png`;
    };

    const iosBase = storedW / 4;
    return {
      '1x': makeUrl(lw, lh),
      '2x': makeUrl(lw * 2, lh * 2),
      '3x': makeUrl(lw * 3, lh * 3),
      'ios_1x': makeUrl(jsRound(iosBase), jsRound(storedH / 4)),
      'ios_2x': makeUrl(jsRound(iosBase * 2), jsRound(storedH / 4 * 2)),
      'ios_3x': makeUrl(jsRound(iosBase * 3), jsRound(storedH / 4 * 3)),
      'android_mdpi': makeUrl(jsRound(storedW / 4), jsRound(storedH / 4)),
      'android_hdpi': makeUrl(jsRound(storedW / 4 * 1.5), jsRound(storedH / 4 * 1.5)),
      'android_xhdpi': makeUrl(jsRound(storedW / 4 * 2), jsRound(storedH / 4 * 2)),
      'android_xxhdpi': makeUrl(jsRound(storedW / 4 * 3), jsRound(storedH / 4 * 3)),
      'android_xxxhdpi': makeUrl(storedW, storedH),
    };
  }

  static buildPsScaleUrls(
    imageUrl: string,
    baseW: number,
    baseH: number
  ): Record<string, string> {
    if (!imageUrl || !baseW || !baseH) return {};

    const bw = Math.max(1, Math.round(baseW));
    const bh = Math.max(1, Math.round(baseH));
    const jsRound = (v: number) => Math.floor(v + 0.5);
    const oneXW = bw / 2;
    const oneXH = bh / 2;

    const makeUrl = (w: number, h: number): string => {
      w = Math.max(1, w);
      h = Math.max(1, h);
      return `${imageUrl}?x-oss-process=image/resize,w_${w},h_${h}/format,png`;
    };

    return {
      '1x': makeUrl(jsRound(oneXW), jsRound(oneXH)),
      '2x': makeUrl(bw, bh),
      '3x': makeUrl(jsRound(oneXW * 3), jsRound(oneXH * 3)),
      'ios_1x': makeUrl(jsRound(oneXW), jsRound(oneXH)),
      'ios_2x': makeUrl(bw, bh),
      'ios_3x': makeUrl(jsRound(oneXW * 3), jsRound(oneXH * 3)),
      'android_mdpi': makeUrl(jsRound(oneXW), jsRound(oneXH)),
      'android_hdpi': makeUrl(jsRound(oneXW * 1.5), jsRound(oneXH * 1.5)),
      'android_xhdpi': makeUrl(bw, bh),
      'android_xxhdpi': makeUrl(jsRound(oneXW * 3), jsRound(oneXH * 3)),
      'android_xxxhdpi': makeUrl(jsRound(oneXW * 4), jsRound(oneXH * 4)),
    };
  }

  async getDesignSlicesInfo(
    imageId: string,
    teamId?: string | null,
    projectId?: string | null,
    includeMetadata = true
  ): Promise<Record<string, unknown>> {
    const url = `${BASE_URL}/api/project/image`;
    const params: Record<string, string | number> = {
      dds_status: 1,
      image_id: imageId,
    };
    if (projectId) params.project_id = projectId;
    if (teamId) params.team_id = teamId;

    const resp = await this.client.get<Record<string, unknown>>(url, params);
    const data = resp.data;
    if (data.code !== '00000') {
      throw new Error(formatApiError(data.msg, data.code));
    }

    const result = data.result as Record<string, unknown>;
    const versions = result.versions as Array<Record<string, unknown>>;
    const latestVersion = versions[0];
    const jsonUrl = latestVersion.json_url as string;

    const jsonResp = await this.client.get<Record<string, unknown>>(jsonUrl);
    const sketchData = jsonResp.data;

    const meta = (sketchData.meta ?? {}) as Record<string, unknown>;
    const sliceScale = parseInt(
      String(sketchData.sliceScale ?? sketchData.exportScale ?? meta.sliceScale ?? 2)
    );
    const isFigma = (meta.host as Record<string, unknown>)?.name === 'figma';

    const slices: SliceInfo[] = [];

    function findSlices(obj: Record<string, unknown> | null | undefined, parentName = '', layerPath = ''): void {
      if (!obj || typeof obj !== 'object') return;
      const currentName = (obj.name as string) ?? '';
      const currentPath = layerPath ? `${layerPath}/${currentName}` : currentName;

      // Figma: bitmapLayer + hasExportImage
      const image = obj.image as Record<string, unknown> | undefined;
      if (image && (image.imageUrl || image.svgUrl)) {
        if (isFigma && !obj.hasExportImage) {
          // 图片填充层，跳过
        } else {
          const downloadUrl = (image.imageUrl ?? image.svgUrl) as string;
          const imgSize = (image.size ?? {}) as Record<string, number>;
          let logicalW = imgSize.width ?? 0;
          let logicalH = imgSize.height ?? 0;

          if (!logicalW || !logicalH) {
            const frame = (obj.frame ?? obj.bounds ?? {}) as Record<string, number>;
            if (frame.width) {
              logicalW = frame.width;
              logicalH = frame.height ?? 0;
            }
          }

          const sizeStr = logicalW && logicalH ? `${Math.round(logicalW)}x${Math.round(logicalH)}` : 'unknown';
          const frame = (obj.frame ?? obj.bounds ?? {}) as Record<string, number>;

          const sliceInfo: SliceInfo = {
            id: obj.id,
            name: currentName,
            type: (obj.type ?? obj.layerType ?? 'bitmap') as string,
            download_url: downloadUrl,
            size: sizeStr,
            format: image.imageUrl ? 'png' : 'svg',
            layer_path: currentPath,
          };

          if (image.svgUrl && image.imageUrl) {
            sliceInfo.svg_url = image.svgUrl as string;
          }

          if (downloadUrl && image.imageUrl) {
            sliceInfo.scale_urls = LanhuExtractor.buildScaleUrls(downloadUrl, logicalW, logicalH, sliceScale);
            sliceInfo.logical_size = {
              width: Math.round(logicalW),
              height: Math.round(logicalH),
              note: `1x logical px; stored at ${sliceScale}x = ${Math.round(logicalW * sliceScale)}x${Math.round(logicalH * sliceScale)}px`,
            };
          }

          const x = frame.x ?? frame.left ?? 0;
          const y = frame.y ?? frame.top ?? 0;
          if (x || y) {
            sliceInfo.position = { x: Math.round(x), y: Math.round(y) };
          }
          if (parentName) sliceInfo.parent_name = parentName;

          if (includeMetadata) {
            const metadata: Record<string, unknown> = {};
            if (obj.fills) metadata.fills = obj.fills;
            if (obj.borders || obj.strokes) metadata.borders = obj.borders ?? obj.strokes;
            if ('opacity' in obj) metadata.opacity = obj.opacity;
            if (obj.rotation) metadata.rotation = obj.rotation;
            if (obj.textStyle) metadata.text_style = obj.textStyle;
            if (obj.shadows) metadata.shadows = obj.shadows;
            if (obj.radius || obj.cornerRadius) metadata.border_radius = obj.radius ?? obj.cornerRadius;
            if (Object.keys(metadata).length) sliceInfo.metadata = metadata;
          }

          slices.push(sliceInfo);
        }
      }
      // 旧版 Sketch: ddsImage
      else if (!isFigma) {
        const dds = obj.ddsImage as Record<string, unknown> | undefined;
        if (dds?.imageUrl) {
          const ddsUrl = dds.imageUrl as string;
          const ddsSize = (dds.size ?? {}) as Record<string, number>;
          let logicalW = ddsSize.width ?? 0;
          let logicalH = ddsSize.height ?? 0;

          if (!logicalW || !logicalH) {
            const frame = (obj.frame ?? obj.bounds ?? {}) as Record<string, number>;
            if (frame.width) {
              logicalW = frame.width;
              logicalH = frame.height ?? 0;
            }
          }

          const sizeStr = logicalW && logicalH
            ? `${Math.round(logicalW)}x${Math.round(logicalH)}`
            : JSON.stringify(ddsSize);

          const sliceInfo: SliceInfo = {
            id: obj.id,
            name: currentName,
            type: (obj.type ?? obj.ddsType) as string,
            download_url: ddsUrl,
            size: sizeStr,
            format: 'png',
            layer_path: currentPath,
          };

          if (ddsUrl && logicalW) {
            sliceInfo.scale_urls = LanhuExtractor.buildScaleUrls(ddsUrl, logicalW, logicalH, sliceScale);
            sliceInfo.logical_size = {
              width: Math.round(logicalW),
              height: Math.round(logicalH),
              note: `1x logical px; stored at ${sliceScale}x = ${Math.round(logicalW * sliceScale)}x${Math.round(logicalH * sliceScale)}px`,
            };
          }

          if ('left' in obj && 'top' in obj) {
            sliceInfo.position = {
              x: Math.round(Number(obj.left ?? 0)),
              y: Math.round(Number(obj.top ?? 0)),
            };
          }
          if (parentName) sliceInfo.parent_name = parentName;

          if (includeMetadata) {
            const metadata: Record<string, unknown> = {};
            if (obj.fills) metadata.fills = obj.fills;
            if (obj.borders) metadata.borders = obj.borders;
            if ('opacity' in obj) metadata.opacity = obj.opacity;
            if (obj.rotation) metadata.rotation = obj.rotation;
            if (obj.textStyle) metadata.text_style = obj.textStyle;
            if (obj.shadows) metadata.shadows = obj.shadows;
            if (obj.radius) metadata.border_radius = obj.radius;
            if (Object.keys(metadata).length) sliceInfo.metadata = metadata;
          }

          slices.push(sliceInfo);
        }
      }

      // 递归子图层
      for (const childKey of ['layers', 'children']) {
        const children = obj[childKey] as Array<Record<string, unknown>> | undefined;
        if (children) {
          for (const child of children) {
            if (child && typeof child === 'object') {
              findSlices(child, currentName, currentPath);
            }
          }
        }
      }
    }

    // 从 artboard.layers 开始（新版）
    const artboard = sketchData.artboard as Record<string, unknown> | undefined;
    if (artboard?.layers) {
      for (const layer of artboard.layers as Array<Record<string, unknown>>) {
        findSlices(layer);
      }
    }
    // 从 info 开始（旧版）
    else if (sketchData.info) {
      for (const item of sketchData.info as Array<Record<string, unknown>>) {
        findSlices(item);
      }
    }

    // Photoshop: assets[].isSlice
    if (String(sketchData.type ?? '').toLowerCase() === 'ps') {
      const byId = new Map<string, Record<string, unknown>>();

      function indexPs(obj: Record<string, unknown>): void {
        if (!obj || typeof obj !== 'object') return;
        const oid = obj.id;
        if (oid !== undefined && oid !== null) byId.set(String(oid), obj);
        for (const k of ['layers', 'children']) {
          const children = obj[k] as Array<Record<string, unknown>> | undefined;
          if (children) {
            for (const c of children) {
              if (c && typeof c === 'object') indexPs(c);
            }
          }
        }
      }

      const board = sketchData.board as Record<string, unknown> | undefined;
      if (board) indexPs(board);
      for (const sec of (sketchData.info ?? []) as Array<Record<string, unknown>>) {
        if (sec && typeof sec === 'object') indexPs(sec);
      }

      const existingIds = new Set(slices.map((s) => String(s.id)));

      for (const asset of (sketchData.assets ?? []) as Array<Record<string, unknown>>) {
        if (!asset || !asset.isSlice) continue;
        const lid = asset.id;
        if (lid === undefined || lid === null || existingIds.has(String(lid))) continue;
        const layer = byId.get(String(lid));
        if (!layer) continue;
        const imgs = (layer.images ?? {}) as Record<string, string>;
        const downloadUrl = imgs.png_xxxhd || imgs.svg;
        if (!downloadUrl) continue;

        let lwRaw = parseFloat(String(layer.width ?? 0));
        let lhRaw = parseFloat(String(layer.height ?? 0));
        if (lwRaw <= 0 || lhRaw <= 0) {
          const bb = (asset.bounds ?? {}) as Record<string, number>;
          lwRaw = (bb.right ?? 0) - (bb.left ?? 0);
          lhRaw = (bb.bottom ?? 0) - (bb.top ?? 0);
        }
        const baseW = Math.max(1, lwRaw);
        const baseH = Math.max(1, lhRaw);
        const logicalW = Math.max(1, baseW / 2);
        const logicalH = Math.max(1, baseH / 2);

        const dispName = (asset.name as string) ?? (layer.name as string) ?? 'slice';
        const sizeStr = `${Math.round(baseW)}x${Math.round(baseH)}`;
        const sliceInfo: SliceInfo = {
          id: lid,
          name: dispName,
          type: (layer.type as string) ?? 'ps-slice',
          download_url: downloadUrl,
          size: sizeStr,
          format: imgs.png_xxxhd ? 'png' : 'svg',
          layer_path: dispName,
        };

        if (imgs.png_xxxhd && imgs.svg) sliceInfo.svg_url = imgs.svg;

        if ('left' in layer && 'top' in layer) {
          sliceInfo.position = {
            x: Math.round(parseFloat(String(layer.left ?? 0))),
            y: Math.round(parseFloat(String(layer.top ?? 0))),
          };
        }

        if (includeMetadata) {
          const md: Record<string, unknown> = { source: 'photoshop', asset_id: lid };
          if (asset.scaleType !== undefined) md.scaleType = asset.scaleType;
          sliceInfo.metadata = md;
        }

        if (imgs.png_xxxhd) {
          sliceInfo.scale_urls = LanhuExtractor.buildPsScaleUrls(downloadUrl, baseW, baseH);
          sliceInfo.logical_size = {
            width: Math.round(logicalW),
            height: Math.round(logicalH),
            note: '1x logical px; PS slice base px equals iOS @2x / Android xhdpi',
          };
          sliceInfo.base_size = {
            width: Math.round(baseW),
            height: Math.round(baseH),
            note: 'PS slice base px; equals iOS @2x / Android xhdpi',
          };
        }

        slices.push(sliceInfo);
        existingIds.add(String(lid));
      }
    }

    return {
      design_id: imageId,
      design_name: result.name,
      version: latestVersion.version_info,
      slice_scale: sliceScale,
      canvas_size: { width: result.width, height: result.height },
      total_slices: slices.length,
      slices,
    };
  }

  private async getVersionIdByImageId(
    projectId: string,
    teamId?: string | null,
    imageId?: string | null
  ): Promise<string> {
    const params: Record<string, string | number> = {
      project_id: projectId,
      img_limit: 500,
      detach: 1,
    };
    if (teamId) params.team_id = teamId;

    const resp = await this.client.get<Record<string, unknown>>(`${BASE_URL}/api/project/multi_info`, params);
    const data = resp.data;
    if (data.code !== '00000') {
      throw new Error(formatApiError(data.msg ?? '未知错误', data.code));
    }

    const images = ((data.result as Record<string, unknown>)?.images ?? []) as Array<Record<string, unknown>>;
    for (const img of images) {
      if (img.id === imageId) {
        const vid = img.latest_version as string;
        if (vid) return vid;
        throw new Error('该设计图无 latest_version');
      }
    }
    throw new Error(`未找到 image_id=${imageId} 的设计图`);
  }

  private async fetchDdsSchema(versionId: string): Promise<Record<string, unknown>> {
    const revUrl = `${DDS_BASE_URL}/api/dds/image/store_schema_revise`;
    const revResp = await this.ddsClient.get<Record<string, unknown>>(revUrl, { version_id: versionId });
    const revData = revResp.data;
    if (revData.code !== '00000') {
      throw new Error(formatApiError(revData.msg ?? '未知错误', revData.code));
    }
    const schemaUrl = ((revData.data ?? {}) as Record<string, unknown>).data_resource_url as string;
    if (!schemaUrl) {
      throw new Error('store_schema_revise 未返回 data_resource_url');
    }
    const schemaResp = await this.ddsClient.get<Record<string, unknown>>(schemaUrl);
    return schemaResp.data;
  }

  async getDesignSchemaJson(
    imageId: string,
    teamId?: string | null,
    projectId?: string | null
  ): Promise<Record<string, unknown>> {
    const versionId = await this.getVersionIdByImageId(projectId!, teamId, imageId);
    return this.fetchDdsSchema(versionId);
  }

  async getSketchJson(
    imageId: string,
    teamId?: string | null,
    projectId?: string | null
  ): Promise<Record<string, unknown>> {
    const url = `${BASE_URL}/api/project/image`;
    const params: Record<string, string | number> = {
      dds_status: 1,
      image_id: imageId,
    };
    if (projectId) params.project_id = projectId;
    if (teamId) params.team_id = teamId;

    const resp = await this.client.get<Record<string, unknown>>(url, params);
    const data = resp.data;
    if (data.code !== '00000') {
      throw new Error(formatApiError(data.msg, data.code));
    }

    const result = data.result as Record<string, unknown>;
    const versions = result.versions as Array<Record<string, unknown>>;
    const latestVersion = versions[0];
    const jsonUrl = latestVersion.json_url as string;
    const jsonResp = await this.client.get<Record<string, unknown>>(jsonUrl);
    return jsonResp.data;
  }
}
