# 香港保险考试备考 Web

一个可直接部署到 Cloudflare Pages 的静态网页版本，包含香港保险考试 Paper 1 / Paper 3 的教材阅读、套题练习、错题复盘和搜索。

## AI 功能

- 默认服务商：DeepSeek
- 默认 Base URL：`https://api.deepseek.com`
- 默认模型：`deepseek-v4-flash`
- 可在网页右上角 `AI 设置` 中修改服务商、Base URL、模型、API Key、Temperature 和 Max tokens。
- 所有 AI 设置只保存在当前浏览器的 `localStorage`，不会上传到 Cloudflare 或本项目服务器。
- 点击刷题页的 `AI 讲解`，浏览器会把当前题目、选项和解析直接发送给你配置的 AI 服务商。

## 本地运行

```bash
python3 -m http.server 5178 --bind 127.0.0.1
```

打开：

```text
http://127.0.0.1:5178/
```

## Cloudflare Pages 设置

如果用 Cloudflare Pages 连接这个 GitHub 仓库：

```text
Framework preset: None
Build command: 留空
Build output directory: /
Root directory: 留空
Environment variables: 不需要
```

题库文件位于：

```text
data/study-data.json
```

网页进度保存在浏览器 `localStorage`，不会写回服务器。
