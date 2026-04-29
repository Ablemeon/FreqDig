/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 * Reference：
 * // Vanilla JS Liquid Glass Effect - Paste into browser console
*  // Created by Shu Ding (https://github.com/shuding/liquid-glass) in 2025.

 */

const FILTER_ID = "freqdig-liquid-glass-project-filter";
const MAP_SIZE = 192;
const EDGE_REFRACTION_SCALE = 58;

export function installLiquidGlassFilter() {
  if (document.getElementById(FILTER_ID)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("liquid-glass-shader-defs");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.id = FILTER_ID;
  filter.setAttribute("x", "-8%");
  filter.setAttribute("y", "-8%");
  filter.setAttribute("width", "116%");
  filter.setAttribute("height", "116%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const image = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
  image.setAttribute("width", String(MAP_SIZE));
  image.setAttribute("height", String(MAP_SIZE));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("href", createDisplacementMapUrl(MAP_SIZE, MAP_SIZE));
  image.setAttribute("result", "glassMap");

  const displacement = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
  displacement.setAttribute("in", "SourceGraphic");
  displacement.setAttribute("in2", "glassMap");
  displacement.setAttribute("scale", String(EDGE_REFRACTION_SCALE));
  displacement.setAttribute("xChannelSelector", "R");
  displacement.setAttribute("yChannelSelector", "G");

  filter.append(image, displacement);
  defs.appendChild(filter);
  svg.appendChild(defs);
  document.body.prepend(svg);
}

function createDisplacementMapUrl(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);
  const data = imageData.data;

  let maxScale = 0;
  const raw = new Float32Array(width * height * 2);
  let rawIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const uv = { x: x / width, y: y / height };
      const sample = liquidGlassSample(uv);
      const dx = sample.x * width - x;
      const dy = sample.y * height - y;
      raw[rawIndex++] = dx;
      raw[rawIndex++] = dy;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    }
  }

  maxScale = Math.max(1, maxScale * 0.5);
  rawIndex = 0;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = (raw[rawIndex++] / maxScale + 0.5) * 255;
    data[index + 1] = (raw[rawIndex++] / maxScale + 0.5) * 255;
    data[index + 2] = 0;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function liquidGlassSample(uv) {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;
  const edge = roundedRectSdf(ix, iy, 0.38, 0.28, 0.52);
  const outerPull = smoothStep(0.34, -0.08, edge);
  const innerCalm = smoothStep(-0.46, 0.08, edge);
  const edgeRefraction = outerPull * innerCalm;
  const scaled = 1 + edgeRefraction * 0.44;
  const ripple = Math.sin((uv.x + uv.y) * Math.PI * 3.4) * 0.026 * edgeRefraction;

  return {
    x: ix * scaled + 0.5 + ripple,
    y: iy * scaled + 0.5 - ripple
  };
}

function roundedRectSdf(x, y, width, height, radius) {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function smoothStep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function length(x, y) {
  return Math.sqrt(x * x + y * y);
}
