/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

export function parseRewImpulseResponse(text) {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim());
  const dataStartIndex = lines.findIndex((line) => /^\*\s*Data start/i.test(line));
  if (dataStartIndex < 0 || !/Impulse Response data saved by REW/i.test(text.slice(0, 300))) return null;

  const metadataLines = lines.slice(0, dataStartIndex);
  const sampleInterval = readRewMetadataNumber(metadataLines, "Sample interval");
  const startTime = readRewMetadataNumber(metadataLines, "Start time") ?? 0;
  const peakIndex = readRewMetadataNumber(metadataLines, "Peak index");
  const responseLength = readRewMetadataNumber(metadataLines, "Response length");
  const dataOffsetDb = readRewMetadataNumber(metadataLines, "Data offset");
  const measurementLine = metadataLines.find((line) => /^\*\s*Measurement:/i.test(line));
  const measurementName = measurementLine
    ? measurementLine.replace(/^\*\s*Measurement:\s*/i, "").trim()
    : "";

  if (!Number.isFinite(sampleInterval) || sampleInterval <= 0) return null;

  const samples = [];
  for (const line of lines.slice(dataStartIndex + 1)) {
    if (!line || line.startsWith("*")) continue;
    const value = Number(line.split(/\s+/)[0]);
    if (Number.isFinite(value)) samples.push(value);
  }

  if (samples.length < 8) return null;

  return {
    type: "rew-impulse-response",
    name: measurementName,
    sampleInterval,
    sampleRate: 1 / sampleInterval,
    startTime,
    peakIndex: Number.isFinite(peakIndex) ? Math.round(peakIndex) : findPeakIndex(samples),
    responseLength: Number.isFinite(responseLength) ? Math.round(responseLength) : samples.length,
    dataOffsetDb: Number.isFinite(dataOffsetDb) ? dataOffsetDb : 0,
    samples
  };
}

export function buildImpulseDisplayData(impulse, options = {}) {
  const beforeMs = Number.isFinite(options.beforeMs) ? options.beforeMs : 5;
  const afterMs = Number.isFinite(options.afterMs) ? options.afterMs : 120;
  const maxPoints = Number.isFinite(options.maxPoints) ? options.maxPoints : 2400;
  const startIndex = Math.max(0, Math.floor(impulse.peakIndex - (beforeMs / 1000) / impulse.sampleInterval));
  const endIndex = Math.min(impulse.samples.length - 1, Math.ceil(impulse.peakIndex + (afterMs / 1000) / impulse.sampleInterval));
  const stride = Math.max(1, Math.ceil((endIndex - startIndex + 1) / maxPoints));
  const data = [];

  for (let index = startIndex; index <= endIndex; index += stride) {
    data.push({
      timeMs: ((index - impulse.peakIndex) * impulse.sampleInterval) * 1000,
      value: impulse.samples[index]
    });
  }

  return data;
}

export function getImpulseSummaryItems(impulses) {
  const visible = impulses.filter((impulse) => impulse.visible !== false);
  if (!visible.length) {
    return [
      { label: "IR 数据", value: "-" },
      { label: "采样率", value: "-" },
      { label: "峰值位置", value: "-" },
      { label: "响应长度", value: "-" },
      { label: "显示窗口", value: "-5 至 120 ms" },
      { label: "数据来源", value: "REW IR" },
      { label: "分析状态", value: "等待导入" }
    ];
  }

  const first = visible[0];
  return [
    { label: "IR 数据", value: String(visible.length) },
    { label: "采样率", value: `${Math.round(first.sampleRate).toLocaleString()} Hz` },
    { label: "峰值位置", value: `${first.peakIndex.toLocaleString()} samples` },
    { label: "响应长度", value: `${first.samples.length.toLocaleString()} samples` },
    { label: "显示窗口", value: "-5 至 120 ms" },
    { label: "数据来源", value: "REW IR" },
    { label: "分析状态", value: "已解析" }
  ];
}

function readRewMetadataNumber(lines, label) {
  const matcher = new RegExp(`^([^/]+)//\\s*${label}`, "i");
  const line = lines.find((item) => matcher.test(item));
  if (!line) return null;
  const value = Number(line.replace(/\/\/.*$/, "").trim());
  return Number.isFinite(value) ? value : null;
}

function findPeakIndex(samples) {
  let peakIndex = 0;
  let peakValue = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index]);
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
  }
  return peakIndex;
}
