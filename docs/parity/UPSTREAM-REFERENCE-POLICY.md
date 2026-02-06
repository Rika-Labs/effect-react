# Upstream Reference Policy

`@effect-react/react` uses git submodules as source-of-truth references while implementing parity features.

## Reference submodules

- `submodules/nextjs`
- `submodules/tanstack-query`
- `submodules/tanstack-router`
- `submodules/tanstack-table`
- `submodules/tanstack-virtual`
- `submodules/tanstack-form`

## Rules

1. Submodules are reference-only. Runtime code must not import from submodule source.
2. Every parity feature must map to an upstream reference path in `docs/parity/PARITY-SOURCE-MAP.md`.
3. Submodule updates are explicit commit-pin updates and must include regression tests.
4. Feature behavior should prefer stable upstream contracts over unstable internals.
