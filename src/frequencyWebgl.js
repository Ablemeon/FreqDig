/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * WebGL2 line renderer for dense 2D frequency/phase curves.
 * The main canvas still draws axes, text, tooltips, legend, and exports.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
in vec4 aColor;
out vec4 vColor;

void main() {
  vColor = aColor;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 outColor;

void main() {
  outColor = vColor;
}
`;

const CONTEXT_OPTIONS = {
  alpha: true,
  antialias: true,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true
};

export class FrequencyWebGLRenderer {
  // Renders thick polylines into an offscreen transparent WebGL2 canvas.
  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", CONTEXT_OPTIONS);
    this.program = null;
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.vertexCount = 0;
    if (this.gl) this.init();
  }

  init() {
    const gl = this.gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  render({ width, height, dpr, clip, lines }) {
    // `lines` are already projected into CSS pixels by app.js chart scales.
    if (!this.gl || !width || !height || !lines?.length) return null;
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    const positions = [];
    const colors = [];
    for (const line of lines) {
      appendLineGeometry(positions, colors, line, width, height);
    }
    if (!positions.length) return null;

    const gl = this.gl;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (clip) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        Math.floor(clip.left * dpr),
        Math.floor((height - clip.top - clip.height) * dpr),
        Math.ceil(clip.width * dpr),
        Math.ceil(clip.height * dpr)
      );
    } else {
      gl.disable(gl.SCISSOR_TEST);
    }

    gl.useProgram(this.program);
    const positionLocation = gl.getAttribLocation(this.program, "aPosition");
    const colorLocation = gl.getAttribLocation(this.program, "aColor");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
    gl.disable(gl.SCISSOR_TEST);
    return this.canvas;
  }
}

function appendLineGeometry(positions, colors, line, width, height) {
  // WebGL core line width is unreliable, so build each segment as two triangles.
  const points = line.points || [];
  if (points.length < 2) return;
  const color = parseColor(line.color, line.alpha ?? 1);
  const halfWidth = Math.max(0.45, (Number(line.width) || 1) / 2);
  const dash = Array.isArray(line.dash) ? line.dash.filter((value) => Number(value) > 0) : [];

  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    if (!isFinitePoint(from) || !isFinitePoint(to)) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    const nx = (-dy / length) * halfWidth;
    const ny = (dx / length) * halfWidth;
    if (dash.length) {
      appendDashedSegment(positions, colors, from, to, nx, ny, length, dash, color, width, height);
    } else {
      pushSegmentQuad(positions, colors, from, to, nx, ny, color, width, height);
    }
  }
}

function appendDashedSegment(positions, colors, from, to, nx, ny, length, dash, color, width, height) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let distance = 0;
  let dashIndex = 0;
  while (distance < length) {
    const dashLength = dash[dashIndex % dash.length];
    const nextDistance = Math.min(length, distance + dashLength);
    if (dashIndex % 2 === 0 && nextDistance > distance) {
      const startRatio = distance / length;
      const endRatio = nextDistance / length;
      pushSegmentQuad(
        positions,
        colors,
        { x: from.x + dx * startRatio, y: from.y + dy * startRatio },
        { x: from.x + dx * endRatio, y: from.y + dy * endRatio },
        nx,
        ny,
        color,
        width,
        height
      );
    }
    distance = nextDistance;
    dashIndex++;
  }
}

function pushSegmentQuad(positions, colors, from, to, nx, ny, color, width, height) {
  pushQuad(
    positions,
    colors,
    [
      { x: from.x + nx, y: from.y + ny },
      { x: from.x - nx, y: from.y - ny },
      { x: to.x + nx, y: to.y + ny },
      { x: to.x - nx, y: to.y - ny }
    ],
    color,
    width,
    height
  );
}

function pushQuad(positions, colors, corners, color, width, height) {
  const order = [0, 1, 2, 2, 1, 3];
  for (const index of order) {
    const point = corners[index];
    positions.push((point.x / width) * 2 - 1, 1 - (point.y / height) * 2);
    colors.push(color.r, color.g, color.b, color.a);
  }
}

function parseColor(color, alpha) {
  const fallback = { r: 0.0, g: 0.45, b: 0.70, a: alpha };
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) return fallback;
  return {
    r: parseInt(color.slice(1, 3), 16) / 255,
    g: parseInt(color.slice(3, 5), 16) / 255,
    b: parseInt(color.slice(5, 7), 16) / 255,
    a: alpha
  };
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Unable to link frequency WebGL program.");
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile frequency WebGL shader.");
  }
  return shader;
}
