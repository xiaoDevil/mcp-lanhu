<div align="center">

# Lanhu MCP Server (TypeScript)

**蓝湖设计协作平台 MCP 服务器**

**lanhumcp | 蓝湖mcp | lanhu-mcp | 蓝湖AI助手 | Lanhu AI Integration**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

[快速开始](#-快速开始) | [功能特性](#-核心特性) | [使用文档](#-使用指南) | [工具列表](#-可用工具列表)

</div>

---

## 项目简介

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的蓝湖平台服务器，支持 Axure 原型分析和 UI 设计图提取。

**核心能力**：
- **需求文档分析**：自动提取 Axure 原型页面，支持开发/测试/探索三种分析模式，四阶段工作流确保零遗漏
- **UI 设计支持**：批量下载设计稿，自动将设计 Schema 转换为 HTML+CSS 代码，提取切图资源
- **智能缓存**：基于版本号的永久缓存机制，增量更新，并发处理

**适用场景**：
- Cursor + 蓝湖：让 Cursor AI 直接读取蓝湖需求文档和设计稿
- Windsurf + 蓝湖：Windsurf Cascade AI 直接读取蓝湖需求文档和设计稿
- Claude Code + 蓝湖：Claude AI 直接读取蓝湖需求文档和设计稿
- 任何支持 MCP 协议的 AI 开发工具

---

## 目录

- [核心特性](#-核心特性)
- [快速开始](#-快速开始)
- [使用指南](#-使用指南)
- [可用工具列表](#-可用工具列表)
- [项目结构](#-项目结构)
- [高级配置](#-高级配置)
- [常见问题](#-常见问题)
- [安全说明](#-安全说明)
- [许可证](#-许可证)

---

## 核心特性

### 需求文档分析
- **智能文档提取**：自动下载和解析 Axure 原型的所有页面、资源和交互
- **三种分析模式**：
  - **开发视角**：详细字段规则、业务逻辑、全局流程图
  - **测试视角**：测试场景、用例、边界值、校验规则
  - **快速探索**：核心功能概览、模块依赖、评审要点
- **四阶段工作流**：全局扫描 -> 分组分析 -> 反向验证 -> 生成交付物
- **零遗漏保证**：基于 TODO 驱动的系统化分析流程

### UI 设计支持
- **设计稿查看**：批量下载和展示 UI 设计图
- **设计图分析**：获取详细设计参数（组件尺寸、间距、颜色值、字体大小等），自动将设计 Schema 转为 HTML+CSS 代码
- **切图提取**：自动识别和导出设计切图、图标资源
- **多分辨率支持**：自动生成 1x/2x/3x、iOS/Android 多分辨率切图 URL

### 性能优化
- **智能缓存**：基于文档版本号的永久缓存机制
- **增量更新**：只下载变更的资源
- **并发处理**：支持批量页面截图和资源下载

---

## 快速开始

> **重要提示：必须使用支持视觉功能的 AI 模型！**
>
> 本项目需要 AI 模型具备图像识别和分析能力，推荐使用：
> - Claude (Anthropic)
> - GPT (OpenAI)
> - Gemini (Google)
> - Kimi (月之暗面)
> - Qwen (阿里巴巴)
> - DeepSeek (深度求索)
>
> 不支持纯文本模型（如 GPT-3.5、Claude Instant 等）

### 前置要求

- Node.js 18+
- npm 或 pnpm
- 蓝湖账号及 Cookie

### 安装

**方式一：一键初始化（推荐）**

```bash
# 1. 克隆项目
git clone https://github.com/dsphper/lanhu-mcp.git
cd lanhu-mcp

# 2. 安装依赖
npm install

# 3. 一键初始化（引导配置 Cookie + 安装浏览器 + 构建项目）
npm run init
```

初始化脚本会自动完成：检测环境 → 引导输入 Cookie → 安装 Playwright 浏览器 → 构建项目 → 输出 MCP 配置。

**方式二：手动安装**

```bash
git clone https://github.com/dsphper/lanhu-mcp.git
cd lanhu-mcp
npm install
# 国内用户使用镜像加速下载 Playwright 浏览器（约 150MB）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
cp .env.example .env
# 编辑 .env 文件，填入蓝湖 Cookie
npm run build
```

**方式三：让 AI 帮你安装（推荐小白）**

直接对 AI 说：
```
帮我克隆并安装 https://github.com/dsphper/lanhu-mcp 项目
```

AI 会自动完成：克隆项目 -> 安装依赖 -> 引导获取 Cookie -> 配置并启动服务

参考文档：[AI 安装指南](ai-install-guide.md) | [Cookie 获取教程](GET-COOKIE-TUTORIAL.md)

### 配置

编辑 `.env` 文件：

```bash
# 蓝湖 Cookie（必需）
LANHU_COOKIE=your_lanhu_cookie_here

# DDS Cookie（可选，默认使用 LANHU_COOKIE）
DDS_COOKIE=

# 数据存储目录
DATA_DIR=./data

# HTTP 请求超时时间（秒）
HTTP_TIMEOUT=30

# 浏览器视口宽度/高度
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080

# 调试模式
DEBUG=false
```

### 构建与运行

```bash
# 构建 TypeScript
npm run build

# 开发模式运行（使用 tsx 直接运行）
npm run dev

# 生产模式运行
npm start
```

### 测试 MCP 是否可用

```bash
# 测试 MCP 服务器是否能正常启动和通信
npm run test:mcp
```

该命令会自动检测：构建产物是否存在 → MCP server 能否启动 → 工具列表是否正确 → Cookie 是否有效。

### 连接到 AI 客户端

在支持 MCP 的 AI 客户端中配置 stdio 模式：

**Claude Code 配置示例：**
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH>/dist/index.js"],
      "env": {
        "LANHU_COOKIE": "your_lanhu_cookie_here"
      }
    }
  }
}
```

**Cursor / Windsurf 配置示例：**
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH>/dist/index.js"],
      "env": {
        "LANHU_COOKIE": "your_lanhu_cookie_here"
      }
    }
  }
}
```

**开发模式配置（无需构建）：**
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "npx",
      "args": ["tsx", "<ABSOLUTE_PATH>/src/index.ts"],
      "env": {
        "LANHU_COOKIE": "your_lanhu_cookie_here"
      }
    }
  }
}
```

> 请将 `<ABSOLUTE_PATH>` 替换为本机 `mcp-lanhu` 项目的绝对路径。

---

## 使用指南

### 需求文档分析工作流

**1. 获取页面列表**
```
请帮我用mcp看看这个需求文档：
https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx
```

**2. AI 自动执行四阶段分析**
- STAGE 1: 全局文本扫描，建立整体认知
- STAGE 2: 分组详细分析（根据选择的模式）
- STAGE 3: 反向验证，确保零遗漏
- STAGE 4: 生成交付文档（需求文档/测试计划/评审PPT）

**3. 获取交付物**
- 开发视角：详细需求文档 + 全局业务流程图
- 测试视角：测试计划 + 测试用例清单 + 字段校验表
- 快速探索：评审文档 + 模块依赖图 + 讨论要点

### UI 设计稿查看

```
请帮我用mcp看看这个设计稿：
https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx
```

分析结果包含设计图预览、详细参数（尺寸/间距/颜色/字体等）以及转换后的 HTML+CSS 代码。

### 切图下载

```
帮我用mcp下载"首页设计"的所有切图
```

AI 会自动：检测项目类型 -> 选择合适的输出目录 -> 生成语义化文件名 -> 批量下载切图。

### 解析邀请链接

```
帮我解析这个蓝湖邀请链接：https://lanhuapp.com/link/#/invite?sid=xxx
```

AI 会使用 Playwright 浏览器自动解析邀请链接，获取实际的项目文档地址。

---

## 可用工具列表

| 工具名称 | 功能描述 | 使用场景 |
|---------|---------|---------|
| `lanhu_resolve_invite_link` | 解析邀请链接 | 用户提供分享链接时 |
| `lanhu_list_product_documents` | 列出产品文档 | 查看项目下的 PRD/原型文档列表 |
| `lanhu_get_pages` | 获取原型页面列表 | 分析需求文档前必调用 |
| `lanhu_get_ai_analyze_page_result` | 分析原型页面内容 | 提取需求细节，支持三种分析模式 |
| `lanhu_get_designs` | 获取 UI 设计图列表 | 查看设计稿前必调用 |
| `lanhu_get_ai_analyze_design_result` | 分析 UI 设计图 | 获取设计参数和 HTML+CSS 代码 |
| `lanhu_get_design_slices` | 获取切图信息 | 下载图标、素材，支持多分辨率 |

---

## 项目结构

```
mcp-lanhu/
├── src/
│   ├── index.ts                         # 入口：stdio transport
│   ├── server.ts                        # McpServer + 工具注册
│   ├── types/
│   │   ├── lanhu.ts                     # API 响应类型、URL 参数
│   │   └── design.ts                    # 设计 Schema 节点类型
│   ├── config/
│   │   ├── env.ts                       # 环境变量加载
│   │   └── constants.ts                 # URL、CSS 常量
│   ├── client/
│   │   ├── lanhu-extractor.ts           # 核心 API 客户端类
│   │   └── http.ts                      # fetch 封装
│   ├── converter/
│   │   ├── design-to-html.ts            # Axure Schema -> HTML+CSS
│   │   ├── sketch-to-html.ts            # Sketch JSON -> HTML+CSS
│   │   ├── sketch-annotations.ts        # Sketch 标注提取
│   │   ├── design-tokens.ts             # Design Tokens 提取
│   │   ├── html-localizer.ts            # 远程 URL -> 本地路径
│   │   ├── html-minifier.ts             # HTML/CSS 压缩
│   │   ├── oc-to-css.ts                 # OC -> CSS 转换
│   │   └── css/
│   │       ├── css-utils.ts             # 驼峰转换、值格式化
│   │       ├── flex-utils.ts            # Flex 布局检测
│   │       ├── css-generator.ts         # CSS 规则生成
│   │       └── html-generator.ts        # HTML 结构生成
│   ├── tools/
│   │   ├── resolve-invite-link.ts       # 解析邀请链接
│   │   ├── list-product-documents.ts    # 列出产品文档
│   │   ├── get-pages.ts                 # 获取页面列表
│   │   ├── analyze-pages.ts             # AI 分析页面
│   │   ├── get-designs.ts               # 获取设计图列表
│   │   ├── analyze-designs.ts           # AI 分析设计图
│   │   ├── get-design-slices.ts         # 获取切图信息
│   │   └── prompts/
│   │       ├── analysis-modes.ts        # 分析模式 prompt
│   │       └── ai-instructions.ts       # AI 行为指令
│   └── utils/
│       ├── cache.ts                     # 版本缓存
│       ├── screenshot.ts                # Playwright 截图
│       └── date.ts                      # 日期格式化
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## 高级配置

### 环境变量说明

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `LANHU_COOKIE` | 是 | - | 蓝湖登录 Cookie |
| `DDS_COOKIE` | 否 | LANHU_COOKIE | DDS 服务 Cookie |
| `DATA_DIR` | 否 | `./data` | 数据存储目录 |
| `HTTP_TIMEOUT` | 否 | `30` | HTTP 请求超时（秒） |
| `VIEWPORT_WIDTH` | 否 | `1920` | 浏览器视口宽度 |
| `VIEWPORT_HEIGHT` | 否 | `1080` | 浏览器视口高度 |
| `DEBUG` | 否 | `false` | 调试模式 |

### 缓存控制

缓存目录由 `DATA_DIR` 环境变量控制。删除缓存目录下的对应文件即可清除缓存，系统会自动重新下载。

### 技术栈

| 组件 | 技术 |
|------|------|
| Runtime | Node.js 18+ (ES2022) |
| Language | TypeScript 5.7+ (strict mode) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| HTTP | 原生 `fetch`（零依赖） |
| HTML 解析 | `cheerio` |
| 浏览器自动化 | `playwright` |
| 输入验证 | `zod` |
| 包管理 | npm / pnpm |
| 测试 | vitest |

---

## 常见问题

### Q: Cookie 过期怎么办？

重新登录蓝湖网页版，获取新的 Cookie 并更新 `.env` 文件中的 `LANHU_COOKIE` 值，然后重启服务。

### Q: 截图失败或显示空白？

确保已安装 Playwright 浏览器：
```bash
# 国内用户使用镜像加速
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
```

### Q: 如何清理缓存？

删除 `data/` 目录下的对应缓存文件即可，系统会自动重新下载。

### Q: 如何在开发模式下运行？

使用 `npm run dev` 可以直接运行 TypeScript 源码，无需编译。

### Q: 如何测试 MCP 是否可用？

```bash
npm run test:mcp
```

该命令会检测 MCP server 能否正常启动、工具是否注册、Cookie 是否有效。

### Q: 如何运行测试？

```bash
npm test
```

---

## 安全说明

- **Cookie 安全**：请勿将含有 Cookie 的 `.env` 文件提交到公开仓库
- **访问控制**：建议在内网环境部署
- **数据隐私**：所有数据存储在本地，不会上传到第三方服务器

---

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 致谢

### 开源项目

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP 协议 SDK
- [Playwright](https://playwright.dev/) - 浏览器自动化工具
- [cheerio](https://cheerio.js.org/) - HTML 解析利器
- [zod](https://zod.dev/) - 输入验证库

### 服务平台

- [蓝湖](https://lanhuapp.com/) - 设计协作平台

---

## 免责声明

本项目是一个**第三方开源项目**，由社区开发者独立开发和维护，**并非蓝湖官方产品**。

**重要说明：**
- 本项目与蓝湖公司无任何官方关联或合作关系
- 本项目通过公开的网页接口与蓝湖平台交互，不涉及任何未授权访问
- 使用本项目需要您拥有合法的蓝湖账号和访问权限
- 请遵守蓝湖平台的服务条款和使用政策
- 本项目仅供学习和研究使用，使用者需自行承担使用风险

**数据和隐私：**
- 本项目在本地处理和缓存数据，不会向第三方服务器传输您的数据
- 您的蓝湖 Cookie 和项目数据仅存储在您的本地环境中
- 请妥善保管您的凭证信息，不要分享给他人

**开源协议：**
- 本项目采用 MIT 开源协议，按"原样"提供，不提供任何形式的保证
- 详见 [LICENSE](LICENSE) 文件
