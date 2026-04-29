/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

import { createMineCartAnimator } from "./animate.js";

const ANIMATIONS = ["railRide", "waveRide", "coalRide"];

export class MetricAnimationController {
  constructor({ stage, grid, enabled = true } = {}) {
    this.stage = stage;
    this.grid = grid || stage?.closest(".metric-grid") || null;
    this.enabled = Boolean(enabled);
    this.paused = false;
    this.animator = null;
    this.mirrored = false;
    this.timer = 0;
    this.syncVisibility();
  }

  start(delay = 240) {
    if (!this.stage || !this.enabled || this.paused) return;
    this.ensureAnimator();
    this.schedule(delay);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.syncVisibility();
    window.clearTimeout(this.timer);
    this.timer = 0;

    if (!this.animator && this.enabled && !this.paused) {
      this.start(120);
      return;
    }

    if (!this.animator) return;
    this.animator.clear();
    if (this.enabled && !this.paused) this.schedule(120);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.animator?.clear();
    if (!this.paused && this.enabled) this.start(120);
  }

  resize() {
    if (!this.animator || !this.stage) return;
    this.animator.resize(this.stage.clientWidth || 520, this.stage.clientHeight || 86);
  }

  destroy() {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.animator?.destroy();
    this.animator = null;
  }

  ensureAnimator() {
    if (this.animator || !this.stage) return;
    this.animator = createMineCartAnimator({
      parent: this.stage,
      width: this.stage.clientWidth || 520,
      height: this.stage.clientHeight || 86
    });
  }

  schedule(delay = 900) {
    window.clearTimeout(this.timer);
    if (!this.enabled || this.paused) return;
    this.timer = window.setTimeout(() => this.playNext(), delay);
  }

  playNext() {
    if (!this.enabled || this.paused || !this.animator || !this.stage) return;

    const width = this.stage.clientWidth || 520;
    const height = this.stage.clientHeight || 86;
    const options = {
      width,
      height,
      mirrored: this.mirrored,
      actorHeight: Math.max(44, height * 0.9),
      onComplete: () => {
        this.mirrored = !this.mirrored;
        this.schedule(900 + Math.random() * 700);
      }
    };

    const animation = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
    if (animation === "railRide") this.animator.playRailRide(options);
    else if (animation === "waveRide") this.animator.playWaveRide(options);
    else this.animator.playCoalRide(options);
  }

  syncVisibility() {
    if (!this.stage) return;
    this.stage.hidden = !this.enabled;
    this.grid?.classList.toggle("is-animation-disabled", !this.enabled);
  }
}
