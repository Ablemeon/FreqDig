# Changelog

All notable changes to this project are documented here.

The format loosely follows Keep a Changelog. Versions should be moved from
`Unreleased` into a dated release section when a release is prepared.

[中文](./CHANGELOG.zh-CN.md) | English

## [Unreleased]

### Added

- Added REW THD text import support.
- Added distortion mode for THD, Noise, and harmonic distortion curves.
- Added grouped distortion measurements with rename, remove, and per-series visibility controls.
- Added multi-group distortion comparison when more than one distortion group is enabled.
- Added distortion analysis ranges:
  - Full range 20 Hz - 20 kHz
  - Trusted range 100 Hz - 2 kHz
  - Trusted wide range 100 Hz - 10 kHz
  - Ultra-low range 20 Hz - 60 Hz
  - Low range 60 Hz - 300 Hz
  - Ultra-high range 10 kHz - 20 kHz
- Added distortion analysis export for PNG and SVG outputs.
- Added a curve/distortion dual-state mode switch.
- Added a three-column layout for distortion mode.

### Changed

- Distortion mode now reuses chart tooltip, hover highlight, legend highlight, zoom, and frequency-band controls.
- Distortion axis modes were simplified to percent and dBr.
- Percent mode now uses a fixed 100% upper bound.
- dBr mode now uses a fixed 0 dBr upper bound.
- The right-side y-axis now shows the complementary distortion unit.
- New distortion imports hide H1 by default.
- Distortion mode header controls were simplified to reduce accidental frequency-response operations.
- Dark mode styling for distortion controls was refined.

### Refactored

- Moved distortion calculation and formatting logic into `src/distortion.js`.
- Moved distortion sidebar controls into `src/distortionPanel.js`.
- Moved theme and dark-mode transition control into `src/themeController.js`.

### Removed

- Removed the obsolete `animate-demo.html` page.

## [0.0.1] - 2026-04-30

### Added

- Initial local frequency-response analysis workflow.
