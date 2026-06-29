# Devpost gallery

Fifteen 1920×1080 branded images for the TollRoad Devpost submission — a
balanced overview that walks a judge from the problem to the metered-billing
fix, the listener + artist product, the polyglot-CQRS architecture, x402
agents, Superfan Bonds, delivery, the AWS stack, and a closing card.

Built with the same technique as `../overlays`: a pure-stdlib Python generator
emits one self-contained HTML doc per card (inline SVG + base64 fonts), then
each is screenshotted with headless Chromium. Opaque asphalt background, toll
amber / royal gold primary, metering-green for money, electric blue for the
read-side database.

## Regenerate

```bash
cd docs/demo/devpost-gallery && python3 build.py
```

Requires `python3` and `chromium-browser` on PATH. Output lands in `png/`,
numbered so the gallery keeps its intended order. Edit copy/colors/layout in
`build.py` and re-run.

## The set (upload to Devpost in this order — image 01 is the thumbnail)

| # | File | What it shows |
|---|------|---------------|
| 01 | `png/01-hero.png` | Wordmark + "Pay for the minutes you actually hear" — the thumbnail |
| 02 | `png/02-problem.png` | $11.99 flat fee + pooled payout vs a fair per-minute rate |
| 03 | `png/03-concept.png` | The fix: meter music like a utility (live taximeter dial) |
| 04 | `png/04-listener.png` | Listener — prepaid wallet + live per-minute meter |
| 05 | `png/05-artist.png` | Artist — earn for minutes played, royalty ledger, Stripe payout |
| 06 | `png/06-rates.png` | Variable rates: free → $1.00/min at 0.1¢ precision |
| 07 | `png/07-cqrs.png` | Polyglot CQRS: command → Streams → projector → query |
| 08 | `png/08-two-databases.png` | DynamoDB (the meter) vs Aurora DSQL (system of record) |
| 09 | `png/09-royalty-ledger.png` | Append-only royalty ledger, millicents, derived bonds |
| 10 | `png/10-atomic-minute.png` | One atomic write per minute; can't stream past zero |
| 11 | `png/11-x402-agents.png` | AI agents pay-per-minute over x402; the MCP Vibe DJ |
| 12 | `png/12-superfan-bonds.png` | Metered minutes → ranked, leveling Superfan Bonds |
| 13 | `png/13-delivery.png` | Meter-gated signed-URL audio (S3/KMS) + Stripe money flow |
| 14 | `png/14-aws-stack.png` | The AWS services behind the metering core |
| 15 | `png/15-close.png` | Closing card — tagline + tollroadmusic.xyz |

All product facts and numbers are drawn from the repo `README.md`. Illustrative
values on the mock cards (balances, earnings, fan names) are sample data.
