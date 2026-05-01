# FreqDig

[中文](#中文) | [English](#english)

FreqDig is a local audio measurement analysis tool for frequency response, distortion, impulse response, group delay, and waterfall visualization.

Current version: `0.0.1`

Changelog: [English](./CHANGELOG.md) | [中文](./CHANGELOG.zh-CN.md)

<a id="中文"></a>
## 中文

### 简介

FreqDig 是一个本地运行的音频测量分析工具，用于导入、查看、比较和导出测量曲线。它适合耳机、扬声器、测量麦克风、目标曲线、REW 导出数据等快速分析场景。

项目使用原生 HTML/CSS/JavaScript 实现，不依赖前端框架。建议通过本地 Node.js 静态服务器运行，避免直接打开 HTML 时遇到浏览器模块加载限制。

### 主要功能

- 导入 CSV/TXT/FRD/DAT 频响文本数据，支持 `frequency level` 和可选相位列。
- 频响模式支持原始曲线、参考差异、目标差异、斜率、偏移、归一化、对齐和频段指示。
- 频响曲线层使用 WebGL2 优先渲染，大量曲线和高采样点时更流畅；坐标、文字、tooltip 和导出仍使用稳定的 Canvas/SVG 流程。
- 支持倍频程平滑，并使用对数频率加权平滑以减少窄窗口锯齿。
- 支持 REW THD 文本导入，提供 THD、Noise、H1-H9、百分比/dBr 纵轴和多组失真对比。
- 支持 REW Impulse Response 文本导入，用于 IR 分析和三维瀑布图。
- 支持群延迟分析，由相位斜率计算，可多曲线对比。
- 三维瀑布图使用 WebGL2，支持切片绘制/网格曲面切换、切片数量、动态范围、时间深度、缩放、旋转和平移。
- 支持亮色/暗色主题、独立夜间模式背景、持久化用户设置。
- 支持 PNG、透明 PNG、SVG 导出，可附加分析摘要。

### 数据格式

频响文本行：

```text
frequency level
frequency level phase
```

常见表头也支持，例如：

```text
frequency, level_db, phase
```

REW `.mdat` 二进制文件暂不直接解析。请先在 REW 中导出为文本格式后再导入。

REW THD 文本会自动进入失真模式。REW Impulse Response 文本会进入 IR/瀑布图分析流程。

### 启动

需要先安装 Node.js，建议使用当前 LTS 版本。

```bash
node -v
```

启动本地服务：

```bash
npm start
```

默认访问：

```text
http://127.0.0.1:8000/index.html
```

也可以直接运行：

```bash
node scripts/static-server.mjs 8000 --open
```

Windows 也可以双击项目根目录下的 `start.cmd`，或使用：

```powershell
.\start.ps1
```

### 许可证

本项目使用 MIT 协议发布。使用、修改和分发时请保留版权声明。

<a id="english"></a>
## English

### Overview

FreqDig is a local audio measurement analysis tool for importing, viewing, comparing, and exporting measurement curves. It is useful for headphones, speakers, measurement microphones, target curves, and REW-exported text data.

The project is built with native HTML/CSS/JavaScript and does not depend on a frontend framework. Run it through the local Node.js static server to avoid browser module restrictions that can occur when opening HTML directly.

### Features

- Import CSV/TXT/FRD/DAT frequency-response text data with `frequency level` rows and optional phase columns.
- Frequency-response mode supports raw curves, reference-relative differences, target-relative deviations, tilt, offsets, normalization, alignment, and band indicators.
- Frequency-response curve rendering uses WebGL2 when available for better performance with dense data and many curves; axes, text, tooltips, and exports remain on the stable Canvas/SVG path.
- Octave smoothing uses log-frequency weighted smoothing to reduce narrow-window jagged artifacts.
- Import REW THD text files with THD, Noise, H1-H9, percent/dBr axes, and grouped distortion comparison.
- Import REW Impulse Response text files for IR analysis and 3D waterfall analysis.
- Group delay analysis is calculated from phase slope and supports multiple comparison curves.
- The 3D waterfall view uses WebGL2 and supports slice/grid rendering, slice count, dynamic range, time depth, zoom, rotation, and pan.
- Light/dark themes, standalone night-mode scene, and persisted user settings.
- Export PNG, transparent PNG, and SVG charts with optional analysis summaries.

### Data Format

Supported frequency-response rows:

```text
frequency level
frequency level phase
```

Common headers are also supported, for example:

```text
frequency, level_db, phase
```

REW `.mdat` binary files are not parsed directly. Export measurements from REW as text files before importing them into FreqDig.

REW THD text exports open in distortion mode automatically. REW Impulse Response text exports feed the IR and waterfall analysis modes.

### Start

Install Node.js first. The current LTS version is recommended.

```bash
node -v
```

Start the local server:

```bash
npm start
```

Default URL:

```text
http://127.0.0.1:8000/index.html
```

You can also run the server directly:

```bash
node scripts/static-server.mjs 8000 --open
```

On Windows, you can also double-click `start.cmd` in the project root or run:

```powershell
.\start.ps1
```

### License

This project is released under the MIT License. Keep the copyright notice when using, modifying, or distributing it.
