# AI 助手安装指南

> **专为 AI 助手设计的安装指导文档**
> AI 可以根据这个文档一步步引导用户完成安装

---

## 安装检查清单

在开始之前，AI 需要确认用户的系统环境：

```
[ ] 操作系统：Windows / Mac / Linux
[ ] 是否安装了 Node.js 18+？(node --version)
[ ] 是否安装了 npm？(npm --version)
[ ] 是否有蓝湖账号？
```

---

## 安装流程

### 方式1：npm 安装（推荐）

**步骤1：下载项目**
```bash
# AI 可以执行这个命令
git clone https://github.com/dsphper/lanhu-mcp.git
cd lanhu-mcp
```

**步骤2：安装依赖**
```bash
npm install
```

**步骤3：安装 Playwright 浏览器**
```bash
# 国内用户建议使用镜像加速下载（约 150MB）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
```

**步骤4：配置环境变量**
```bash
cp .env.example .env
```

**步骤5：编辑 .env 文件，填入蓝湖 Cookie**
```bash
# 打开 .env 文件，找到这一行：
# LANHU_COOKIE=your_lanhu_cookie_here
# 把 your_lanhu_cookie_here 替换为你的蓝湖 Cookie
```

**步骤6：构建项目**
```bash
npm run build
```

**步骤7：测试运行**
```bash
npm start
```

**AI 引导话术示例**：
```
我现在帮你安装 Lanhu MCP Server（TypeScript 版），非常简单！

1. 我先帮你下载项目（正在执行...）
2. 安装 Node.js 依赖（正在执行...）
3. 安装 Playwright 浏览器（正在执行...）
4. 有一个步骤需要你配合：获取蓝湖的 Cookie
   不用担心，我会给你看教程，跟着做就行！
   
准备好了吗？我们开始吧！
```

---

### 方式2：开发模式运行（无需构建）

适合开发调试，使用 tsx 直接运行 TypeScript 源码：

```bash
# 1. 下载项目
git clone https://github.com/dsphper/lanhu-mcp.git
cd lanhu-mcp

# 2. 安装依赖
npm install

# 3. 安装 Playwright 浏览器（国内用户使用镜像加速）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 5. 开发模式运行
npm run dev
```

**AI 引导话术示例**：
```
我看你对命令行有一定了解，我们用开发模式：

1. 下载项目（正在执行...）
2. 安装依赖（正在执行...）
3. 配置 Cookie（需要你配合）
4. 直接运行 TypeScript 源码

开发模式不需要编译，修改代码后直接生效。
```

---

## Cookie 获取详细指南

### 方法1：Chrome/Edge（推荐）

1. **打开蓝湖并登录**
   ```
   https://lanhuapp.com
   ```

2. **打开开发者工具**
   - Windows/Linux: 按 `F12` 键
   - Mac: 按 `Command + Option + I`
   - 或者：右键点击页面 -> 选择"检查"

3. **切换到 Network 标签**
   - 在开发者工具顶部找到 "Network"（网络）标签
   - 点击它

4. **刷新页面**
   - 按 `F5` 或点击浏览器的刷新按钮

5. **找到并复制 Cookie**
   - 在请求列表中点击任意一个请求（通常是第一个）
   - 右侧会显示请求详情
   - 找到 "Request Headers"（请求头）部分
   - 找到 "Cookie:" 开头的那一行
   - 选中并复制整个 Cookie 值（可能很长）

### 方法2：浏览器插件（更简单）

1. 安装 **Cookie-Editor** 插件（Chrome/Edge/Firefox）
2. 登录蓝湖
3. 点击插件图标
4. 点击 "Export" -> "Header String"
5. 粘贴到 `.env` 文件

---

## AI 自动化安装能力

### AI 可以做的：
- 执行命令下载项目
- 安装 npm 依赖
- 安装 Playwright 浏览器（自动使用国内镜像）
- 检查环境
- 修改配置文件
- 构建项目
- 启动服务
- 提供图文教程链接

### AI 无法做的（需要用户配合）：
- 自动获取 Cookie（浏览器安全限制）
- 自动登录蓝湖账号

### AI 引导流程示例：

```
AI: "我现在帮你安装 Lanhu MCP Server，整个过程大约需要 3-5 分钟。"

AI: "步骤1：下载项目（执行 git clone...）"
AI: "下载完成！"

AI: "步骤2：安装依赖（执行 npm install...）"
AI: "依赖安装完成！"

AI: "步骤3：安装 Playwright 浏览器（使用国内镜像加速下载...）"
AI: "浏览器安装完成！"

AI: "步骤4：获取 Cookie（这一步需要你的配合）"
AI: "我打开了一个图文教程，跟着做就行，非常简单！"
AI: "（展示截图或教程链接）"

用户: "我复制好了"

AI: "太棒了！把 Cookie 发给我，我帮你配置。"

用户: "（粘贴 Cookie）"

AI: "收到！我正在配置...（修改 .env 文件）"
AI: "配置完成！"

AI: "步骤5：构建项目（执行 npm run build...）"
AI: "构建完成！"

AI: "步骤6：启动服务"
AI: "服务已启动！"

AI: "最后一步：在 AI 客户端中配置 MCP"
AI: "我帮你生成配置文件：（展示配置）"
```

---

## 简化版安装步骤（给小白看的）

### 只需 4 步：

**第1步：运行安装命令**
```bash
git clone https://github.com/dsphper/lanhu-mcp.git
cd lanhu-mcp
npm install
# 国内用户使用镜像加速下载 Playwright 浏览器
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
```

**第2步：获取 Cookie**
- 打开 https://lanhuapp.com 并登录
- 按 F12 键
- 点击 "Network" 标签
- 刷新页面（按F5）
- 点击任意请求，找到 "Cookie"，复制

**第3步：配置 Cookie**
```bash
cp .env.example .env
# 编辑 .env 文件，粘贴你的 Cookie
```

**第4步：构建并运行**
```bash
npm run build
npm start
```

---

## 常见问题

### Q1: 提示 Node.js 未安装？

AI 引导：
```
看起来你的电脑还没有安装 Node.js，我帮你安装：

Windows:
  访问 https://nodejs.org/
  下载 LTS 版本并安装

Mac:
  在终端执行：brew install node
  （如果没有 brew，先安装 Homebrew）

或者使用 nvm 管理 Node.js 版本：
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  nvm install 18
```

### Q2: npm install 失败？

可能原因：
- 网络问题（国内用户可能需要配置 npm 镜像）
- Node.js 版本过低

解决方案：
```bash
# 配置淘宝镜像
npm config set registry https://registry.npmmirror.com

# 重新安装
npm install
```

### Q3: Playwright 安装失败或下载很慢？

```bash
# 使用国内镜像下载（推荐国内用户）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
```

> **提示**：安装指南中的命令已默认使用国内镜像，如果仍然失败，可以尝试手动访问 https://cdn.npmmirror.com/binaries/playwright 确认镜像是否可用。

### Q4: Cookie 在哪里粘贴？

AI 会自动打开 `.env` 文件，告诉用户：
```
我已经打开了配置文件，你只需要：
1. 找到这一行：LANHU_COOKIE=your_lanhu_cookie_here
2. 把等号后面的内容替换成你复制的 Cookie
3. 保存文件（Ctrl+S 或 Command+S）
```

### Q5: 构建失败？

```bash
# 检查 TypeScript 版本
npx tsc --version

# 重新构建
npm run build

# 如果有类型错误，查看详细信息
npx tsc --noEmit
```

---

## 安装成功标志

当看到以下输出，说明安装成功：

```
Lanhu MCP Server started
```

下一步：在 AI 客户端中配置 MCP（AI 会继续指导）

---

## AI 客户端配置

安装成功后，需要在 AI 客户端中配置 MCP 服务器：

### Claude Code

在 `~/.claude/claude_desktop_config.json` 中添加：
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

### Cursor

在 `.cursor/mcp.json` 中添加：
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

### Windsurf

在 `.windsurfrules` 或 MCP 配置中添加：
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

> 请将 `<ABSOLUTE_PATH>` 替换为本机 `mcp-lanhu` 项目的绝对路径。
