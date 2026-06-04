/**
 * Icon/切片下载工具
 *
 * 由 LLM 分析 UI 设计图后，指定需要下载的切片及其语义化文件名。
 * LLM 根据综合分析返回的切片元数据，决定下载哪些、怎么命名。
 */

import { z } from 'zod';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHttpClient } from '../client/http.js';
import { getConfig } from '../config/env.js';

export const downloadSlicesSchema = {
  icons: z.array(z.object({
    download_url: z.string().describe('切片下载 URL（来自综合分析或 get_design_slices 的返回值）'),
    filename: z.string().describe('语义化文件名，如 "icon-home-active.svg"、"btn-submit.png"'),
    svg_url: z.string().optional().describe('SVG 格式的 URL（如果有，优先下载 SVG）'),
  })).describe('需要下载的 icon 列表，由 LLM 根据设计图分析结果指定'),
  output_dir: z.string().optional().describe(
    '下载目标目录（绝对路径或相对路径）。默认: ./data/icons/'
  ),
  prefer_svg: z.boolean().default(true).describe(
    '当同时有 PNG 和 SVG URL 时，优先下载 SVG。默认: true'
  ),
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function downloadSlices(
  args: {
    icons: Array<{
      download_url: string;
      filename: string;
      svg_url?: string;
    }>;
    output_dir?: string;
    prefer_svg?: boolean;
  },
): Promise<Record<string, unknown>> {
  const config = getConfig();
  const client = createHttpClient(false);
  const outputDir = args.output_dir ?? join(config.dataDir, 'icons');
  await mkdir(outputDir, { recursive: true });

  const results: Array<{
    filename: string;
    file_path: string;
    format: string;
    status: 'success' | 'skipped' | 'failed';
    error?: string;
  }> = [];

  // 并发下载（限制 5 并发）
  const CONCURRENCY = 5;

  for (let i = 0; i < args.icons.length; i += CONCURRENCY) {
    const batch = args.icons.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (icon) => {
        // 优先 SVG
        const useSvg = args.prefer_svg !== false && icon.svg_url;
        const url = useSvg ? icon.svg_url! : icon.download_url;

        // 确保文件名有扩展名
        let filename = icon.filename;
        if (useSvg && !filename.endsWith('.svg')) {
          filename = filename.replace(/\.\w+$/, '.svg');
        } else if (!useSvg && !filename.endsWith('.png') && !filename.endsWith('.jpg') && !filename.endsWith('.webp')) {
          filename += '.png';
        }

        const filePath = join(outputDir, filename);

        // 已存在则跳过
        if (await fileExists(filePath)) {
          return {
            filename,
            file_path: filePath,
            format: useSvg ? 'svg' : 'png',
            status: 'skipped' as const,
          };
        }

        // 确保子目录存在
        const dir = join(filePath, '..');
        await mkdir(dir, { recursive: true });

        const buffer = await client.getBytes(url);
        await writeFile(filePath, buffer);

        return {
          filename,
          file_path: filePath,
          format: useSvg ? 'svg' : 'png',
          status: 'success' as const,
        };
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        // 找到对应的 icon 信息
        const failedIdx = batchResults.indexOf(r);
        const icon = batch[failedIdx];
        results.push({
          filename: icon.filename,
          file_path: '',
          format: '',
          status: 'failed',
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return {
    status: 'success',
    output_dir: outputDir,
    total: args.icons.length,
    success: successCount,
    skipped: skippedCount,
    failed: failedCount,
    results,
  };
}
