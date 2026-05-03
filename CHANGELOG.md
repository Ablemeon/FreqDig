# Changelog

All notable changes to this project are documented here.

The format loosely follows Keep a Changelog. Versions should be moved from `Unreleased` into a dated release section when a release is prepared.

[中文](./CHANGELOG.zh-CN.md) | English

## [Unreleased]

### Added

- Added REW THD text import support.
- Added distortion mode for THD, Noise, and harmonic distortion curves.
- Added grouped distortion measurements with rename, remove, visibility, and per-series controls.
- Added distortion analysis ranges and distortion analysis export.
- Added REW Impulse Response import for IR analysis and waterfall analysis.
- Added group delay analysis from phase slope.
- Added a WebGL2 3D waterfall renderer with slice/grid rendering modes.
- Added waterfall controls for slice count, dynamic range, time depth, zoom, rotation, pan, frequency width, and render algorithm.
- Added waterfall analysis summary cards linked to current waterfall settings.
- Added WebGL2 acceleration for dense frequency-response and phase curve rendering.
- Added module-level comments to the main JavaScript files to make feature locations easier to find.

### Changed

- Limited the open-source edition UI and import/project flow to frequency response, distortion, and group delay analysis.
- Frequency-response curve rendering now uses a hybrid path: WebGL2 for dense curve strokes, Canvas2D for axes, text, tooltips, legend, and export composition.
- Octave smoothing now uses log-frequency weighted smoothing to reduce narrow-window jagged artifacts.
- Relative waterfall data now keeps decay down to `-80 dB`, with a wider default dynamic range.
- Waterfall slice count can generate up to `501` frames when performance allows.
- The default waterfall camera is now yaw `-20°` and pitch `0°`.
- Dark mode and header layering were refined across chart modes.

### Fixed

- Fixed waterfall PNG/SVG export composition paths.
- Fixed dark-mode visibility issues for 2D charts.
- Fixed several waterfall rendering artifacts by replacing the earlier continuous surface with a WebGL2 slice/grid renderer.
- Fixed octave smoothing artifacts that could make smoothed curves look more jagged than raw curves.

### Refactored

- Moved distortion calculation and formatting logic into `src/distortion.js`.
- Moved distortion sidebar controls into `src/distortionPanel.js`.
- Moved theme and dark-mode transition control into `src/themeController.js`.
- Added `src/waterfall.js`, `src/waterfall3d.js`, `src/impulseAnalysis.js`, `src/groupDelay.js`, and `src/frequencyWebgl.js` for analysis and rendering modules.

### Removed

- Removed the obsolete `animate-demo.html` page.

## [0.0.1] - 2026-04-30

### Added

- Initial local frequency-response analysis workflow.
