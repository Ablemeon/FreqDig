/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

export const DISTORTION_SERIES = [
  { key: "thd", label: "THD", color: "#d55e00", width: 2.6 },
  { key: "h1", label: "H1", color: "#111827", width: 1.3, visible: false },
  { key: "noise", label: "Noise", color: "#6b7280", width: 1.5 },
  { key: "h2", label: "H2", color: "#0072b2", width: 1.8 },
  { key: "h3", label: "H3", color: "#cc79a7", width: 1.8 },
  { key: "h4", label: "H4", color: "#8b5cf6", width: 1.4, visible: false },
  { key: "h5", label: "H5", color: "#009e73", width: 1.6, visible: false },
  { key: "h6", label: "H6", color: "#14b8a6", width: 1.4, visible: false },
  { key: "h7", label: "H7", color: "#e69f00", width: 1.5, visible: false },
  { key: "h8", label: "H8", color: "#64748b", width: 1.3, visible: false },
  { key: "h9", label: "H9", color: "#ef4444", width: 1.3, visible: false }
];

export const DISTORTION_GROUP_STYLES = [
  { dash: [], label: "实线" },
  { dash: [8, 5], label: "虚线" },
  { dash: [2, 4], label: "点线" },
  { dash: [10, 4, 2, 4], label: "点划线" },
  { dash: [14, 5, 4, 5], label: "长短线" },
  { dash: [1, 3], label: "细点线" }
];

export const DISTORTION_ANALYSIS_RANGES = [
  { id: "full", label: "全频段 20-2w", min: 20, max: 20000 },
  { id: "trusted", label: "可信频段 100-2k", min: 100, max: 2000 },
  { id: "trusted-wide", label: "可信宽频 100-10k", min: 100, max: 10000 },
  { id: "sub-low", label: "超低频 20-60", min: 20, max: 60 },
  { id: "low", label: "低频 60-300", min: 60, max: 300 },
  { id: "ultra-high", label: "超高频 10k-20k", min: 10000, max: 20000 }
];

export function getDistortionAnalysisRange(rangeId) {
  return DISTORTION_ANALYSIS_RANGES.find((range) => range.id === rangeId) || DISTORTION_ANALYSIS_RANGES[0];
}

export function getEnabledDistortionMeasurements(measurements) {
  return measurements.filter((measurement) => measurement.enabled !== false);
}

export function getDistortionGroupStyle(measurements, measurement) {
  const index = Math.max(0, measurements.findIndex((item) => item.id === measurement?.id));
  return DISTORTION_GROUP_STYLES[index % DISTORTION_GROUP_STYLES.length];
}

export function distortionGroupPreviewClass(measurements, measurement) {
  const index = Math.max(0, measurements.findIndex((item) => item.id === measurement?.id));
  return `distortion-group-select--${index % DISTORTION_GROUP_STYLES.length}`;
}

export function getVisibleDistortionMeasurement(measurements) {
  return getEnabledDistortionMeasurements(measurements)[0] || measurements[0] || null;
}

export function getDistortionSeriesSetting(key, measurement, fallbackMeasurement, normalizeColor) {
  const definition = DISTORTION_SERIES.find((series) => series.key === key);
  const setting = (measurement || fallbackMeasurement)?.seriesSettings?.[key] || {};
  return {
    visible: setting.visible !== undefined ? setting.visible !== false : definition?.visible !== false,
    color: normalizeColor(setting.color) || definition?.color || "#0072b2"
  };
}

export function distortionValue(point, key) {
  if (key === "thd") return point.thd;
  if (key === "noise") return point.noise;
  if (key === "h1") return 100;
  return point.harmonics?.[key] ?? null;
}

export function isDistortionPercentMode(axisMode) {
  return axisMode === "percent";
}

export function distortionAxisUnit(axisMode) {
  return axisMode === "dbr" ? "dBr" : "%";
}

export function distortionDisplayValue(point, key, axisMode) {
  if (isDistortionPercentMode(axisMode)) return distortionValue(point, key);
  if (key === "h1") return 0;
  const percent = distortionValue(point, key);
  return Number.isFinite(percent) && percent > 0 ? 20 * Math.log10(percent / 100) : null;
}

export function distortionAxisFixedMaxValue(axisMode) {
  return isDistortionPercentMode(axisMode) ? 100 : 0;
}

export function getDistortionRange({ measurements, minFreq, maxFreq, axisMode, axisMin, getSeriesSetting }) {
  let minValue = Infinity;
  let maxValue = isDistortionPercentMode(axisMode) ? 0 : -Infinity;

  for (const measurement of measurements) {
    for (const point of measurement.data) {
      if (point.frequency < minFreq || point.frequency > maxFreq) continue;
      for (const series of DISTORTION_SERIES) {
        if (!getSeriesSetting(series.key, measurement).visible) continue;
        const value = distortionDisplayValue(point, series.key, axisMode);
        if (!Number.isFinite(value) || (isDistortionPercentMode(axisMode) && value <= 0)) continue;
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    }
  }

  if (isDistortionPercentMode(axisMode) && (!Number.isFinite(minValue) || maxValue <= 0)) {
    minValue = 0.001;
    maxValue = 10;
  }

  if (!isDistortionPercentMode(axisMode) && (!Number.isFinite(minValue) || !Number.isFinite(maxValue))) {
    minValue = -100;
    maxValue = 120;
  }

  let autoMinValue = isDistortionPercentMode(axisMode)
    ? 10 ** Math.floor(Math.log10(minValue * 0.75))
    : Math.floor((minValue - Math.max(6, (maxValue - minValue) * 0.08)) / 10) * 10;
  const autoMaxValue = distortionAxisFixedMaxValue(axisMode);
  if (autoMaxValue <= autoMinValue) {
    autoMinValue = isDistortionPercentMode(axisMode) ? Math.max(0.000001, autoMaxValue / 1000) : autoMaxValue - 80;
  }
  const manualMinValue = axisMin !== null && Number.isFinite(Number(axisMin)) ? Number(axisMin) : autoMinValue;
  const manualMaxValue = autoMaxValue;

  if (manualMaxValue > manualMinValue) {
    return { minValue: manualMinValue, maxValue: manualMaxValue, autoMinValue, autoMaxValue };
  }

  return { minValue: autoMinValue, maxValue: autoMaxValue, autoMinValue, autoMaxValue };
}

export function buildDistortionChartSeries({ measurements, minFreq, maxFreq, axisMode, getSeriesSetting, getGroupStyle }) {
  const chartSeries = [];

  for (const measurement of measurements) {
    const groupStyle = getGroupStyle(measurement);
    const measurementName = measurement.name || measurement.fileName || "失真数据";

    for (const series of DISTORTION_SERIES) {
      const setting = getSeriesSetting(series.key, measurement);
      if (!setting.visible) continue;

      const data = measurement.data
        .filter((point) => point.frequency >= minFreq && point.frequency <= maxFreq)
        .map((point) => ({
          frequency: point.frequency,
          level: distortionDisplayValue(point, series.key, axisMode)
        }))
        .filter((point) => Number.isFinite(point.level) && (!isDistortionPercentMode(axisMode) || point.level > 0));

      if (!data.length) continue;

      chartSeries.push({
        id: `${measurement.id}:${series.key}`,
        name: `${measurementName} - ${series.label}`,
        shortName: series.label,
        data,
        color: setting.color,
        width: series.width,
        dash: groupStyle.dash,
        visible: true,
        phaseSeries: [],
        isDistortion: true,
        measurementId: measurement.id,
        distortionKey: series.key
      });
    }
  }

  return chartSeries;
}

export function getDistortionTicks(minValue, maxValue, axisMode, niceDbStep) {
  if (!isDistortionPercentMode(axisMode)) {
    const step = niceDbStep((maxValue - minValue) / 8);
    const ticks = [];
    for (let value = Math.ceil(minValue / step) * step; value <= maxValue; value += step) {
      ticks.push(value);
    }
    return ticks;
  }

  return getPercentAxisTicks(minValue, maxValue);
}

export function getAuxiliaryPercentTicksFromDbr(minDbr, maxDbr) {
  const minPercent = 100 * (10 ** (minDbr / 20));
  const maxPercent = 100 * (10 ** (maxDbr / 20));
  return getPercentAxisTicks(minPercent, maxPercent);
}

export function getPercentAxisTicks(minValue, maxValue) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= 0) return [];
  const min = Math.max(0.000001, minValue);
  const ticks = [];
  const multipliers = [1, 2, 5];
  const startExp = Math.floor(Math.log10(min));
  const endExp = Math.ceil(Math.log10(maxValue));

  for (let exp = startExp; exp <= endExp; exp++) {
    for (const multiplier of multipliers) {
      const value = multiplier * (10 ** exp);
      if (value >= min && value <= maxValue) ticks.push(value);
    }
  }

  return ticks;
}

export function formatAuxiliaryPercentTick(value) {
  if (value >= 1) return `${Number(value.toFixed(value >= 10 ? 0 : 1))}%`;
  if (value >= 0.1) return `${Number(value.toFixed(2))}%`;
  if (value >= 0.01) return `${Number(value.toFixed(3))}%`;
  return `${Number(value.toPrecision(2))}%`;
}

export function formatPercentTick(value, axisMode) {
  if (!isDistortionPercentMode(axisMode)) {
    return `${Number(value.toFixed(0))} ${distortionAxisUnit(axisMode)}`;
  }
  if (value >= 1) return `${Number(value.toFixed(value >= 10 ? 0 : 1))}%`;
  if (value >= 0.1) return `${Number(value.toFixed(2))}%`;
  return `${Number(value.toFixed(3))}%`;
}

export function interpolateDistortionValue(data, frequency, key) {
  if (!data.length || frequency < data[0].frequency || frequency > data[data.length - 1].frequency) return null;
  if (data.length === 1) return data[0].frequency === frequency ? distortionValue(data[0], key) : null;

  let lo = 0;
  let hi = data.length - 1;

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (data[mid].frequency <= frequency) lo = mid;
    else hi = mid;
  }

  const a = data[lo];
  const b = data[hi];
  const av = distortionValue(a, key);
  const bv = distortionValue(b, key);
  if (!Number.isFinite(av) || !Number.isFinite(bv)) return null;
  if (a.frequency === frequency) return av;
  if (b.frequency === frequency) return bv;

  const t = (Math.log10(frequency) - Math.log10(a.frequency)) / (Math.log10(b.frequency) - Math.log10(a.frequency));
  return av + (bv - av) * t;
}

export function getDominantHarmonic(point) {
  if (!point?.harmonics) return null;
  return Object.entries(point.harmonics)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])[0] || null;
}

export function formatPercentValue(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1) return `${value.toFixed(2)}%`;
  if (value >= 0.1) return `${value.toFixed(3)}%`;
  return `${value.toFixed(4)}%`;
}

function getDistortionMeasurementStats(measurement, range) {
  const pointsInRange = measurement.data.filter((point) => point.frequency >= range.min && point.frequency <= range.max);
  const points = pointsInRange.length ? pointsInRange : measurement.data;
  let thdSum = 0;
  let thdCount = 0;
  let noiseSum = 0;
  let noiseCount = 0;
  let peakPoint = null;

  for (const point of points) {
    if (Number.isFinite(point.thd)) {
      thdSum += point.thd;
      thdCount++;
      if (!peakPoint || point.thd > peakPoint.thd) peakPoint = point;
    }
    if (Number.isFinite(point.noise)) {
      noiseSum += point.noise;
      noiseCount++;
    }
  }

  return {
    measurement,
    name: measurement.name || measurement.fileName || "失真数据",
    avgThd: thdCount ? thdSum / thdCount : null,
    avgNoise: noiseCount ? noiseSum / noiseCount : null,
    peakThd: peakPoint?.thd ?? null,
    peakFrequency: peakPoint?.frequency ?? null,
    thdAt1k: interpolateDistortionValue(measurement.data, 1000, "thd")
  };
}

function formatGroupStat(stat, key) {
  if (!stat || !Number.isFinite(stat[key])) return "-";
  return `${stat.name} / ${formatPercentValue(stat[key])}`;
}

function getDistortionComparisonSummaryItems(measurements, range, formatFrequency) {
  const stats = measurements
    .map((measurement) => getDistortionMeasurementStats(measurement, range))
    .filter((stat) => Number.isFinite(stat.avgThd) || Number.isFinite(stat.peakThd) || Number.isFinite(stat.avgNoise));

  if (!stats.length) {
    return [
      { label: "启用组数", value: `${measurements.length} 组` },
      { label: "最低平均 THD", value: "-" },
      { label: "最高平均 THD", value: "-" },
      { label: "最大峰值 THD", value: "-" },
      { label: "最低平均噪声", value: "-" },
      { label: "1 kHz 最低 THD", value: "-" },
      { label: "平均 THD 差距", value: "-" }
    ];
  }

  const byAvgThd = stats.filter((stat) => Number.isFinite(stat.avgThd)).sort((a, b) => a.avgThd - b.avgThd);
  const byPeak = stats.filter((stat) => Number.isFinite(stat.peakThd)).sort((a, b) => b.peakThd - a.peakThd);
  const byNoise = stats.filter((stat) => Number.isFinite(stat.avgNoise)).sort((a, b) => a.avgNoise - b.avgNoise);
  const by1k = stats.filter((stat) => Number.isFinite(stat.thdAt1k)).sort((a, b) => a.thdAt1k - b.thdAt1k);
  const avgGap = byAvgThd.length > 1 ? byAvgThd.at(-1).avgThd - byAvgThd[0].avgThd : null;
  const peak = byPeak[0];

  return [
    { label: "启用组数", value: `${measurements.length} 组` },
    { label: "最低平均 THD", value: formatGroupStat(byAvgThd[0], "avgThd") },
    { label: "最高平均 THD", value: formatGroupStat(byAvgThd.at(-1), "avgThd") },
    { label: "最大峰值 THD", value: peak ? `${peak.name} / ${formatPercentValue(peak.peakThd)} @ ${formatFrequency(peak.peakFrequency)}` : "-" },
    { label: "最低平均噪声", value: formatGroupStat(byNoise[0], "avgNoise") },
    { label: "1 kHz 最低 THD", value: formatGroupStat(by1k[0], "thdAt1k") },
    { label: "平均 THD 差距", value: formatPercentValue(avgGap) }
  ];
}

export function getDistortionSummaryItems({ measurements, range, frequencyBands, formatFrequency }) {
  if (!measurements.some((measurement) => measurement.data?.length)) {
    return [
      { label: "平均 THD", value: "-" },
      { label: "最大 THD", value: "-" },
      { label: "主导谐波", value: "-" },
      { label: "峰值主因", value: "-" },
      { label: "平均噪声", value: "-" },
      { label: "最差频段", value: "-" },
      { label: "1 kHz THD", value: "-" }
    ];
  }
  if (measurements.length > 1) return getDistortionComparisonSummaryItems(measurements, range, formatFrequency);

  const harmonicTotals = new Map();
  const bands = frequencyBands.map((band) => ({ ...band, sum: 0, count: 0 }));
  let thdSum = 0;
  let noiseSum = 0;
  let thdCount = 0;
  let noiseCount = 0;
  let peakPoint = null;
  let peakMeasurement = null;
  let thdAt1kSum = 0;
  let thdAt1kCount = 0;

  for (const measurement of measurements) {
    const visible = measurement.data.filter((point) => point.frequency >= range.min && point.frequency <= range.max);
    const points = visible.length ? visible : measurement.data;
    const thdAt1k = interpolateDistortionValue(measurement.data, 1000, "thd");
    if (Number.isFinite(thdAt1k)) {
      thdAt1kSum += thdAt1k;
      thdAt1kCount++;
    }

    for (const point of points) {
      if (Number.isFinite(point.thd)) {
        thdSum += point.thd;
        thdCount++;
        if (!peakPoint || point.thd > peakPoint.thd) {
          peakPoint = point;
          peakMeasurement = measurement;
        }
      }

      if (Number.isFinite(point.noise)) {
        noiseSum += point.noise;
        noiseCount++;
      }

      for (const [key, value] of Object.entries(point.harmonics || {})) {
        if (!Number.isFinite(value)) continue;
        const current = harmonicTotals.get(key) || { sum: 0, count: 0 };
        current.sum += value;
        current.count++;
        harmonicTotals.set(key, current);
      }

      for (const band of bands) {
        if (point.frequency >= band.min && point.frequency <= band.max && Number.isFinite(point.thd)) {
          band.sum += point.thd;
          band.count++;
        }
      }
    }
  }

  const dominant = [...harmonicTotals.entries()]
    .map(([key, value]) => ({ key, average: value.count ? value.sum / value.count : 0 }))
    .sort((a, b) => b.average - a.average)[0];
  const peakDominant = getDominantHarmonic(peakPoint);
  const worstBand = bands
    .filter((band) => band.count)
    .map((band) => ({ ...band, average: band.sum / band.count }))
    .sort((a, b) => b.average - a.average)[0];

  return [
    { label: "平均 THD", value: formatPercentValue(thdCount ? thdSum / thdCount : null) },
    { label: "最大 THD", value: peakPoint ? `${formatPercentValue(peakPoint.thd)} @ ${formatFrequency(peakPoint.frequency)}${peakMeasurement ? ` / ${peakMeasurement.name || peakMeasurement.fileName}` : ""}` : "-" },
    { label: "主导谐波", value: dominant ? `${dominant.key.toUpperCase()} / ${formatPercentValue(dominant.average)}` : "-" },
    { label: "峰值主因", value: peakDominant ? `${peakDominant[0].toUpperCase()} / ${formatPercentValue(peakDominant[1])}` : "-" },
    { label: "平均噪声", value: formatPercentValue(noiseCount ? noiseSum / noiseCount : null) },
    { label: "最差频段", value: worstBand ? `${worstBand.label} / ${formatPercentValue(worstBand.average)}` : "-" },
    { label: "1 kHz THD", value: formatPercentValue(thdAt1kCount ? thdAt1kSum / thdAt1kCount : null) }
  ];
}
