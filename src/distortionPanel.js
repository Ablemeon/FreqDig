/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * Sidebar UI builder for distortion mode.
 * It receives callbacks from app.js instead of importing global app state.
 */

import { DISTORTION_SERIES, distortionValue, formatPercentValue } from "./distortion.js";

export function renderDistortionCurveControls({
  // Main entry: builds band controls, axis mode controls, measurement tabs, and series rows.
  curveList,
  state,
  lockedFrequencyBands,
  render,
  renderTitle,
  hideTooltip,
  getDistortionGroupStyle,
  distortionGroupPreviewClass,
  getDistortionSeriesSetting,
  escapeHtml,
  trashIcon,
  formatFrequency
}) {
  const bandControl = document.createElement("label");
  bandControl.className = "check-control distortion-band-control";
  bandControl.innerHTML = `
    <input type="checkbox" ${state.showBandIndicator ? "checked" : ""}>
    <span>频带指示器</span>
  `;
  bandControl.querySelector("input").addEventListener("change", (event) => {
    state.showBandIndicator = event.target.checked;
    if (!state.showBandIndicator) lockedFrequencyBands.clear();
    render();
  });
  curveList.appendChild(bandControl);

  if (!["percent", "dbr"].includes(state.distortionAxisMode)) {
    state.distortionAxisMode = "dbr";
  }
  const axisControl = document.createElement("div");
  axisControl.className = "distortion-axis-controls";
  axisControl.innerHTML = `
    <span class="distortion-axis-label">纵轴模式</span>
    <div class="distortion-axis-toggle" role="group" aria-label="失真纵轴模式">
      <button class="${state.distortionAxisMode === "percent" ? "is-active" : ""}" type="button" data-axis-mode="percent" aria-pressed="${state.distortionAxisMode === "percent"}">%</button>
      <button class="${state.distortionAxisMode === "dbr" ? "is-active" : ""}" type="button" data-axis-mode="dbr" aria-pressed="${state.distortionAxisMode === "dbr"}">dBr</button>
    </div>
  `;
  axisControl.querySelectorAll("[data-axis-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.distortionAxisMode = button.dataset.axisMode === "percent" ? "percent" : "dbr";
      state.distortionAxisMin = null;
      state.distortionAxisMax = null;
      render();
    });
  });
  curveList.appendChild(axisControl);

  if (!state.distortionMeasurements.length) {
    const empty = document.createElement("div");
    empty.className = "curve-item distortion-empty";
    empty.innerHTML = `
      <div class="curve-meta">导入 REW THD 文本文件后，可以在这里控制 THD、Noise 与各阶谐波曲线。</div>
    `;
    curveList.appendChild(empty);
    return;
  }

  renderDistortionMeasurementTabs({
    curveList,
    state,
    render,
    renderTitle,
    hideTooltip,
    getDistortionGroupStyle,
    distortionGroupPreviewClass,
    getDistortionSeriesSetting,
    escapeHtml,
    trashIcon,
    formatFrequency
  });
}

function renderDistortionMeasurementTabs(deps) {
  const {
    curveList,
    state,
    render,
    renderTitle,
    hideTooltip,
    getDistortionGroupStyle,
    distortionGroupPreviewClass,
    getDistortionSeriesSetting,
    escapeHtml,
    trashIcon,
    formatFrequency
  } = deps;
  const tabs = document.createElement("div");
  tabs.className = "distortion-group-tabs";

  for (const measurement of state.distortionMeasurements) {
    const group = document.createElement("div");
    const isEnabled = measurement.enabled !== false;
    group.className = `distortion-group${isEnabled ? " is-enabled" : " is-disabled"}`;
    const tab = document.createElement("div");
    tab.className = `distortion-group-tab${isEnabled ? " is-enabled" : " is-off"}`;
    const groupStyle = getDistortionGroupStyle(measurement);
    tab.innerHTML = `
      <button class="distortion-group-select ${distortionGroupPreviewClass(measurement)}" type="button" title="${groupStyle.label} / ${isEnabled ? "停用该组失真曲线" : "启用该组失真曲线"}" aria-pressed="${isEnabled}"></button>
      <input class="distortion-group-name" value="${escapeHtml(measurement.name || measurement.fileName)}" title="${escapeHtml(measurement.name || measurement.fileName)}" aria-label="失真数据组名称">
      <button class="icon-button danger-button" type="button" title="移除该组失真曲线" aria-label="移除该组失真曲线">${trashIcon()}</button>
    `;

    tab.querySelector(".distortion-group-select").addEventListener("click", () => {
      measurement.enabled = !isEnabled;
      render();
    });

    const nameInput = tab.querySelector(".distortion-group-name");
    nameInput.addEventListener("input", (event) => {
      measurement.name = event.target.value.trim() || measurement.fileName || "失真数据";
      nameInput.title = measurement.name;
      renderTitle();
    });

    tab.querySelector(".danger-button").addEventListener("click", () => {
      removeDistortionMeasurement(state, measurement.id, hideTooltip, render);
    });

    group.appendChild(tab);
    group.appendChild(renderDistortionSeriesTabs({
      measurement,
      render,
      getDistortionSeriesSetting,
      escapeHtml,
      formatFrequency
    }));
    tabs.appendChild(group);
  }

  curveList.appendChild(tabs);
}

function renderDistortionSeriesTabs({
  measurement,
  render,
  getDistortionSeriesSetting,
  escapeHtml,
  formatFrequency
}) {
  const box = document.createElement("div");
  box.className = "distortion-series-box";

  for (const series of DISTORTION_SERIES) {
    const setting = getDistortionSeriesSetting(series.key, measurement);
    const item = document.createElement("button");
    item.className = `distortion-series-tab${setting.visible ? " is-visible" : " is-off"}`;
    item.type = "button";
    item.title = `${series.label}: ${getDistortionSeriesDescription(series.key, measurement.data, formatFrequency)}`;
    item.setAttribute("aria-pressed", String(setting.visible));
    item.innerHTML = `
      <span>${escapeHtml(series.label)}</span>
      <span class="distortion-series-dot" style="--series-color:${setting.color}"></span>
    `;

    item.addEventListener("click", () => {
      const current = getDistortionSeriesSetting(series.key, measurement);
      measurement.seriesSettings[series.key] = {
        ...current,
        visible: !current.visible
      };
      render();
    });

    box.appendChild(item);
  }

  return box;
}

function removeDistortionMeasurement(state, id, hideTooltip, render) {
  const index = state.distortionMeasurements.findIndex((measurement) => measurement.id === id);
  if (index < 0) return;
  state.distortionMeasurements.splice(index, 1);

  if (!state.distortionMeasurements.length) {
    state.distortionMode = false;
  }

  hideTooltip();
  render();
}

function getDistortionSeriesDescription(key, data, formatFrequency) {
  let sum = 0;
  let count = 0;
  let peak = null;

  for (const point of data) {
    const value = distortionValue(point, key);
    if (!Number.isFinite(value)) continue;
    sum += value;
    count++;
    if (!peak || value > peak.value) {
      peak = { frequency: point.frequency, value };
    }
  }

  if (!count || !peak) return "无可用数据";
  return `平均 ${formatPercentValue(sum / count)} / 峰值 ${formatPercentValue(peak.value)} @ ${formatFrequency(peak.frequency)}`;
}
