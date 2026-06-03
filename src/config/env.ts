import 'dotenv/config';

export interface Config {
  cookie: string;
  ddsCookie: string;
  baseUrl: string;
  ddsBaseUrl: string;
  cdnUrl: string;
  dataDir: string;
  httpTimeout: number;
  viewportWidth: number;
  viewportHeight: number;
  debug: boolean;
  imageMode: 'direct' | 'mcp_assisted' | 'text_only_images' | 'auto';
  imageMcpTool: string;
  /** YApi 访问令牌（用于私有项目） */
  yapiToken: string;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const cookie = process.env.LANHU_COOKIE ?? '';

  if (!cookie) {
    console.error(
      '[lanhu-mcp] 警告: LANHU_COOKIE 未设置，请在 .env 文件中配置蓝湖 Cookie\n' +
      '获取方式: https://lanhuapp.com 登录后，从浏览器开发者工具复制 Cookie\n' +
      '配置方法: 在项目根目录创建 .env 文件，写入 LANHU_COOKIE=你的cookie'
    );
  }

  _config = {
    cookie,
    ddsCookie: process.env.DDS_COOKIE ?? cookie,
    baseUrl: 'https://lanhuapp.com',
    ddsBaseUrl: 'https://dds.lanhuapp.com',
    cdnUrl: 'https://axure-file.lanhuapp.com',
    dataDir: process.env.DATA_DIR ?? './data',
    httpTimeout: parseFloat(process.env.HTTP_TIMEOUT ?? '30') * 1000,
    viewportWidth: parseInt(process.env.VIEWPORT_WIDTH ?? '1920', 10),
    viewportHeight: parseInt(process.env.VIEWPORT_HEIGHT ?? '1080', 10),
    debug: (process.env.DEBUG ?? 'false').toLowerCase() === 'true',
    imageMode: (['direct', 'mcp_assisted', 'text_only_images', 'auto'].includes(process.env.IMAGE_MODE ?? '')
      ? process.env.IMAGE_MODE
      : 'auto') as Config['imageMode'],
    imageMcpTool: process.env.IMAGE_MCP_TOOL ?? 'mcp__zai-mcp-server__analyze_image',
    yapiToken: process.env.YAPI_TOKEN ?? '',
  };
  return _config;
}
