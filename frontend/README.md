# TollRoad — Frontend

The listener / artist / label web app for **TollRoad**, the metered-billing DSP
for music. Built with **Next.js (App Router)** and deployed on **Vercel**. It's a
pure client of the [`/v1` API](../backend) — every data read/write proxies through
`app/api/v1/[...path]/route.ts`, which attaches the session cookie and the server
API key.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Custom CSS** design system (CSS modules + tokens in `app/globals.css`) — no UI framework
- Fonts via `next/font`: **Fraunces** (display), **JetBrains Mono** (instrument / numerals), **Manrope** (body)

## Design language

A precision **metering instrument on asphalt** with a **Night Drive** identity:
near-black background, high-visibility toll-signage amber, road-marking dashed
dividers, a grain overlay, and a **live taximeter** that ticks up cost-per-minute
in real time (`components/Meter.tsx`, `GlobalPlayer.tsx`).

## Routes

Grouped by Next.js route group:

### `(marketing)` — public pitch
| Route | Page |
|---|---|
| `/` | Landing page (Night Drive hero, metered-billing story, honest-10%-cut bar) |
| `/for-artists` | Artist pitch page |
| `/developers` | Public `/v1` API overview |
| `/connect` | MCP "Vibe DJ" setup guide for Claude / agents |

### `(listen)` — the listener app (auth)
| Route | Page |
|---|---|
| `/browse` | Catalog browse with artist/track cards |
| `/search` | Catalog search |
| `/library` | Likes + playlists overview |
| `/liked` | Liked-songs rail |
| `/playlist/[id]` | Playlist detail (owner edit; public share with `?r=<handle>` referral) |
| `/wallet` | Balance + Stripe top-ups |
| `/artists/[slug]` | Artist profile + track list |
| `/u/[handle]` | Public **superfan** profile — the "wall of bonds" |

### `(artist)` — the creator dashboard (auth)
| Route | Page |
|---|---|
| `/artist` | Dashboard: earnings summary, profile editor, song manager, payouts card |
| `/artist/join` | Artist onboarding |

### `(public)` — unauth, OG-tagged share pages
| Route | Page |
|---|---|
| `/a/[slug]` | Shareable artist page (server-rendered, OG meta) |
| `/s/[slug]` | Shareable song page (server-rendered, OG meta) |

### Other
| Route | Page |
|---|---|
| `/signup` | Email-OTP sign-up |
| `/api/v1/[...path]` | Server proxy to the backend `/v1` API (adds cookie + API key) |

## Notable components

```
components/
  GlobalPlayer.tsx     # persistent player: live meter, repeat (off→all→one), stream gate
  Meter.tsx            # live per-minute taximeter
  WalletPanel.tsx · TopUpSheet.tsx       # balance + Stripe top-up
  OnboardingFlow.tsx · SignInSheet.tsx · SignupForm.tsx · AuthButton.tsx
  listen/              # browse/search/library/liked surfaces
  listen/MoodPad/      # Vibe-Pad valence×energy mood-tagging mini-game
  artist/              # ProfileEditor, SongManager (song CRUD + audio upload), PayoutsCard
  bond/                # superfan BondCard / BondWall / BondRail
  share/               # public share-page chrome
  + landing sections   # Hero, MeteredSteps, MiddlemanFlow, Outcomes, Closer, Infrastructure, DevStrip
```

```
lib/
  api/{server,client,types}.ts   # typed API access (server proxy + client fetch)
  auth.ts · routes.ts · slug.ts  # session, route map, slugs
  coverSrc.ts · shareUrls.ts     # cover-art resolution, share/OG URLs
  payoutState.ts                 # Stripe Connect payout state machine
  bond/bondConfig.ts             # superfan tier/BP config
  og/                            # OG image generation
context/MoodProvider.tsx         # Vibe-Pad state
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
# point at the API:
#   TOLLROAD_API_BASE=http://localhost:8787/v1   (and optionally TOLLROAD_APP_API_KEY)
```

## Build

```bash
npm run build
npm run start
```

## Deploy (Vercel)

This app lives in the `frontend/` subdirectory of the repo. In the Vercel project
settings set the **Root Directory** to `frontend`. Framework preset auto-detects
as **Next.js**; no extra build config needed.

```
Root Directory:   frontend
Build Command:    next build      (default)
Output:           .next           (default)
```

Required env: `TOLLROAD_API_BASE` (backend `/v1` URL), `TOLLROAD_APP_API_KEY`
(usage-plan key), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (checkout — note it's
optional in deploy tooling, so verify it's set).
