/*
 * FreqDig
 * Copyright (c) 2026 Diggercat (挖煤猫)
 * SPDX-License-Identifier: MIT
 */

const MINIMUM_PHASE_GRID_POINTS = 768;
const MINIMUM_PHASE_FFT_MIN_BINS = 4096;
const MINIMUM_PHASE_FFT_MAX_BINS = 131072;

export function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((line) => line.trim().split(/[,\t; ]+/).map((cell) => cell.trim()));
  const data = [];

  for (const row of rows) {
    if (row.length < 2) continue;
    const frequency = Number(row[0]);
    const level = Number(row[1]);
    const phase = Number(row[2]);

    if (Number.isFinite(frequency) && Number.isFinite(level) && frequency > 0) {
      const point = { frequency, level };
      if (Number.isFinite(phase)) point.phase = phase;
      data.push(point);
    }
  }

  return data.sort((a, b) => a.frequency - b.frequency);
}

export function parseRewDistortion(text) {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^\*?\s*Freq\s*\(Hz\)/i.test(line) && /THD\s*\(%\)/i.test(line));
  if (headerIndex < 0) return null;

  const columns = lines[headerIndex]
    .replace(/^\*?\s*/, "")
    .split(/\s*,\s*/)
    .map((column) => column.trim());
  const data = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line || line.startsWith("*")) continue;
    const cells = line.split(/\s*,\s*/).map((cell) => Number(cell.trim()));
    if (cells.length < 4) continue;

    const point = {
      frequency: cells[0],
      fundamental: cells[1],
      thd: cells[2],
      noise: cells[3],
      harmonics: {}
    };

    if (!Number.isFinite(point.frequency) || point.frequency <= 0) continue;
    if (!Number.isFinite(point.fundamental) || !Number.isFinite(point.thd)) continue;

    for (let index = 4; index < Math.min(cells.length, columns.length); index++) {
      const match = columns[index]?.match(/^H(\d+)\s*\(%\)$/i);
      if (match && Number.isFinite(cells[index])) {
        point.harmonics[`h${match[1]}`] = cells[index];
      }
    }

    data.push(point);
  }

  if (!data.length) return null;

  const measurementLine = lines.find((line) => /^\*\s*Measurement:/i.test(line));
  const measurementName = measurementLine
    ? measurementLine.replace(/^\*\s*Measurement:\s*/i, "").trim()
    : "";

  return {
    type: "rew-distortion",
    name: measurementName,
    columns,
    data: data.sort((a, b) => a.frequency - b.frequency)
  };
}

export function dataHasPhase(data) {
  return data.some((point) => Number.isFinite(point.phase));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function interpolate(data, frequency) {
  return interpolateField(data, frequency, "level");
}

export function interpolateField(data, frequency, field) {
  if (!data.length || frequency < data[0].frequency || frequency > data[data.length - 1].frequency) {
    return null;
  }
  if (data.length === 1) {
    return data[0].frequency === frequency && Number.isFinite(data[0][field]) ? data[0][field] : null;
  }

  let lo = 0;
  let hi = data.length - 1;

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (data[mid].frequency <= frequency) lo = mid;
    else hi = mid;
  }

  const a = data[lo];
  const b = data[hi];
  if (!Number.isFinite(a[field]) || !Number.isFinite(b[field])) return null;
  if (a.frequency === frequency) return a[field];
  if (b.frequency === frequency) return b[field];

  const t = (Math.log10(frequency) - Math.log10(a.frequency)) / (Math.log10(b.frequency) - Math.log10(a.frequency));
  return a[field] + (b[field] - a[field]) * t;
}

export function interpolatePhase(data, frequency) {
  const rawPhase = interpolateField(data, frequency, "rawPhase");
  if (rawPhase !== null) return wrapPhaseDegrees(rawPhase);
  return interpolateField(data, frequency, "phase");
}

export function interpolateRawPhase(data, frequency) {
  return interpolateField(data, frequency, "rawPhase") ?? interpolateField(data, frequency, "phase");
}

export function wrapPhaseDegrees(value) {
  if (!Number.isFinite(value)) return null;
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function smoothData(data, octaves) {
  if (!octaves) return data;

  const halfWindow = octaves / 2;
  const logFreqs = data.map((point) => Math.log2(point.frequency));
  const smoothed = [];
  let start = 0;
  let end = 0;
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    const minLog = logFreqs[i] - halfWindow;
    const maxLog = logFreqs[i] + halfWindow;

    while (end < data.length && logFreqs[end] <= maxLog) {
      sum += data[end].level;
      end++;
    }

    while (start < end && logFreqs[start] < minLog) {
      sum -= data[start].level;
      start++;
    }

    smoothed.push({
      frequency: data[i].frequency,
      level: sum / (end - start),
      phase: data[i].phase
    });
  }

  return smoothed;
}

function getOriginalPhaseData(displaySource) {
  let previousRawPhase = null;

  return displaySource
    .filter((point) => Number.isFinite(point.phase))
    .map((point) => {
      let rawPhase = point.phase;
      if (previousRawPhase !== null) {
        while (rawPhase - previousRawPhase > 180) rawPhase -= 360;
        while (rawPhase - previousRawPhase < -180) rawPhase += 360;
      }
      previousRawPhase = rawPhase;

      return {
        frequency: point.frequency,
        rawPhase,
        phase: wrapPhaseDegrees(rawPhase)
      };
    })
    .filter((point) => point.phase !== null);
}

function getPhaseMarginData(curve, displaySource) {
  const original = getOriginalPhaseData(displaySource);
  if (original.length < 2) return [];

  const minimum = getMinimumPhaseData(curve, displaySource);
  if (minimum.length < 2) return [];
  const cacheKey = `${curve.minimumPhaseCache?.key || ""}|${getPhaseDataSignature(original)}`;
  if (curve.phaseMarginCache?.key === cacheKey) return curve.phaseMarginCache.data;

  const data = original
    .map((point) => {
      const minimumPhase = interpolateRawPhase(minimum, point.frequency);
      if (minimumPhase === null) return null;
      return {
        frequency: point.frequency,
        rawPhase: (point.rawPhase ?? point.phase) - minimumPhase,
        phase: wrapPhaseDegrees((point.rawPhase ?? point.phase) - minimumPhase)
      };
    })
    .filter(Boolean);

  curve.phaseMarginCache = { key: cacheKey, data };
  return data;
}

function getPhaseDataSignature(data) {
  if (!data.length) return "empty";

  const step = Math.max(1, Math.floor(data.length / 32));
  return data
    .filter((_, index) => index % step === 0 || index === data.length - 1)
    .map((point) => `${point.frequency.toFixed(3)}:${(point.rawPhase ?? point.phase).toFixed(3)}`)
    .join(",");
}

export function getPhaseSeries(curve, displaySource) {
  if (!curve.hasPhase) return [];

  const series = [];

  if (curve.showPhase) {
    series.push({
      id: "phase",
      label: "相位",
      dash: [3, 5],
      data: getOriginalPhaseData(displaySource)
    });
  }

  if (curve.minimumPhase) {
    series.push({
      id: "minimumPhase",
      label: "最小相位",
      dash: [7, 3],
      data: getMinimumPhaseData(curve, displaySource)
    });
  }

  if (curve.phaseMargin) {
    series.push({
      id: "phaseMargin",
      label: "相位裕度",
      dash: [1, 4],
      data: getPhaseMarginData(curve, displaySource)
    });
  }

  return series.filter((item) => item.data.length);
}

function getMinimumPhaseData(curve, displaySource) {
  const source = displaySource.filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.level) && point.frequency > 0);
  if (source.length < 4) return [];

  const sourceSignature = getMinimumPhaseSourceSignature(source);
  const cacheKey = [
    curve.smoothingOctaves || 0,
    "cepstrum-v1",
    source.length,
    source[0].frequency,
    source[source.length - 1].frequency,
    sourceSignature
  ].join("|");
  if (curve.minimumPhaseCache?.key === cacheKey) return curve.minimumPhaseCache.data;

  const cepstrumData = calculateMinimumPhaseFromLinearSpectrum(source);
  if (cepstrumData.length) {
    curve.minimumPhaseCache = { key: cacheKey, data: cepstrumData };
    return cepstrumData;
  }

  const frequencies = createMinimumPhaseFrequencyGrid(source);
  const referenceLevel = source[0].level;
  const logMagnitude = frequencies.map((frequency) => ((interpolate(source, frequency) ?? referenceLevel) - referenceLevel) * Math.log(10) / 20);
  const integrationSamples = extendMinimumPhaseSamples(frequencies, logMagnitude);
  const calculated = calculateMinimumPhaseByBodeIntegral(frequencies, integrationSamples.frequencies, integrationSamples.logMagnitude)
    .filter((point) => Number.isFinite(point.phase));
  const data = source
    .map((point) => {
      const rawPhase = interpolateRawPhase(calculated, point.frequency);
      return {
        frequency: point.frequency,
        rawPhase,
        phase: wrapPhaseDegrees(rawPhase)
      };
    })
    .filter((point) => Number.isFinite(point.phase));

  curve.minimumPhaseCache = { key: cacheKey, data };
  return data;
}

function createMinimumPhaseFrequencyGrid(source) {
  if (source.length <= MINIMUM_PHASE_GRID_POINTS) {
    return source.map((point) => point.frequency);
  }

  const minLog = Math.log10(source[0].frequency);
  const maxLog = Math.log10(source[source.length - 1].frequency);
  const frequencies = [];

  for (let i = 0; i < MINIMUM_PHASE_GRID_POINTS; i++) {
    const ratio = i / (MINIMUM_PHASE_GRID_POINTS - 1);
    frequencies.push(10 ** (minLog + (maxLog - minLog) * ratio));
  }

  return frequencies;
}

function calculateMinimumPhaseFromLinearSpectrum(source) {
  if (source.length < 16) return [];

  const maxFrequency = source[source.length - 1].frequency;
  const medianStep = estimateMedianFrequencyStep(source);
  if (!Number.isFinite(medianStep) || medianStep <= 0 || !Number.isFinite(maxFrequency) || maxFrequency <= 0) return [];

  const halfBins = clampPowerOfTwo(
    Math.ceil(maxFrequency / medianStep),
    MINIMUM_PHASE_FFT_MIN_BINS,
    MINIMUM_PHASE_FFT_MAX_BINS
  );
  const fftSize = halfBins * 2;
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  const referenceLevel = interpolateLinearLevel(source, 0);

  for (let bin = 0; bin <= halfBins; bin++) {
    const frequency = (maxFrequency * bin) / halfBins;
    real[bin] = (interpolateLinearLevel(source, frequency) - referenceLevel) * Math.log(10) / 20;
  }

  for (let bin = halfBins + 1; bin < fftSize; bin++) {
    real[bin] = real[fftSize - bin];
  }

  fft(real, imag, true);

  for (let bin = 1; bin < halfBins; bin++) {
    real[bin] *= 2;
    imag[bin] *= 2;
  }
  for (let bin = halfBins + 1; bin < fftSize; bin++) {
    real[bin] = 0;
    imag[bin] = 0;
  }

  fft(real, imag, false);

  return source
    .map((point) => {
      const rawPhase = interpolateFftPhase(imag, point.frequency, maxFrequency, halfBins);
      return {
        frequency: point.frequency,
        rawPhase,
        phase: wrapPhaseDegrees(rawPhase)
      };
    })
    .filter((point) => Number.isFinite(point.phase));
}

function estimateMedianFrequencyStep(source) {
  const steps = [];
  const stride = Math.max(1, Math.floor(source.length / 4096));

  for (let index = stride; index < source.length; index += stride) {
    const step = source[index].frequency - source[index - stride].frequency;
    if (Number.isFinite(step) && step > 0) steps.push(step / stride);
  }

  if (!steps.length) return null;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

function clampPowerOfTwo(value, min, max) {
  let result = 1;
  while (result < value) result *= 2;
  return Math.max(min, Math.min(max, result));
}

function interpolateLinearLevel(source, frequency) {
  if (frequency <= source[0].frequency) return source[0].level;
  if (frequency >= source[source.length - 1].frequency) return source[source.length - 1].level;

  let lo = 0;
  let hi = source.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (source[mid].frequency <= frequency) lo = mid;
    else hi = mid;
  }

  const a = source[lo];
  const b = source[hi];
  const t = (frequency - a.frequency) / (b.frequency - a.frequency);
  return a.level + (b.level - a.level) * t;
}

function interpolateFftPhase(imaginarySpectrum, frequency, maxFrequency, halfBins) {
  const position = clamp((frequency / maxFrequency) * halfBins, 0, halfBins);
  const lower = Math.floor(position);
  const upper = Math.min(halfBins, lower + 1);
  const t = position - lower;
  return (imaginarySpectrum[lower] * (1 - t) + imaginarySpectrum[upper] * t) * 180 / Math.PI;
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

function getMinimumPhaseSourceSignature(source) {
  let hash = 2166136261;

  for (const point of source) {
    const frequency = Math.round(point.frequency * 1000);
    const relativeLevel = Math.round((point.level - source[0].level) * 1000);
    hash ^= frequency;
    hash = Math.imul(hash, 16777619);
    hash ^= relativeLevel;
    hash = Math.imul(hash, 16777619);
  }

  return String(hash >>> 0);
}

function extendMinimumPhaseSamples(frequencies, logMagnitude) {
  const extensionDecades = 2;
  const extensionPoints = 48;
  const lnFrequencies = frequencies.map((frequency) => Math.log(frequency));
  const lowSlope = estimateEndpointSlope(lnFrequencies, logMagnitude, 0);
  const highSlope = estimateEndpointSlope(lnFrequencies, logMagnitude, frequencies.length - 1);
  const extendedFrequencies = [];
  const extendedLogMagnitude = [];
  const lowStart = lnFrequencies[0] - extensionDecades * Math.log(10);
  const lowStep = (lnFrequencies[0] - lowStart) / extensionPoints;

  for (let i = 0; i < extensionPoints; i++) {
    const lnFrequency = lowStart + i * lowStep;
    extendedFrequencies.push(Math.exp(lnFrequency));
    extendedLogMagnitude.push(logMagnitude[0] + lowSlope * (lnFrequency - lnFrequencies[0]));
  }

  extendedFrequencies.push(...frequencies);
  extendedLogMagnitude.push(...logMagnitude);

  const highEnd = lnFrequencies[lnFrequencies.length - 1] + extensionDecades * Math.log(10);
  const highStep = (highEnd - lnFrequencies[lnFrequencies.length - 1]) / extensionPoints;

  for (let i = 1; i <= extensionPoints; i++) {
    const lnFrequency = lnFrequencies[lnFrequencies.length - 1] + i * highStep;
    extendedFrequencies.push(Math.exp(lnFrequency));
    extendedLogMagnitude.push(logMagnitude[logMagnitude.length - 1] + highSlope * (lnFrequency - lnFrequencies[lnFrequencies.length - 1]));
  }

  return { frequencies: extendedFrequencies, logMagnitude: extendedLogMagnitude };
}

function estimateEndpointSlope(lnFrequencies, values, endpointIndex) {
  const span = Math.min(12, values.length - 1);
  if (span < 1) return 0;

  if (endpointIndex === 0) {
    const slope = (values[span] - values[0]) / (lnFrequencies[span] - lnFrequencies[0]);
    return clamp(slope, -4, 4);
  }

  const last = values.length - 1;
  const slope = (values[last] - values[last - span]) / (lnFrequencies[last] - lnFrequencies[last - span]);
  return clamp(slope, -4, 4);
}

function calculateMinimumPhaseByBodeIntegral(targetFrequencies, integrationFrequencies, logMagnitude) {
  const n = integrationFrequencies.length;
  const lnFrequencies = integrationFrequencies.map((frequency) => Math.log(frequency));
  const result = [];

  for (const omega of targetFrequencies) {
    const omegaSquared = omega * omega;
    const referenceLogMagnitude = interpolateLogMagnitude(integrationFrequencies, logMagnitude, omega);
    if (referenceLogMagnitude === null) continue;
    let integral = 0;

    for (let j = 0; j < n - 1; j++) {
      const x0 = lnFrequencies[j];
      const x1 = lnFrequencies[j + 1];
      const dx = x1 - x0;
      const midLogFrequency = (x0 + x1) / 2;
      const midFrequency = Math.exp(midLogFrequency);
      const midLogMagnitude = (logMagnitude[j] + logMagnitude[j + 1]) / 2;
      integral += minimumPhaseKernel(midFrequency, midLogMagnitude, omega, omegaSquared, referenceLogMagnitude) * dx;
    }

    const rawPhase = (2 * omega / Math.PI) * integral * 180 / Math.PI;
    result.push({
      frequency: omega,
      rawPhase,
      phase: wrapPhaseDegrees(rawPhase)
    });
  }

  return result;
}

function interpolateLogMagnitude(frequencies, values, frequency) {
  if (!frequencies.length || frequency < frequencies[0] || frequency > frequencies[frequencies.length - 1]) return null;

  let lo = 0;
  let hi = frequencies.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (frequencies[mid] <= frequency) lo = mid;
    else hi = mid;
  }

  if (frequencies[lo] === frequency) return values[lo];
  if (frequencies[hi] === frequency) return values[hi];
  const t = (Math.log(frequency) - Math.log(frequencies[lo])) / (Math.log(frequencies[hi]) - Math.log(frequencies[lo]));
  return values[lo] + (values[hi] - values[lo]) * t;
}

function minimumPhaseKernel(frequency, logMagnitude, omega, omegaSquared, referenceLogMagnitude) {
  const denominator = frequency * frequency - omegaSquared;
  if (Math.abs(denominator) < Number.EPSILON) return 0;
  return ((logMagnitude - referenceLogMagnitude) * frequency) / denominator;
}
