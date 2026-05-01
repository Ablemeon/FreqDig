/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * Group delay is derived from the slope of unwrapped phase vs frequency.
 * app.js uses this module for both chart series and the summary cards.
 */

export function calculateGroupDelay(data) {
  // delay = -d(phi) / d(omega); central differences reduce local point noise.
  const phaseData = unwrapPhaseData(data);
  if (phaseData.length < 3) return [];

  const result = [];
  for (let index = 1; index < phaseData.length - 1; index++) {
    const previous = phaseData[index - 1];
    const next = phaseData[index + 1];
    const deltaFrequency = next.frequency - previous.frequency;
    if (!Number.isFinite(deltaFrequency) || deltaFrequency <= 0) continue;

    const deltaPhaseRadians = (next.rawPhase - previous.rawPhase) * Math.PI / 180;
    const delayMs = -(deltaPhaseRadians / (2 * Math.PI * deltaFrequency)) * 1000;
    if (Number.isFinite(delayMs)) {
      result.push({
        frequency: phaseData[index].frequency,
        level: delayMs
      });
    }
  }

  return result;
}

export function makeGroupDelaySeries(curves, options = {}) {
  return curves
    .filter((curve) => curve?.visible && curve.hasPhase)
    .map((curve) => {
      const data = calculateGroupDelay(options.getData ? options.getData(curve) : curve.data);
      return data.length ? { ...curve, data, phaseSeries: [] } : null;
    })
    .filter(Boolean);
}

export function getGroupDelaySummaryItems(series, range) {
  const values = series.flatMap((curve) => curve.data.filter((point) => point.frequency >= range.minFreq && point.frequency <= range.maxFreq));
  if (!values.length) {
    return [
      { label: "平均群延迟", value: "-" },
      { label: "最大群延迟", value: "-" },
      { label: "最低群延迟", value: "-" },
      { label: "数据来源", value: "需要相位" },
      { label: "曲线数量", value: "0" },
      { label: "显示范围", value: "-" },
      { label: "计算方式", value: "相位斜率" }
    ];
  }

  const delays = values.map((point) => point.level);
  const average = delays.reduce((sum, value) => sum + value, 0) / delays.length;
  const max = Math.max(...delays);
  const min = Math.min(...delays);

  return [
    { label: "平均群延迟", value: `${average.toFixed(2)} ms` },
    { label: "最大群延迟", value: `${max.toFixed(2)} ms` },
    { label: "最低群延迟", value: `${min.toFixed(2)} ms` },
    { label: "采样点", value: String(values.length) },
    { label: "曲线数量", value: String(series.length) },
    { label: "显示范围", value: `${Math.round(range.minFreq)}-${Math.round(range.maxFreq)} Hz` },
    { label: "计算方式", value: "相位斜率" }
  ];
}

function unwrapPhaseData(data) {
  // Keep phase continuous before differentiating; wrapped +/-180 jumps create false spikes.
  let previousRawPhase = null;
  return data
    .filter((point) => Number.isFinite(point.frequency) && point.frequency > 0 && Number.isFinite(point.phase))
    .map((point) => {
      let rawPhase = point.phase;
      if (previousRawPhase !== null) {
        while (rawPhase - previousRawPhase > 180) rawPhase -= 360;
        while (rawPhase - previousRawPhase < -180) rawPhase += 360;
      }
      previousRawPhase = rawPhase;
      return {
        frequency: point.frequency,
        rawPhase
      };
    });
}
