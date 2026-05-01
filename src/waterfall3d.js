/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * WebGL2 renderer for the interactive 3D waterfall chart.
 * Data comes from src/waterfall.js; this file only projects and draws it.
 */

const SURFACE_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in float aLevel;
uniform mat4 uMatrix;
out float vLevel;
out float vHeight;

void main() {
  vLevel = clamp(aLevel, 0.0, 1.0);
  vHeight = aPosition.y;
  gl_Position = uMatrix * vec4(aPosition, 1.0);
}
`;

const SURFACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float vLevel;
in float vHeight;
out vec4 outColor;

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 deep = vec3(0.07, 0.10, 0.30);
  vec3 blue = vec3(0.02, 0.32, 0.66);
  vec3 cyan = vec3(0.00, 0.67, 0.72);
  vec3 green = vec3(0.14, 0.68, 0.18);
  vec3 yellow = vec3(0.94, 0.88, 0.12);
  vec3 red = vec3(1.00, 0.22, 0.05);
  if (t < 0.24) return mix(deep, blue, t / 0.24);
  if (t < 0.44) return mix(blue, cyan, (t - 0.24) / 0.20);
  if (t < 0.66) return mix(cyan, green, (t - 0.44) / 0.22);
  if (t < 0.84) return mix(green, yellow, (t - 0.66) / 0.18);
  return mix(yellow, red, (t - 0.84) / 0.16);
}

void main() {
  if (vLevel < 0.026) discard;
  vec3 color = palette(vLevel);
  float heightLight = smoothstep(-0.25, 1.20, vHeight);
  float levelLight = 0.80 + vLevel * 0.34;
  color *= levelLight;
  color = mix(color, vec3(1.0, 0.97, 0.78), smoothstep(0.80, 1.0, vLevel) * 0.10);
  color = mix(color, vec3(0.14, 0.34, 0.52), (1.0 - heightLight) * 0.10);
  float alpha = mix(0.28, 0.96, smoothstep(0.04, 0.92, vLevel));
  outColor = vec4(color, alpha);
}
`;

const LINE_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec4 aColor;
uniform mat4 uMatrix;
out vec4 vColor;

void main() {
  vColor = aColor;
  gl_Position = uMatrix * vec4(aPosition, 1.0);
}
`;

const LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 outColor;

void main() {
  outColor = vColor;
}
`;

const WEBGL_OPTIONS = {
  antialias: true,
  alpha: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: true
};

export class Waterfall3DRenderer {
  // Runtime renderer owned by app.js. It draws surface slices, ridges, and 3D axes.
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", WEBGL_OPTIONS);
    this.surfaceProgram = null;
    this.lineProgram = null;
    this.surfacePositionBuffer = null;
    this.surfaceLevelBuffer = null;
    this.axisPositionBuffer = null;
    this.axisColorBuffer = null;
    this.ridgePositionBuffer = null;
    this.ridgeColorBuffer = null;
    this.sliceRanges = [];
    this.axisVertexCount = 0;
    this.ridgeVertexCount = 0;
    this.cacheKey = "";

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.cacheKey = "";
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.gl = canvas.getContext("webgl2", WEBGL_OPTIONS);
      this.cacheKey = "";
      if (this.gl) this.init();
    });

    if (this.gl) this.init();
  }

  init() {
    const gl = this.gl;
    if (!gl) return;

    this.surfaceProgram = createProgram(gl, SURFACE_VERTEX_SHADER, SURFACE_FRAGMENT_SHADER);
    this.lineProgram = createProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    this.surfacePositionBuffer = gl.createBuffer();
    this.surfaceLevelBuffer = gl.createBuffer();
    this.axisPositionBuffer = gl.createBuffer();
    this.axisColorBuffer = gl.createBuffer();
    this.ridgePositionBuffer = gl.createBuffer();
    this.ridgeColorBuffer = gl.createBuffer();
    this.cacheKey = "";

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  render(waterfall, options = {}) {
    // Public entry point: resize, refresh cached geometry if needed, then draw a frame.
    if (!this.gl || this.gl.isContextLost?.() || !waterfall?.frames?.length) return false;
    this.resize();

    const settings = normalizeRenderSettings(waterfall, options);
    const key = getMeshKey(waterfall, settings);
    if (key !== this.cacheKey) {
      this.uploadSurface(waterfall, settings);
      this.uploadAxes(settings);
      this.uploadRidges(waterfall, settings);
      this.cacheKey = key;
    }

    const gl = this.gl;
    const aspect = gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight);
    const matrix = makeSceneMatrix(settings, aspect);
    const background = options.darkTheme
      ? [0.035, 0.078, 0.120, 1]
      : [0.890, 0.945, 0.945, 1];

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(background[0], background[1], background[2], background[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    this.drawLineBuffer(matrix, this.axisPositionBuffer, this.axisColorBuffer, this.axisVertexCount, 1);
    this.drawSurface(matrix, settings);
    if (settings.showContours) {
      this.drawLineBuffer(matrix, this.ridgePositionBuffer, this.ridgeColorBuffer, this.ridgeVertexCount, 1);
    }
    this.drawLineBuffer(matrix, this.axisPositionBuffer, this.axisColorBuffer, this.axisVertexCount, 1);

    if (gl.getError() !== gl.NO_ERROR) {
      this.cacheKey = "";
      return false;
    }
    return true;
  }

  drawSurface(matrix, settings) {
    if (!this.sliceRanges.length) return;
    const gl = this.gl;
    const positionLocation = gl.getAttribLocation(this.surfaceProgram, "aPosition");
    const levelLocation = gl.getAttribLocation(this.surfaceProgram, "aLevel");
    const orderedRanges = this.sliceRanges
      .map((range) => ({
        ...range,
        depth: projectDepth(
          waterfallPositionFromRatios(0.5, 0.55, range.frameRatio, settings),
          matrix
        )
      }))
      .sort((a, b) => b.depth - a.depth);

    gl.useProgram(this.surfaceProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uMatrix"), false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfacePositionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceLevelBuffer);
    gl.enableVertexAttribArray(levelLocation);
    gl.vertexAttribPointer(levelLocation, 1, gl.FLOAT, false, 0, 0);

    for (const range of orderedRanges) {
      if (range.count > 0) gl.drawArrays(gl.TRIANGLES, range.start, range.count);
    }
  }

  drawLineBuffer(matrix, positionBuffer, colorBuffer, vertexCount, lineWidth = 1) {
    if (!vertexCount) return;
    const gl = this.gl;
    const positionLocation = gl.getAttribLocation(this.lineProgram, "aPosition");
    const colorLocation = gl.getAttribLocation(this.lineProgram, "aColor");

    gl.useProgram(this.lineProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, "uMatrix"), false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    gl.lineWidth(lineWidth);
    gl.drawArrays(gl.LINES, 0, vertexCount);
  }

  uploadSurface(waterfall, settings) {
    // Builds either independent time slices or a connected grid surface.
    const gl = this.gl;
    const frames = getRenderableFrames(waterfall, settings);
    const frequencies = waterfall.frequencies || [];
    const positions = [];
    const levels = [];
    const minLog = Math.log10(frequencies[0] || 20);
    const maxLog = Math.log10(frequencies.at(-1) || 20000);
    const dbRange = Math.max(18, settings.dbRange);
    const visibleFloor = waterfall.scale === "absolute" ? 0.028 : 0.040;
    this.sliceRanges = [];

    const pushVertex = (frequencyRatio, levelRatio, frameRatio, levelValue) => {
      const position = waterfallPositionFromRatios(frequencyRatio, levelRatio, frameRatio, settings);
      positions.push(position.x, position.y, position.z);
      levels.push(levelValue);
    };

    if (settings.surfaceMode === "grid") {
      for (let frameIndex = 0; frameIndex < frames.length - 1; frameIndex++) {
        const current = frames[frameIndex];
        const next = frames[frameIndex + 1];
        const currentFrameRatio = waterfallTimeRatio(waterfall, current.timeMs, settings);
        const nextFrameRatio = waterfallTimeRatio(waterfall, next.timeMs, settings);
        const start = levels.length;
        for (let index = 0; index < frequencies.length - 1; index++) {
          const fromRatio = logFrequencyRatio(frequencies[index], minLog, maxLog);
          const toRatio = logFrequencyRatio(frequencies[index + 1], minLog, maxLog);
          const aLevel = safeWaterfallLevelRatio(waterfall, current.values[index], dbRange);
          const bLevel = safeWaterfallLevelRatio(waterfall, current.values[index + 1], dbRange);
          const cLevel = safeWaterfallLevelRatio(waterfall, next.values[index], dbRange);
          const dLevel = safeWaterfallLevelRatio(waterfall, next.values[index + 1], dbRange);
          if (Math.max(aLevel, bLevel, cLevel, dLevel) <= visibleFloor) continue;

          pushVertex(fromRatio, aLevel, currentFrameRatio, aLevel);
          pushVertex(fromRatio, cLevel, nextFrameRatio, cLevel);
          pushVertex(toRatio, bLevel, currentFrameRatio, bLevel);
          pushVertex(toRatio, bLevel, currentFrameRatio, bLevel);
          pushVertex(fromRatio, cLevel, nextFrameRatio, cLevel);
          pushVertex(toRatio, dLevel, nextFrameRatio, dLevel);
        }
        const count = levels.length - start;
        if (count) this.sliceRanges.push({ start, count, frameRatio: currentFrameRatio });
      }
    } else {
      for (const frame of frames) {
      const frameRatio = waterfallTimeRatio(waterfall, frame.timeMs, settings);
      const start = levels.length;
      for (let index = 0; index < frequencies.length - 1; index++) {
        const fromRatio = logFrequencyRatio(frequencies[index], minLog, maxLog);
        const toRatio = logFrequencyRatio(frequencies[index + 1], minLog, maxLog);
        const fromLevel = safeWaterfallLevelRatio(waterfall, frame.values[index], dbRange);
        const toLevel = safeWaterfallLevelRatio(waterfall, frame.values[index + 1], dbRange);
        if (fromLevel <= visibleFloor && toLevel <= visibleFloor) continue;

        const floorA = 0;
        const floorB = 0;
        pushVertex(fromRatio, fromLevel, frameRatio, fromLevel);
        pushVertex(fromRatio, floorA, frameRatio, floorA);
        pushVertex(toRatio, toLevel, frameRatio, toLevel);
        pushVertex(toRatio, toLevel, frameRatio, toLevel);
        pushVertex(fromRatio, floorA, frameRatio, floorA);
        pushVertex(toRatio, floorB, frameRatio, floorB);
      }
      const count = levels.length - start;
      if (count) this.sliceRanges.push({ start, count, frameRatio });
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfacePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceLevelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(levels), gl.STATIC_DRAW);
  }

  uploadRidges(waterfall, settings) {
    // Ridges are the REW-like contour lines drawn along each time slice.
    const gl = this.gl;
    const frames = getRenderableFrames(waterfall, settings);
    const frequencies = waterfall.frequencies || [];
    const positions = [];
    const colors = [];
    const minLog = Math.log10(frequencies[0] || 20);
    const maxLog = Math.log10(frequencies.at(-1) || 20000);
    const dbRange = Math.max(18, settings.dbRange);
    const binStep = Math.max(1, Math.floor(frequencies.length / 180));

    const pushLine = (from, to, color) => {
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
      colors.push(...color, ...color);
    };

    frames.forEach((frame, frameIndex) => {
      const frameRatio = waterfallTimeRatio(waterfall, frame.timeMs, settings);
      const color = frameIndex % 10 === 0
        ? [0.90, 0.92, 0.92, 0.52]
        : [0.36, 0.38, 0.39, 0.36];
      for (let index = 0; index + binStep < frequencies.length; index += binStep) {
        const fromRatio = logFrequencyRatio(frequencies[index], minLog, maxLog);
        const toRatio = logFrequencyRatio(frequencies[index + binStep], minLog, maxLog);
        const fromLevel = safeWaterfallLevelRatio(waterfall, frame.values[index], dbRange);
        const toLevel = safeWaterfallLevelRatio(waterfall, frame.values[index + binStep], dbRange);
        if (fromLevel < 0.030 && toLevel < 0.030) continue;
        pushLine(
          waterfallPositionFromRatios(fromRatio, fromLevel + 0.010, frameRatio, settings),
          waterfallPositionFromRatios(toRatio, toLevel + 0.010, frameRatio, settings),
          color
        );
      }
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ridgePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ridgeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    this.ridgeVertexCount = positions.length / 3;
  }

  uploadAxes(settings) {
    const gl = this.gl;
    const positions = [];
    const colors = [];
    const grid = [0.72, 0.76, 0.76, 0.32];
    const minor = [0.56, 0.62, 0.64, 0.22];
    const axis = [0.44, 0.50, 0.54, 0.70];
    const yAxisX = -0.055;
    const yAxisZ = -0.065;

    const pushLine = (fromRatios, toRatios, color) => {
      const from = waterfallPositionFromRatios(fromRatios[0], fromRatios[1], fromRatios[2], settings);
      const to = waterfallPositionFromRatios(toRatios[0], toRatios[1], toRatios[2], settings);
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
      colors.push(...color, ...color);
    };

    for (let index = 0; index <= 8; index++) {
      const ratio = index / 8;
      pushLine([ratio, 0, 0], [ratio, 0, 1], minor);
      pushLine([ratio, 0, 0], [ratio, 1, 0], minor);
    }

    for (const frameRatio of [0, 0.25, 0.5, 0.75, 1]) {
      pushLine([0, 0, frameRatio], [1, 0, frameRatio], grid);
      pushLine([0, 0, frameRatio], [0, 1, frameRatio], minor);
    }

    for (const levelRatio of [0, 0.25, 0.5, 0.75, 1]) {
      pushLine([0, levelRatio, 0], [1, levelRatio, 0], grid);
      pushLine([0, levelRatio, 0], [0, levelRatio, 1], minor);
      pushLine([yAxisX, levelRatio, yAxisZ], [0, levelRatio, 0], minor);
    }

    pushLine([0, 0, 0], [1, 0, 0], axis);
    pushLine([0, 0, 0], [0, 0, 1], axis);
    pushLine([yAxisX, 0, yAxisZ], [yAxisX, 1, yAxisZ], axis);
    pushLine([yAxisX, 0, yAxisZ], [0, 0, 0], axis);
    pushLine([yAxisX, 1, yAxisZ], [0, 1, 0], grid);
    pushLine([1, 0, 0], [1, 1, 0], grid);
    pushLine([1, 0, 0], [1, 0, 1], grid);
    pushLine([0, 1, 0], [1, 1, 0], grid);
    pushLine([0, 0, 1], [1, 0, 1], grid);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    this.axisVertexCount = positions.length / 3;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.cacheKey = "";
    }
  }

  clear() {
    if (!this.gl) return;
    this.cacheKey = "";
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  reset() {
    if (!this.gl || this.gl.isContextLost?.()) return false;
    this.cacheKey = "";
    this.init();
    return true;
  }
}

function normalizeRenderSettings(waterfall, options = {}) {
  return {
    yaw: options.yaw ?? -20,
    pitch: options.pitch ?? 0,
    dbRange: options.dbRange ?? getWaterfallDefaultDbRange(waterfall),
    surfaceMode: options.surfaceMode === "grid" ? "grid" : "slice",
    sliceCount: clamp(Math.round(Number(options.sliceCount) || 101), 20, 501),
    timeScale: options.timeScale ?? 1,
    effectiveMaxTimeMs: options.effectiveMaxTimeMs ?? getEffectiveWaterfallTimeMs(waterfall, options.dbRange),
    zoom: options.zoom ?? 1,
    xScale: clamp(options.xScale ?? 1, 0.45, 2.8),
    panX: clamp(options.panX ?? 0, -1.6, 1.6),
    panY: clamp(options.panY ?? 0, -1.1, 1.1),
    showContours: options.showContours !== false
  };
}

function getRenderableFrames(waterfall, settings) {
  const maxTimeMs = Math.max(1, settings.effectiveMaxTimeMs);
  const frames = (waterfall.frames || []).filter((frame) => frame.timeMs <= maxTimeMs || frame === waterfall.frames[0]);
  const usableFrames = frames.length >= 2 ? frames : (waterfall.frames || []).slice(0, 2);
  const targetCount = clamp(Math.round(Number(settings.sliceCount) || 101), 2, usableFrames.length || 2);
  if (usableFrames.length <= targetCount) return usableFrames;

  const sampled = [];
  let previousIndex = -1;
  for (let index = 0; index < targetCount; index++) {
    const sourceIndex = Math.round((index / Math.max(1, targetCount - 1)) * (usableFrames.length - 1));
    if (sourceIndex === previousIndex) continue;
    sampled.push(usableFrames[sourceIndex]);
    previousIndex = sourceIndex;
  }
  return sampled;
}

function getMeshKey(waterfall, settings) {
  return [
    waterfall.frames.length,
    waterfall.frequencies.length,
    waterfall.mode,
    waterfall.scale,
    waterfall.minDb,
    waterfall.maxDb,
    waterfall.effectiveMaxTimeMs,
    settings.effectiveMaxTimeMs,
    settings.dbRange,
    settings.surfaceMode,
    settings.sliceCount,
    settings.timeScale,
    settings.xScale,
    waterfall.frames[0]?.values?.[0],
    waterfall.frames.at(-1)?.values?.at(-1)
  ].join("|");
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Unable to link WebGL2 program.");
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile WebGL2 shader.");
  }
  return shader;
}

export function waterfallPositionFromRatios(frequencyRatio, levelRatio, frameRatio, settings = {}) {
  // Shared by WebGL and the 2D overlay so tooltips align with the 3D world.
  const timeScale = settings.timeScale ?? 1;
  const xScale = settings.xScale ?? 1;
  return {
    x: (frequencyRatio - 0.5) * 3.25 * xScale,
    y: (levelRatio - 0.18) * 1.55,
    z: (frameRatio - 0.52) * 2.15 * timeScale
  };
}

export function waterfallTimeRatio(waterfall, timeMs, settingsOrDbRange) {
  const maxTimeMs = typeof settingsOrDbRange === "object" && settingsOrDbRange
    ? settingsOrDbRange.effectiveMaxTimeMs
    : getEffectiveWaterfallTimeMs(waterfall, settingsOrDbRange);
  return clamp(timeMs / Math.max(1, maxTimeMs), 0, 1);
}

export function getEffectiveWaterfallTimeMs(waterfall, dbRange = 70) {
  const frames = waterfall?.frames || [];
  if (!frames.length) return 1;
  const threshold = waterfall?.scale === "absolute"
    ? (Number(waterfall.maxDb) || 0) - Math.max(18, Number(dbRange) || getWaterfallDefaultDbRange(waterfall))
    : -Math.max(18, Number(dbRange) || 70);
  const effective = frames.filter((frame) => Number(frame.peakDb) > threshold);
  return Math.max(1, effective.at(-1)?.timeMs ?? Number(waterfall?.effectiveMaxTimeMs) ?? frames.at(-1)?.timeMs ?? 1);
}

export function getWaterfallDbRangeLimit(waterfall) {
  if (waterfall?.scale === "absolute") {
    return Math.max(18, Math.ceil((Number(waterfall.maxDb) || 0) - (Number(waterfall.minDb) || 0)));
  }
  const frames = waterfall?.frames || [];
  let minDb = Number.isFinite(Number(waterfall?.minDb)) ? Number(waterfall.minDb) : 0;
  for (const frame of frames) {
    for (const value of frame.values || []) {
      if (Number.isFinite(value)) minDb = Math.min(minDb, value);
    }
  }
  return Math.max(18, Math.ceil(Math.abs(minDb)));
}

export function getWaterfallRenderSettings(waterfall, view = {}) {
  const dbRange = clamp(view.dbRange ?? getWaterfallDefaultDbRange(waterfall), 18, getWaterfallDbRangeLimit(waterfall));
  return {
    ...view,
    dbRange,
    effectiveMaxTimeMs: getEffectiveWaterfallTimeMs(waterfall, dbRange)
  };
}

export function waterfallLevelRatio(waterfall, value, dbRange = getWaterfallDefaultDbRange(waterfall)) {
  if (waterfall?.scale === "absolute") {
    const maxDb = Number(waterfall.maxDb) || 0;
    const minDb = maxDb - Math.max(18, Number(dbRange) || getWaterfallDefaultDbRange(waterfall));
    return clamp((value - minDb) / Math.max(1, maxDb - minDb), 0, 1);
  }
  return clamp(1 + value / Math.max(18, Number(dbRange) || 70), 0, 1);
}

export function waterfallDbFromLevelRatio(waterfall, levelRatio, dbRange = getWaterfallDefaultDbRange(waterfall)) {
  if (waterfall?.scale === "absolute") {
    const maxDb = Number(waterfall.maxDb) || 0;
    return maxDb - (1 - levelRatio) * Math.max(18, Number(dbRange) || getWaterfallDefaultDbRange(waterfall));
  }
  return (levelRatio - 1) * Math.max(18, Number(dbRange) || 70);
}

export function projectWaterfallPoint(position, settings, width, height) {
  const aspect = Math.max(0.2, width / Math.max(1, height));
  const matrix = makeSceneMatrix(settings, aspect);
  const clip = transformPoint(matrix, position.x, position.y, position.z);
  if (!Number.isFinite(clip.w) || clip.w <= 0) return null;
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
    depth: clip.z / clip.w
  };
}

function safeWaterfallLevelRatio(waterfall, value, dbRange) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return waterfallLevelRatio(waterfall, number, dbRange);
}

function logFrequencyRatio(frequency, minLog, maxLog) {
  if (!Number.isFinite(frequency) || frequency <= 0 || maxLog === minLog) return 0;
  return clamp((Math.log10(frequency) - minLog) / (maxLog - minLog), 0, 1);
}

function getWaterfallDefaultDbRange(waterfall) {
  if (waterfall?.scale === "absolute") return Math.max(18, (Number(waterfall.maxDb) || 114) - (Number(waterfall.minDb) || 54));
  return 70;
}

function projectDepth(position, matrix) {
  const clip = transformPoint(matrix, position.x, position.y, position.z);
  if (!Number.isFinite(clip.w) || clip.w === 0) return 0;
  return clip.z / clip.w;
}

function makeSceneMatrix(settings = {}, aspect) {
  const yawDegrees = settings.yaw ?? -20;
  const pitchDegrees = settings.pitch ?? 0;
  const zoom = settings.zoom ?? 1;
  const panX = settings.panX ?? 0;
  const panY = settings.panY ?? 0;
  const projection = perspective(42 * Math.PI / 180, aspect, 0.1, 100);
  const distance = -5.1 / clamp(zoom, 0.55, 2.6);
  const view = multiply(
    translate(panX, -0.12 + panY, distance),
    multiply(rotateX(pitchDegrees * Math.PI / 180), rotateY(yawDegrees * Math.PI / 180))
  );
  return multiply(projection, view);
}

function transformPoint(matrix, x, y, z) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  };
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0
  ]);
}

function translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function rotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function rotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
