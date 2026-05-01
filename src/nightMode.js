/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

const DEFAULT_SCENE_URL = "./assets/night-scene.svg";

export async function installNightModeScene(options = {}) {
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
