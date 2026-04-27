# FreqDig

[中文](#中文) | [English](#english)

FreqDig is a local frequency-response analysis tool for importing, comparing, visualizing, and exporting audio measurement curves.

Current version: `0.0.1`

<a id="中文"></a>
<details open>
<summary><strong>中文说明</strong></summary>

## 简介

FreqDig 是一个本地运行的轻量级频响曲线分析工具，用于导入、查看、比较和导出音频测量曲线。它适合耳机、扬声器、测量麦克风、目标曲线和多组频响数据的快速对比分析。

项目使用原生 HTML/CSS/JavaScript 实现，不依赖前端框架。页面通过本地 Node.js 静态服务器运行，避免直接打开 HTML 时遇到浏览器模块加载限制。

## 功能

- 导入 CSV/TXT/FRD/DAT 文本测量数据
- 支持原始曲线、相对基准差异、相对目标偏差视图
- 支持目标曲线导入与可见性控制
- 支持曲线平滑、偏移、归一化和对齐
- 支持相位、最小相位和相位裕量显示
- 支持频带指示器和五段式偏差摘要
- 支持水印、测量器型号和隐藏设置持久化
- 支持 PNG、透明 PNG 和 SVG 导出
- 支持导出图表时附加偏差概要

## 数据格式

支持文本数据行：

```text
frequency level
frequency level phase
```

也支持常见表头，例如：

```text
frequency, level_db, phase
```

暂不直接解析 REW `.mdat` 二进制文件。请先在 REW 中导出为文本格式后再导入。

## 运行环境

需要安装 Node.js，建议使用当前 LTS 版本。

检查 Node.js：

```bash
node -v
```

如果没有安装，可以从 https://nodejs.org/ 下载。

Windows 也可以使用：

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

## 启动服务

### Windows：双击启动

在项目根目录双击：

```text
start.cmd
```

默认访问：

```text
http://127.0.0.1:8000/index.html
```

### Windows：PowerShell

```powershell
.\start.ps1
```

指定端口：

```powershell
.\start.ps1 -Port 8123
```

### macOS / Linux：Shell

首次使用时给脚本执行权限：

```bash
chmod +x ./start.sh
```

启动：

```bash
./start.sh
```

指定端口：

```bash
./start.sh 8123
```

### 通用：npm

```bash
npm start
```

也可以直接运行：

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

## 许可

本项目使用 MIT 协议发布。使用、修改和分发时请保留版权声明。

</details>

<a id="english"></a>
<details>
<summary><strong>English</strong></summary>

## Overview

FreqDig is a lightweight local frequency-response analysis tool for importing, viewing, comparing, and exporting audio measurement curves. It is useful for quick comparison work involving headphones, speakers, measurement microphones, target curves, and multiple frequency-response datasets.

The project is built with native HTML/CSS/JavaScript and does not depend on a frontend framework. It runs through a local Node.js static server to avoid browser restrictions that can occur when opening HTML files directly.

## Features

- Import CSV/TXT/FRD/DAT text measurement data
- View raw curves, reference-relative differences, and target-relative deviations
- Import target curves and toggle target visibility
- Apply smoothing, offset, normalization, and curve alignment
- Display phase, minimum phase, and phase margin traces
- Show frequency-band indicators and five-band deviation summaries
- Configure watermark text, measurement model text, and hidden settings with persistence
- Export PNG, transparent PNG, and SVG charts
- Optionally append a deviation summary to exported charts

## Data Format

Supported text rows:

```text
frequency level
frequency level phase
```

Common headers are also supported, for example:

```text
frequency, level_db, phase
```

REW `.mdat` binary files are not parsed directly. Export measurements from REW as text files before importing them into FreqDig.

## Requirements

Install Node.js first. The current LTS version is recommended.

Check Node.js:

```bash
node -v
```

If Node.js is not installed, download it from https://nodejs.org/.

On Windows, you can also install it with:

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

## Start The Server

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

Start:

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

## License

This project is released under the MIT License. Keep the copyright notice when using, modifying, or distributing it.

</details>
