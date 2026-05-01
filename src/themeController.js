/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

export function createThemeController({
  state,
  themeToggle,
  themeSetting,
  normalizeTheme,
  saveUserSettings,
  cssColorCache,
  renderCurveList,
  drawChart,
  prepareThemeScene
}) {
  let themeTransitionTimer = null;

  function setTheme(value, options = {}) {
    const theme = normalizeTheme(value);
    const persist = options.persist !== false;
    const redraw = options.redraw !== false;
    state.theme = theme;
    document.body.dataset.theme = theme;
    cssColorCache.clear();
    themeToggle.classList.toggle("is-dark", theme === "dark");
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle.title = theme === "dark" ? "切换亮色模式" : "切换暗色模式";
    themeToggle.setAttribute("aria-label", themeToggle.title);
    if (themeSetting) themeSetting.checked = theme === "dark";
    if (persist) saveUserSettings(state);
    if (redraw) {
      renderCurveList();
      drawChart();
    }
  }

  function toggleTheme() {
    const nextTheme = state.theme === "dark" ? "light" : "dark";
    if (nextTheme === "dark") {
      Promise.resolve(prepareThemeScene?.())
        .catch((error) => console.warn(error))
        .finally(() => playDarkThemeTransition(() => setTheme("dark")));
      return;
    }
    setTheme("light");
  }

  function playDarkThemeTransition(onRevealComplete) {
    const rect = themeToggle.getBoundingClientRect();
    const originX = `${rect.left + rect.width / 2}px`;
    const originY = `${rect.top + rect.height / 2}px`;
    document.body.style.setProperty("--theme-origin-x", originX);
    document.body.style.setProperty("--theme-origin-y", originY);

    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script").forEach((script) => script.remove());
    clone.querySelectorAll(".theme-wipe-overlay").forEach((node) => node.remove());
    clone.querySelector("body")?.setAttribute("data-theme", "dark");
    clone.querySelector("body")?.classList.add("theme-scene-enter");

    const overlay = document.createElement("iframe");
    overlay.className = "theme-wipe-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.tabIndex = -1;
    document.body.appendChild(overlay);
    overlay.contentDocument.open();
    overlay.contentDocument.write(`<!DOCTYPE html>${clone.outerHTML}`);
    overlay.contentDocument.close();

    document.body.classList.remove("theme-scene-enter");

    window.clearTimeout(themeTransitionTimer);
    window.setTimeout(() => {
      onRevealComplete?.();
      document.body.classList.add("theme-scene-enter");
    }, 760);
    themeTransitionTimer = window.setTimeout(() => {
      overlay.remove();
      document.body.classList.remove("theme-scene-enter");
    }, 1680);
  }

  return {
    setTheme,
    toggleTheme
  };
}
