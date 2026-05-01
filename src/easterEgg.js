/*
 * FreqDig
 * Copyright (c) 2026 Diggercat (挖煤猫)
 * SPDX-License-Identifier: MIT
 *
 * Optional click-triggered avatar effect.
 * app.js passes probabilities and cleanup hooks from user settings.
 */

const DEFAULT_AVATAR_SRC = "./assets/catty.png";
const SINGLE_TRIGGER_INTERVAL = 5;
const TRIGGER_PROBABILITY = 0.5;
const RAPID_BURST_PROBABILITY = 0.2;
const RAPID_BURST_MIN = 20;
const RAPID_BURST_MAX = 40;
const burstTimers = new Set();

export function setupCatAvatarEasterEgg(options = {}) {
  // Event binding entry point; cleanupCatAvatarEasterEgg removes pending timers/elements.
  const target = options.target || document;
  const avatarSrc = options.avatarSrc || DEFAULT_AVATAR_SRC;
  const isEnabled = options.isEnabled || (() => true);
  const ignoredSelector = options.ignoredSelector || "";
  const getTriggerProbability = options.getTriggerProbability || (() => TRIGGER_PROBABILITY);
  const getBurstProbability = options.getBurstProbability || (() => RAPID_BURST_PROBABILITY);
  let clickCount = 0;

  target.addEventListener("click", (event) => {
    if (!isEnabled() || (ignoredSelector && event.target.closest(ignoredSelector))) return;
    clickCount++;
    if (clickCount % SINGLE_TRIGGER_INTERVAL !== 0 || Math.random() >= clampProbability(getTriggerProbability())) return;

    if (Math.random() < clampProbability(getBurstProbability())) {
      spawnRapidCatBurst(event.clientX, event.clientY, avatarSrc);
      return;
    }

    spawnCatAvatar(event.clientX, event.clientY, avatarSrc);
  });
}

function spawnRapidCatBurst(clientX, clientY, avatarSrc) {
  const count = randomInt(RAPID_BURST_MIN, RAPID_BURST_MAX);

  for (let index = 0; index < count; index++) {
    const timer = window.setTimeout(() => {
      burstTimers.delete(timer);
      const offsetX = (Math.random() - 0.5) * 46;
      const offsetY = (Math.random() - 0.5) * 30;
      spawnCatAvatar(clientX + offsetX, clientY + offsetY, avatarSrc, {
        speedMultiplier: 1.45 + Math.random() * 0.7,
        size: 44 + Math.random() * 18
      });
    }, index * (16 + Math.random() * 18));
    burstTimers.add(timer);
  }
}

function spawnCatAvatar(clientX, clientY, avatarSrc, options = {}) {
  const size = options.size || 58;
  const speed = options.speedMultiplier || 1;
  const image = document.createElement("img");
  image.className = "cat-avatar-burst";
  image.src = avatarSrc;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.style.width = `${size}px`;
  image.style.height = `${size}px`;
  document.body.appendChild(image);

  const state = {
    x: clientX - size / 2,
    y: clientY - size / 2,
    vx: (Math.random() - 0.5) * 260 * speed,
    vy: (-260 - Math.random() * 180) * speed,
    rotation: (Math.random() - 0.5) * 40,
    vr: (Math.random() - 0.5) * 360 * speed,
    lastTime: performance.now()
  };
  const gravity = 1280;

  function step(now) {
    const dt = Math.min(0.032, (now - state.lastTime) / 1000);
    state.lastTime = now;
    state.vy += gravity * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.rotation += state.vr * dt;
    image.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) rotate(${state.rotation}deg)`;

    if (state.y > window.innerHeight + size || state.x < -size * 2 || state.x > window.innerWidth + size * 2) {
      image.remove();
      return;
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function cleanupCatAvatarEasterEgg() {
  for (const timer of burstTimers) window.clearTimeout(timer);
  burstTimers.clear();
  for (const image of document.querySelectorAll(".cat-avatar-burst")) {
    image.remove();
  }
}

function clampProbability(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}
