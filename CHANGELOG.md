# Changelog

All notable changes to this project will be documented in this file.

## 0.0.1 - 2026-02-08

### Added

- Effect-native first-party modules for state, query, router, form, grid, virtual lists, realtime, and devtools.
- Expanded API reference docs for all public module exports under `docs/reference/*`.
- CI pipeline with parallel jobs for repo linting, quality checks, tests, and build in `.github/workflows/ci.yml`.
- Release pipeline with parallel preflight checks and npm publish on version tags in `.github/workflows/release.yml`.
- Repo lint configuration in `.repo-lint.yaml` and script wiring in `package.json`.
- Coverage thresholds enforced in `vitest.config.ts` (`lines >= 95`, `statements >= 95`).

### Changed

- Package name renamed to `@rika-labs/effect-react`.
- Package version set to initial release `0.0.1`.
- Test layout refactored to mirror implementation modules under `src/__tests__/*`.
- Root and docs import examples updated to use `@rika-labs/effect-react` paths.

### Notes

- This is the initial public release line for the package identity `@rika-labs/effect-react`.
