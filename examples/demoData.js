/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * Synthetic frequency-response data used only by the demo button.
 * Real imports still go through app.js -> audioMath.parseCsv().
 */

export function getDemoCurves() {
  return [
    { name: "设备 A - 左声道", data: makeDemoCurveData(0.2, -0.6, 3.5) },
    { name: "设备 A - 右声道", data: makeDemoCurveData(1.4, -0.4, 2.8) },
    { name: "设备 B", data: makeDemoCurveData(2.5, 0.5, 1.2) }
  ];
}

export function getDemoTarget() {
  const data = [];

  for (let frequency = 20; frequency <= 20000; frequency *= 1.08) {
    const bass = 5 / (1 + Math.pow(frequency / 120, 2));
    const trebleDown = frequency > 1000 ? -2.5 * Math.log10(frequency / 1000) : 0;
    data.push({ frequency, level: bass + trebleDown });
  }

  return { name: "实验室目标曲线", data };
}

function makeDemoCurveData(colorOffset, tilt = 0, bass = 0) {
  const data = [];

  for (let frequency = 20; frequency <= 20000; frequency *= 1.08) {
    const log = Math.log10(frequency / 1000);
    const ripple = Math.sin(log * 6 + colorOffset) * 1.6 + Math.sin(log * 17 + colorOffset) * 0.7;
    const bassShelf = bass / (1 + Math.pow(frequency / 130, 2));
    const treble = frequency > 4500 ? Math.sin(Math.log(frequency) * 4 + colorOffset) * 2.2 : 0;
    data.push({ frequency, level: ripple + bassShelf + tilt * log + treble });
  }

  return data;
}
