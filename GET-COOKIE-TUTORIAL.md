# 如何获取蓝湖 Cookie - 图文教程

> 这是最简单的获取 Cookie 方法，适合所有人，只需 7 个步骤！

---

## 准备工作

- 确保你有蓝湖账号并且能登录
- 推荐使用 Chrome 或 Edge 浏览器
- 预计耗时：1-2 分钟

---

## 获取步骤

### 步骤 1: 打开蓝湖并登录

在浏览器中访问：**https://lanhuapp.com**

确保你已经登录到你的蓝湖账号。

```
提示：如果没有账号，需要先注册一个。
```

---

### 步骤 2: 打开开发者工具

有三种方法打开开发者工具，选择最方便的一种：

**方法 1: 键盘快捷键（推荐）**
- Windows/Linux: 按 `F12` 键
- Mac: 按 `Command + Option + I`

**方法 2: 右键菜单**
- 在页面空白处右键点击
- 选择 "检查" 或 "Inspect"

**方法 3: 浏览器菜单**
- Chrome: 右上角三个点 -> 更多工具 -> 开发者工具
- Edge: 右上角三个点 -> 更多工具 -> 开发者工具

```
成功标志：
页面底部或右侧会出现一个面板，这就是开发者工具
```

---

### 步骤 3: 切换到 Network 标签

在开发者工具顶部，找到并点击 **"Network"**（网络）标签。

可能的名称：
- `Network` (英文)
- `网络` (中文)

```
提示：
如果看不到 Network 标签，可能是窗口太窄了，
尝试拖宽开发者工具窗口，或者点击 >> 按钮查看更多标签。
```

---

### 步骤 4: 刷新页面

按 `F5` 键，或者点击浏览器的刷新按钮。

```
成功标志：
Network 面板中会出现很多请求记录
```

---

### 步骤 5: 选择一个请求

在 Network 面板左侧的请求列表中，点击**第一个请求**。

通常第一个请求的名称会是类似：
- `document`
- `/`
- 或者以域名开头的请求

```
提示：
不确定选哪个？随便选一个就行，只要是蓝湖域名的请求都可以。
```

---

### 步骤 6: 找到 Cookie

点击请求后，右侧会显示请求详情。

找到 **"Headers"**（请求头）标签（通常默认就显示这个）。

往下滚动，找到 **"Request Headers"**（请求头）部分。

在这个部分中，找到以 **`Cookie:`** 开头的那一行。

```
Cookie: Hm_lvt_xxx=xxx; session=xxx; user_token=xxx; ...
```

这一行通常很长，包含多个键值对，用 `;` 分隔。

---

### 步骤 7: 复制 Cookie

**重要：** 只复制 `Cookie:` **冒号后面**的内容，不要包含 `Cookie:` 这几个字。

有两种复制方法：

**方法 1: 直接选中复制（推荐）**
1. 用鼠标从第一个字符开始拖动选中整行
2. 确保选到最后（Cookie 很长，可能需要横向滚动）
3. 右键 -> 复制，或按 `Ctrl+C` (Mac: `Command+C`)

**方法 2: 右键复制（Chrome/Edge）**
1. 在 Cookie 那一行上右键点击
2. 选择 "Copy value"（复制值）

```
成功标志：
复制的内容应该是一长串文本，包含多个键值对，
类似这样：
Hm_lvt_xxx=xxx; session=.eyJhbGc...; user_token=eyJhbGc...; ...

注意：
- 不要包含 "Cookie:" 这几个字
- 确保复制完整，不要截断
- Cookie 很长，可能有几千个字符
```

---

## 验证 Cookie 是否正确

复制的 Cookie 应该满足以下特征：

- 包含 `session=` 或 `user_token=`
- 包含多个键值对，用 `;` 分隔
- 很长，通常有几百甚至上千个字符
- 不包含 `Cookie:` 字样
- 不包含换行符

**示例（脱敏后）：**
```
Hm_lvt_b4f3ed63ac4e8f18be586b41df007a16=1761908153; session=.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; user_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; ...
```

---

## 配置 Cookie

获取到 Cookie 后，将其配置到 `.env` 文件中：

```bash
# 1. 复制示例配置文件
cp .env.example .env

# 2. 编辑 .env 文件
# 找到这一行：
# LANHU_COOKIE=your_lanhu_cookie_here
# 把 your_lanhu_cookie_here 替换为你复制的 Cookie
```

**完整示例：**
```bash
LANHU_COOKIE=Hm_lvt_b4f3ed63ac4e8f18be586b41df007a16=1761908153; session=.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 安全提示

**Cookie 包含你的登录凭证，请妥善保管！**

- 不要分享给他人
- 不要提交到公开的 Git 仓库
- 不要发布到社交媒体
- 只在本地的 `.env` 文件中使用
- 定期更换 Cookie（重新登录蓝湖即可）

---

## 常见问题

### Q1: 找不到 Cookie？

**可能原因：**
- 没有登录蓝湖
- 选错了请求（选择了非蓝湖域名的请求）
- 开发者工具没有打开 Network 标签

**解决方法：**
1. 确保已登录蓝湖
2. 重新刷新页面
3. 选择 lanhuapp.com 域名的请求

---

### Q2: Cookie 是空的或很短？

**可能原因：**
- 选择的请求不对
- 浏览器插件拦截了 Cookie

**解决方法：**
1. 换一个请求试试，选择域名为 lanhuapp.com 的
2. 暂时禁用浏览器插件（特别是隐私保护类插件）

---

### Q3: 复制的 Cookie 包含了 "Cookie:" 字样？

**解决方法：**
手动删除 `Cookie:` 这几个字和后面的空格，只保留值的部分。

---

### Q4: Cookie 会过期吗？

**是的，Cookie 会过期。**

当你遇到以下情况时，需要重新获取 Cookie：
- 服务返回认证失败
- 蓝湖网页提示需要重新登录
- Cookie 使用了一段时间后失效

**更新 Cookie 的方法：**
1. 重新获取新的 Cookie（按照本教程）
2. 更新 `.env` 文件中的 `LANHU_COOKIE` 值
3. 重启服务

---

## 更简单的方法（高级）

如果你经常需要获取 Cookie，可以使用浏览器插件：

### 推荐插件：

1. **Cookie-Editor** (Chrome/Edge/Firefox)
   - 可视化 Cookie 管理
   - 一键导出

2. **EditThisCookie** (Chrome/Edge)
   - 一键复制所有 Cookie
   - 支持导出为多种格式

**使用方法：**
1. 安装插件
2. 登录蓝湖后点击插件图标
3. 点击 "Export" 或 "复制"
4. 选择 "Header String" 格式
5. 粘贴到 `.env` 文件

---

## 还有问题？

如果按照教程操作还是有问题，可以：

1. 查看项目的 [常见问题文档](README.md#常见问题)
2. 在 GitHub 提 Issue
3. 加入讨论群寻求帮助

---

## 下一步

获取到 Cookie 后，你可以：

1. **按照安装指南配置**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，粘贴 Cookie
   npm run build
   npm start
   ```

2. **让 AI 帮你**
   - 把 Cookie 告诉 AI（在私密对话中）
   - AI 会帮你完成配置和启动

3. **在 AI 客户端中配置 MCP**
   - 参考 [AI 安装指南](ai-install-guide.md) 中的客户端配置部分
