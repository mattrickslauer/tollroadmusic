# TollRoad — Frontend

The listener / artist / label web app for **TollRoad**, the metered-billing DSP
for music. Built with **Next.js (App Router)** and deployed on **Vercel**.

This package currently ships the **landing page**. The HLS player, live
per-minute meter for real playback, and the artist/label dashboards layer in on
top of this foundation.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Custom CSS** design system (no UI framework) — tokens in `app/globals.css`
- Fonts via `next/font`: **Fraunces** (display), **JetBrains Mono** (instrument
  / numerals), **Manrope** (body)

## Design language

A precision **metering instrument on asphalt**: near-black background,
high-visibility toll-signage amber, road-marking dashed dividers, a grain
overlay, and a **live taximeter** in the hero that ticks up cost-per-minute in
real time (`components/Meter.tsx`).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build
npm run start
```

## Deploy (Vercel)

This app lives in the `frontend/` subdirectory of the repo. In the Vercel
project settings set the **Root Directory** to `frontend`. Framework preset
auto-detects as **Next.js**; no extra build config needed.

```
Root Directory:   frontend
Build Command:    next build      (default)
Output:           .next           (default)
```

## Structure

```
frontend/
├─ app/
│  ├─ layout.tsx      # fonts + metadata
│  ├─ page.tsx        # landing page
│  └─ globals.css     # design tokens + all styles
└─ components/
   ├─ Meter.tsx       # live per-minute taximeter (client)
   ├─ Reveal.tsx      # scroll-reveal wrapper (client)
   └─ BrandMark.tsx   # logo glyph
```
