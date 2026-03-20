# Economy Simulation Harness

Deterministic formula-level economy simulation for:

- BASE
- MINERS
- Arcade paid
- Arcade freeplay
- Shared vault net redeemable liability

## Run

```bash
npx tsx sim/economy/run.ts
```

## Liability Identity

Net Redeemable Liability =

- Redeemable Credits
- Redeemable Internal Spends
- Withdrawn
- Burned / Quarantined / Excluded

## Notes

- Server-authority formulas are used where practical from SQL files.
- Arcade is grouped into deterministic RTP categories to avoid modeling every game branch line-by-line.
- Freeplay rewards are tracked as non-redeemable by default.
