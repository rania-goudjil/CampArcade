# Camp Arcade Website

Plain HTML, CSS, and JavaScript website with an Arcade Mode QR ticket system.

## Frontend Visual Identity

The main theme styles live in `styles.css`. The visual identity is based on a retro arcade, camp/nature, and leaderboard arcade machine direction.

Global colors:

```css
:root {
  --primary: #2F4F3A;
  --secondary: #6BBE4E;
  --accent: #F4D35E;
  --accent-2: #885A2B;
  --background: #EADCC2;
  --background-soft: #CCAA7E;
  --text-dark: #191818;
  --text-light: #ffffff;
}
```

Fonts:

- Display and scoreboard labels: `Press Start 2P`
- Body, forms, navigation, and readable controls: `Poppins`

SVG assets are stored in `Files/`. `Files/Design sans titre (1).svg` is the main logo/identity asset and is used in the browser icon, header, hero, and footer. `Files/Group 37064.svg` is used as a decorative arcade glyph in the Arcade Mode cabinet. Original SVG files are not edited destructively.

## QR Ticket System

Arcade Mode lives in `index.html#arcade`. A winning QR opens a URL like:

```text
/index.html?win=game-1#arcade
```

On page load, `script.js` creates a persistent anonymous browser/device ID in `localStorage`, validates the `win` game ID against the shared game list, and sends one `POST /api/scan` request. Repeated scans of the same QR code are allowed and each valid scan adds one ticket.

The frontend polls `GET /api/state?userId=...` every 4 seconds while Arcade Mode is visible. It shows:

- Current user's total tickets.
- Current user's tickets per game.
- Current user's most scanned game.
- Global total scans.
- Global high score and the first user who reached it.
- Per-game high scores.
- Showdown state and winner.

## Editing Games

Edit the 15 placeholder game names in:

```text
arcade-config.js
```

Each game has an `id`, `name`, and `qrPath`. Keep the IDs as `game-1` through `game-15` unless you also update any printed QR codes.

## Winning QR Codes

Generated QR SVG files are stored in:

```text
winning-qr-codes/
```

The mapping file is:

```text
winning-qr-codes/README.md
```

Regenerate local QR codes:

```bash
npm run generate:qr
```

Regenerate production QR codes after you know the deployed domain:

```bash
PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app npm run generate:qr
```

## Local Testing

Run the dependency-free local server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/index.html?win=game-1#arcade
```

Run the backend/data-model tests:

```bash
npm test
```

The local server uses a file in `/tmp` when Vercel KV variables are not configured. That fallback is for local testing only.

## API Routes

- `POST /api/scan`
  - Body: `{ "userId": "...", "email": "optional@example.com", "gameId": "game-1" }`
  - Adds one ticket for a valid game.

- `GET /api/state?userId=...`
  - Returns current user stats, game list, global stats, showdown state, and winner flag.

- `POST /api/user`
  - Body: `{ "userId": "...", "email": "optional@example.com" }`
  - Saves or clears optional email.

- `POST /api/admin/showdown`
  - Body: `{ "secret": "..." }`
  - Requires `ADMIN_SECRET`.
  - Locks the current global high score and winner.

- `POST /api/admin/reset`
  - Body: `{ "secret": "..." }`
  - Requires `ADMIN_SECRET`.
  - Dangerous testing route that clears ticket state.

## Showdown Behavior

When showdown starts, the current global high score is locked and the first user who reached that score becomes the winner. After showdown is active, scans still count toward user totals and global total scans, but global and per-game high-score tables do not change. This keeps the showdown winner locked while still allowing post-showdown ticket collection.

The winning user sees the winner overlay through the normal polling refresh. Other users see the locked score and winner in the Showdown card.

## Required Environment Variables

For Vercel deployment with persistent global data:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
ADMIN_SECRET
```

Use Vercel KV or Upstash Redis REST credentials for the KV variables. `ADMIN_SECRET` is the password required by admin showdown and reset routes.

The API intentionally requires KV in production/Vercel. Without those variables, deployed API routes will return a configuration error instead of using non-persistent storage.

## Vercel Deployment

1. Create or link the Vercel project.
2. Add Vercel KV / Upstash Redis free-tier storage.
3. Set `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `ADMIN_SECRET`.
4. Deploy the project.
5. Regenerate QR codes with `PUBLIC_SITE_URL` set to the final deployment URL before printing production QR codes.

Deployment was not run from this workspace because Vercel login/project linking and required environment variables are external setup.
