#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ENV_PATH = join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = join(PROJECT_ROOT, '.env.example');

function log(msg: string): void {
  console.log(msg);
}

function error(msg: string): void {
  console.error(`\x1b[31m${msg}\x1b[0m`);
}

function success(msg: string): void {
  console.log(`\x1b[32m${msg}\x1b[0m`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m${msg}\x1b[0m`);
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function checkNodeVersion(): boolean {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major < 18) {
    error(`[错误] Node.js 版本过低: ${version}，需要 >= 18`);
    return false;
  }
  success(`[√] Node.js 版本: ${version}`);
  return true;
}

function checkPlaywrightBrowser(): boolean {
  try {
    execSync('npx playwright install --dry-run chromium 2>&1', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

function installPlaywrightBrowser(): boolean {
  log('\n正在安装 Playwright Chromium 浏览器（约 150MB，请耐心等待）...');
  log('使用国内镜像加速下载...');
  try {
    execSync('npx playwright install chromium', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 300000,
      env: {
        ...process.env,
        PLAYWRIGHT_DOWNLOAD_HOST: 'https://cdn.npmmirror.com/binaries/playwright',
      },
    });
    success('[√] Playwright Chromium 安装完成');
    return true;
  } catch {
    error('[错误] Playwright Chromium 安装失败');
    warn('请手动执行: PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium');
    return false;
  }
}

function loadEnvExample(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!existsSync(ENV_EXAMPLE_PATH)) return vars;
  const content = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
  return vars;
}

function writeEnv(vars: Record<string, string>): void {
  const lines = ['# 蓝湖 MCP 服务器配置', ''];
  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

function buildProject(): boolean {
  log('\n正在构建项目...');
  try {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit', timeout: 60000 });
    success('[√] 构建完成');
    return true;
  } catch {
    error('[错误] 构建失败，请手动执行: npm run build');
    return false;
  }
}

function showMcpConfig(): void {
  const distPath = resolve(PROJECT_ROOT, 'dist', 'index.js');

  log('\n========================================');
  log('  MCP 配置（复制到你的 AI 客户端）');
  log('========================================\n');

  const config = {
    mcpServers: {
      lanhu: {
        command: 'node',
        args: [distPath],
        env: {
          LANHU_COOKIE: 'your_lanhu_cookie_here',
        },
      },
    },
  };

  log(JSON.stringify(config, null, 2));

  log('\n--- Claude Code 用户 ---');
  log('将上述配置添加到 ~/.claude/settings.json 或项目的 .claude/settings.json');

  log('\n--- Cursor 用户 ---');
  log('将上述配置添加到 Cursor Settings > MCP Servers');

  log('\n--- Windsurf 用户 ---');
  log('将上述配置添加到 ~/.codeium/windsurf/mcp_config.json');
}

async function main(): Promise<void> {
  log('========================================');
  log('  蓝湖 MCP 服务器 - 初始化向导');
  log('========================================\n');

  // 1. 检查 Node.js 版本
  if (!checkNodeVersion()) {
    process.exit(1);
  }

  // 2. 检查 Playwright 浏览器
  const hasPlaywright = checkPlaywrightBrowser();
  if (!hasPlaywright) {
    warn('[!] Playwright Chromium 浏览器未安装');
    const answer = await ask('是否现在安装？(y/n): ');
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      if (!installPlaywrightBrowser()) {
        warn('跳过浏览器安装，截图功能将不可用');
      }
    } else {
      warn('跳过浏览器安装，截图功能将不可用');
      warn('稍后可手动执行: PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium');
    }
  } else {
    success('[√] Playwright Chromium 已安装');
  }

  // 3. 配置 Cookie
  log('\n--- 配置蓝湖 Cookie ---');
  log('获取方式:');
  log('  1. 打开 https://lanhuapp.com 并登录');
  log('  2. 按 F12 打开开发者工具');
  log('  3. 切换到 Network 标签');
  log('  4. 刷新页面，点击任意请求');
  log('  5. 在 Request Headers 中找到 Cookie 字段');
  log('  6. 复制完整的 Cookie 值\n');

  if (existsSync(ENV_PATH)) {
    const existing = readFileSync(ENV_PATH, 'utf-8');
    if (existing.includes('LANHU_COOKIE=') && !existing.includes('LANHU_COOKIE=\n') && !existing.includes('LANHU_COOKIE=""')) {
      success('[√] .env 文件已存在且包含 Cookie 配置');
      const answer = await ask('是否重新配置 Cookie？(y/n): ');
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        log('跳过 Cookie 配置');
        buildProject();
        showMcpConfig();
        return;
      }
    }
  }

  const cookie = await ask('请粘贴蓝湖 Cookie: ');
  if (!cookie) {
    warn('[!] Cookie 为空，后续使用时可能会报错');
    warn('  获取方式: https://lanhuapp.com 登录后从浏览器复制');
  }

  // 4. 写入 .env
  const envVars = loadEnvExample();
  envVars['LANHU_COOKIE'] = cookie || '';
  writeEnv(envVars);
  success('[√] .env 文件已生成');

  // 5. 构建项目
  buildProject();

  // 6. 输出 MCP 配置
  showMcpConfig();

  success('\n初始化完成！');
}

main().catch((err) => {
  error(`初始化失败: ${err.message}`);
  process.exit(1);
});
