# MLEO Base Structure

This folder keeps `game/mleo-base.js` maintainable by splitting responsibilities into clear modules.

## File Map

- `data.js`
  - Static game data and configuration.
  - Examples: buildings, modules, research trees, scene coordinates, contracts, live events.

- `engine.js`
  - Pure game/domain logic.
  - Examples: role metadata, scene state helpers, state normalization, level-up helpers, progression helpers.

- `actions.js`
  - Shared action/controller helpers used by `mleo-base.js`.
  - Contains repetitive state merge/update logic for async server actions.

- `components/panels/`
  - Presentational UI panels and panel shells.
  - Keep these focused on rendering and callbacks, not game state mutation rules.

- `../mleo-base.js`
  - Main orchestrator (container/controller).
  - Owns React state, effects, UI flow, and wiring between engine/data/actions/panels.

## Working Rules

When adding or changing code, prefer this decision order:

1. **Static content or tuning values?**
   - Put in `data.js`.
2. **Deterministic logic (no React state/effects)?**
   - Put in `engine.js`.
3. **Repeated async action/update merge pattern?**
   - Put in `actions.js`.
4. **JSX rendering block or panel UI?**
   - Put in `components/panels/`.
5. **Only orchestration/wiring?**
   - Keep in `mleo-base.js`.

## Practical Boundaries

- Keep `mleo-base.js` as the integration layer.
- Avoid creating tiny one-purpose files unless they remove meaningful complexity.
- Prefer extending existing modules (`engine.js`, `actions.js`, `data.js`) before adding new files.
