/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

import {
  clamp,
  dataHasPhase,
  getPhaseSeries,
  interpolate,
  interpolatePhase,
  parseCsv,
  smoothData,
  wrapPhaseDegrees
} from "./src/audioMath.js";
import { cleanupCatAvatarEasterEgg, setupCatAvatarEasterEgg } from "./src/easterEgg.js";
import {
  downloadTextFile,
  getExportPngDataUrl as buildExportPngDataUrl,
  svgLine,
  svgNumber,
  svgPath,
  svgText
} from "./src/chartExport.js";
import { installLiquidGlassFilter } from "./src/liquidGlassFilter.js";
import { MetricAnimationController } from "./src/metricAnimation.js";
import { DEFAULT_USER_SETTINGS, clampProbability, loadUserSettings, normalizeTheme, saveUserSettings } from "./src/userSettings.js";
import { getDemoCurves, getDemoTarget } from "./examples/demoData.js";

installLiquidGlassFilter();

// --- Theme and app state ---
// Default palette used when new curves are imported.
const colors = [
  "#0072b2",
  "#d55e00",
  "#009e73",
  "#cc79a7",
  "#f0e442",
  "#56b4e9",
  "#e69f00",
  "#332288",
  "#88ccee",
  "#44aa99",
  "#117733",
  "#999933",
  "#ddcc77",
  "#cc6677",
  "#882255",
  "#aa4499"
];
const darkModeColors = [
  "#62cfff",
  "#ff9f6e",
  "#65e6b4",
  "#ff9bd6",
  "#fff46a",
  "#8fe7ff",
  "#ffc35a",
  "#a9a4ff",
  "#b8f0ff",
  "#7ee6d8",
  "#7edb96",
  "#d7da72",
  "#ffe28a",
  "#ff9aaa",
  "#e883c8",
  "#f19cff"
];

// Single source of truth for user-visible settings and loaded measurement data.
// Curve objects keep their own cached derived data to avoid recalculating on every redraw.
const state = {
  curves: [], // Imported measurement curves.
  target: null, // Optional target/reference curve.
  mode: "raw", // raw | reference | target.
  referenceId: null, // Curve id used as the baseline in reference mode.
  tiltDbPerOct: 0, // Global tilt applied in dB per octave.
  applyTiltToCurves: true, // Whether imported curves receive the global tilt.
  applyTiltToTarget: false, // Whether the target curve receives the global tilt.
  alignTarget: false, // Whether target is included in normalize/align operations.
  axisMinFreq: 20, // Current visible frequency range, lower bound.
  axisMaxFreq: 20000, // Current visible frequency range, upper bound.
  axisFreqStepOctaves: null,
  axisMinDb: null, // Manual dB axis lower bound; null means auto.
  axisMaxDb: null, // Manual dB axis upper bound; null means auto.
  axisDbStep: null,
  showBandIndicator: false, // Toggles the frequency-band overlay and labels.
  globalSmoothing: false, // Forces every curve to 1/24-octave smoothing while enabled.
  exportDeviationSummary: false,
  watermarkText: DEFAULT_USER_SETTINGS.watermarkText, // Export watermark text.
  measurementModel: DEFAULT_USER_SETTINGS.measurementModel, // Small chart tag edited through the hidden footer settings.
  easterEggTriggerProbability: DEFAULT_USER_SETTINGS.easterEggTriggerProbability,
  easterEggBurstProbability: DEFAULT_USER_SETTINGS.easterEggBurstProbability,
  mineCartAnimationEnabled: DEFAULT_USER_SETTINGS.mineCartAnimationEnabled,
  theme: DEFAULT_USER_SETTINGS.theme
};

// --- DOM references ---
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const curveFiles = document.getElementById("curveFiles");
const targetFile = document.getElementById("targetFile");
const projectFile = document.getElementById("projectFile");
const curveList = document.getElementById("curveList");
const reference = document.getElementById("reference");
const mode = document.getElementById("mode");
const emptyState = document.getElementById("emptyState");
const chartTooltip = document.getElementById("chartTooltip");
const tiltInput = document.getElementById("tiltInput");
const tiltDown = document.getElementById("tiltDown");
const tiltUp = document.getElementById("tiltUp");
const curveTilt = document.getElementById("curveTilt");
const targetTilt = document.getElementById("targetTilt");
const alignTarget = document.getElementById("alignTarget");
const bandIndicator = document.getElementById("bandIndicator");
const spreadCurves = document.getElementById("spreadCurves");
const normalizeCurves = document.getElementById("normalizeCurves");
const alignFrequency = document.getElementById("alignFrequency");
const alignCurves = document.getElementById("alignCurves");
const saveProject = document.getElementById("saveProject");
const mobileMenuToggle = document.getElementById("mobileMenuToggle");
const easterEggToggle = document.getElementById("easterEggToggle");
const appSettingsToggle = document.getElementById("appSettingsToggle");
const appSettingsPanel = document.getElementById("appSettingsPanel");
const appSettingsCancel = document.getElementById("appSettingsCancel");
const themeToggle = document.getElementById("themeToggle");
const watermarkSetting = document.getElementById("watermarkSetting");
const measurementSetting = document.getElementById("measurementSetting");
const easterTriggerSetting = document.getElementById("easterTriggerSetting");
const easterBurstSetting = document.getElementById("easterBurstSetting");
const mineCartAnimationSetting = document.getElementById("mineCartAnimationSetting");
const themeSetting = document.getElementById("themeSetting");
const exportDeviationSummary = document.getElementById("exportDeviationSummary");
const toolbar = document.querySelector(".toolbar");
const xMinSlider = document.getElementById("xMinSlider");
const xMaxSlider = document.getElementById("xMaxSlider");
const yZoomSlider = document.getElementById("yZoomSlider");
const zoomControlsToggle = document.getElementById("zoomControlsToggle");
const resetAxisView = document.getElementById("resetAxisView");
const globalSmoothing = document.getElementById("globalSmoothing");
const canvasWrap = canvas.parentElement;
const bandRangeButtons = document.querySelectorAll("[data-band-range]");
const xZoomMinLabel = document.getElementById("xZoomMinLabel");
const xZoomMaxLabel = document.getElementById("xZoomMaxLabel");
const yZoomMinLabel = document.getElementById("yZoomMinLabel");
const yZoomMaxLabel = document.getElementById("yZoomMaxLabel");
const xZoomTip = document.getElementById("xZoomTip");
const yZoomTip = document.getElementById("yZoomTip");
const xRangeTrack = document.getElementById("xRangeTrack");
const bandIndicatorOverlay = document.getElementById("bandIndicatorOverlay");
const metricAnimationStage = document.getElementById("metricAnimationStage");
document.querySelector(".chart-head")?.appendChild(globalSmoothing);

// --- Runtime drawing state ---
let chartView = null; // Last computed chart geometry, scales, and visible series.
let hoverPoint = null; // Current nearest point under the cursor, used by tooltip and dimming.
let zoomControlsVisible = false; // Whether the on-canvas zoom controls are expanded.
let lightweightDrawFrame = null; // requestAnimationFrame id for cheap redraws.
let hoverMoveFrame = null; // requestAnimationFrame id for coalesced pointer hover work.
let pendingHoverClientPoint = null; // Latest pointer position waiting to be processed.
let transparentExportMode = false; // Skips chart background fill while exporting transparent PNG.
let hoveredFrequencyBand = null; // Frequency band temporarily highlighted by pointer/focus.
const lockedFrequencyBands = new Set(); // Frequency bands explicitly locked on by the user.
let hoverAnimationFrame = null;
let hoverAnimation = { previousKey: null, activeKey: null, startedAt: 0, progress: 1 };
let tooltipPosition = null;
let bandAnimationFrame = null;
let bandAnimationStartedAt = 0;
const bandAnimationValues = new Map();
const cssColorCache = new Map();
let easterEggEnabled = true;
let metricAnimationController = null;
let themeTransitionTimer = null;

// --- Chart constants ---
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DRAW_POINTS_PER_PIXEL_WIDE = 1.2; // Full-range draw density.
const DRAW_POINTS_PER_PIXEL_MID = 3; // Medium zoom draw density.
const DRAW_POINTS_PER_PIXEL_ZOOMED = 8; // Close zoom draw density.
const MIN_DRAW_POINT_BUDGET = 120; // Minimum point budget per curve after decimation.
const MAX_CANVAS_DPR = 2; // Caps retina scaling to keep memory under control.
const MAX_CANVAS_PIXELS = 8000000; // Hard upper bound for backing canvas pixels.
const X_SLIDER_STEPS = 10000; // Integer precision for the dual-range frequency slider.
const MIN_X_SPAN_OCTAVES = 1 / 96; // Smallest allowed horizontal zoom span.
const MIN_Y_SPAN_DB = 3;
const MAX_Y_SPAN_DB = 160;
const GLOBAL_SMOOTHING_OCTAVES = 1 / 24;
const BAND_INDICATOR_HEIGHT = 24;
const DEFAULT_PHASE_MIN = -180;
const DEFAULT_PHASE_MAX = 180;
const PHASE_PLOT_TOP_RATIO = 0.4; // Phase traces use the lower 60% of the plot area.
const HOVER_ANIMATION_MS = 180;
const BAND_ANIMATION_MS = 180;
const TOOLTIP_FOLLOW_EASING = 0.16;
const EXPORT_SUMMARY_HEIGHT = 116;
// Frequency bands are shared by zoom shortcuts, chart background highlighting, and SVG export.
const FREQUENCY_BANDS = [
  { id: "sub-bass", label: "Sub Bass", min: 20, max: 80, color: "#56b4e9" },
  { id: "bass", label: "Bass", min: 80, max: 300, color: "#009e73" },
  { id: "mid", label: "Mid", min: 300, max: 2000, color: "#e69f00" },
  { id: "high-mid", label: "High-mid", min: 2000, max: 6000, color: "#cc79a7" },
  { id: "high", label: "High", min: 6000, max: 20000, color: "#0072b2" }
];
let dragState = null; // Active pan gesture state, or null when not dragging.

// --- Generic helpers ---
function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getFrequencyRange() {
  let minFreq = positiveNumber(state.axisMinFreq, MIN_FREQ);
  let maxFreq = positiveNumber(state.axisMaxFreq, MAX_FREQ);

  if (maxFreq <= minFreq) {
    minFreq = MIN_FREQ;
    maxFreq = MAX_FREQ;
  }

  return { minFreq, maxFreq };
}

function resetAxisSettings() {
  state.axisMinFreq = MIN_FREQ;
  state.axisMaxFreq = MAX_FREQ;
  state.axisFreqStepOctaves = null;
  state.axisMinDb = null;
  state.axisMaxDb = null;
  state.axisDbStep = null;
}

function setFrequencyRangeFromLog(centerLog, spanOctaves) {
  const fullMin = Math.log2(MIN_FREQ);
  const fullMax = Math.log2(MAX_FREQ);
  const span = Math.min(fullMax - fullMin, Math.max(MIN_X_SPAN_OCTAVES, spanOctaves));
  let minLog = centerLog - span / 2;
  let maxLog = centerLog + span / 2;

  if (minLog < fullMin) {
    maxLog += fullMin - minLog;
    minLog = fullMin;
  }
  if (maxLog > fullMax) {
    minLog -= maxLog - fullMax;
    maxLog = fullMax;
  }

  state.axisMinFreq = 2 ** minLog;
  state.axisMaxFreq = 2 ** maxLog;
}

function setDbRange(centerDb, spanDb) {
  const span = clamp(spanDb, MIN_Y_SPAN_DB, MAX_Y_SPAN_DB);
  state.axisMinDb = centerDb - span / 2;
  state.axisMaxDb = centerDb + span / 2;
}

function syncZoomSliders() {
  if (!xMinSlider || !xMaxSlider || !yZoomSlider) return;

  const { minFreq, maxFreq } = getFrequencyRange();
  const fullSpan = Math.log2(MAX_FREQ / MIN_FREQ);
  xMinSlider.value = String(Math.round((Math.log2(minFreq / MIN_FREQ) / fullSpan) * X_SLIDER_STEPS));
  xMaxSlider.value = String(Math.round((Math.log2(maxFreq / MIN_FREQ) / fullSpan) * X_SLIDER_STEPS));
  xZoomMinLabel.textContent = formatFrequency(minFreq);
  xZoomMaxLabel.textContent = formatFrequency(maxFreq);
  updateXRangeTrack();

  if (chartView) {
    const ySpan = chartView.maxDb - chartView.minDb;
    yZoomSlider.value = String(Math.round(100 * (1 - Math.sqrt(clamp((ySpan - MIN_Y_SPAN_DB) / (MAX_Y_SPAN_DB - MIN_Y_SPAN_DB), 0, 1)))));
    yZoomMaxLabel.textContent = `${chartView.maxDb.toFixed(0)} dB`;
    yZoomMinLabel.textContent = `${chartView.minDb.toFixed(0)} dB`;
  }

  syncBandButtons(minFreq, maxFreq);
}

function frequencyFromSliderValue(value) {
  const ratio = clamp(Number(value) / X_SLIDER_STEPS, 0, 1);
  return MIN_FREQ * (2 ** (Math.log2(MAX_FREQ / MIN_FREQ) * ratio));
}

function updateXRangeTrack() {
  const minPercent = clamp((Number(xMinSlider.value) / X_SLIDER_STEPS) * 100, 0, 100);
  const maxPercent = clamp((Number(xMaxSlider.value) / X_SLIDER_STEPS) * 100, 0, 100);
  xRangeTrack.style.setProperty("--range-min", `${minPercent}%`);
  xRangeTrack.style.setProperty("--range-max", `${maxPercent}%`);
}

function syncBandButtons(minFreq, maxFreq) {
  for (const button of bandRangeButtons) {
    const [bandMin, bandMax] = button.dataset.bandRange.split(",").map(Number);
    const isActive = Math.abs(minFreq - bandMin) < 0.5 && Math.abs(maxFreq - bandMax) < 0.5;
    button.classList.toggle("is-active", isActive);
  }
}

function setZoomControlsVisible(visible) {
  zoomControlsVisible = visible;
  canvasWrap.classList.toggle("is-zoom-hidden", !visible);
  zoomControlsToggle.classList.toggle("is-active", visible);
  zoomControlsToggle.setAttribute("aria-pressed", String(visible));
  zoomControlsToggle.setAttribute("aria-label", visible ? "隐藏缩放控件" : "显示缩放控件");
  zoomControlsToggle.title = visible ? "隐藏缩放控件" : "显示缩放控件";
}

function showZoomTip(tip, text) {
  tip.textContent = text;
  tip.hidden = false;
  clearTimeout(tip.hideTimer);
  tip.hideTimer = setTimeout(() => {
    tip.hidden = true;
  }, 900);
}

function isMdatFile(file) {
  return /\.mdat$/i.test(file.name);
}

function showImportWarnings(mdatFiles, emptyFiles) {
  if (mdatFiles.length) {
    alert(`暂不支持直接解析 REW .mdat 二进制文件：\n${mdatFiles.join("\n")}\n\n请在 REW 中使用 File > Export > Measurement as text 导出为 .txt/.frd/.dat 后再导入。`);
  }

  if (emptyFiles.length) {
    alert(`以下文件没有识别到频率/声压数据：\n${emptyFiles.join("\n")}\n\n支持 CSV/TXT/FRD/DAT 文本数据，数据行格式为 frequency level，可带第三列 phase。`);
  }
}

// --- Curve creation, display transforms, and import ---
function makeId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `curve-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeCurve(name, data) {
  const hasPhase = dataHasPhase(data);

  return {
    id: makeId(),
    name,
    data,
    color: nextCurveColor(),
    visible: true,
    offsetDb: 0,
    smoothingOctaves: state.globalSmoothing ? GLOBAL_SMOOTHING_OCTAVES : 0,
    hasPhase,
    showPhase: hasPhase,
    minimumPhase: false,
    phaseMargin: false
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value.length === 3
    ? value.split("").map((item) => item + item).join("")
    : value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cssColor(name, fallback) {
  if (cssColorCache.has(name)) return cssColorCache.get(name);
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  const color = value || fallback;
  cssColorCache.set(name, color);
  return color;
}

function isDarkTheme() {
  return document.body.dataset.theme === "dark";
}

function nextCurveColor() {
  const usedColors = new Set([
    ...state.curves.map((curve) => curve.color.toLowerCase()),
    state.target?.color.toLowerCase()
  ].filter(Boolean));
  const sourcePalette = state.theme === "dark" ? darkModeColors : colors;
  const availableColors = sourcePalette.filter((color) => !usedColors.has(color.toLowerCase()));
  const palette = availableColors.length ? availableColors : sourcePalette;
  return palette[Math.floor(Math.random() * palette.length)];
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : null;
}

function displayCurveColor(color) {
  if (state.theme !== "dark") return color;
  return brightenColorForDarkChart(color);
}

function brightenColorForDarkChart(color) {
  const hex = normalizeColor(color);
  if (!hex) return color;
  const rgb = hexToRgb(hex);
  const luminance = relativeLuminance(rgb);
  if (luminance >= 0.48) return hex;
  const amount = Math.min(0.58, 0.22 + (0.48 - luminance) * 0.85);
  return rgbToHex({
    r: Math.round(rgb.r + (255 - rgb.r) * amount),
    g: Math.round(rgb.g + (255 - rgb.g) * amount),
    b: Math.round(rgb.b + (255 - rgb.b) * amount)
  });
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function toHexByte(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function relativeLuminance({ r, g, b }) {
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
}

function displayLevel(point, curve, options = {}) {
  const applyTilt = options.applyTilt !== false;
  const tilt = applyTilt ? state.tiltDbPerOct * Math.log2(point.frequency / 1000) : 0;
  const applyOffset = options.applyOffset !== false;
  const offset = applyOffset ? (curve.offsetDb || 0) : 0;
  return point.level + tilt + offset;
}

function setTilt(value) {
  const nextValue = Number(value);
  state.tiltDbPerOct = Number.isFinite(nextValue) ? nextValue : 0;
  tiltInput.value = Number(state.tiltDbPerOct.toFixed(1));
  render();
}

function stepTilt(delta) {
  setTilt(state.tiltDbPerOct + delta);
}

function getSmoothedData(curve) {
  const octaves = curve.smoothingOctaves || 0;
  if (!octaves) return curve.data;

  if (!curve.smoothingCache || curve.smoothingCache.octaves !== octaves) {
    curve.smoothingCache = {
      octaves,
      data: smoothData(curve.data, octaves)
    };
  }

  return curve.smoothingCache.data;
}

function displayData(curve, options = {}) {
  const source = getSmoothedData(curve);
  const applyTilt = options.applyTilt !== false;
  const applyOffset = options.applyOffset !== false;
  const cacheKey = [
    curve.smoothingOctaves || 0,
    applyTilt ? state.tiltDbPerOct : "no-tilt",
    applyOffset ? curve.offsetDb || 0 : "no-offset",
    source.length
  ].join("|");

  if (curve.displayCache?.key === cacheKey) {
    return curve.displayCache.data;
  }

  const data = source.map((point) => ({
    frequency: point.frequency,
    level: displayLevel(point, curve, options),
    phase: point.phase
  }));

  curve.displayCache = { key: cacheKey, data };
  return data;
}

function alignmentData(curve) {
  const source = getSmoothedData(curve);

  return source.map((point) => ({
    frequency: point.frequency,
    level: point.level + (state.applyTiltToCurves ? state.tiltDbPerOct * Math.log2(point.frequency / 1000) : 0)
  }));
}

function targetAlignmentData(target) {
  return target.data.map((point) => ({
    frequency: point.frequency,
    level: point.level + (state.applyTiltToTarget ? state.tiltDbPerOct * Math.log2(point.frequency / 1000) : 0)
  }));
}

async function readFiles(files, isTarget = false) {
  const mdatFiles = [];
  const emptyFiles = [];

  for (const file of files) {
    if (isMdatFile(file)) {
      mdatFiles.push(file.name);
      continue;
    }

    const text = await file.text();
    const data = parseCsv(text);
    if (!data.length) {
      emptyFiles.push(file.name);
      continue;
    }

    if (isTarget) {
      const hasPhase = dataHasPhase(data);
      clearCurveCaches(state.target);
      state.target = {
        id: "target",
        name: file.name,
        data,
        color: nextCurveColor(),
        visible: true,
        offsetDb: 0,
        smoothingOctaves: state.globalSmoothing ? GLOBAL_SMOOTHING_OCTAVES : 0,
        hasPhase,
        showPhase: hasPhase,
        minimumPhase: false,
        phaseMargin: false
      };
    } else {
  state.curves.push(makeCurve(file.name, data));
    }
  }

  showImportWarnings(mdatFiles, emptyFiles);

  if (!state.referenceId && state.curves.length) {
    state.referenceId = state.curves[0].id;
  }

  render();
}

function importDroppedCurveFiles(fileList) {
  const files = Array.from(fileList || [])
    .filter((file) => /\.(csv|txt|frd|dat|mdat)$/i.test(file.name));

  if (files.length) {
    readFiles(files);
  }
}

// Convert raw curve data into the currently selected comparison mode.
function transformedData(curve) {
  if (state.mode === "raw") return displayData(curve, { applyTilt: state.applyTiltToCurves });

  const baseline = state.mode === "target"
    ? state.target
    : state.curves.find((item) => item.id === state.referenceId);

  if (!baseline) return [];

  const baselineData = state.mode === "reference"
    ? displayData(baseline, { applyTilt: state.applyTiltToCurves })
    : displayData(baseline, { applyTilt: state.applyTiltToTarget });

  return displayData(curve, { applyTilt: state.applyTiltToCurves }).map((point) => {
    const base = interpolate(baselineData, point.frequency);
    if (base === null) return null;
    return {
      frequency: point.frequency,
      level: point.level - base
    };
  }).filter(Boolean);
}

function getVisibleSeries() {
  const series = state.curves
    .filter((curve) => curve && curve.visible)
    .map((curve) => {
      const rawData = displayData(curve, { applyTilt: state.applyTiltToCurves });
      const data = state.mode === "raw" ? rawData : transformedData(curve);
      return {
        ...curve,
        data,
        phaseSeries: curve.hasPhase ? getPhaseSeries(curve, rawData) : []
      };
    })
    .filter((curve) => curve.data.length);

  if (state.mode === "raw" && state.target && state.target.visible !== false) {
    const data = displayData(state.target, { applyTilt: state.applyTiltToTarget });
    series.push({
      ...state.target,
      data,
      phaseSeries: state.target.hasPhase ? getPhaseSeries(state.target, data) : []
    });
  }

  return series;
}

// --- Canvas chart rendering ---
function drawChart() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = getCanvasDpr(rect);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const series = getVisibleSeries();
  const hasPhaseSeries = seriesHasPhase(series);
  const pad = { left: 62, right: hasPhaseSeries ? 58 : 24, top: 28, bottom: 48 };
  canvasWrap.classList.toggle("has-chart", Boolean(series.length));
  emptyState.style.display = series.length ? "none" : "grid";
  if (hoverPoint && !series.some((curve) => curve.id === hoverPoint.curve.id)) {
    hideTooltip();
  }
  if (!series.length) {
    chartView = null;
    renderBandIndicatorOverlay();
    hideTooltip();
    return;
  }

  const { minFreq, maxFreq } = getFrequencyRange();
  const { minDb, maxDb } = getDbRange(series, minFreq, maxFreq);
  const { minPhase, maxPhase } = getPhaseRange(series, minFreq, maxFreq);
  const plotW = width - pad.left - pad.right;
  const fullPlotH = height - pad.top - pad.bottom;
  const bandIndicatorHeight = state.showBandIndicator ? BAND_INDICATOR_HEIGHT : 0;
  const plotH = Math.max(1, fullPlotH - bandIndicatorHeight);

  const minLogFreq = Math.log10(minFreq);
  const maxLogFreq = Math.log10(maxFreq);
  const x = (freq) => pad.left + ((Math.log10(freq) - minLogFreq) / (maxLogFreq - minLogFreq)) * plotW;
  const y = (db) => pad.top + (1 - (db - minDb) / (maxDb - minDb)) * plotH;
  const phaseTop = pad.top + plotH * PHASE_PLOT_TOP_RATIO;
  const phaseBottom = pad.top + plotH;
  const phasePlotH = phaseBottom - phaseTop;
  const phaseY = (phase) => phaseTop + (1 - (phase - minPhase) / (maxPhase - minPhase)) * phasePlotH;

  chartView = { series, x, y, phaseY, pad, plotW, plotH, bandIndicatorHeight, phaseTop, phaseBottom, phasePlotH, width, height, minFreq, maxFreq, minDb, maxDb, minPhase, maxPhase, minLogFreq, maxLogFreq, hasPhaseSeries };

  drawGrid({ x, y, phaseY, pad, plotW, plotH, width, height, minDb, maxDb, minFreq, maxFreq, minPhase, maxPhase, hasPhaseSeries });
  drawWatermark();
  drawSeries(series, x, y, minFreq, maxFreq);
  drawPhaseSeries(series, x, phaseY, minFreq, maxFreq);
  drawMeasurementLabel();
  if (hoverPoint) drawHoverGuide(hoverPoint);
  drawLegend(series, pad.left + 10, pad.top + 26);
  renderBandIndicatorOverlay();
  syncZoomSliders();
}

function getCanvasDpr(rect) {
  const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
  const cssPixels = Math.max(1, rect.width * rect.height);
  const pixelLimitedDpr = Math.sqrt(MAX_CANVAS_PIXELS / cssPixels);
  return Math.max(1, Math.min(rawDpr, pixelLimitedDpr));
}

function scheduleLightweightDraw() {
  if (lightweightDrawFrame) return;

  lightweightDrawFrame = requestAnimationFrame(() => {
    lightweightDrawFrame = null;
    drawCurrentChartView();
  });
}

function drawCurrentChartView() {
  if (!chartView) {
    drawChart();
    return;
  }

  const { series, x, y, phaseY, pad, plotW, plotH, bandIndicatorHeight, width, height, minFreq, maxFreq, minDb, maxDb, minPhase, maxPhase, hasPhaseSeries } = chartView;
  ctx.clearRect(0, 0, width, height);
  drawGrid({ x, y, phaseY, pad, plotW, plotH, width, height, minDb, maxDb, minFreq, maxFreq, minPhase, maxPhase, hasPhaseSeries });
  drawWatermark();
  drawSeries(series, x, y, minFreq, maxFreq);
  drawPhaseSeries(series, x, phaseY, minFreq, maxFreq);
  drawMeasurementLabel();
  if (hoverPoint) drawHoverGuide(hoverPoint);
  drawLegend(series, pad.left + 10, pad.top + 26);
}

// --- Frequency band indicator overlay ---
function renderBandIndicatorOverlay() {
  if (!bandIndicatorOverlay) return;
  bandIndicatorOverlay.innerHTML = "";

  if (!state.showBandIndicator || !chartView) {
    bandIndicatorOverlay.hidden = true;
    return;
  }

  const { x, pad, plotW, plotH, bandIndicatorHeight, width, height, minFreq, maxFreq } = chartView;
  bandIndicatorOverlay.hidden = false;
  bandIndicatorOverlay.style.width = `${width}px`;
  bandIndicatorOverlay.style.height = `${height}px`;

  const top = pad.top + plotH;
  for (const band of FREQUENCY_BANDS) {
    const start = Math.max(band.min, minFreq);
    const end = Math.min(band.max, maxFreq);
    if (end <= start) continue;

    const left = clamp(x(start), pad.left, pad.left + plotW);
    const right = clamp(x(end), pad.left, pad.left + plotW);
    const widthPx = right - left;
    if (widthPx < 18) continue;

    const item = document.createElement("button");
    item.type = "button";
    const isLocked = lockedFrequencyBands.has(band.id);
    const isActive = isFrequencyBandActive(band.id);
    const strength = getBandStrength(band.id);
    item.className = `band-indicator-item${isActive ? " is-hovered" : ""}${isLocked ? " is-locked" : ""}`;
    item.dataset.bandId = band.id;
    item.style.setProperty("--band-strength", strength.toFixed(3));
    item.textContent = band.label;
    item.title = `${band.label}: ${formatFrequency(band.min)} - ${formatFrequency(band.max)}`;
    item.setAttribute("aria-pressed", String(isLocked));
    item.style.left = `${left}px`;
    item.style.top = `${top}px`;
    item.style.height = `${Math.max(22, bandIndicatorHeight)}px`;
    item.style.width = `${widthPx}px`;
    item.addEventListener("mouseenter", () => setHoveredFrequencyBand(band.id));
    item.addEventListener("focus", () => setHoveredFrequencyBand(band.id));
    item.addEventListener("mouseleave", () => setHoveredFrequencyBand(null));
    item.addEventListener("blur", () => setHoveredFrequencyBand(null));
    item.addEventListener("click", () => toggleLockedFrequencyBand(band.id));
    bandIndicatorOverlay.appendChild(item);
  }
}

function setHoveredFrequencyBand(id) {
  if (hoveredFrequencyBand === id) return;
  hoveredFrequencyBand = id;
  requestBandAnimation();
  scheduleLightweightDraw();
}

function toggleLockedFrequencyBand(id) {
  if (lockedFrequencyBands.has(id)) {
    lockedFrequencyBands.delete(id);
  } else {
    lockedFrequencyBands.add(id);
  }
  requestBandAnimation();
  updateBandIndicatorItems();
  scheduleLightweightDraw();
}

function isFrequencyBandActive(id) {
  return lockedFrequencyBands.has(id) || hoveredFrequencyBand === id;
}

function getBandStrength(id) {
  return bandAnimationValues.get(id) ?? (isFrequencyBandActive(id) ? 1 : 0);
}

function requestBandAnimation() {
  bandAnimationStartedAt = performance.now();
  if (!bandAnimationFrame) bandAnimationFrame = requestAnimationFrame(stepBandAnimation);
}

function stepBandAnimation(now) {
  bandAnimationFrame = null;
  const progress = easeOutCubic(clamp((now - bandAnimationStartedAt) / BAND_ANIMATION_MS, 0, 1));
  let needsNextFrame = false;

  for (const band of FREQUENCY_BANDS) {
    const current = getBandStrength(band.id);
    const target = isFrequencyBandActive(band.id) ? 1 : 0;
    const next = lerp(current, target, progress);
    bandAnimationValues.set(band.id, Math.abs(next - target) < 0.01 ? target : next);
    if (Math.abs((bandAnimationValues.get(band.id) || 0) - target) >= 0.01) needsNextFrame = true;
  }

  updateBandIndicatorItems();
  drawCurrentChartView();
  if (needsNextFrame) bandAnimationFrame = requestAnimationFrame(stepBandAnimation);
}

function updateBandIndicatorItems() {
  if (!bandIndicatorOverlay) return;
  for (const item of bandIndicatorOverlay.querySelectorAll(".band-indicator-item")) {
    const id = item.dataset.bandId;
    item.classList.toggle("is-hovered", isFrequencyBandActive(id));
    item.classList.toggle("is-locked", lockedFrequencyBands.has(id));
    item.style.setProperty("--band-strength", getBandStrength(id).toFixed(3));
  }
}

// --- Axis ranges and grid helpers ---
function updateChartSeriesColor(id, color) {
  if (!chartView) return;

  const series = chartView.series.find((curve) => curve.id === id);
  if (series) series.color = color;
  if (hoverPoint?.curve?.id === id) hoverPoint.curve.color = color;
}

function seriesHasPhase(series) {
  return series.some((curve) => curve.phaseSeries?.some((phaseLine) => phaseLine.data.some((point) => Number.isFinite(point.phase))));
}

function getPhaseRange(series, minFreq, maxFreq) {
  return { minPhase: DEFAULT_PHASE_MIN, maxPhase: DEFAULT_PHASE_MAX };
}

function getDbRange(series, minFreq, maxFreq) {
  let rawMin = Infinity;
  let rawMax = -Infinity;
  let hasLevels = false;

  for (const curve of series) {
    const { start, end } = getVisibleIndexRange(curve.data, minFreq, maxFreq);
    const stride = getRangeSampleStride(end - start, minFreq, maxFreq);
    for (let index = start; index < end; index += stride) {
      const point = curve.data[index];
      if (point.frequency < minFreq || point.frequency > maxFreq) continue;
      if (point.level < rawMin) rawMin = point.level;
      if (point.level > rawMax) rawMax = point.level;
      hasLevels = true;
    }
  }

  if (!hasLevels) {
    return { minDb: -10, maxDb: 10 };
  }

  const manualMin = optionalNumber(state.axisMinDb);
  const manualMax = optionalNumber(state.axisMaxDb);
  if (manualMin !== null && manualMax !== null && manualMax > manualMin) {
    return { minDb: manualMin, maxDb: manualMax };
  }

  if (state.mode !== "raw") {
    const extent = Math.max(10, Math.abs(rawMin), Math.abs(rawMax)) + 2;
    return {
      minDb: -Math.ceil(extent / 2) * 2,
      maxDb: Math.ceil(extent / 2) * 2
    };
  }

  const padding = Math.max(3, (rawMax - rawMin) * 0.08);
  return {
    minDb: Math.floor((rawMin - padding) / 5) * 5,
    maxDb: Math.ceil((rawMax + padding) / 5) * 5
  };
}

function getMajorFrequencyTicks(minFreq, maxFreq) {
  const preferredTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const visibleTicks = preferredTicks.filter((freq) => freq >= minFreq && freq <= maxFreq);
  if (visibleTicks.length >= 3 || Math.log2(maxFreq / minFreq) > 3) return visibleTicks;

  return getZoomedFrequencyTicks(minFreq, maxFreq);
}

function getMinorFrequencyTicks(minFreq, maxFreq, majorTicks) {
  const majorSet = new Set(majorTicks);
  return [30, 40, 60, 70, 80, 90, 150, 300, 400, 600, 700, 800, 900, 1500, 3000, 4000, 6000, 7000, 8000, 9000, 15000]
    .filter((freq) => freq >= minFreq && freq <= maxFreq && !majorSet.has(freq));
}

function getZoomedFrequencyTicks(minFreq, maxFreq) {
  const ticks = [];
  const span = maxFreq - minFreq;
  const step = niceLinearFrequencyStep(span / 6);
  const start = Math.ceil(minFreq / step) * step;

  for (let freq = start; freq <= maxFreq + step * 0.001; freq += step) {
    if (freq > 0) ticks.push(freq);
  }

  return ticks;
}

function niceLinearFrequencyStep(rawStep) {
  const exponent = Math.floor(Math.log10(rawStep));
  const base = rawStep / (10 ** exponent);
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * (10 ** exponent);
}

function drawGrid({ x, y, phaseY, pad, plotW, plotH, width, height, minDb, maxDb, minFreq, maxFreq, minPhase, maxPhase, hasPhaseSeries }) {
  if (!transparentExportMode) {
    if (isDarkTheme()) {
      ctx.fillStyle = "rgba(3, 12, 30, 0.025)";
      ctx.fillRect(pad.left, pad.top, plotW, plotH);
    } else {
      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      gradient.addColorStop(0, cssColor("--chart-bg-top", "#ffffff"));
      gradient.addColorStop(0.58, cssColor("--chart-bg-mid", "#fbfdfe"));
      gradient.addColorStop(1, cssColor("--chart-bg-bottom", "#f3f8fa"));
      ctx.fillStyle = gradient;
      ctx.fillRect(pad.left, pad.top, plotW, plotH);
    }

    const innerGlow = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    innerGlow.addColorStop(0, cssColor("--chart-plot-sheen", "rgba(255, 255, 255, 0.75)"));
    innerGlow.addColorStop(0.16, "rgba(255, 255, 255, 0)");
    innerGlow.addColorStop(0.86, "rgba(255, 255, 255, 0)");
    innerGlow.addColorStop(1, cssColor("--chart-inner-shadow", "rgba(20, 33, 43, 0.035)"));
    ctx.fillStyle = innerGlow;
    ctx.fillRect(pad.left, pad.top, plotW, plotH);
  }
  drawFrequencyBandBackgrounds(x, pad, plotW, plotH, minFreq, maxFreq);

  ctx.strokeStyle = cssColor("--chart-grid-major", "#d3dee4");
  ctx.lineWidth = 1;
  ctx.fillStyle = cssColor("--chart-label", "#657484");
  ctx.font = "12px Arial";

  const majorFreqTicks = getMajorFrequencyTicks(minFreq, maxFreq);
  const minorFreqTicks = getMinorFrequencyTicks(minFreq, maxFreq, majorFreqTicks);

  ctx.strokeStyle = cssColor("--chart-grid-minor", "#e3ebef");
  for (const freq of minorFreqTicks) {
    const px = x(freq);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + plotH);
    ctx.stroke();
  }

  ctx.strokeStyle = cssColor("--chart-grid-major", "#c8d5dd");
  for (const freq of majorFreqTicks) {
    const px = x(freq);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + plotH);
    ctx.stroke();

    const label = formatFrequencyTick(freq);
    ctx.fillText(label, px - 10, state.showBandIndicator ? pad.top + plotH + BAND_INDICATOR_HEIGHT + 16 : height - 20);
  }

  ctx.fillStyle = cssColor("--chart-label", "#657484");
  ctx.fillText("频率 (Hz，对数坐标)", pad.left + plotW / 2 - 58, height - 6);

  const dbStep = niceDbStep((maxDb - minDb) / 8);
  for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
    const py = y(db);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + plotW, py);
    ctx.stroke();
    ctx.fillText(String(db), 18, py + 4);
  }

  if (hasPhaseSeries) {
    const phaseStep = nicePhaseStep((maxPhase - minPhase) / 8);
    ctx.strokeStyle = cssColor("--phase-grid", "#ead9c2");
    ctx.fillStyle = cssColor("--phase-label", "#8a5a19");
    ctx.textAlign = "left";
    for (let phase = Math.ceil(minPhase / phaseStep) * phaseStep; phase <= maxPhase; phase += phaseStep) {
      const py = phaseY(phase);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();
      ctx.fillText(`${phase}°`, pad.left + plotW + 8, py + 4);
    }
    ctx.save();
    ctx.translate(width - 12, (phaseY(minPhase) + phaseY(maxPhase)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("相位 (°)", 0, 0);
    ctx.restore();
    ctx.textAlign = "start";
  }

  ctx.strokeStyle = cssColor("--chart-axis", "#849aa8");
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);

  ctx.strokeStyle = cssColor("--chart-top-stroke", "rgba(255, 255, 255, 0.85)");
  ctx.beginPath();
  ctx.moveTo(pad.left + 1, pad.top + 1);
  ctx.lineTo(pad.left + plotW - 1, pad.top + 1);
  ctx.stroke();

  if (state.mode !== "raw") {
    ctx.strokeStyle = cssColor("--chart-zero", "#111827");
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y(0));
    ctx.lineTo(pad.left + plotW, y(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawFrequencyBandBackgrounds(x, pad, plotW, plotH, minFreq, maxFreq) {
  if (!state.showBandIndicator) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  for (const band of FREQUENCY_BANDS) {
    const start = Math.max(band.min, minFreq);
    const end = Math.min(band.max, maxFreq);
    if (end <= start) continue;

    const left = clamp(x(start), pad.left, pad.left + plotW);
    const right = clamp(x(end), pad.left, pad.left + plotW);
    if (right <= left) continue;

    const strength = getBandStrength(band.id);
    const bandGradient = ctx.createLinearGradient(left, pad.top, right, pad.top);
    bandGradient.addColorStop(0, hexToRgba(band.color, lerp(0.018, 0.055, strength)));
    bandGradient.addColorStop(0.5, hexToRgba(band.color, lerp(0.062, 0.19, strength)));
    bandGradient.addColorStop(1, hexToRgba(band.color, lerp(0.018, 0.055, strength)));
    ctx.fillStyle = bandGradient;
    ctx.fillRect(left, pad.top, right - left, plotH);

    const verticalSheen = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    verticalSheen.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    verticalSheen.addColorStop(0.45, "rgba(255, 255, 255, 0)");
    verticalSheen.addColorStop(1, "rgba(20, 33, 43, 0.015)");
    ctx.fillStyle = verticalSheen;
    ctx.fillRect(left, pad.top, right - left, plotH);

    ctx.strokeStyle = hexToRgba(band.color, lerp(0.13, 0.28, strength));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, pad.top);
    ctx.lineTo(left, pad.top + plotH);
    ctx.moveTo(right, pad.top);
    ctx.lineTo(right, pad.top + plotH);
    ctx.stroke();
  }

  ctx.restore();
}

// --- Series drawing and point reduction ---
function niceDbStep(rawStep) {
  const steps = [0.5, 1, 2, 5, 10, 20, 40];
  return steps.find((step) => step >= rawStep) || 50;
}

function nicePhaseStep(rawStep) {
  const steps = [15, 30, 45, 60, 90, 180];
  return steps.find((step) => step >= rawStep) || 360;
}

function formatFrequencyTick(freq) {
  if (freq >= 1000) {
    const value = freq / 1000;
    return `${Number(value.toFixed(value >= 10 ? 0 : value >= 2 ? 1 : 2))}k`;
  }

  return String(Number(freq.toFixed(freq >= 100 ? 0 : 1)));
}

function drawSeries(series, x, y, minFreq, maxFreq) {
  const dimStrength = getDimStrength();
  for (const curve of series) {
    const hoverStrength = getHoverStrength(curve, "level");
    const curveColor = displayCurveColor(curve.color);

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartView.pad.left, chartView.pad.top, chartView.plotW, chartView.plotH);
    ctx.clip();
    ctx.globalAlpha = lerp(1, hoverStrength > 0 ? 1 : 0.12, dimStrength);
    ctx.strokeStyle = curveColor;
    ctx.lineWidth = lerp(2, 5, hoverStrength);
    if (hoverStrength > 0) {
      ctx.shadowColor = curveColor;
      ctx.shadowBlur = lerp(0, 9, hoverStrength);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    const drawData = getDrawablePoints(curve.data, x, y, minFreq, maxFreq);

    let started = false;
    for (const point of drawData) {
      const px = x(point.frequency);
      const py = y(point.level);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
    ctx.restore();
  }
}

function drawPhaseSeries(series, x, phaseY, minFreq, maxFreq) {
  const dimStrength = getDimStrength();
  for (const curve of series) {
    if (!curve.phaseSeries?.length) continue;
    const curveColor = displayCurveColor(curve.color);

    for (const phaseLine of curve.phaseSeries) {
      const hoverStrength = getHoverStrength(curve, phaseLine.id);
      ctx.save();
      ctx.beginPath();
      ctx.rect(chartView.pad.left, chartView.pad.top, chartView.plotW, chartView.plotH);
      ctx.clip();
      ctx.globalAlpha = lerp(0.78, hoverStrength > 0 ? 1 : 0.1, dimStrength);
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = lerp(1.8, 4.6, hoverStrength);
      if (hoverStrength > 0) {
        ctx.shadowColor = curveColor;
        ctx.shadowBlur = lerp(0, 8, hoverStrength);
      }
      ctx.setLineDash(phaseLine.dash);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      const drawData = getDrawablePoints(phaseLine.data, x, phaseY, minFreq, maxFreq, "phase");
      let started = false;
      let previousPhase = null;

      for (const point of drawData) {
        const px = x(point.frequency);
        const py = phaseY(point.phase);
        if (!started || (previousPhase !== null && Math.abs(point.phase - previousPhase) > 180)) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
        previousPhase = point.phase;
      }

      ctx.stroke();
      ctx.restore();
    }
  }
}

function isHoveredSeries(curve, seriesKey) {
  return getHoverStrength(curve, seriesKey) > 0.5;
}

// Reduces dense series using screen-space buckets before drawing. This keeps interaction fast
// without changing the visible shape as aggressively as a fixed stride.
function getDrawablePoints(data, x, y, minFreq, maxFreq, valueKey = "level") {
  if (!chartView) return getVisibleData(data, minFreq, maxFreq, valueKey);

  const density = getDrawPointDensity(minFreq, maxFreq);
  const pointBudget = Math.max(MIN_DRAW_POINT_BUDGET, Math.ceil(chartView.plotW * density));
  const { start, end } = getVisibleIndexRange(data, minFreq, maxFreq);
  const visibleCount = end - start;
  if (visibleCount <= pointBudget) return getVisibleData(data, minFreq, maxFreq, valueKey);

  const bucketCount = Math.max(1, Math.ceil(pointBudget / 4));
  const buckets = new Array(bucketCount);

  for (let index = start; index < end; index++) {
    addPointToDrawBucket(buckets, data, index, x, y, valueKey);
  }

  const result = [];
  let previousIndex = -1;

  for (const bucket of buckets) {
    if (!bucket) continue;

    const representatives = [bucket.first, bucket.min, bucket.max, bucket.last]
      .sort((a, b) => a.index - b.index);

    for (const item of representatives) {
      if (item.index === previousIndex) continue;
      result.push(item.point);
      previousIndex = item.index;
    }
  }

  return result;
}

function addPointToDrawBucket(buckets, data, index, x, y, valueKey) {
  if (index < 0 || index >= data.length) return;

  const point = data[index];
  if (!Number.isFinite(point[valueKey])) return;
  const bucketRatio = (x(point.frequency) - chartView.pad.left) / chartView.plotW;
  const bucketIndex = Math.max(0, Math.min(buckets.length - 1, Math.floor(bucketRatio * buckets.length)));
  const py = y(point[valueKey]);
  let bucket = buckets[bucketIndex];

  if (!bucket) {
    bucket = buckets[bucketIndex] = {
      first: { point, index },
      last: { point, index },
      min: { point, index, py },
      max: { point, index, py }
    };
    return;
  }

  bucket.last = { point, index };
  if (py < bucket.min.py) bucket.min = { point, index, py };
  if (py > bucket.max.py) bucket.max = { point, index, py };
}

function getVisibleData(data, minFreq, maxFreq, valueKey) {
  const { start, end } = getVisibleIndexRange(data, minFreq, maxFreq);
  const visibleData = [];

  for (let index = start; index < end; index++) {
    const point = data[index];
    if (Number.isFinite(point[valueKey])) visibleData.push(point);
  }

  return visibleData;
}

function getVisibleIndexRange(data, minFreq, maxFreq) {
  if (!data.length) return { start: 0, end: 0 };
  const start = lowerBoundFrequency(data, minFreq);
  let end = lowerBoundFrequency(data, maxFreq);
  if (end < data.length && data[end].frequency <= maxFreq) end++;
  return {
    start: Math.max(0, Math.min(start, data.length)),
    end: Math.max(start, Math.min(end, data.length))
  };
}

function lowerBoundFrequency(data, frequency) {
  let lo = 0;
  let hi = data.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (data[mid].frequency < frequency) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

function getDrawPointDensity(minFreq, maxFreq) {
  const spanOctaves = Math.log2(maxFreq / minFreq);
  if (spanOctaves <= 1.5) return DRAW_POINTS_PER_PIXEL_ZOOMED;
  if (spanOctaves <= 4) return DRAW_POINTS_PER_PIXEL_MID;
  return DRAW_POINTS_PER_PIXEL_WIDE;
}

function getRangeSampleStride(visiblePointCount, minFreq, maxFreq) {
  const spanOctaves = Math.log2(maxFreq / minFreq);
  if (spanOctaves <= 4) return 1;
  return Math.max(1, Math.floor(visiblePointCount / 1200));
}

// --- Hover guide, tooltip, and nearest-point lookup ---
function hoverKey(point) {
  return point ? `${point.curve.id}:${point.seriesKey}` : null;
}

function seriesKey(curve, key) {
  return `${curve.id}:${key}`;
}

function setHoverPoint(point) {
  const currentKey = hoverKey(hoverPoint);
  const nextKey = hoverKey(point);
  hoverPoint = point;
  if (!point) tooltipPosition = null;
  if (currentKey === nextKey) return;

  hoverAnimation = {
    previousKey: currentKey,
    activeKey: nextKey,
    startedAt: performance.now(),
    progress: 0
  };
  requestHoverAnimation();
}

function requestHoverAnimation() {
  if (hoverAnimationFrame) return;
  hoverAnimationFrame = requestAnimationFrame(stepHoverAnimation);
}

function stepHoverAnimation(now) {
  hoverAnimationFrame = null;
  hoverAnimation.progress = clamp((now - hoverAnimation.startedAt) / HOVER_ANIMATION_MS, 0, 1);
  drawCurrentChartView();
  if (hoverAnimation.progress < 1) requestHoverAnimation();
}

function getHoverEase() {
  return easeOutCubic(hoverAnimation.progress);
}

function getHoverStrength(curve, key) {
  const itemKey = seriesKey(curve, key);
  const ease = getHoverEase();
  if (hoverAnimation.activeKey === itemKey) return ease;
  if (hoverAnimation.previousKey === itemKey) return 1 - ease;
  return 0;
}

function getDimStrength() {
  const ease = getHoverEase();
  if (hoverAnimation.activeKey) return ease;
  if (hoverAnimation.previousKey) return 1 - ease;
  return 0;
}

function drawHoverGuide(point) {
  if (!chartView) return;

  const px = chartView.x(point.frequency);
  const py = point.kind === "phase" ? chartView.phaseY(point.phase) : chartView.y(point.level);
  const strength = Math.max(0.001, getHoverStrength(point.curve, point.seriesKey));

  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = "rgba(31, 41, 51, 0.38)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px, chartView.pad.top);
  ctx.lineTo(px, chartView.pad.top + chartView.plotH);
  ctx.moveTo(chartView.pad.left, py);
  ctx.lineTo(chartView.pad.left + chartView.plotW, py);
  ctx.stroke();
  ctx.setLineDash([]);

  const pointColor = displayCurveColor(point.curve.color);
  ctx.fillStyle = pointColor;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, lerp(4.5, 7, strength), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function formatFrequency(freq) {
  if (freq >= 1000) return `${(freq / 1000).toFixed(freq >= 10000 ? 1 : 2)} kHz`;
  return `${freq.toFixed(freq >= 100 ? 1 : 2)} Hz`;
}

function hideTooltip() {
  setHoverPoint(null);
  chartTooltip.classList.remove("is-visible");
  clearTimeout(chartTooltip.hideTimer);
  chartTooltip.hideTimer = setTimeout(() => {
    if (!hoverPoint) chartTooltip.hidden = true;
  }, 160);
}

function updateTooltip(point, mouseX, mouseY) {
  const rows = (point.readings || []).map((reading) => `
    <div class="tooltip-series${reading.curve.id === point.curve.id ? " is-active" : ""}">
      <span class="tooltip-swatch" style="background:${displayCurveColor(reading.curve.color)}"></span>
      <span class="tooltip-series-name">${escapeHtml(reading.curve.name)}</span>
      <strong>${reading.level === null ? "-" : `${reading.level.toFixed(2)} dB`}${reading.phase === null ? "" : ` / ${reading.phase.toFixed(1)}°`}</strong>
    </div>
  `).join("");

  chartTooltip.innerHTML = `
    <div class="tooltip-name" style="color:${displayCurveColor(point.curve.color)}">${escapeHtml(point.curve.name)}</div>
    <div class="tooltip-row"><span>频点</span><strong>${formatFrequency(point.frequency)}</strong></div>
    <div class="tooltip-row"><span>${point.kind === "phase" ? point.phaseLabel : "声压"}</span><strong>${point.kind === "phase" ? `${point.phase.toFixed(1)}°` : `${point.level.toFixed(2)} dB`}</strong></div>
    <div class="tooltip-readings">${rows}</div>
  `;

  clearTimeout(chartTooltip.hideTimer);
  chartTooltip.hidden = false;
  requestAnimationFrame(() => chartTooltip.classList.add("is-visible"));

  const wrap = canvas.parentElement.getBoundingClientRect();
  const tooltipRect = chartTooltip.getBoundingClientRect();
  const margin = 12;
  let left = mouseX + margin;
  let top = mouseY + margin;

  if (left + tooltipRect.width > wrap.width) left = mouseX - tooltipRect.width - margin;
  if (top + tooltipRect.height > wrap.height) top = mouseY - tooltipRect.height - margin;

  left = Math.max(8, left);
  top = Math.max(8, top);
  if (!tooltipPosition) {
    tooltipPosition = { x: left, y: top };
  } else {
    tooltipPosition.x = lerp(tooltipPosition.x, left, TOOLTIP_FOLLOW_EASING);
    tooltipPosition.y = lerp(tooltipPosition.y, top, TOOLTIP_FOLLOW_EASING);
  }
  chartTooltip.style.left = `${tooltipPosition.x}px`;
  chartTooltip.style.top = `${tooltipPosition.y}px`;
}

function scheduleChartHover(event) {
  pendingHoverClientPoint = { x: event.clientX, y: event.clientY };
  if (hoverMoveFrame) return;
  hoverMoveFrame = requestAnimationFrame(handleScheduledChartHover);
}

function handleScheduledChartHover() {
  hoverMoveFrame = null;
  if (!pendingHoverClientPoint || dragState) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = pendingHoverClientPoint.x - rect.left;
  const mouseY = pendingHoverClientPoint.y - rect.top;
  pendingHoverClientPoint = null;
  const previousKey = hoverKey(hoverPoint);
  const previousFrequency = hoverPoint?.frequency;
  const nearest = findNearestPoint(mouseX, mouseY);

  if (!nearest) {
    if (hoverPoint) {
      hideTooltip();
      drawCurrentChartView();
    }
    return;
  }

  setHoverPoint(nearest);
  updateTooltip(nearest, mouseX, mouseY);

  if (previousKey === hoverKey(nearest) && previousFrequency === nearest.frequency) return;
  if (previousKey !== hoverKey(nearest)) return;
  drawCurrentChartView();
}

function findNearestPoint(mouseX, mouseY) {
  if (!chartView) return null;

  const { series, x, y, phaseY, pad, plotW, plotH, minFreq, maxFreq, minLogFreq, maxLogFreq } = chartView;
  if (mouseX < pad.left || mouseX > pad.left + plotW || mouseY < pad.top || mouseY > pad.top + plotH) {
    return null;
  }

  let nearest = null;
  const thresholdPx = 18;
  const mouseLog = minLogFreq + ((mouseX - pad.left) / plotW) * (maxLogFreq - minLogFreq);
  const mouseFreq = 10 ** mouseLog;
  const logThreshold = (thresholdPx / plotW) * (maxLogFreq - minLogFreq);

  for (const curve of series) {
    const startIndex = nearestFrequencyIndex(curve.data, mouseFreq);
    for (let i = startIndex; i >= 0; i--) {
      const point = curve.data[i];
      if (Math.abs(Math.log10(point.frequency) - mouseLog) > logThreshold) break;
      nearest = nearestByDistance(nearest, curve, point, "level", mouseX, mouseY, x, y, thresholdPx, minFreq, maxFreq);
    }

    for (let i = startIndex + 1; i < curve.data.length; i++) {
      const point = curve.data[i];
      if (Math.abs(Math.log10(point.frequency) - mouseLog) > logThreshold) break;
      nearest = nearestByDistance(nearest, curve, point, "level", mouseX, mouseY, x, y, thresholdPx, minFreq, maxFreq);
    }

    if (curve.phaseSeries?.length) {
      for (const phaseLine of curve.phaseSeries) {
        const phaseStartIndex = nearestFrequencyIndex(phaseLine.data, mouseFreq);
        if (phaseStartIndex < 0) continue;
        for (let i = phaseStartIndex; i >= 0; i--) {
          const point = phaseLine.data[i];
          if (Math.abs(Math.log10(point.frequency) - mouseLog) > logThreshold) break;
          nearest = nearestByDistance(nearest, curve, point, "phase", mouseX, mouseY, x, phaseY, thresholdPx, minFreq, maxFreq, phaseLine);
        }

        for (let i = phaseStartIndex + 1; i < phaseLine.data.length; i++) {
          const point = phaseLine.data[i];
          if (Math.abs(Math.log10(point.frequency) - mouseLog) > logThreshold) break;
          nearest = nearestByDistance(nearest, curve, point, "phase", mouseX, mouseY, x, phaseY, thresholdPx, minFreq, maxFreq, phaseLine);
        }
      }
    }
  }

  if (!nearest) return null;

  nearest.readings = getReadingsAtFrequency(nearest.frequency);
  return nearest;
}

function getReadingsAtFrequency(frequency) {
  if (!chartView) return [];

  return chartView.series
    .map((curve) => {
      const level = interpolate(curve.data, frequency);
      const phaseLine = curve.phaseSeries?.[0];
      const phase = phaseLine ? interpolatePhase(phaseLine.data, frequency) : null;
      return level === null && phase === null ? null : { curve, level, phase };
    })
    .filter(Boolean)
    .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity));
}

function nearestFrequencyIndex(data, frequency) {
  if (!data.length) return -1;

  let lo = 0;
  let hi = data.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (data[mid].frequency < frequency) lo = mid + 1;
    else hi = mid;
  }

  if (lo > 0 && Math.abs(data[lo - 1].frequency - frequency) < Math.abs(data[lo].frequency - frequency)) {
    return lo - 1;
  }

  return lo;
}

function nearestByDistance(nearest, curve, point, valueKey, mouseX, mouseY, x, y, thresholdPx, minFreq, maxFreq, phaseLine = null) {
  if (point.frequency < minFreq || point.frequency > maxFreq) return nearest;
  if (!Number.isFinite(point[valueKey])) return nearest;

  const px = x(point.frequency);
  const py = y(point[valueKey]);
  const distance = Math.hypot(px - mouseX, py - mouseY);

  if (distance <= thresholdPx && (!nearest || distance < nearest.distance)) {
    return {
      curve,
      kind: valueKey === "phase" ? "phase" : "level",
      seriesKey: phaseLine?.id || "level",
      phaseLabel: phaseLine?.label || "相位",
      frequency: point.frequency,
      level: valueKey === "level" ? point.level : interpolate(curve.data, point.frequency),
      phase: valueKey === "phase" ? point.phase : (curve.phaseSeries?.[0] ? interpolatePhase(curve.phaseSeries[0].data, point.frequency) : null),
      distance
    };
  }

  return nearest;
}

// --- Legend, watermark, and export builders ---
function drawLegend(series, x, y) {
  ctx.font = "12px Arial";
  let offset = 0;
  const items = getLegendItems(series).slice(0, 14);
  const dimStrength = getDimStrength();

  for (const item of items) {
    const hoverStrength = getHoverStrength(item.curve, item.seriesKey);
    const itemColor = displayCurveColor(item.curve.color);
    ctx.save();
    ctx.globalAlpha = lerp(1, hoverStrength > 0 ? 1 : 0.25, dimStrength);
    if (hoverStrength > 0) {
      ctx.fillStyle = cssColor("--chart-highlight-bg", "rgba(255, 255, 255, 0.86)");
      ctx.strokeStyle = itemColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = hoverStrength;
      ctx.fillRect(x - 8, y + offset - 15, 230, 17);
      ctx.strokeRect(x - 8, y + offset - 15, 230, 17);
      ctx.globalAlpha = lerp(1, hoverStrength > 0 ? 1 : 0.25, dimStrength);
    }
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = lerp(2, 4, hoverStrength);
    ctx.setLineDash(item.dash);
    ctx.beginPath();
    ctx.moveTo(x, y + offset - 7);
    ctx.lineTo(x + 20, y + offset - 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssColor("--ink", "#1f2933");
    ctx.font = hoverStrength > 0.5 ? "700 12px Arial" : "12px Arial";
    ctx.fillText(item.label, x + 28, y + offset - 4);
    ctx.restore();
    offset += 18;
  }
}

function getLegendItems(series) {
  const items = [];

  for (const curve of series) {
    items.push({
      curve,
      seriesKey: "level",
      label: curve.name,
      dash: []
    });

    for (const phaseLine of curve.phaseSeries || []) {
      items.push({
        curve,
        seriesKey: phaseLine.id,
        label: `${curve.name} - ${phaseLine.label}`,
        dash: phaseLine.dash
      });
    }
  }

  return items;
}

function getWatermarkText() {
  return String(state.watermarkText || "").trim();
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function getMeasurementLabel() {
  const model = String(state.measurementModel || "").trim();
  return model ? `Measured by ${model}` : "";
}

function drawMeasurementLabel() {
  if (!chartView) return;

  const text = getMeasurementLabel();
  if (!text) return;

  const x = chartView.pad.left + chartView.plotW - 12;
  const y = chartView.pad.top + 18;

  ctx.save();
  ctx.font = "600 11px Inter, 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.shadowColor = state.theme === "dark" ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.9)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = state.theme === "dark" ? "rgba(220, 235, 243, 0.5)" : "rgba(20, 33, 43, 0.42)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawWatermark(options = {}) {
  if (!chartView) return;

  const text = getWatermarkText();
  if (!text) return;

  const x = chartView.pad.left + chartView.plotW - 12;
  const y = chartView.pad.top + chartView.plotH - 12;

  ctx.save();
  ctx.font = "700 32px Inter, 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = state.theme === "dark" ? "rgba(0, 0, 0, 0.5)" : "rgba(20, 33, 43, 0.28)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = state.theme === "dark" ? "rgba(220, 235, 243, 0.34)" : "rgba(20, 33, 43, 0.46)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function buildChartSvg() {
  if (!chartView) return "";

  const { series, x, y, phaseY, pad, plotW, plotH, width, height, minFreq, maxFreq, minDb, maxDb, minPhase, maxPhase, hasPhaseSeries } = chartView;
  const summaryHeight = state.exportDeviationSummary ? EXPORT_SUMMARY_HEIGHT : 0;
  const svgHeight = height + summaryHeight;
  const clipId = `freqdig-clip-${Date.now().toString(36)}`;
  const bgId = `freqdig-bg-${Date.now().toString(36)}`;
  const majorFreqTicks = getMajorFrequencyTicks(minFreq, maxFreq);
  const minorFreqTicks = getMinorFrequencyTicks(minFreq, maxFreq, majorFreqTicks);
  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(width)}" height="${svgNumber(svgHeight)}" viewBox="0 0 ${svgNumber(width)} ${svgNumber(svgHeight)}">`);
  parts.push(`<title>FreqDig chart</title>`);
  parts.push(`<defs>`);
  parts.push(`<linearGradient id="${bgId}" x1="0" y1="${svgNumber(pad.top)}" x2="0" y2="${svgNumber(pad.top + plotH)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="0.58" stop-color="#fbfdfe"/><stop offset="1" stop-color="#f3f8fa"/></linearGradient>`);
  parts.push(`<clipPath id="${clipId}"><rect x="${svgNumber(pad.left)}" y="${svgNumber(pad.top)}" width="${svgNumber(plotW)}" height="${svgNumber(plotH)}"/></clipPath>`);
  parts.push(`</defs>`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(`<rect x="${svgNumber(pad.left)}" y="${svgNumber(pad.top)}" width="${svgNumber(plotW)}" height="${svgNumber(plotH)}" fill="url(#${bgId})"/>`);
  parts.push(buildFrequencyBandSvg(x, pad, plotW, plotH, minFreq, maxFreq));

  for (const freq of minorFreqTicks) {
    const px = x(freq);
    parts.push(svgLine(px, pad.top, px, pad.top + plotH, "#e3ebef", 1));
  }

  for (const freq of majorFreqTicks) {
    const px = x(freq);
    parts.push(svgLine(px, pad.top, px, pad.top + plotH, "#c8d5dd", 1));
    parts.push(svgText(formatFrequencyTick(freq), px - 10, state.showBandIndicator ? pad.top + plotH + BAND_INDICATOR_HEIGHT + 16 : height - 20, { fill: "#657484", size: 12 }));
  }

  parts.push(svgText("频率 (Hz，对数坐标)", pad.left + plotW / 2, height - 6, { fill: "#657484", size: 12, anchor: "middle" }));

  const dbStep = niceDbStep((maxDb - minDb) / 8);
  for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
    const py = y(db);
    parts.push(svgLine(pad.left, py, pad.left + plotW, py, "#c8d5dd", 1));
    parts.push(svgText(String(db), 18, py + 4, { fill: "#657484", size: 12 }));
  }

  if (hasPhaseSeries) {
    const phaseStep = nicePhaseStep((maxPhase - minPhase) / 8);
    for (let phase = Math.ceil(minPhase / phaseStep) * phaseStep; phase <= maxPhase; phase += phaseStep) {
      const py = phaseY(phase);
      parts.push(svgLine(pad.left, py, pad.left + plotW, py, "#f0ddc5", 1));
      parts.push(svgText(`${phase}°`, pad.left + plotW + 8, py + 4, { fill: "#8a5a19", size: 12 }));
    }
    const phaseLabelX = width - 12;
    const phaseLabelY = (phaseY(minPhase) + phaseY(maxPhase)) / 2;
    parts.push(svgText("相位 (°)", phaseLabelX, phaseLabelY, { fill: "#8a5a19", size: 12, anchor: "middle", transform: `rotate(-90 ${svgNumber(phaseLabelX)} ${svgNumber(phaseLabelY)})` }));
  }

  parts.push(`<rect x="${svgNumber(pad.left)}" y="${svgNumber(pad.top)}" width="${svgNumber(plotW)}" height="${svgNumber(plotH)}" fill="none" stroke="#849aa8" stroke-width="1"/>`);
  parts.push(svgLine(pad.left + 1, pad.top + 1, pad.left + plotW - 1, pad.top + 1, "rgba(255, 255, 255, 0.85)", 1));

  if (state.mode !== "raw") {
    parts.push(svgLine(pad.left, y(0), pad.left + plotW, y(0), "#111827", 1, [5, 5]));
  }

  parts.push(`<g clip-path="url(#${clipId})">`);
  for (const curve of series) {
    const path = svgPathForSeries(curve.data, x, y, minFreq, maxFreq, "level");
    if (path) parts.push(svgPath(path, displayCurveColor(curve.color), 2));
  }

  for (const curve of series) {
    for (const phaseLine of curve.phaseSeries || []) {
      const path = svgPathForSeries(phaseLine.data, x, phaseY, minFreq, maxFreq, "phase", true);
      if (path) parts.push(svgPath(path, displayCurveColor(curve.color), 1.8, phaseLine.dash, 0.78));
    }
  }
  parts.push(`</g>`);

  parts.push(buildMeasurementLabelSvg());
  parts.push(buildLegendSvg(series, pad.left + 10, pad.top + 26));
  parts.push(buildBandIndicatorSvg(x, pad, plotW, plotH, minFreq, maxFreq));
  parts.push(buildWatermarkSvg());
  if (state.exportDeviationSummary) parts.push(buildExportSummarySvg(width, height, summaryHeight));
  parts.push(`</svg>`);

  return parts.join("\n");
}

function buildFrequencyBandSvg(x, pad, plotW, plotH, minFreq, maxFreq) {
  if (!state.showBandIndicator) return "";

  const parts = [`<g id="frequency-band-backgrounds">`];
  FREQUENCY_BANDS.forEach((band, index) => {
    const start = Math.max(band.min, minFreq);
    const end = Math.min(band.max, maxFreq);
    if (end <= start) return;

    const left = clamp(x(start), pad.left, pad.left + plotW);
    const right = clamp(x(end), pad.left, pad.left + plotW);
    if (right <= left) return;

    const isHovered = isFrequencyBandActive(band.id);
    const gradientId = `freqdig-band-${index}-${Date.now().toString(36)}`;
    parts.push(`<defs><linearGradient id="${gradientId}" x1="${svgNumber(left)}" y1="0" x2="${svgNumber(right)}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${band.color}" stop-opacity="${isHovered ? "0.055" : "0.018"}"/><stop offset="0.5" stop-color="${band.color}" stop-opacity="${isHovered ? "0.19" : "0.062"}"/><stop offset="1" stop-color="${band.color}" stop-opacity="${isHovered ? "0.055" : "0.018"}"/></linearGradient></defs>`);
    parts.push(`<rect x="${svgNumber(left)}" y="${svgNumber(pad.top)}" width="${svgNumber(right - left)}" height="${svgNumber(plotH)}" fill="url(#${gradientId})"/>`);
    parts.push(`<line x1="${svgNumber(left)}" y1="${svgNumber(pad.top)}" x2="${svgNumber(left)}" y2="${svgNumber(pad.top + plotH)}" stroke="${band.color}" stroke-opacity="${isHovered ? "0.28" : "0.13"}"/>`);
    parts.push(`<line x1="${svgNumber(right)}" y1="${svgNumber(pad.top)}" x2="${svgNumber(right)}" y2="${svgNumber(pad.top + plotH)}" stroke="${band.color}" stroke-opacity="${isHovered ? "0.28" : "0.13"}"/>`);
  });
  parts.push(`</g>`);
  return parts.join("\n");
}

function buildBandIndicatorSvg(x, pad, plotW, plotH, minFreq, maxFreq) {
  if (!state.showBandIndicator) return "";

  const top = pad.top + plotH;
  const parts = [`<g id="frequency-band-labels" font-family="Arial, sans-serif" font-size="11">`];
  for (const band of FREQUENCY_BANDS) {
    const start = Math.max(band.min, minFreq);
    const end = Math.min(band.max, maxFreq);
    if (end <= start) continue;

    const left = clamp(x(start), pad.left, pad.left + plotW);
    const right = clamp(x(end), pad.left, pad.left + plotW);
    const widthPx = right - left;
    if (widthPx < 18) continue;

    const isHovered = isFrequencyBandActive(band.id);
    parts.push(`<rect x="${svgNumber(left)}" y="${svgNumber(top)}" width="${svgNumber(widthPx)}" height="${BAND_INDICATOR_HEIGHT}" rx="5" fill="${isHovered ? "#e8f5f9" : "#ffffff"}" fill-opacity="${isHovered ? "0.96" : "0.88"}" stroke="${isHovered ? "#1d6f91" : "#1f2933"}" stroke-opacity="${isHovered ? "0.42" : "0.16"}"/>`);
    parts.push(svgText(band.label, left + widthPx / 2, top + 15, { fill: isHovered ? "#1d6f91" : "#334155", size: 11, anchor: "middle", weight: isHovered ? "700" : "" }));
  }
  parts.push(`</g>`);
  return parts.join("\n");
}

function svgPathForSeries(data, x, y, minFreq, maxFreq, valueKey, breakOnPhaseWrap = false) {
  const drawData = getDrawablePoints(data, x, y, minFreq, maxFreq, valueKey);
  const commands = [];
  let started = false;
  let previousValue = null;

  for (const point of drawData) {
    const value = point[valueKey];
    if (!Number.isFinite(value)) continue;
    const px = x(point.frequency);
    const py = y(value);
    const wrapped = breakOnPhaseWrap && previousValue !== null && Math.abs(value - previousValue) > 180;
    commands.push(`${!started || wrapped ? "M" : "L"} ${svgNumber(px)} ${svgNumber(py)}`);
    started = true;
    previousValue = value;
  }

  return commands.join(" ");
}

function buildLegendSvg(series, x, y) {
  const parts = [`<g id="legend" font-family="Arial, sans-serif" font-size="12" fill="#1f2933">`];
  let offset = 0;

  for (const item of getLegendItems(series).slice(0, 14)) {
    const lineY = y + offset - 7;
    parts.push(svgLine(x, lineY, x + 20, lineY, displayCurveColor(item.curve.color), 2, item.dash));
    parts.push(svgText(item.label, x + 28, y + offset - 4, { fill: "#1f2933", size: 12 }));
    offset += 18;
  }

  parts.push(`</g>`);
  return parts.join("\n");
}

function buildMeasurementLabelSvg() {
  if (!chartView) return "";

  const text = getMeasurementLabel();
  if (!text) return "";

  const x = chartView.pad.left + chartView.plotW - 12;
  const y = chartView.pad.top + 18;

  return `<text x="${svgNumber(x)}" y="${svgNumber(y)}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="11" font-weight="600" text-anchor="end" dominant-baseline="text-before-edge" fill="#14212b" fill-opacity="0.42">${escapeHtml(text)}</text>`;
}

function buildWatermarkSvg() {
  if (!chartView) return "";

  const text = getWatermarkText();
  if (!text) return "";

  const x = chartView.pad.left + chartView.plotW - 12;
  const y = chartView.pad.top + chartView.plotH - 12;
  const filterId = `freqdig-watermark-shadow-${Date.now().toString(36)}`;

  return [
    `<defs><filter id="${filterId}" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14212b" flood-opacity="0.28"/></filter></defs>`,
    `<g id="watermark">`,
    `<text x="${svgNumber(x)}" y="${svgNumber(y)}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="32" font-weight="700" text-anchor="end" dominant-baseline="text-after-edge" fill="#14212b" fill-opacity="0.46" filter="url(#${filterId})">${escapeHtml(text)}</text>`,
    `</g>`
  ].join("\n");
}

function buildExportSummarySvg(width, y, height) {
  const items = getDeviationSummaryItems();
  const gap = 10;
  const padX = 18;
  const top = y + 10;
  const primaryItems = items.slice(0, 2);
  const bandItems = items.slice(2);
  const primaryCardW = (width - padX * 2 - gap) / 2;
  const bandCardW = Math.max(86, (width - padX * 2 - gap * (bandItems.length - 1)) / bandItems.length);
  const parts = [
    `<g id="export-deviation-summary">`,
    `<rect x="0" y="${svgNumber(y)}" width="${svgNumber(width)}" height="${svgNumber(height)}" fill="#f7fbfc"/>`,
    svgText("偏差概要", padX, y + 21, { fill: "#203542", size: 12, weight: "700" })
  ];

  primaryItems.forEach((item, index) => {
    parts.push(buildExportSummaryCardSvg(item, padX + index * (primaryCardW + gap), top + 18, primaryCardW));
  });
  bandItems.forEach((item, index) => {
    parts.push(buildExportSummaryCardSvg(item, padX + index * (bandCardW + gap), top + 58, bandCardW));
  });

  parts.push(`</g>`);
  return parts.join("\n");
}

function buildExportSummaryCardSvg(item, x, y, width) {
  return [
    `<rect x="${svgNumber(x)}" y="${svgNumber(y)}" width="${svgNumber(width)}" height="34" rx="6" fill="#ffffff" stroke="#d7e0e6"/>`,
    svgText(item.label, x + 10, y + 14, { fill: "#657484", size: 10 }),
    svgText(item.value, x + 10, y + 29, { fill: "#14212b", size: 12, weight: "700" })
  ].join("\n");
}
// --- Curve list UI helpers ---
function formatOffset(value) {
  const rounded = Number(value).toFixed(1);
  return `${value > 0 ? "+" : ""}${rounded} dB`;
}

function selectedSmoothing(curve, value) {
  return Math.abs((curve.smoothingOctaves || 0) - value) < 0.0001 ? " selected" : "";
}

function eyeIcon(visible) {
  if (!visible) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3l18 18"></path>
        <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"></path>
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 8.5 4.2 10 8a16.4 16.4 0 0 1-2.1 3.6"></path>
        <path d="M6.4 6.4A15.5 15.5 0 0 0 2 12c1.5 3.8 5 8 10 8a10.8 10.8 0 0 0 5.6-1.6"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

function trashIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v5"></path>
      <path d="M14 11v5"></path>
    </svg>
  `;
}

function clearCurveCaches(curve) {
  if (!curve) return;
  curve.smoothingCache = null;
  curve.displayCache = null;
  curve.minimumPhaseCache = null;
  curve.phaseMarginCache = null;
}

// --- Curve operations ---
function setGlobalSmoothing(enabled) {
  state.globalSmoothing = enabled;
  const octaves = enabled ? GLOBAL_SMOOTHING_OCTAVES : 0;

  for (const curve of state.curves) {
    curve.smoothingOctaves = octaves;
    clearCurveCaches(curve);
  }

  if (state.target) {
    state.target.smoothingOctaves = octaves;
    clearCurveCaches(state.target);
  }

  render();
}

function deleteCurve(id) {
  const curve = state.curves.find((item) => item.id === id);
  clearCurveCaches(curve);
  state.curves = state.curves.filter((curve) => curve.id !== id);

  if (state.referenceId === id) {
    state.referenceId = state.curves[0]?.id || null;
    if (!state.referenceId && state.mode === "reference") {
      state.mode = "raw";
    }
  }

  render();
}

function spreadVisibleCurves() {
  const visibleCurves = state.curves.filter((curve) => curve.visible);
  const stepDb = 6;

  visibleCurves.forEach((curve, index) => {
    curve.offsetDb = (index - (visibleCurves.length - 1) / 2) * stepDb;
  });

  render();
}

function alignCurvesAtFrequency(frequency) {
  for (const curve of state.curves) {
    const levelAtFrequency = interpolate(alignmentData(curve), frequency);
    if (levelAtFrequency !== null) {
      curve.offsetDb = -levelAtFrequency;
    }
  }

  if (state.alignTarget && state.target) {
    const targetLevelAtFrequency = interpolate(targetAlignmentData(state.target), frequency);
    if (targetLevelAtFrequency !== null) {
      state.target.offsetDb = -targetLevelAtFrequency;
    }
  }

  render();
}

function normalizeCurvesAt1k() {
  alignCurvesAtFrequency(1000);
}

// --- Project persistence ---
function serializeCurve(curve) {
  return {
    id: curve.id,
    name: curve.name,
    data: curve.data,
    color: curve.color,
    visible: curve.visible,
    offsetDb: curve.offsetDb || 0,
    smoothingOctaves: curve.smoothingOctaves || 0,
    hasPhase: Boolean(curve.hasPhase),
    showPhase: Boolean(curve.showPhase),
    minimumPhase: Boolean(curve.minimumPhase),
    phaseMargin: Boolean(curve.phaseMargin)
  };
}

function hydrateCurve(curve, fallbackName) {
  const data = Array.isArray(curve.data) ? curve.data
    .map((point) => {
      const hydrated = { frequency: Number(point.frequency), level: Number(point.level) };
      const phase = Number(point.phase);
      if (Number.isFinite(phase)) hydrated.phase = phase;
      return hydrated;
    })
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.level) && point.frequency > 0)
    .sort((a, b) => a.frequency - b.frequency) : [];

  const hasPhase = dataHasPhase(data);

  return {
    id: curve.id || makeId(),
    name: curve.name || fallbackName,
    data,
    color: normalizeColor(curve.color) || nextCurveColor(),
    visible: curve.visible !== false,
    offsetDb: Number(curve.offsetDb) || 0,
    smoothingOctaves: Number(curve.smoothingOctaves) || 0,
    hasPhase,
    showPhase: hasPhase && (curve.showPhase !== undefined ? Boolean(curve.showPhase) : true),
    minimumPhase: hasPhase && Boolean(curve.minimumPhase),
    phaseMargin: hasPhase && Boolean(curve.phaseMargin),
    smoothingCache: null,
    displayCache: null
  };
}

function saveProjectFile() {
  const project = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      mode: state.mode,
      referenceId: state.referenceId,
      tiltDbPerOct: state.tiltDbPerOct,
      applyTiltToCurves: state.applyTiltToCurves,
      applyTiltToTarget: state.applyTiltToTarget,
      alignTarget: state.alignTarget,
      axisMinFreq: state.axisMinFreq,
      axisMaxFreq: state.axisMaxFreq,
      axisFreqStepOctaves: state.axisFreqStepOctaves,
      axisMinDb: state.axisMinDb,
      axisMaxDb: state.axisMaxDb,
      axisDbStep: state.axisDbStep,
      showBandIndicator: state.showBandIndicator,
      globalSmoothing: state.globalSmoothing,
      exportDeviationSummary: state.exportDeviationSummary,
      watermarkText: state.watermarkText,
      measurementModel: state.measurementModel,
      easterEggTriggerProbability: state.easterEggTriggerProbability,
      easterEggBurstProbability: state.easterEggBurstProbability,
      theme: state.theme
    },
    curves: state.curves.map(serializeCurve),
    target: state.target ? serializeCurve(state.target) : null
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.download = "freqdig-project.json";
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadProjectFile(file) {
  const project = JSON.parse(await file.text());
  const loadedState = project.state || {};

  state.curves.forEach(clearCurveCaches);
  clearCurveCaches(state.target);
  state.curves = (project.curves || [])
    .map((curve, index) => hydrateCurve(curve, `曲线 ${index + 1}`))
    .filter((curve) => curve.data.length);
  state.target = project.target ? hydrateCurve(project.target, "目标曲线") : null;
  state.mode = ["raw", "reference", "target"].includes(loadedState.mode) ? loadedState.mode : "raw";
  state.referenceId = loadedState.referenceId || state.curves[0]?.id || null;
  state.tiltDbPerOct = Number(loadedState.tiltDbPerOct) || 0;
  state.applyTiltToCurves = loadedState.applyTiltToCurves !== false;
  state.applyTiltToTarget = Boolean(loadedState.applyTiltToTarget);
  state.alignTarget = Boolean(loadedState.alignTarget);
  state.axisMinFreq = positiveNumber(loadedState.axisMinFreq, MIN_FREQ);
  state.axisMaxFreq = positiveNumber(loadedState.axisMaxFreq, MAX_FREQ);
  state.axisFreqStepOctaves = optionalNumber(loadedState.axisFreqStepOctaves);
  state.axisMinDb = optionalNumber(loadedState.axisMinDb);
  state.axisMaxDb = optionalNumber(loadedState.axisMaxDb);
  state.axisDbStep = optionalNumber(loadedState.axisDbStep);
  state.showBandIndicator = Boolean(loadedState.showBandIndicator);
  state.globalSmoothing = Boolean(loadedState.globalSmoothing);
  state.exportDeviationSummary = Boolean(loadedState.exportDeviationSummary);
  state.watermarkText = typeof loadedState.watermarkText === "string" ? loadedState.watermarkText : DEFAULT_USER_SETTINGS.watermarkText;
  state.measurementModel = typeof loadedState.measurementModel === "string" ? loadedState.measurementModel : DEFAULT_USER_SETTINGS.measurementModel;
  state.easterEggTriggerProbability = clampProbability(loadedState.easterEggTriggerProbability, state.easterEggTriggerProbability);
  state.easterEggBurstProbability = clampProbability(loadedState.easterEggBurstProbability, state.easterEggBurstProbability);
  setTheme(loadedState.theme || state.theme, { persist: false, redraw: false });
  if (state.globalSmoothing) {
    for (const curve of state.curves) curve.smoothingOctaves = GLOBAL_SMOOTHING_OCTAVES;
    if (state.target) state.target.smoothingOctaves = GLOBAL_SMOOTHING_OCTAVES;
  }

  if (!state.curves.some((curve) => curve.id === state.referenceId)) {
    state.referenceId = state.curves[0]?.id || null;
  }
  if (state.mode === "reference" && !state.referenceId) state.mode = "raw";
  if (state.mode === "target" && !state.target) state.mode = "raw";

  tiltInput.value = Number(state.tiltDbPerOct.toFixed(1));
  hideTooltip();
  render();
}

// --- Sidebar and summary rendering ---
function renderCurveList() {
  curveList.innerHTML = "";

  for (const curve of state.curves) {
    const phaseDisabled = curve.hasPhase ? "" : "disabled";
    const item = document.createElement("div");
    item.className = "curve-item";
    item.innerHTML = `
      <span class="swatch" style="background:${displayCurveColor(curve.color)}"></span>
      <input class="curve-name-input" value="${escapeHtml(curve.name)}" title="${escapeHtml(curve.name)}" aria-label="曲线名称">
      <button class="icon-button visibility-button${curve.visible ? "" : " is-off"}" title="${curve.visible ? "隐藏曲线" : "显示曲线"}" aria-label="${curve.visible ? "隐藏曲线" : "显示曲线"}">${eyeIcon(curve.visible)}</button>
      <button class="icon-button danger-button" title="删除曲线" aria-label="删除曲线">${trashIcon()}</button>
      <div class="curve-meta">${curve.data.length} 个点</div>
      <div class="curve-options">
        <label class="compact-color" title="曲线颜色">
          <span>颜色</span>
          <input type="color" value="${curve.color}" aria-label="曲线颜色">
        </label>
        <label class="compact-select">
          <span>平滑</span>
          <select aria-label="平滑">
            <option value="0"${selectedSmoothing(curve, 0)}>关闭</option>
            <option value="1"${selectedSmoothing(curve, 1)}>1/1 倍频程</option>
            <option value="0.5"${selectedSmoothing(curve, 0.5)}>1/2 倍频程</option>
            <option value="0.3333333333"${selectedSmoothing(curve, 1 / 3)}>1/3 倍频程</option>
            <option value="0.1666666667"${selectedSmoothing(curve, 1 / 6)}>1/6 倍频程</option>
            <option value="0.0833333333"${selectedSmoothing(curve, 1 / 12)}>1/12 倍频程</option>
            <option value="0.0416666667"${selectedSmoothing(curve, 1 / 24)}>1/24 倍频程</option>
            <option value="0.0208333333"${selectedSmoothing(curve, 1 / 48)}>1/48 倍频程</option>
          </select>
        </label>
        <label class="compact-check" title="显示或隐藏相位曲线">
          <input type="checkbox" data-control="show-phase" ${curve.showPhase ? "checked" : ""} ${phaseDisabled}>
          <span>相位</span>
        </label>
        <label class="compact-check" title="由幅频曲线估算最小相位">
          <input type="checkbox" data-control="minimum-phase" ${curve.minimumPhase ? "checked" : ""} ${phaseDisabled}>
          <span>最小相位</span>
        </label>
        <label class="compact-check" title="显示原始相位与最小相位的差值">
          <input type="checkbox" data-control="phase-margin" ${curve.phaseMargin ? "checked" : ""} ${phaseDisabled}>
          <span>相位裕度</span>
        </label>
      </div>
      <div class="curve-offset">
        <input type="range" min="-200" max="200" step="0.5" value="${curve.offsetDb || 0}" aria-label="纵向偏移">
        <span class="offset-value">${formatOffset(curve.offsetDb || 0)}</span>
      </div>
    `;
    const buttons = item.querySelectorAll("button");
    const nameInput = item.querySelector(".curve-name-input");
    const colorInput = item.querySelector("input[type='color']");
    const smoothingSelect = item.querySelector("select");
    const showPhaseInput = item.querySelector("[data-control='show-phase']");
    const minimumPhaseInput = item.querySelector("[data-control='minimum-phase']");
    const phaseMarginInput = item.querySelector("[data-control='phase-margin']");
    const offsetSlider = item.querySelector("input[type='range']");
    const offsetValue = item.querySelector(".offset-value");

    buttons[0].addEventListener("click", () => {
      curve.visible = !curve.visible;
      render();
    });

    buttons[1].addEventListener("click", () => {
      deleteCurve(curve.id);
    });

    nameInput.addEventListener("input", (event) => {
      curve.name = event.target.value.trim() || "未命名曲线";
      nameInput.title = curve.name;
      renderControls();
      renderTitle();
      drawChart();
    });

    colorInput.addEventListener("input", (event) => {
      curve.color = event.target.value;
      item.querySelector(".swatch").style.background = displayCurveColor(curve.color);
      updateChartSeriesColor(curve.id, curve.color);
      scheduleLightweightDraw();
    });

    smoothingSelect.addEventListener("change", (event) => {
      curve.smoothingOctaves = Number(event.target.value);
      clearCurveCaches(curve);
      renderMetrics();
      drawChart();
    });

    showPhaseInput.addEventListener("change", (event) => {
      if (!curve.hasPhase) return;
      curve.showPhase = event.target.checked;
      hideTooltip();
      drawChart();
    });

    minimumPhaseInput.addEventListener("change", (event) => {
      if (!curve.hasPhase) return;
      curve.minimumPhase = event.target.checked;
      hideTooltip();
      drawChart();
    });

    phaseMarginInput.addEventListener("change", (event) => {
      if (!curve.hasPhase) return;
      curve.phaseMargin = event.target.checked;
      hideTooltip();
      drawChart();
    });

    offsetSlider.addEventListener("input", (event) => {
      curve.offsetDb = Number(event.target.value);
      offsetValue.textContent = formatOffset(curve.offsetDb);
      renderTitle();
      renderMetrics();
      drawChart();
    });

    curveList.appendChild(item);
  }

  if (state.target) {
    const targetPhaseDisabled = state.target.hasPhase ? "" : "disabled";
    const target = document.createElement("div");
    target.className = "curve-item";
    target.innerHTML = `
      <span class="swatch" style="background:${displayCurveColor(state.target.color)}"></span>
      <input class="curve-name-input" value="${escapeHtml(state.target.name)}" title="${escapeHtml(state.target.name)}" aria-label="目标曲线名称">
      <button class="icon-button danger-button" title="移除目标曲线" aria-label="移除目标曲线">${trashIcon()}</button>
      <div class="curve-meta">${state.target.data.length} 个点</div>
      <div class="curve-options target-options">
        <label class="compact-color" title="目标曲线颜色">
          <span>颜色</span>
          <input type="color" value="${state.target.color}" aria-label="目标曲线颜色">
        </label>
        <label class="compact-check" title="显示或隐藏相位曲线">
          <input type="checkbox" data-control="show-phase" ${state.target.showPhase ? "checked" : ""} ${targetPhaseDisabled}>
          <span>相位</span>
        </label>
        <label class="compact-check" title="由幅频曲线估算最小相位">
          <input type="checkbox" data-control="minimum-phase" ${state.target.minimumPhase ? "checked" : ""} ${targetPhaseDisabled}>
          <span>最小相位</span>
        </label>
        <label class="compact-check" title="显示原始相位与最小相位的差值">
          <input type="checkbox" data-control="phase-margin" ${state.target.phaseMargin ? "checked" : ""} ${targetPhaseDisabled}>
          <span>相位裕度</span>
        </label>
      </div>
    `;
    const targetRemoveButton = target.querySelector("button");
    const targetVisibilityButton = document.createElement("button");
    targetVisibilityButton.className = `icon-button visibility-button${state.target.visible ? "" : " is-off"}`;
    targetVisibilityButton.title = state.target.visible ? "Hide target curve" : "Show target curve";
    targetVisibilityButton.setAttribute("aria-label", targetVisibilityButton.title);
    targetVisibilityButton.innerHTML = eyeIcon(state.target.visible);
    target.insertBefore(targetVisibilityButton, targetRemoveButton);

    targetVisibilityButton.addEventListener("click", () => {
      state.target.visible = !state.target.visible;
      render();
    });

    targetRemoveButton.addEventListener("click", () => {
      clearCurveCaches(state.target);
      state.target = null;
      state.applyTiltToTarget = false;
      state.alignTarget = false;
      if (state.mode === "target") state.mode = "raw";
      render();
    });

    target.querySelector(".curve-name-input").addEventListener("input", (event) => {
      state.target.name = event.target.value.trim() || "目标曲线";
      event.target.title = state.target.name;
      drawChart();
    });

    target.querySelector("input[type='color']").addEventListener("input", (event) => {
      state.target.color = event.target.value;
      target.querySelector(".swatch").style.background = displayCurveColor(state.target.color);
      updateChartSeriesColor(state.target.id, state.target.color);
      scheduleLightweightDraw();
    });

    target.querySelector("[data-control='show-phase']").addEventListener("change", (event) => {
      if (!state.target.hasPhase) return;
      state.target.showPhase = event.target.checked;
      hideTooltip();
      drawChart();
    });

    target.querySelector("[data-control='minimum-phase']").addEventListener("change", (event) => {
      if (!state.target.hasPhase) return;
      state.target.minimumPhase = event.target.checked;
      hideTooltip();
      drawChart();
    });

    target.querySelector("[data-control='phase-margin']").addEventListener("change", (event) => {
      if (!state.target.hasPhase) return;
      state.target.phaseMargin = event.target.checked;
      hideTooltip();
      drawChart();
    });

    curveList.appendChild(target);
  }
}

function renderControls() {
  mode.value = state.mode;
  curveTilt.checked = state.applyTiltToCurves;
  targetTilt.checked = state.applyTiltToTarget;
  alignTarget.checked = state.alignTarget;
  bandIndicator.checked = state.showBandIndicator;
  exportDeviationSummary.checked = state.exportDeviationSummary;
  globalSmoothing.classList.toggle("is-active", state.globalSmoothing);
  globalSmoothing.setAttribute("aria-pressed", String(state.globalSmoothing));
  targetTilt.disabled = !state.target;
  alignTarget.disabled = !state.target;
  reference.innerHTML = "";

  for (const curve of state.curves) {
    const option = document.createElement("option");
    option.value = curve.id;
    option.textContent = `基准：${curve.name}`;
    reference.appendChild(option);
  }

  reference.value = state.referenceId || "";
  reference.disabled = state.curves.length < 2 || state.mode !== "reference";

  if (state.mode === "target" && !state.target) {
    state.mode = "raw";
    mode.value = "raw";
  }
}

function averageAbs(data, min, max) {
  let sum = 0;
  let count = 0;

  for (const point of data) {
    if (point.frequency < min || point.frequency > max) continue;
    sum += Math.abs(point.level);
    count++;
  }

  return count ? sum / count : null;
}

function getDeviationSummary() {
  const baselineMode = state.mode !== "raw";
  const empty = { avg: null, max: null, subBass: null, bass: null, mid: null, highMid: null, high: null };

  if (!baselineMode) {
    return empty;
  }

  const bands = [
    { key: "subBass", min: 20, max: 80, sum: 0, count: 0 },
    { key: "bass", min: 80, max: 300, sum: 0, count: 0 },
    { key: "mid", min: 300, max: 2000, sum: 0, count: 0 },
    { key: "highMid", min: 2000, max: 6000, sum: 0, count: 0 },
    { key: "high", min: 6000, max: 20000, sum: 0, count: 0 }
  ];
  let totalAbs = 0;
  let totalCount = 0;
  let maxAbs = 0;

  for (const curve of getVisibleSeries()) {
    for (const point of curve.data) {
      const value = Math.abs(point.level);
      totalAbs += value;
      totalCount++;
      if (value > maxAbs) maxAbs = value;

      for (const band of bands) {
        if (point.frequency >= band.min && point.frequency <= band.max) {
          band.sum += value;
          band.count++;
        }
      }
    }
  }

  if (!totalCount) return empty;

  return bands.reduce((summary, band) => {
    summary[band.key] = band.count ? band.sum / band.count : null;
    return summary;
  }, { ...empty, avg: totalAbs / totalCount, max: maxAbs });
}

function formatDeviationValue(value) {
  return value === null ? "-" : `${value.toFixed(1)} dB`;
}

function getDeviationSummaryItems() {
  const summary = getDeviationSummary();
  return [
    { label: "平均绝对偏差", value: formatDeviationValue(summary.avg) },
    { label: "最大绝对偏差", value: formatDeviationValue(summary.max) },
    { label: "超低频 20-80 Hz", value: formatDeviationValue(summary.subBass) },
    { label: "低频 80-300 Hz", value: formatDeviationValue(summary.bass) },
    { label: "中频 300-2000 Hz", value: formatDeviationValue(summary.mid) },
    { label: "中高频 2k-6k Hz", value: formatDeviationValue(summary.highMid) },
    { label: "高频 6k-20k Hz", value: formatDeviationValue(summary.high) }
  ];
}

function renderMetrics() {
  const summary = getDeviationSummary();
  document.getElementById("avgDeviation").textContent = formatDeviationValue(summary.avg);
  document.getElementById("maxDeviation").textContent = formatDeviationValue(summary.max);
  document.getElementById("subBassDeviation").textContent = formatDeviationValue(summary.subBass);
  document.getElementById("bassDeviation").textContent = formatDeviationValue(summary.bass);
  document.getElementById("midDeviation").textContent = formatDeviationValue(summary.mid);
  document.getElementById("highMidDeviation").textContent = formatDeviationValue(summary.highMid);
  document.getElementById("highDeviation").textContent = formatDeviationValue(summary.high);
}

function setupMetricAnimation() {
  if (!metricAnimationStage || metricAnimationController) return;
  metricAnimationController = new MetricAnimationController({
    stage: metricAnimationStage,
    enabled: state.mineCartAnimationEnabled
  });
  metricAnimationController.start();
}

function setMineCartAnimationEnabled(enabled) {
  state.mineCartAnimationEnabled = Boolean(enabled);
  if (!metricAnimationController) setupMetricAnimation();
  metricAnimationController?.setEnabled(state.mineCartAnimationEnabled);
}

function renderTitle() {
  const titles = {
    raw: "原始曲线",
    reference: "相对基准差异",
    target: "相对目标偏差"
  };

  document.getElementById("chartTitle").textContent = titles[state.mode];
  const { minFreq, maxFreq } = getFrequencyRange();
  const rangeText = `${formatFrequency(minFreq)} - ${formatFrequency(maxFreq)}`;
  const subtitle = state.mode === "raw"
    ? `${rangeText} / dB SPL`
    : `${rangeText} / dB 差异`;
  const tiltedParts = [];
  if (state.tiltDbPerOct && state.applyTiltToCurves) tiltedParts.push("导入曲线已应用斜率");
  if (state.tiltDbPerOct && state.target && state.applyTiltToTarget) tiltedParts.push("目标曲线已应用斜率");
  const tilt = state.tiltDbPerOct ? ` / 斜率 ${state.tiltDbPerOct.toFixed(1)} dB/oct` : "";
  const tiltTargets = tiltedParts.length ? ` / ${tiltedParts.join(", ")}` : "";
  document.getElementById("chartSubtitle").textContent = `${subtitle}${tilt}${tiltTargets}`;
}

function render() {
  renderControls();
  renderCurveList();
  renderTitle();
  renderMetrics();
  drawChart();
}

// --- File input, drag/drop, and control events ---
curveFiles.addEventListener("change", async (event) => {
  try {
    await readFiles(event.target.files);
  } finally {
    curveFiles.value = "";
  }
});

targetFile.addEventListener("change", async (event) => {
  try {
    await readFiles(event.target.files, true);
  } finally {
    targetFile.value = "";
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  canvasWrap.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    canvasWrap.classList.add("is-drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  canvasWrap.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "dragleave" && canvasWrap.contains(event.relatedTarget)) return;
    canvasWrap.classList.remove("is-drag-over");
  });
});

canvasWrap.addEventListener("drop", (event) => {
  importDroppedCurveFiles(event.dataTransfer.files);
});

projectFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    await loadProjectFile(file);
  } catch (error) {
    alert("工程文件加载失败，请确认 JSON 文件格式正确。");
    console.error(error);
  } finally {
    projectFile.value = "";
  }
});

saveProject.addEventListener("click", saveProjectFile);

tiltInput.addEventListener("input", (event) => {
  setTilt(event.target.value);
});

tiltDown.addEventListener("click", () => stepTilt(-0.1));
tiltUp.addEventListener("click", () => stepTilt(0.1));

document.querySelectorAll("[data-tilt]").forEach((button) => {
  button.addEventListener("click", () => setTilt(button.dataset.tilt));
});

function updateXRangeFromSliders(activeSlider) {
  let minValue = Number(xMinSlider.value);
  let maxValue = Number(xMaxSlider.value);
  const minGap = Math.ceil((MIN_X_SPAN_OCTAVES / Math.log2(MAX_FREQ / MIN_FREQ)) * X_SLIDER_STEPS);

  if (maxValue - minValue < minGap) {
    if (activeSlider === xMinSlider) {
      minValue = Math.max(0, maxValue - minGap);
      xMinSlider.value = String(minValue);
    } else {
      maxValue = Math.min(X_SLIDER_STEPS, minValue + minGap);
      xMaxSlider.value = String(maxValue);
    }
  }
  if (maxValue - minValue < minGap) {
    if (minValue === 0) {
      maxValue = minGap;
      xMaxSlider.value = String(maxValue);
    } else {
      minValue = X_SLIDER_STEPS - minGap;
      xMinSlider.value = String(minValue);
    }
  }

  const minFreq = frequencyFromSliderValue(minValue);
  const maxFreq = frequencyFromSliderValue(maxValue);
  state.axisMinFreq = minFreq;
  state.axisMaxFreq = maxFreq;
  updateXRangeTrack();
  showZoomTip(xZoomTip, `${formatFrequency(minFreq)} - ${formatFrequency(maxFreq)}`);
  hideTooltip();
  renderTitle();
  drawChart();
}

function updateYZoomFromSlider() {
  const value = 1 - Number(yZoomSlider.value) / 100;
  const currentMin = chartView?.minDb ?? state.axisMinDb ?? -10;
  const currentMax = chartView?.maxDb ?? state.axisMaxDb ?? 10;
  const center = (currentMin + currentMax) / 2;
  const span = MIN_Y_SPAN_DB + (MAX_Y_SPAN_DB - MIN_Y_SPAN_DB) * (value ** 2);
  setDbRange(center, span);
  showZoomTip(yZoomTip, `${span.toFixed(1)} dB range`);
  hideTooltip();
  renderTitle();
  drawChart();
}

xMinSlider.addEventListener("input", () => updateXRangeFromSliders(xMinSlider));
xMaxSlider.addEventListener("input", () => updateXRangeFromSliders(xMaxSlider));
yZoomSlider.addEventListener("input", updateYZoomFromSlider);
zoomControlsToggle.addEventListener("click", () => {
  setZoomControlsVisible(!zoomControlsVisible);
});

resetAxisView.addEventListener("click", () => {
  resetAxisSettings();
  hideTooltip();
  renderTitle();
  drawChart();
});

globalSmoothing.addEventListener("click", () => {
  setGlobalSmoothing(!state.globalSmoothing);
});

bandRangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const [minFreq, maxFreq] = button.dataset.bandRange.split(",").map(Number);
    state.axisMinFreq = minFreq;
    state.axisMaxFreq = maxFreq;
    hideTooltip();
    renderTitle();
    drawChart();
  });
});

targetTilt.addEventListener("change", (event) => {
  state.applyTiltToTarget = event.target.checked;
  render();
});

alignTarget.addEventListener("change", (event) => {
  state.alignTarget = event.target.checked;
  render();
});

bandIndicator.addEventListener("change", (event) => {
  state.showBandIndicator = event.target.checked;
  hoveredFrequencyBand = null;
  if (!state.showBandIndicator) lockedFrequencyBands.clear();
  drawChart();
});

exportDeviationSummary.addEventListener("change", (event) => {
  state.exportDeviationSummary = event.target.checked;
});

curveTilt.addEventListener("change", (event) => {
  state.applyTiltToCurves = event.target.checked;
  render();
});

spreadCurves.addEventListener("click", spreadVisibleCurves);
normalizeCurves.addEventListener("click", normalizeCurvesAt1k);
alignCurves.addEventListener("click", () => {
  alignCurvesAtFrequency(Number(alignFrequency.value));
});

mode.addEventListener("change", (event) => {
  state.mode = event.target.value;
  render();
});

reference.addEventListener("change", (event) => {
  state.referenceId = event.target.value;
  render();
});

document.getElementById("loadDemo").addEventListener("click", () => {
  state.curves = getDemoCurves().map((curve) => makeCurve(curve.name, curve.data));
  const target = getDemoTarget();
  state.target = {
    ...makeCurve(target.name, target.data),
    id: "target",
    hasPhase: false,
    showPhase: false,
    minimumPhase: false,
    phaseMargin: false
  };
  state.referenceId = state.curves[0].id;
  state.mode = "raw";
  render();
});

document.getElementById("exportPng").addEventListener("click", () => {
  exportPng({ transparent: false });
});

document.getElementById("exportTransparentPng").addEventListener("click", () => {
  exportPng({ transparent: true });
});

document.getElementById("exportSvg").addEventListener("click", () => {
  if (!chartView) drawChart();
  if (!chartView) return;
  downloadTextFile(buildChartSvg(), "freqdig.svg", "image/svg+xml;charset=utf-8");
});

// Export routes intentionally redraw the visible canvas, so PNG exports match current zoom,
// active overlays, curve visibility, and high-DPI backing resolution.
function exportPng(options = {}) {
  const transparent = options.transparent === true;
  const previousTransparentMode = transparentExportMode;

  try {
    transparentExportMode = transparent;
    if (transparent) drawChart();

    const link = document.createElement("a");
    link.download = transparent ? "freqdig-transparent.png" : "freqdig.png";
    link.href = getExportPngDataUrl(transparent);
    link.click();
  } finally {
    transparentExportMode = previousTransparentMode;
    drawChart();
  }
}

function getExportPngDataUrl(transparent) {
  return buildExportPngDataUrl({
    canvas,
    transparent,
    state,
    chartView,
    getCanvasDpr,
    getDeviationSummaryItems,
    frequencyBands: FREQUENCY_BANDS,
    bandIndicatorHeight: BAND_INDICATOR_HEIGHT,
    isFrequencyBandActive
  });
}

function revealAppSettingsButton() {
  appSettingsToggle.hidden = false;
  appSettingsToggle.classList.add("is-visible");
  appSettingsToggle.focus();
}

function setTheme(value, options = {}) {
  const theme = normalizeTheme(value);
  const persist = options.persist !== false;
  const redraw = options.redraw !== false;
  state.theme = theme;
  document.body.dataset.theme = theme;
  cssColorCache.clear();
  themeToggle.classList.toggle("is-dark", theme === "dark");
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.title = theme === "dark" ? "切换亮色模式" : "切换暗色模式";
  themeToggle.setAttribute("aria-label", themeToggle.title);
  if (themeSetting) themeSetting.checked = theme === "dark";
  if (persist) saveUserSettings(state);
  if (redraw) {
    renderCurveList();
    drawChart();
  }
}

function toggleTheme() {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  if (nextTheme === "dark") {
    playDarkThemeTransition(() => setTheme("dark"));
    return;
  }
  setTheme("light");
}

function playDarkThemeTransition(onRevealComplete) {
  const rect = themeToggle.getBoundingClientRect();
  const originX = `${rect.left + rect.width / 2}px`;
  const originY = `${rect.top + rect.height / 2}px`;
  document.body.style.setProperty("--theme-origin-x", originX);
  document.body.style.setProperty("--theme-origin-y", originY);

  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll("script").forEach((script) => script.remove());
  clone.querySelectorAll(".theme-wipe-overlay").forEach((node) => node.remove());
  clone.querySelector("body")?.setAttribute("data-theme", "dark");
  clone.querySelector("body")?.classList.add("theme-scene-enter");

  const overlay = document.createElement("iframe");
  overlay.className = "theme-wipe-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.tabIndex = -1;
  document.body.appendChild(overlay);
  overlay.contentDocument.open();
  overlay.contentDocument.write(`<!DOCTYPE html>${clone.outerHTML}`);
  overlay.contentDocument.close();

  document.body.classList.remove("theme-scene-enter");

  window.clearTimeout(themeTransitionTimer);
  window.setTimeout(() => {
    onRevealComplete?.();
    document.body.classList.add("theme-scene-enter");
  }, 760);
  themeTransitionTimer = window.setTimeout(() => {
    overlay.remove();
    document.body.classList.remove("theme-scene-enter");
  }, 1680);
}

function openAppSettings() {
  syncAppSettingsForm();
  appSettingsPanel.hidden = false;
  appSettingsToggle.classList.add("is-active");
  watermarkSetting.focus();
}

function closeAppSettings() {
  appSettingsPanel.hidden = true;
  appSettingsToggle.classList.remove("is-active");
}

function syncAppSettingsForm() {
  watermarkSetting.value = state.watermarkText || "";
  measurementSetting.value = state.measurementModel || "";
  easterTriggerSetting.value = String(Math.round(state.easterEggTriggerProbability * 100));
  easterBurstSetting.value = String(Math.round(state.easterEggBurstProbability * 100));
  mineCartAnimationSetting.checked = state.mineCartAnimationEnabled;
  themeSetting.checked = state.theme === "dark";
}

function applyAppSettingsFromForm() {
  state.watermarkText = watermarkSetting.value.trim();
  state.measurementModel = measurementSetting.value.trim();
  state.easterEggTriggerProbability = clampProbability(Number(easterTriggerSetting.value) / 100, state.easterEggTriggerProbability);
  state.easterEggBurstProbability = clampProbability(Number(easterBurstSetting.value) / 100, state.easterEggBurstProbability);
  state.theme = themeSetting.checked ? "dark" : "light";
  setTheme(state.theme, { persist: false, redraw: false });
  setMineCartAnimationEnabled(mineCartAnimationSetting.checked);
  saveUserSettings(state);
  cleanupCatAvatarEasterEgg();
  closeAppSettings();
  drawChart();
}

// --- Pan and zoom interactions ---
function panChart(deltaX, deltaY) {
  if (!chartView) return;

  const { minFreq, maxFreq, minDb, maxDb, plotW, plotH } = chartView;
  const minLog = Math.log2(minFreq);
  const maxLog = Math.log2(maxFreq);
  const xSpan = maxLog - minLog;
  const ySpan = maxDb - minDb;

  if (deltaX) {
    setFrequencyRangeFromLog((minLog + maxLog) / 2 - (deltaX / plotW) * xSpan, xSpan);
  }
  if (deltaY) {
    setDbRange((minDb + maxDb) / 2 + (deltaY / plotH) * ySpan, ySpan);
  }
  hideTooltip();
  renderTitle();
  drawChart();
}

function zoomChart(factor, mouseX, mouseY) {
  if (!chartView) return;

  const { pad, plotW, plotH, minFreq, maxFreq, minDb, maxDb } = chartView;
  const xRatio = clamp((mouseX - pad.left) / plotW, 0, 1);
  const yRatio = clamp((mouseY - pad.top) / plotH, 0, 1);
  const minLog = Math.log2(minFreq);
  const maxLog = Math.log2(maxFreq);
  const xSpan = maxLog - minLog;
  const ySpan = maxDb - minDb;
  const focalLog = minLog + xRatio * xSpan;
  const focalDb = maxDb - yRatio * ySpan;
  const nextXSpan = xSpan * factor;
  const nextYSpan = clamp(ySpan * factor, MIN_Y_SPAN_DB, MAX_Y_SPAN_DB);
  const nextMinLog = focalLog - xRatio * nextXSpan;
  const nextMaxLog = nextMinLog + nextXSpan;
  const nextMinDb = focalDb - (1 - yRatio) * nextYSpan;
  const nextMaxDb = nextMinDb + nextYSpan;

  setFrequencyRangeFromLog((nextMinLog + nextMaxLog) / 2, nextXSpan);
  state.axisMinDb = nextMinDb;
  state.axisMaxDb = nextMaxDb;
  hideTooltip();
  renderTitle();
  drawChart();
}

canvas.addEventListener("wheel", (event) => {
  if (!chartView) return;
  event.preventDefault();

  if (event.shiftKey) {
    panChart(event.deltaY, 0);
    return;
  }

  if (event.ctrlKey) {
    panChart(0, event.deltaY);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const factor = event.deltaY > 0 ? 1.12 : 0.88;
  zoomChart(factor, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

canvas.addEventListener("mousedown", (event) => {
  if (!chartView || event.button !== 0) return;
  dragState = { x: event.clientX, y: event.clientY };
  canvas.classList.add("is-dragging");
});

window.addEventListener("mousemove", (event) => {
  if (!dragState) return;
  const deltaX = event.clientX - dragState.x;
  const deltaY = event.clientY - dragState.y;
  dragState = { x: event.clientX, y: event.clientY };
  panChart(deltaX, deltaY);
});

window.addEventListener("mouseup", () => {
  dragState = null;
  canvas.classList.remove("is-dragging");
});

canvas.addEventListener("mousemove", (event) => {
  if (dragState) return;
  scheduleChartHover(event);
});

canvas.addEventListener("mouseleave", () => {
  if (hoverMoveFrame) {
    cancelAnimationFrame(hoverMoveFrame);
    hoverMoveFrame = null;
  }
  pendingHoverClientPoint = null;
  hideTooltip();
  drawCurrentChartView();
});

window.addEventListener("resize", () => {
  drawChart();
  metricAnimationController?.resize();
});

// --- Mobile menu ---
mobileMenuToggle.addEventListener("click", () => {
  const isOpen = toolbar.classList.toggle("is-open");
  mobileMenuToggle.classList.toggle("is-open", isOpen);
  mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
  mobileMenuToggle.setAttribute("aria-label", isOpen ? "关闭工具菜单" : "打开工具菜单");
});

function syncEasterEggToggle() {
  easterEggToggle.classList.toggle("is-active", easterEggEnabled);
  easterEggToggle.setAttribute("aria-pressed", String(easterEggEnabled));
  easterEggToggle.title = easterEggEnabled ? "Disable easter egg" : "Enable easter egg";
  easterEggToggle.setAttribute("aria-label", easterEggToggle.title);
}

syncEasterEggToggle();
easterEggToggle.addEventListener("click", () => {
  easterEggEnabled = !easterEggEnabled;
  syncEasterEggToggle();
});

themeToggle.addEventListener("click", () => {
  toggleTheme();
});

appSettingsToggle.addEventListener("click", () => {
  if (appSettingsPanel.hidden) openAppSettings();
  else closeAppSettings();
});

appSettingsCancel.addEventListener("click", closeAppSettings);

appSettingsPanel.addEventListener("submit", (event) => {
  event.preventDefault();
  applyAppSettingsFromForm();
});

setupCatAvatarEasterEgg({
  isEnabled: () => easterEggEnabled,
  ignoredSelector: "#themeToggle, #easterEggToggle, #appSettingsToggle, #appSettingsPanel",
  getTriggerProbability: () => state.easterEggTriggerProbability,
  getBurstProbability: () => state.easterEggBurstProbability
});

document.addEventListener("click", (event) => {
  if (!toolbar.classList.contains("is-open")) return;
  if (toolbar.contains(event.target) || mobileMenuToggle.contains(event.target)) return;

  toolbar.classList.remove("is-open");
  mobileMenuToggle.classList.remove("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", "打开工具菜单");
});

document.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "l") return;
  event.preventDefault();
  revealAppSettingsButton();
});

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("is-page-hidden", document.hidden);
  metricAnimationController?.setPaused(document.hidden);
});

Object.assign(state, loadUserSettings());
setTheme(state.theme, { persist: false, redraw: false });
render();
setupMetricAnimation();
