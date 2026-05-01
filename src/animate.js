/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * Sprite-sheet animator used by the optional metrics-panel animation.
 * MetricAnimationController controls when this runs.
 */

const SPRITE_SRC = new URL("../assets/cattymove-sprite.png", import.meta.url).href;
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 150;
const DEFAULT_STEP_MS = 250;
const CELL_W = 320;
const CELL_H = 270;

const FRAMES = {
  push: [
    { x: 0, y: 0, w: CELL_W, h: CELL_H },
    { x: CELL_W, y: 0, w: CELL_W, h: CELL_H },
    { x: CELL_W * 2, y: 0, w: CELL_W, h: CELL_H },
    { x: CELL_W * 3, y: 0, w: CELL_W, h: CELL_H }
  ],
  wave: [
    { x: 0, y: CELL_H, w: CELL_W, h: CELL_H },
    { x: CELL_W, y: CELL_H, w: CELL_W, h: CELL_H },
    { x: CELL_W * 2, y: CELL_H, w: CELL_W, h: CELL_H },
    { x: CELL_W * 3, y: CELL_H, w: CELL_W, h: CELL_H },
    { x: CELL_W * 4, y: CELL_H, w: CELL_W, h: CELL_H }
  ],
  cart: [
    { x: 0, y: CELL_H * 2, w: CELL_W, h: CELL_H },
    { x: CELL_W, y: CELL_H * 2, w: CELL_W, h: CELL_H },
    { x: CELL_W * 2, y: CELL_H * 2, w: CELL_W, h: CELL_H },
    { x: CELL_W * 3, y: CELL_H * 2, w: CELL_W, h: CELL_H },
    { x: CELL_W * 4, y: CELL_H * 2, w: CELL_W, h: CELL_H }
  ],
  rail: { x: 0, y: CELL_H * 3, w: 1430, h: 82 }
};

const ANIMATIONS = {
  railRide: { frames: FRAMES.push, frameMs: DEFAULT_STEP_MS },
  waveRide: { frames: FRAMES.push, waveFrames: FRAMES.wave, frameMs: DEFAULT_STEP_MS, waveFrameMs: DEFAULT_STEP_MS },
  coalRide: { frames: FRAMES.cart, frameMs: DEFAULT_STEP_MS }
};

const activeAnimators = new Set();

export function createMineCartAnimator(options = {}) {
  // Factory keeps active instances tracked for global cleanup.
  const animator = new MineCartAnimator(options);
  activeAnimators.add(animator);
  return animator;
}

export function cleanupMineCartAnimationComponents() {
  for (const animator of activeAnimators) animator.destroy();
  activeAnimators.clear();
}

export class MineCartAnimator {
  constructor(options = {}) {
    this.parent = options.parent || document.body;
    this.spriteSrc = options.spriteSrc || SPRITE_SRC;
    this.width = positiveNumber(options.width, DEFAULT_WIDTH);
    this.height = positiveNumber(options.height, DEFAULT_HEIGHT);
    this.stepMs = positiveNumber(options.stepMs, DEFAULT_STEP_MS);
    this.timer = 0;
    this.actor = null;
    this.image = new Image();
    this.image.src = this.spriteSrc;
    this.canvas = document.createElement("canvas");
    this.canvas.className = options.className || "mine-cart-animation-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, {
      display: "block",
      width: `${this.width}px`,
      height: `${this.height}px`,
      pointerEvents: "none"
    });
    this.ctx = this.canvas.getContext("2d");
    this.resize(this.width, this.height);
    this.parent.appendChild(this.canvas);
    this.image.addEventListener("load", () => this.drawStaticFrame());
  }

  resize(width = this.width, height = this.height) {
    const nextWidth = positiveNumber(width, this.width);
    const nextHeight = positiveNumber(height, this.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.width === nextWidth && this.height === nextHeight && this.dpr === dpr) return;

    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(this.width * dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStaticFrame();
  }

  clear() {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.actor = null;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  destroy() {
    this.clear();
    this.canvas.remove();
  }

  playRailRide(options = {}) {
    this.play("railRide", options);
  }

  playWaveRide(options = {}) {
    this.play("waveRide", options);
  }

  playCoalRide(options = {}) {
    this.play("coalRide", options);
  }

  playMany(sequence = [], options = {}) {
    const items = sequence.length ? sequence : ["railRide", "waveRide", "coalRide"];
    let index = 0;
    const count = options.count || items.length;
    const intervalMs = positiveNumber(options.intervalMs, 220);
    const playNext = () => {
      if (index >= count) return;
      const type = normalizeAnimationType(items[index % items.length]);
      index++;
      this.play(type, {
        ...options,
        onComplete: () => {
          this.timer = window.setTimeout(playNext, intervalMs);
        }
      });
    };
    playNext();
  }

  play(type, options = {}) {
    window.clearTimeout(this.timer);
    const nextWidth = options.width || this.width;
    const nextHeight = options.height || this.height;
    if (nextWidth !== this.width || nextHeight !== this.height) {
      this.resize(nextWidth, nextHeight);
    }

    const animationType = normalizeAnimationType(type);
    const config = ANIMATIONS[animationType] || ANIMATIONS.railRide;
    const geometry = this.getGeometry(config, options);
    const mirrored = options.mirrored === true;
    const startX = mirrored ? this.width : -geometry.actorW;
    const endX = mirrored ? -geometry.actorW : this.width;
    const moveDistance = Math.abs(endX - startX);
    const movementStep = Math.max(1, geometry.actorW * 0.25);
    const steps = Math.max(1, Math.ceil(moveDistance / movementStep));
    const centerX = this.width / 2 - geometry.actorW / 2;
    const centerStep = Math.max(1, Math.ceil(Math.abs(centerX - startX) / movementStep));
    const waveLoops = 1;

    this.actor = {
      type: animationType,
      config,
      geometry,
      mirrored,
      step: 0,
      moveFrameStep: 0,
      steps,
      centerStep,
      startX,
      endX,
      centerX,
      moveDirection: mirrored ? -1 : 1,
      moveDistance,
      movementStep,
      phase: "move-in",
      waveLoops,
      waveStep: 0,
      waveTotalSteps: config.waveFrames ? config.waveFrames.length * waveLoops : 0,
      onComplete: typeof options.onComplete === "function" ? options.onComplete : null
    };

    this.tick();
  }

  tick() {
    if (!this.actor) return;
    if (!this.image.complete || !this.image.naturalWidth) {
      this.timer = window.setTimeout(() => this.tick(), this.stepMs);
      return;
    }

    this.draw();
    const done = this.advanceActor();
    if (done) {
      const onComplete = this.actor.onComplete;
      this.actor = null;
      if (onComplete) onComplete();
      return;
    }

    const frameMs = this.actor.phase === "wave" ? this.actor.config.waveFrameMs : this.actor.config.frameMs;
    this.timer = window.setTimeout(() => this.tick(), positiveNumber(frameMs, this.stepMs));
  }

  advanceActor() {
    const actor = this.actor;
    if (actor.type !== "waveRide") {
      actor.step++;
      actor.moveFrameStep++;
      return actor.step > actor.steps;
    }

    if (actor.phase === "move-in") {
      actor.step++;
      actor.moveFrameStep++;
      if (actor.step >= actor.centerStep) {
        actor.step = actor.centerStep;
        actor.phase = "wave";
        actor.waveStep = 0;
      }
      return false;
    }

    if (actor.phase === "wave") {
      actor.waveStep++;
      if (actor.waveStep >= actor.waveTotalSteps) {
        actor.phase = "move-out";
        actor.moveFrameStep = 0;
      }
      return false;
    }

    actor.step++;
    actor.moveFrameStep++;
    return actor.step > actor.steps;
  }

  drawStaticFrame() {
    if (!this.image.complete || !this.image.naturalWidth || this.actor) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawRail();
  }

  draw() {
    const actor = this.actor;
    const { actorW, actorH, actorY } = actor.geometry;
    const frameSet = actor.phase === "wave" && actor.config.waveFrames ? actor.config.waveFrames : actor.config.frames;
    const frameIndex = actor.phase === "wave"
      ? actor.waveStep % frameSet.length
      : actor.moveFrameStep % frameSet.length;
    const frame = frameSet[frameIndex];
    const x = this.getActorX(actor);
    const bob = actor.type === "coalRide" ? (actor.step % 2 === 0 ? -4 : 4) : 0;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawRail();
    this.ctx.save();
    if (actor.mirrored) {
      this.ctx.translate(x + actorW, actorY + bob);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, 0, 0, actorW, actorH);
    } else {
      this.ctx.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, x, actorY + bob, actorW, actorH);
    }
    this.ctx.restore();
  }

  getActorX(actor) {
    if (actor.phase === "wave") return actor.centerX;

    if (actor.type === "waveRide" && actor.phase === "move-out") {
      const distanceFromCenter = Math.min((actor.step - actor.centerStep) * actor.movementStep, Math.abs(actor.endX - actor.centerX));
      return actor.centerX + actor.moveDirection * distanceFromCenter;
    }

    const distanceFromStart = Math.min(actor.step * actor.movementStep, actor.moveDistance);
    return actor.startX + actor.moveDirection * distanceFromStart;
  }

  drawRail() {
    const rail = FRAMES.rail;
    const railH = this.getRailHeight();
    const railW = railH * (rail.w / rail.h);
    const railY = this.getRailY(railH);

    for (let x = 0; x < this.width; x += railW) {
      this.ctx.drawImage(this.image, rail.x, rail.y, rail.w, rail.h, x, railY, railW, railH);
    }
  }

  getGeometry(config, options) {
    const frame = config.frames[0];
    const railH = this.getRailHeight();
    const actorH = positiveNumber(options.actorHeight, Math.max(52, this.height - railH * 0.9));
    const actorW = actorH * (frame.w / frame.h);
    const railY = this.getRailY(railH);
    const actorY = Math.max(0, railY - actorH + railH * 0.12);
    return { actorW, actorH, actorY };
  }

  getRailHeight() {
    return clamp(this.height * 0.13, 12, 28);
  }

  getRailY(railH = this.getRailHeight()) {
    return this.height - railH - Math.max(2, this.height * 0.035);
  }
}

function normalizeAnimationType(type) {
  if (type === "rail" || type === "push" || type === "railRide") return "railRide";
  if (type === "wave" || type === "waveRide") return "waveRide";
  if (type === "coal" || type === "cart" || type === "coalRide") return "coalRide";
  return "railRide";
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
