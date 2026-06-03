import { z } from 'zod';
import { LanhuExtractor } from '../client/lanhu-extractor.js';
import { createHttpClient } from '../client/http.js';
import { BASE_URL } from '../config/constants.js';

export const getDesignsSchema = {
  url: z.string().describe(
    'Lanhu URL WITHOUT docId. Example: https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx. Required param: pid.'
  ),
};

interface Sector {
  id?: string;
  parent_id?: string;
  name?: string;
  order?: number;
  images?: string[];
}

interface NormalizedSector {
  id: string;
  parent_id: string | null;
  name: string | undefined;
  path: string;
  order: number;
  image_count: number;
}

function normalizeDesignSectors(sectors: Sector[]): [NormalizedSector[], Record<string, NormalizedSector[]>] {
  const sectorById = new Map<string, Sector>();
  for (const s of sectors ?? []) {
    if (s.id) sectorById.set(s.id, s);
  }

  const sectorPathCache = new Map<string, string>();

  function buildSectorPath(sectorId: string, trail = new Set<string>()): string {
    if (!sectorId) return '';
    if (sectorPathCache.has(sectorId)) return sectorPathCache.get(sectorId)!;

    const sector = sectorById.get(sectorId) ?? {};
    const sectorName = sector.name ?? sectorId;
    const parentId = sector.parent_id ?? '';

    if (trail.has(sectorId)) return sectorName;

    let path: string;
    if (parentId && sectorById.has(parentId)) {
      const parentPath = buildSectorPath(parentId, new Set([...trail, sectorId]));
      path = parentPath ? `${parentPath}/${sectorName}` : sectorName;
    } else {
      path = sectorName;
    }

    sectorPathCache.set(sectorId, path);
    return path;
  }

  const normalized: NormalizedSector[] = [];
  const imageSectorMap: Record<string, NormalizedSector[]> = {};

  for (const sector of sectors ?? []) {
    if (!sector.id) continue;
    const ns: NormalizedSector = {
      id: sector.id,
      parent_id: sector.parent_id ?? null,
      name: sector.name,
      path: buildSectorPath(sector.id),
      order: sector.order ?? 0,
      image_count: (sector.images ?? []).length,
    };
    normalized.push(ns);

    for (const imageId of sector.images ?? []) {
      if (!imageId) continue;
      if (!imageSectorMap[imageId]) imageSectorMap[imageId] = [];
      imageSectorMap[imageId].push({ ...ns });
    }
  }

  return [normalized, imageSectorMap];
}

export async function getDesigns(
  args: { url: string }
): Promise<Record<string, unknown>> {
  const extractor = new LanhuExtractor();
  const client = createHttpClient(false);
  const params = extractor.parseUrl(args.url);

  const apiUrl =
    `${BASE_URL}/api/project/images?project_id=${params.project_id}` +
    (params.team_id ? `&team_id=${params.team_id}` : '') +
    '&dds_status=1&position=1&show_cb_src=1&comment=1';

  let sectorList: NormalizedSector[] = [];
  let imageSectorMap: Record<string, NormalizedSector[]> = {};
  let sectorWarning: string | null = null;

  try {
    const sectorApiUrl = `${BASE_URL}/api/project/project_sectors?project_id=${params.project_id}`;
    const sectorResp = await client.get<Record<string, unknown>>(sectorApiUrl);
    const sectorData = sectorResp.data;
    if (sectorData.code === '00000') {
      [sectorList, imageSectorMap] = normalizeDesignSectors(
        ((sectorData.data as Record<string, unknown>)?.sectors ?? []) as Sector[]
      );
    } else {
      sectorWarning = (sectorData.msg as string) ?? 'Unknown error';
    }
  } catch (e) {
    sectorWarning = e instanceof Error ? e.message : String(e);
  }

  const resp = await client.get<Record<string, unknown>>(apiUrl);
  const data = resp.data;

  if (data.code !== '00000') {
    return { status: 'error', message: (data.msg as string) ?? 'Unknown error' };
  }

  const projectData = (data.data ?? {}) as Record<string, unknown>;
  const images = (projectData.images ?? []) as Array<Record<string, unknown>>;

  const designList = images.map((img, idx) => {
    const designSectors = imageSectorMap[img.id as string] ?? [];
    return {
      index: idx + 1,
      id: img.id,
      name: img.name,
      width: img.width,
      height: img.height,
      url: img.url,
      has_comment: img.has_comment ?? false,
      update_time: img.update_time,
      sectors: designSectors.map((s) => s.name).filter(Boolean),
    };
  });

  const result: Record<string, unknown> = {
    status: 'success',
    project_name: projectData.name,
    total_sectors: sectorList.length,
    ungrouped_design_count: designList.filter((d) => !(d.sectors as string[]).length).length,
    sectors: sectorList,
    total_designs: designList.length,
    designs: designList,
  };

  if (sectorWarning) {
    result.sector_warning = `Failed to load project sectors: ${sectorWarning}`;
  }

  const totalDesigns = designList.length;
  if (totalDesigns > 8) {
    result.ai_suggestion = {
      notice: `This project contains ${totalDesigns} design images, which is quite a lot`,
      recommendation: 'Ask user whether to download all designs or specific ones first.',
      user_prompt_template: `该项目包含 ${totalDesigns} 个设计图。请选择：\n1. 下载全部 ${totalDesigns} 个设计图（完整查看所有UI）\n2. 下载关键设计图（请指定需要的设计图）`,
      language_note: 'Respond in Chinese when talking to user',
    };
  }

  return result;
}
