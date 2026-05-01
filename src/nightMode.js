/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 *
 * Lazy-loads the static SVG scene used behind dark mode.
 * Keeping the SVG outside index.html makes the main template easier to scan.
 */

const DEFAULT_SCENE_URL = "./assets/night-scene.svg";

export async function installNightModeScene(options = {}) {
  // Idempotent loader: safe to call before every dark-mode transition.
  const host = options.host || document.querySelector("[data-night-scene]");
  const sceneUrl = options.sceneUrl || DEFAULT_SCENE_URL;
  if (!host || host.dataset.nightSceneReady === "true") return null;

  try {
    const response = await fetch(sceneUrl);
    if (!response.ok) throw new Error(`Failed to load night scene: ${response.status}`);

    host.innerHTML = (await response.text()).trim();
    host.dataset.nightSceneReady = "true";
    return host.firstElementChild;
  } catch (error) {
    console.warn(error);
    host.dataset.nightSceneReady = "error";
    return null;
  }
}
