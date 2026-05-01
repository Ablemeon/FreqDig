/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

export function buildWaterfallData(impulse, options = {}) {
  const mode = options.mode === "rew" ? "rew" : "relative";
  const fftSize = options.fftSize || (mode === "rew" ? 32768 : 4096);
  const frameCount = clamp(Math.round(Number(options.frameCount) || 101), 20, 501);
  const binCount = options.binCount || (mode === "rew" ? 320 : 288);
  const timeStepMs = options.timeStepMs || 3.02;
  const minFrequency = options.minFrequency || 20;
  const maxFrequency = Math.min(options.maxFrequency || 20000, impulse.sampleRate / 2);
  const prePeakSamples = Number.isFinite(Number(options.prePeakSamples))
    ? Math.max(0, Math.round(Number(options.prePeakSamples)))
    : Math.floor(fftSize * 0.08);
  const startIndex = Math.max(0, impulse.peakIndex - prePeakSamples);
  const hop = Math.max(1, Math.round((timeStepMs / 1000) * impulse.sampleRate));
  const window = hannWindow(fftSize);
  const frequencies = [];
  const minLog = Math.log10(minFrequency);
  const maxLog = Math.log10(maxFrequency);

  for (let index = 0; index < binCount; index++) {
    const ratio = index / (binCount - 1);
    frequencies.push(10 ** (minLog + (maxLog - minLog) * ratio));
  }

  const frames = [];
  let maxDb = -Infinity;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const offset = startIndex + frameIndex * hop;
    const real = new Float64Array(fftSize);
    const imag = new Float64Array(fftSize);

    for (let sample = 0; sample < fftSize; sample++) {
      const sourceIndex = offset + sample;
      real[sample] = (impulse.samples[sourceIndex] || 0) * window[sample];
    }

    fft(real, imag, false);

    const values = frequencies.map((frequency) => {
      const bin = clamp((frequency / impulse.sampleRate) * fftSize, 0, fftSize / 2);
      const lower = Math.floor(bin);
      const upper = Math.min(fftSize / 2, lower + 1);
      const t = bin - lower;
      const lowerMagnitude = Math.hypot(real[lower], imag[lower]);
      const upperMagnitude = Math.hypot(real[upper], imag[upper]);
      const magnitude = lowerMagnitude * (1 - t) + upperMagnitude * t;
      const db = 20 * Math.log10(Math.max(magnitude, 1e-12));
      maxDb = Math.max(maxDb, db);
      return db;
    });

    frames.push({
      timeMs: frameIndex * timeStepMs,
      values
    });
  }

  const floorDb = Number.isFinite(Number(options.floorDb)) ? Number(options.floorDb) : 54;
  const ceilingDb = Number.isFinite(Number(options.ceilingDb)) ? Number(options.ceilingDb) : (mode === "rew" ? 113.8 : 114);
  const referenceGuardDb = Number.isFinite(Number(options.referenceGuardDb)) ? Number(options.referenceGuardDb) : 36;
  const binReference = mode === "rew"
    ? frames[0]?.values?.map((value) => Number.isFinite(value) ? value : maxDb) || []
    : [];

  for (const frame of frames) {
    frame.values = mode === "rew"
      ? frame.values.map((value, index) => {
        const reference = binReference[index] ?? maxDb;
        const referenceStrength = clamp(1 - ((maxDb - reference) / referenceGuardDb), 0, 1);
        const perBinNormalized = ceilingDb + value - reference;
        const globalNormalized = ceilingDb + value - maxDb;
        const mixed = globalNormalized * (1 - referenceStrength) + perBinNormalized * referenceStrength;
        return clamp(mixed, floorDb, ceilingDb);
      })
      : frame.values.map((value) => clamp(value - maxDb, -80, 0));
    frame.peakDb = Math.max(...frame.values);
  }

  const effectiveFloor = mode === "rew" ? floorDb + 1 : -78;
  const effectiveFrames = frames.filter((frame) => frame.peakDb > effectiveFloor);
  const effectiveMaxTimeMs = effectiveFrames.at(-1)?.timeMs ?? frames.at(-1)?.timeMs ?? 0;

  return {
    mode,
    scale: mode === "rew" ? "absolute" : "relative",
    frequencies,
    frames,
    effectiveMaxTimeMs,
    minDb: mode === "rew" ? floorDb : -80,
    maxDb: mode === "rew" ? ceilingDb : 0
  };
}

export function getWaterfallSummaryItems(impulses, options = {}) {
  const visible = impulses.filter((impulse) => impulse.visible !== false);
  const view = options.view || {};
  const waterfall = options.waterfall || visible[0]?.waterfallCache || null;
  const renderMode = view.renderMode === "rew" ? "REW 归一化" : "相对衰减";
  const surfaceMode = view.surfaceMode === "grid" ? "网格曲面" : "切片绘制";
  const dbRange = Number.isFinite(Number(view.dbRange)) ? Math.round(Number(view.dbRange)) : 70;
  const sliceCount = Number.isFinite(Number(view.sliceCount))
    ? Math.round(Number(view.sliceCount))
    : (waterfall?.frames?.length || 101);
  const binCount = waterfall?.frequencies?.length || (view.renderMode === "rew" ? 320 : 288);
  const maxTimeMs = Number.isFinite(Number(options.effectiveMaxTimeMs))
    ? Math.round(Number(options.effectiveMaxTimeMs))
    : Number.isFinite(Number(waterfall?.effectiveMaxTimeMs))
      ? Math.round(Number(waterfall.effectiveMaxTimeMs))
      : null;

  return [
    { label: "瀑布图", value: visible.length ? (visible[0].name || visible[0].fileName) : "-" },
    { label: "时间切片", value: `${sliceCount}` },
    { label: "频率采样", value: `${binCount}` },
    { label: "动态范围", value: `${dbRange} dB` },
    { label: "时间范围", value: visible.length && maxTimeMs !== null ? `${maxTimeMs} ms` : "-" },
    { label: "绘制方式", value: surfaceMode },
    { label: "算法", value: renderMode }
  ];
}

function hannWindow(size) {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }
  return window;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fft(real, imag, inverse = false) {
  const n = real.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const realValue = real[i];
      const imagValue = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = realValue;
      imag[j] = imagValue;
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (2 * Math.PI / length) * (inverse ? 1 : -1);
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);

    for (let start = 0; start < n; start += length) {
      let unitReal = 1;
      let unitImag = 0;

      for (let offset = 0; offset < length / 2; offset++) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + length / 2;
        const oddReal = real[oddIndex] * unitReal - imag[oddIndex] * unitImag;
        const oddImag = real[oddIndex] * unitImag + imag[oddIndex] * unitReal;
        const evenReal = real[evenIndex];
        const evenImag = imag[evenIndex];

        real[evenIndex] = evenReal + oddReal;
        imag[evenIndex] = evenImag + oddImag;
        real[oddIndex] = evenReal - oddReal;
        imag[oddIndex] = evenImag - oddImag;

        const nextUnitReal = unitReal * stepReal - unitImag * stepImag;
        unitImag = unitReal * stepImag + unitImag * stepReal;
        unitReal = nextUnitReal;
      }
    }
  }

  if (inverse) {
    for (let index = 0; index < n; index++) {
      real[index] /= n;
      imag[index] /= n;
    }
  }
}
