# Surge Control Desk

一个本地 Web 页面，用 Surge HTTP API 查看和控制 Surge。

## 启动

```bash
npm start
```

打开：

```text
http://127.0.0.1:8787
```

## Surge 配置

在 Surge 配置中启用 HTTP API，例如：

```text
http-api = examplekey@0.0.0.0:6171
```

页面里填写：

```text
API 地址: http://127.0.0.1:6171
API Key: examplekey
```

## 功能

- 查看和切换 MITM、Capture、Rewrite、Scripting、System Proxy、Enhanced Mode。
- 切换 Direct / Proxy / Rule 出站模式。
- 设置 Global 默认策略。
- 查看策略和策略组，测试策略延迟，切换策略组选择。
- 查看和切换模块。
- 查看活动请求、最近请求，并终止活动请求。
- 查看流量、事件、DNS 缓存、规则、当前配置。
- 执行重载配置、清空 DNS 缓存、设置日志等级、停止 Engine。

## 代理说明

浏览器直接请求 Surge API 时，自定义 `X-Key` header 可能触发 CORS 预检。这个项目用本地 Node 服务同时提供页面和 `/api/surge/*` 代理，由服务端转发到 Surge 并带上 `X-Key`。

默认只监听 `127.0.0.1:8787`。如果要改端口：

```bash
PORT=8790 npm start
```

## 测试

```bash
npm test
```
