import { z } from 'zod';
import { LanhuExtractor } from '../client/lanhu-extractor.js';
import { getAiInstructionTemplate } from './prompts/ai-instructions.js';

export const getPagesSchema = {
  url: z.string().describe(
    'Lanhu URL with docId parameter. Example: https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx. Required param: pid.'
  ),
};

export async function getPages(
  args: { url: string },
  userRole = '未知'
): Promise<Record<string, unknown>> {
  const extractor = new LanhuExtractor();
  const result = await extractor.getPagesList(args.url);

  const aiInstruction = getAiInstructionTemplate(userRole);
  (result as Record<string, unknown>).__AI_INSTRUCTION__ = aiInstruction;

  const totalPages = (result.total_pages as number) ?? 0;
  (result as Record<string, unknown>).ai_suggestion = {
    notice: `Document has ${totalPages} pages`,
    next_action: 'Call lanhu_get_ai_analyze_page_result(page_names="all") to get page screenshots and text',
  };

  return result;
}
