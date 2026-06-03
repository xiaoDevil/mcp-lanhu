interface CacheEntry<T> {
  data: T;
  versionId: string | null;
}

/**
 * 基于版本号的永久缓存
 */
export class MetadataCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * 获取缓存数据
   * 如果提供了 versionId，只有版本匹配时才返回
   */
  get<T>(key: string, versionId?: string | null): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    // 如果指定了版本号，检查是否匹配
    if (versionId !== undefined && entry.versionId !== versionId) {
      return null;
    }

    return entry.data as T;
  }

  /**
   * 设置缓存数据
   */
  set<T>(key: string, data: T, versionId?: string | null): void {
    this.store.set(key, {
      data,
      versionId: versionId ?? null,
    });
  }

  /**
   * 构建缓存键
   */
  static buildKey(projectId: string, docId?: string | null): string {
    return docId ? `${projectId}:${docId}` : projectId;
  }
}

/**
 * 文件系统缓存元数据
 */
export interface FileCacheMeta {
  versionId: string;
  documentId?: string;
  documentName?: string;
  downloadTime?: number;
  pages?: string[];
  totalFiles?: number;
  cachedPages?: string[];
}

/**
 * 检查文件缓存是否需要更新
 */
export function shouldUpdateCache(
  cachedMeta: FileCacheMeta | null,
  currentVersionId: string
): { needUpdate: boolean; reason: string } {
  if (!cachedMeta) {
    return { needUpdate: true, reason: 'no_cache' };
  }

  if (cachedMeta.versionId !== currentVersionId) {
    return { needUpdate: true, reason: 'version_changed' };
  }

  return { needUpdate: false, reason: 'up_to_date' };
}
