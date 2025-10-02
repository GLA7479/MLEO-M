# MLEO Miners — New App (2 pages)

This is a clean Next.js project with **2 pages**: landing (`/`) and game (`/play`).

## What you need to add
1. **Paste your game file** to: `game/mleo-miners.js` (exact file name).
2. **Add assets** into `public/*`:
   - `public/images/` : bg-cave.png, leo-miner-4x.png, rock.png, silver.png, coin3.png, coin4.png, leo-intro.png
   - `public/sounds/` : click.mp3, merge.mp3, rock.mp3, gift.mp3
   - `public/ads/`    : ad1.mp4 (optional)

3. Create `.env.local` with your **WalletConnect Project ID** (already scaffolded).

## Scripts
```
npm i
npm run dev
# open http://localhost:3000
```

## Notes
- `pages/play.js` dynamically imports the game on the client only.
- `Layout` includes mobile safe-area and PWA meta tags.
- Tailwind is preconfigured.
