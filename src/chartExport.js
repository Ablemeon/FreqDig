/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

export function getExportPngDataUrl({
  canvas,
  transparent,
  state,
  chartView,
  getCanvasDpr,
  getDeviationSummaryItems,
  frequencyBands,
  bandIndicatorHeight,
  isFrequencyBandActive
}) {
  const shouldDrawBandIndicator = state.showBandIndicator && chartView;
  if (!state.exportDeviationSummary && !shouldDrawBandIndicator) return canvas.toDataURL("image/png");

  const dpr = getCanvasDpr(canvas.getBoundingClientRect());
  const summaryHeight = state.exportDeviationSummary ? 116 : 0;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height + Math.round(summaryHeight * dpr);
  const exportCtx = exportCanvas.getContext("2d");

  if (!transparent) {
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  exportCtx.drawImage(canvas, 0, 0);
  exportCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBandIndicatorLabelsCanvas(exportCtx, {
    state,
    chartView,
    frequencyBands,
    bandIndicatorHeight,
    isFrequencyBandActive
  });
  if (state.exportDeviationSummary) {
    drawExportSummaryCanvas(exportCtx, canvas.width / dpr, canvas.height / dpr, summaryHeight, transparent, getDeviationSummaryItems);
  }
  exportCtx.setTransform(1, 0, 0, 1, 0, 0);
  return exportCanvas.toDataURL("image/png");
}

export function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function svgPath(pathData, stroke, strokeWidth, dash = [], opacity = 1) {
  const dashAttr = dash?.length ? ` stroke-dasharray="${dash.map(svgNumber).join(" ")}"` : "";
  const opacityAttr = opacity < 1 ? ` opacity="${svgNumber(opacity)}"` : "";
  return `<path d="${pathData}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="${svgNumber(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"${dashAttr}${opacityAttr}/>`;
}

export function svgLine(x1, y1, x2, y2, stroke, strokeWidth, dash = []) {
  const dashAttr = dash?.length ? ` stroke-dasharray="${dash.map(svgNumber).join(" ")}"` : "";
  return `<line x1="${svgNumber(x1)}" y1="${svgNumber(y1)}" x2="${svgNumber(x2)}" y2="${svgNumber(y2)}" stroke="${escapeHtml(stroke)}" stroke-width="${svgNumber(strokeWidth)}"${dashAttr}/>`;
}

export function svgText(text, x, y, options = {}) {
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const transform = options.transform ? ` transform="${options.transform}"` : "";
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  return `<text x="${svgNumber(x)}" y="${svgNumber(y)}" fill="${escapeHtml(options.fill || "#1f2933")}" font-family="Arial, sans-serif" font-size="${svgNumber(options.size || 12)}"${anchor}${transform}${weight}>${escapeHtml(text)}</text>`;
}

export function svgNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function drawBandIndicatorLabelsCanvas(targetCtx, {
  state,
  chartView,
  frequencyBands,
  bandIndicatorHeight,
  isFrequencyBandActive
}) {
  if (!state.showBandIndicator || !chartView) return;

  const { x, pad, plotW, plotH, minFreq, maxFreq } = chartView;
  const top = pad.top + plotH;

  targetCtx.save();
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";

  for (const band of frequencyBands) {
    const start = Math.max(band.min, minFreq);
    const end = Math.min(band.max, maxFreq);
    if (end <= start) continue;

    const left = clamp(x(start), pad.left, pad.left + plotW);
    const right = clamp(x(end), pad.left, pad.left + plotW);
    const widthPx = right - left;
    if (widthPx < 18) continue;

    const isActive = isFrequencyBandActive(band.id);
    targetCtx.fillStyle = isActive ? "rgba(232, 245, 249, 0.96)" : "rgba(255, 255, 255, 0.88)";
    targetCtx.strokeStyle = isActive ? "rgba(29, 111, 145, 0.42)" : "rgba(31, 41, 51, 0.16)";
    targetCtx.lineWidth = 1;
    roundedRect(targetCtx, left, top, widthPx, bandIndicatorHeight, 5);
    targetCtx.fill();
    targetCtx.stroke();

    targetCtx.fillStyle = isActive ? "#1d6f91" : "#334155";
    targetCtx.font = `${isActive ? "700 " : ""}11px Inter, 'Segoe UI', Arial, sans-serif`;
    targetCtx.fillText(band.label, left + widthPx / 2, top + 14);
  }

  targetCtx.restore();
}

function drawExportSummaryCanvas(targetCtx, width, y, height, transparent, getDeviationSummaryItems) {
  const items = getDeviationSummaryItems();
  const gap = 10;
  const padX = 18;
  const top = y + 10;
  const primaryItems = items.slice(0, 2);
  const bandItems = items.slice(2);
  const primaryCardW = (width - padX * 2 - gap) / 2;
  const bandCardW = Math.max(86, (width - padX * 2 - gap * (bandItems.length - 1)) / bandItems.length);

  targetCtx.save();
  targetCtx.fillStyle = transparent ? "rgba(247, 251, 252, 0.94)" : "#f7fbfc";
  targetCtx.fillRect(0, y, width, height);
  targetCtx.strokeStyle = "#d7e0e6";
  targetCtx.beginPath();
  targetCtx.moveTo(0, y + 0.5);
  targetCtx.lineTo(width, y + 0.5);
  targetCtx.stroke();

  targetCtx.font = "700 12px Inter, 'Segoe UI', Arial, sans-serif";
  targetCtx.fillStyle = "#203542";
  targetCtx.textBaseline = "middle";
  targetCtx.fillText("偏差概要", padX, y + 21);

  primaryItems.forEach((item, index) => {
    drawExportSummaryCardCanvas(targetCtx, item, padX + index * (primaryCardW + gap), top + 18, primaryCardW);
  });
  bandItems.forEach((item, index) => {
    drawExportSummaryCardCanvas(targetCtx, item, padX + index * (bandCardW + gap), top + 58, bandCardW);
  });
  targetCtx.restore();
}

function drawExportSummaryCardCanvas(targetCtx, item, x, y, width) {
  targetCtx.fillStyle = "#ffffff";
  targetCtx.strokeStyle = "#d7e0e6";
  roundedRect(targetCtx, x, y, width, 34, 6);
  targetCtx.fill();
  targetCtx.stroke();
  targetCtx.fillStyle = "#657484";
  targetCtx.font = "10px Inter, 'Segoe UI', Arial, sans-serif";
  targetCtx.fillText(item.label, x + 10, y + 12);
  targetCtx.fillStyle = "#14212b";
  targetCtx.font = "700 12px Inter, 'Segoe UI', Arial, sans-serif";
  targetCtx.fillText(item.value, x + 10, y + 27);
}

function roundedRect(targetCtx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  targetCtx.beginPath();
  targetCtx.moveTo(x + r, y);
  targetCtx.lineTo(x + width - r, y);
  targetCtx.quadraticCurveTo(x + width, y, x + width, y + r);
  targetCtx.lineTo(x + width, y + height - r);
  targetCtx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  targetCtx.lineTo(x + r, y + height);
  targetCtx.quadraticCurveTo(x, y + height, x, y + height - r);
  targetCtx.lineTo(x, y + r);
  targetCtx.quadraticCurveTo(x, y, x + r, y);
  targetCtx.closePath();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
