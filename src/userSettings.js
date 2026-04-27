/*
 * FreqDig
 * Copyright (c) 2026 Diggercat
 * SPDX-License-Identifier: MIT
 */

const USER_SETTINGS_COOKIE = "freqdig_user_settings";
const COOKIE_MAX_AGE_DAYS = 30;

export const DEFAULT_USER_SETTINGS = {
  watermarkText: "DiggerCat",
  measurementModel: "G.R.A.S. 0045 IEC60318-4",
  easterEggTriggerProbability: 0.5,
  easterEggBurstProbability: 0.2,
  mineCartAnimationEnabled: true
};

export function clampProbability(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

export function loadUserSettings() {
  const raw = getCookie(USER_SETTINGS_COOKIE);
  if (!raw) return { ...DEFAULT_USER_SETTINGS };

  try {
    const settings = JSON.parse(raw);
    return {
      watermarkText: typeof settings.watermarkText === "string" ? settings.watermarkText : DEFAULT_USER_SETTINGS.watermarkText,
      measurementModel: typeof settings.measurementModel === "string" ? settings.measurementModel : DEFAULT_USER_SETTINGS.measurementModel,
      easterEggTriggerProbability: clampProbability(settings.easterEggTriggerProbability, DEFAULT_USER_SETTINGS.easterEggTriggerProbability),
      easterEggBurstProbability: clampProbability(settings.easterEggBurstProbability, DEFAULT_USER_SETTINGS.easterEggBurstProbability),
      mineCartAnimationEnabled: typeof settings.mineCartAnimationEnabled === "boolean" ? settings.mineCartAnimationEnabled : DEFAULT_USER_SETTINGS.mineCartAnimationEnabled
    };
  } catch {
    deleteCookie(USER_SETTINGS_COOKIE);
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings) {
  deleteCookie(USER_SETTINGS_COOKIE);
  setCookie(USER_SETTINGS_COOKIE, JSON.stringify({
    watermarkText: settings.watermarkText,
    measurementModel: settings.measurementModel,
    easterEggTriggerProbability: settings.easterEggTriggerProbability,
    easterEggBurstProbability: settings.easterEggBurstProbability,
    mineCartAnimationEnabled: settings.mineCartAnimationEnabled
  }), COOKIE_MAX_AGE_DAYS);
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function setCookie(name, value, days) {
  const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; samesite=lax`;
}
