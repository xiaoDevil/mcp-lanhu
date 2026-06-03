import { z } from 'zod';
import { chromium } from 'playwright';
import { LanhuExtractor } from '../client/lanhu-extractor.js';

export const resolveInviteLinkSchema = {
  invite_url: z.string().describe('Lanhu invite link. Example: https://lanhuapp.com/link/#/invite?sid=xxx'),
};

export async function resolveInviteLink(
  args: { invite_url: string },
  cookie: string
): Promise<Record<string, unknown>> {
  const { invite_url } = args;

  try {
    // 解析Cookie字符串为playwright格式
    const cookies = cookie.split('; ').filter(Boolean).map((c) => {
      const eqIdx = c.indexOf('=');
      return {
        name: c.slice(0, eqIdx),
        value: c.slice(eqIdx + 1),
        domain: '.lanhuapp.com',
        path: '/',
      };
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (cookies.length) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(invite_url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    await browser.close();

    const extractor = new LanhuExtractor();
    try {
      const params = extractor.parseUrl(finalUrl);
      return {
        status: 'success',
        invite_url,
        resolved_url: finalUrl,
        parsed_params: params,
        usage_tip: 'You can now use this resolved_url with other lanhu tools (lanhu_get_pages, lanhu_get_designs, etc.)',
      };
    } catch (e) {
      return {
        status: 'partial_success',
        invite_url,
        resolved_url: finalUrl,
        parse_error: e instanceof Error ? e.message : String(e),
        message: 'URL resolved but parsing failed. You can try using the resolved_url directly.',
      };
    }
  } catch (e) {
    return {
      status: 'error',
      invite_url,
      error: e instanceof Error ? e.message : String(e),
      message: 'Failed to resolve invite link. Please check if the link is valid.',
    };
  }
}
