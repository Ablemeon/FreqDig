# FreqDig

[中文](#中文) | [English](#english)

FreqDig is a local frequency-response analysis tool for importing, comparing, visualizing, and exporting audio measurement curves.

<a id="中文"></a>
<details open>
<summary><strong>中文说明</strong></summary>

## 简介

FreqDig 是一个轻量级频响曲线分析工具，支持导入 CSV/TXT/FRD/DAT 文本测量数据，查看原始曲线、相对基准差异、相对目标偏差，并导出图表。
尤其对音频测量数据进行可视化分析，帮助用户快速理解频响曲线的特征和变化趋势。
同时支持快捷导出png与svg等再编辑友好格式，对自媒体用户友好。
完全原生算法，严格遵循傅里叶与希尔伯特函数计算，原始采样精度计算：对函数的旋转，缩放，移动，相位转换，裕量等进行严格全精度计算后抽头绘制图表。

本项目采用MIT协议授权，请尊重并保留项目的版权声明。
## 运行环境

需要先安装 Node.js，建议使用当前 LTS 版本。

检查是否已安装：

```bash
node -v
```

如果没有安装，可以从 https://nodejs.org/ 下载。

Windows 也可以使用：

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

## 启动服务

项目使用零依赖 Node.js 静态服务器运行页面，避免直接打开 HTML 时遇到浏览器模块、脚本或资源加载限制。

### Windows：双击启动

在项目根目录双击：

```text
start.cmd
```

默认访问地址：

```text
http://127.0.0.1:8000/index.html
```

### Windows：PowerShell 启动

在项目根目录运行：

```powershell
.\start.ps1
```

指定端口：

```powershell
.\start.ps1 -Port 8123
```

### macOS / Linux：Shell 启动

首次使用时给脚本执行权限：

```bash
chmod +x ./start.sh
```

启动默认端口 `8000`：

```bash
./start.sh
```

指定端口：

```bash
./start.sh 8123
```

### 通用：npm 启动

```bash
npm start
```

也可以直接运行 Node 脚本：

```bash
node scripts/static-server.mjs 8000 --open
```

## 关闭服务

在运行服务的终端窗口中按：

```text
Ctrl+C
```

Windows 如果出现“是否终止批处理操作”的提示，输入 `Y` 后回车。

## 端口被占用

如果默认 `8000` 端口已被占用，换一个端口启动。

Windows：

```powershell
.\start.ps1 -Port 8123
```

macOS / Linux：

```bash
./start.sh 8123
```

访问地址也要改为对应端口：

```text
http://127.0.0.1:8123/index.html
```

</details>

<a id="english"></a>
<details>
<summary><strong>English</strong></summary>

## Overview

FreqDig is a local frequency-response analysis tool. It can import CSV/TXT/FRD/DAT text measurement data, display raw curves, compare curves against a reference or target curve, and export charts.

- Author: Diggercat
- License: MIT

## Requirements

Install Node.js first. The current LTS version is recommended.

Check whether Node.js is available:

```bash
node -v
```

If Node.js is not installed, download it from https://nodejs.org/.

On Windows, you can also install it with:

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

## Start The Server

FreqDig uses a zero-dependency Node.js static server, which avoids browser restrictions that can happen when opening HTML files directly.

### Windows: Double Click

Double-click this file in the project root:

```text
start.cmd
```

Default URL:

```text
http://127.0.0.1:8000/index.html
```

### Windows: PowerShell

Run this command in the project root:

```powershell
.\start.ps1
```

Use a custom port:

```powershell
.\start.ps1 -Port 8123
```

### macOS / Linux: Shell

Grant execute permission the first time:

```bash
chmod +x ./start.sh
```

Start on the default port `8000`:

```bash
./start.sh
```

Use a custom port:

```bash
./start.sh 8123
```

### Cross Platform: npm

```bash
npm start
```

You can also run the Node.js server directly:

```bash
node scripts/static-server.mjs 8000 --open
```

## Stop The Server

Press this in the terminal window running the server:

```text
Ctrl+C
```

On Windows, if the terminal asks whether to terminate the batch job, type `Y` and press Enter.

## Port Already In Use

If port `8000` is already in use, start the server with another port.

Windows:

```powershell
.\start.ps1 -Port 8123
```

macOS / Linux:

```bash
./start.sh 8123
```

Then open the matching URL:

```text
http://127.0.0.1:8123/index.html
```

</details>
