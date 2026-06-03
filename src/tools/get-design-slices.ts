import { z } from 'zod';
import { LanhuExtractor } from '../client/lanhu-extractor.js';

export const getDesignSlicesSchema = {
  url: z.string().describe(
    'Lanhu URL WITHOUT docId. Example: https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx.'
  ),
  design_name: z.string().describe(
    'Exact design name (single design only, NOT "all"). Must match exactly with name from lanhu_get_designs!'
  ),
  include_metadata: z.boolean().default(true).describe('Include color, opacity, shadow info'),
};

export async function getDesignSlices(
  args: { url: string; design_name: string; include_metadata: boolean }
): Promise<Record<string, unknown>> {
  const extractor = new LanhuExtractor();
  try {
    const params = extractor.parseUrl(args.url);

    // 获取设计图列表找到对应设计图
    const { getDesigns } = await import('./get-designs.js');
    const designsData = await getDesigns({ url: args.url }) as Record<string, unknown>;

    if (designsData.status !== 'success') {
      return { status: 'error', message: `Failed to get design list: ${designsData.message ?? 'Unknown error'}` };
    }

    const designs = designsData.designs as Array<Record<string, unknown>>;
    const targetDesign = designs.find((d) => d.name === args.design_name);

    if (!targetDesign) {
      const available = designs.map((d) => d.name as string);
      return {
        status: 'error',
        message: `Design "${args.design_name}" not found`,
        available_designs: available,
      };
    }

    const result = await extractor.getDesignSlicesInfo(
      targetDesign.id as string,
      params.team_id,
      params.project_id,
      args.include_metadata
    );

    return result;
  } finally {
    // no cleanup needed
  }
}
