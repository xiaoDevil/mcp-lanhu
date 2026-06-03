#!/usr/bin/env node

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const DIST_ENTRY = resolve(PROJECT_ROOT, 'dist', 'index.js');

function log(msg: string): void {
  console.log(msg);
}

function success(msg: string): void {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function error(msg: string): void {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m! ${msg}\x1b[0m`);
}

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

function sendRequest(proc: ChildProcess, method: string, params: Record<string, unknown> = {}, id = 1): void {
  const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  proc.stdin!.write(`${message}\n`);
}

function waitForResponse(proc: ChildProcess, timeoutMs = 15000): Promise<McpResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`等待响应超时（${timeoutMs / 1000}秒）`));
    }, timeoutMs);

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as McpResponse;
          if (parsed.jsonrpc === '2.0' && parsed.id !== undefined) {
            clearTimeout(timer);
            proc.stdout!.off('data', onData);
            resolve(parsed);
            return;
          }
        } catch {
          // 不是完整 JSON，继续等待
        }
      }
    };

    proc.stdout!.on('data', onData);
    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) log(`  [server stderr] ${text}`);
    });
  });
}

async function testMcp(): Promise<void> {
  log('========================================');
  log('  蓝湖 MCP 服务器 - 可用性测试');
  log('========================================\n');

  // 1. 检查构建产物
  if (!existsSync(DIST_ENTRY)) {
    error(`构建产物不存在: ${DIST_ENTRY}`);
    log('请先执行: npm run build');
    process.exit(1);
  }
  success('构建产物存在');

  // 2. 检查 .env 文件
  const envPath = resolve(PROJECT_ROOT, '.env');
  if (!existsSync(envPath)) {
    error('.env 文件不存在');
    log('请先执行: npm run init');
    process.exit(1);
  }
  success('.env 文件存在');

  // 3. 启动 MCP server
  log('\n正在启动 MCP server...');
  const proc = spawn('node', [DIST_ENTRY], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let serverStarted = false;

  try {
    // 4. 发送 initialize 请求
    log('发送 initialize 请求...');
    sendRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });

    const initResp = await waitForResponse(proc, 10000);
    if (initResp.error) {
      error(`initialize 失败: ${initResp.error.message}`);
      process.exit(1);
    }
    serverStarted = true;
    const serverInfo = (initResp.result?.serverInfo ?? {}) as Record<string, string>;
    success(`MCP server 启动成功: ${serverInfo.name ?? 'unknown'} v${serverInfo.version ?? 'unknown'}`);

    // 5. 发送 initialized 通知
    proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    // 6. 获取工具列表
    log('\n获取工具列表...');
    sendRequest(proc, 'tools/list', {}, 2);
    const toolsResp = await waitForResponse(proc, 10000);
    if (toolsResp.error) {
      error(`tools/list 失败: ${toolsResp.error.message}`);
      process.exit(1);
    }

    const tools = (toolsResp.result?.tools ?? []) as Array<{ name: string; description: string }>;
    success(`发现 ${tools.length} 个工具:`);
    for (const tool of tools) {
      log(`  - ${tool.name}`);
    }

    // 7. 测试工具调用（列出产品文档，用一个示例 URL）
    log('\n测试工具调用 (lanhu_list_product_documents)...');
    sendRequest(proc, 'tools/call', {
      name: 'lanhu_list_product_documents',
      arguments: { url: 'https://lanhuapp.com/web/#/item/project/product?tid=test&pid=test' },
    }, 3);

    const callResp = await waitForResponse(proc, 30000);
    if (callResp.error) {
      warn(`工具调用返回错误（可能是 Cookie 或 URL 问题）: ${callResp.error.message}`);
    } else {
      const content = callResp.result?.content as Array<{ type: string; text?: string }> | undefined;
      if (content && content.length > 0) {
        const text = content[0].text ?? '';
        if (text.includes('API Error') || text.includes('error')) {
          warn('工具调用返回了 API 错误 — 请检查 Cookie 是否有效');
          log(`  响应: ${text.slice(0, 200)}...`);
        } else {
          success('工具调用成功');
        }
      }
    }

    success('\nMCP 服务器可用性测试通过！');
    log('\n提示: 如果工具调用报错，请检查:');
    log('  1. .env 中的 LANHU_COOKIE 是否有效');
    log('  2. 蓝湖账号是否有对应项目的访问权限');
  } catch (err) {
    if (serverStarted) {
      error(`测试失败: ${err instanceof Error ? err.message : String(err)}`);
    } else {
      error(`MCP server 启动失败: ${err instanceof Error ? err.message : String(err)}`);
      log('可能原因:');
      log('  1. 构建产物损坏，请重新执行: npm run build');
      log('  2. 依赖缺失，请执行: npm install');
    }
    process.exit(1);
  } finally {
    proc.kill();
  }
}

testMcp().catch((err) => {
  error(`测试异常: ${err.message}`);
  process.exit(1);
});
