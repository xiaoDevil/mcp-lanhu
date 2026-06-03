import { z } from 'zod';
import { LanhuExtractor } from '../client/lanhu-extractor.js';

export const listProductDocumentsSchema = {
  url: z.string().describe(
    'Lanhu project URL. Example: https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx (docId optional). Required params: tid, pid. If you have an invite link, use lanhu_resolve_invite_link first!'
  ),
};

export async function listProductDocuments(
  args: { url: string }
): Promise<Record<string, unknown>> {
  const extractor = new LanhuExtractor();
  try {
    const params = extractor.parseUrl(args.url);
    return await extractor.listProductDocuments(params.team_id, params.project_id);
  } finally {
    // no cleanup needed for native fetch
  }
}
