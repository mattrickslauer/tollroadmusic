#!/usr/bin/env python3
"""Generate TOLLROAD_AWS_ARCHITECTURE.pdf — a thorough, system-level map of
TollRoad's AWS stack, tuned for the H0 hackathon (Track 3 · DBs are the centerpiece).

Master overview + focused detail pages, one idea per page, dark "meter" aesthetic
(brand: Deep Indigo #0a0f1c, Meter-Amber #f5a524 signal). Every resource shown is
real and traceable to `infra/lib/tollroad-stack.ts`, `infra/lambda/projector/index.js`,
and `backend/src/*`.

    python3 docs/architecture/generate_aws_diagram.py
"""
import math
import os

# ----------------------------------------------------------------------------- palette
BG      = "#0a0f1c"   # Deep Indigo
PANEL   = "#141c30"
PANEL2  = "#1b2540"
STROKE  = "#2c3a5c"
TEXT    = "#eaf0fb"   # Signal White
MUTED   = "#94a3c4"
FAINT   = "#5a6788"
# brand signal — the meter. DynamoDB (the metering heart) shares the accent on purpose.
AMBER   = "#f5a524"   # Meter-Amber — the signal · DynamoDB (command/write side)
DIM     = "#a06d12"   # Amber Deep
GREEN   = "#34d399"   # Aurora DSQL · read model / system of record
CYAN    = "#22d3ee"   # API Gateway / edge
VIOLET  = "#a855f7"   # Lambda / compute
ROSE    = "#fb7185"   # billing / Stripe / metering / 402
BLUE    = "#3b82f6"   # S3 / CloudFront / storage
RED     = "#ef4444"   # auth / security / KMS
GOLD    = "#f5a524"
SANS    = "Geist, DejaVu Sans, Helvetica, Arial, sans-serif"
MONO    = "Geist Mono, DejaVu Sans Mono, ui-monospace, monospace"

W, H = 1340, 760
SIGNAL = AMBER   # the brand accent used for kickers / underlines / motif


# ----------------------------------------------------------------------------- svg helpers
def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size, color, anchor="start", weight="400", spacing=None,
         opacity=1, family=SANS):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
            f'fill="{color}" text-anchor="{anchor}" font-weight="{weight}"{ls} '
            f'opacity="{opacity}">{esc(s)}</text>')


def rect(x, y, w, h, fill, stroke=None, rx=0, sw=1.5, opacity=1, dash=None):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
            f'fill="{fill}"{s}{d} opacity="{opacity}"/>')


def circle(cx, cy, r, fill="none", stroke=None, sw=1.5, opacity=1, dash=None):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{s}{d} opacity="{opacity}"/>'


def line(x1, y1, x2, y2, color=MUTED, sw=2, dash=None, opacity=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{color}" stroke-width="{sw}"{d} opacity="{opacity}" stroke-linecap="round"/>')


def arrow(x1, y1, x2, y2, color=MUTED, sw=2.0, dash=None, head=9, label=None,
          label_color=None, label_dy=-9, label_size=11.5):
    a = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - head * math.cos(a), y2 - head * math.sin(a)
    p2 = (x2 - head * math.cos(a - 0.42), y2 - head * math.sin(a - 0.42))
    p3 = (x2 - head * math.cos(a + 0.42), y2 - head * math.sin(a + 0.42))
    out = [line(x1, y1, bx, by, color, sw, dash),
           f'<polygon points="{x2:.1f},{y2:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f}" fill="{color}"/>']
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + label_dy
        out.append(text(mx, my, label, label_size, label_color or MUTED, "middle", "600", family=MONO))
    return "".join(out)


def node(x, y, w, h, title, subs=None, accent=CYAN, fill=PANEL, rx=13,
         title_size=16, sub_size=11, tag=None, tag_color=None):
    """An AWS resource node: title, optional sub-lines, accent rail, service tag."""
    parts = [rect(x, y, w, h, fill, STROKE, rx),
             f'<rect x="{x:.1f}" y="{y+10:.1f}" width="4.5" height="{h-20:.1f}" rx="2.2" fill="{accent}"/>']
    cx = x + w / 2 + 2
    top = y + (24 if tag else 20)
    if subs:
        parts.append(text(cx, top + 14, title, title_size, TEXT, "middle", "700"))
        ty = top + 36
        for i, s in enumerate(subs):
            parts.append(text(cx, ty + i * 16.5, s, sub_size, MUTED, "middle", family=MONO))
    else:
        parts.append(text(cx, y + h / 2 + title_size * 0.34, title, title_size, TEXT, "middle", "700"))
    if tag:
        parts.append(text(x + 16, y + 18, tag, 9.5, tag_color or accent, "start", "700", spacing=1.4, family=MONO))
    return "".join(parts)


def chip(x, y, w, h, title, sub, accent, title_size=14, sub_size=10.5):
    return "".join([
        rect(x, y, w, h, PANEL2, STROKE, 9),
        f'<rect x="{x:.1f}" y="{y:.1f}" width="4.5" height="{h:.1f}" rx="2.2" fill="{accent}"/>',
        text(x + 14, y + 22, title, title_size, TEXT, "start", "700"),
        text(x + 14, y + 22 + sub_size + 6, sub, sub_size, MUTED, "start", family=MONO),
    ])


def boundary(x, y, w, h, label, color=SIGNAL, dash="2 6", op=0.5):
    return "".join([
        rect(x, y, w, h, "none", color, 18, sw=1.4, opacity=op, dash=dash),
        text(x + 18, y + 24, label, 12, color, "start", "700", spacing=2, family=MONO),
    ])


def meter_motif(cx, cy, r, color=SIGNAL):
    """A faint gauge dial — concentric arcs + tick marks + a swept needle."""
    out = [circle(cx, cy, r * f, stroke=color, sw=1, opacity=0.06) for f in (1, 0.72, 0.46, 0.22)]
    # gauge ticks around the lower-left sweep
    for k in range(0, 9):
        a = math.radians(-200 + k * 25)
        x1, y1 = cx + r * 0.86 * math.cos(a), cy + r * 0.86 * math.sin(a)
        x2, y2 = cx + r * math.cos(a), cy + r * math.sin(a)
        out.append(line(x1, y1, x2, y2, color, 1, opacity=0.06))
    # swept wedge + needle
    a0, a1 = -1.15, -0.55
    out.append(f'<path d="M {cx} {cy} L {cx + r*math.cos(a0):.1f} {cy + r*math.sin(a0):.1f} '
               f'A {r} {r} 0 0 1 {cx + r*math.cos(a1):.1f} {cy + r*math.sin(a1):.1f} Z" '
               f'fill="{color}" opacity="0.05"/>')
    out.append(line(cx, cy, cx + r * 0.82 * math.cos(-0.85), cy + r * 0.82 * math.sin(-0.85), color, 1.4, opacity=0.10))
    return "".join(out)


def page(kicker, title, caption, body, n, total):
    head = [
        rect(0, 0, W, H, BG),
        meter_motif(W - 140, 130, 230),
        text(70, 48, kicker, 12.5, SIGNAL, "start", "700", spacing=3, family=MONO),
        text(68, 90, title, 33, TEXT, "start", "800"),
        line(70, 104, 240, 104, SIGNAL, 3),
    ]
    cap = caption if isinstance(caption, list) else [caption]
    foot = [text(70, H - 50 + i * 20, c, 13.5, MUTED, "start") for i, c in enumerate(cap)]
    foot.append(text(W - 70, H - 34, f"{n:02d} / {total:02d}", 12, FAINT, "end", "700",
                     spacing=1, family=MONO))
    foot.append(text(W - 70, H - 50, "TOLLROAD · AWS", 10.5, FAINT, "end", "700", spacing=2, family=MONO))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           + "".join(head) + body + "".join(foot) + "</svg>")
    return f'<div class="page">{svg}</div>'


TOTAL = 7


# ============================================================================ P1 master
def p1():
    b = []
    # --- external client + edge tier -------------------------------------------------
    b.append(node(46, 318, 152, 96, "Browser / PWA",
                  ["<audio> player", "play · charge · stream"], CYAN, title_size=15, tag="CLIENT"))
    # Vercel edge (NOT AWS compute)
    b.append(boundary(214, 296, 172, 150, "VERCEL", color=FAINT, op=0.6))
    b.append(node(228, 322, 144, 104, "Next.js app",
                  ["/api/v1 proxy", "x-api-key + JWT", "TOLLROAD_API_BASE"], TEXT, fill=PANEL2,
                  title_size=14, tag="NOT AWS", tag_color=FAINT))

    # --- AWS boundary ----------------------------------------------------------------
    AX, AY, AW, AH = 412, 150, 700, 540
    b.append(boundary(AX, AY, AW, AH, "AWS · us-east-1 · TollroadStack  (one CDK stack)"))

    # column 1: API / authz
    b.append(node(430, 196, 156, 80, "API Gateway",
                  ["tollroad-api · v1", "API-key · 50 rps"], CYAN, title_size=15, tag="REST"))
    b.append(node(430, 290, 156, 66, "JWT authorizer",
                  ["session → Bearer"], RED, title_size=14, tag="LAMBDA · OPT"))

    # column 2: lambda compute
    lx, lw = 614, 172
    b.append(text(lx + lw / 2, 188, "LAMBDA  ·  node20", 10.5, VIOLET, "middle", "700", spacing=1.6, family=MONO))
    b.append(node(lx, 196, lw, 92, "tollroad-api  (ApiFn)",
                  ["router · ESM bundle", "256 MB · 30 s", "pg via createRequire"], VIOLET,
                  title_size=14.5, tag="HOT PATH"))
    b.append(node(lx, 304, lw, 96, "ProjectorConsumerFn",
                  ["DDB Streams → DSQL", "batch 100 · retry 3", "SOLE DSQL writer"], VIOLET,
                  title_size=14, tag="CQRS PROJECTOR"))
    b.append(node(lx, 416, lw, 56, "DsqlDepsLayer",
                  ["pg · dsql-signer"], DIM, title_size=13, tag="LAYER"))

    # column 3: data + storage
    dx, dw = 806, 150
    b.append(node(dx, 196, dw, 88, "DynamoDB",
                  ["table: tollroad", "Streams · TTL · GSI1"], AMBER, title_size=15, tag="COMMAND · NoSQL"))
    b.append(node(dx, 300, dw, 80, "Aurora DSQL",
                  ["read model + catalog", "serverless · IAM"], GREEN, title_size=15, tag="QUERY · PG16"))
    b.append(node(dx, 396, dw, 66, "S3 · audio",
                  ["SSE-KMS · OAC", "private"], BLUE, title_size=14, tag="OBJECT"))
    b.append(node(dx, 478, dw, 64, "CloudFront",
                  ["signed URL · KeyGroup"], BLUE, title_size=14, tag="CDN"))

    # column 4: integration / ops
    ex, ew = 972, 128
    b.append(node(ex, 196, ew, 62, "Bedrock", ["titan-embed v2", "vibe search"], VIOLET, title_size=13, tag="AI"))
    b.append(node(ex, 272, ew, 62, "KMS · CMK", ["alias/tollroad", "audio at rest"], RED, title_size=13, tag="ENCRYPT"))
    b.append(node(ex, 348, ew, 74, "Secrets", ["session · CF key", "SMTP · Stripe"], RED, title_size=13, tag="SECURE"))
    b.append(node(ex, 436, ew, 62, "S3 · images", ["covers · avatars", "public CDN"], BLUE, title_size=13, tag="OBJECT"))

    # --- external providers band -----------------------------------------------------
    by = 636
    for i, (nm, ac) in enumerate([("Stripe", ROSE), ("ZeptoMail", GOLD), ("x402 agents", VIOLET), ("MCP", CYAN)]):
        x = 614 + i * 122
        b.append(rect(x, by, 110, 36, PANEL2, STROKE, 8))
        b.append(f'<rect x="{x:.1f}" y="{by:.1f}" width="4" height="36" rx="2" fill="{ac}"/>')
        b.append(text(x + 57, by + 23, nm, 12.5, TEXT, "middle", "700"))
    b.append(text(602, by + 23, "EXTERNAL", 10, FAINT, "end", "700", spacing=1.4, family=MONO))

    # --- arrows: main flows ----------------------------------------------------------
    b.append(arrow(198, 352, 228, 360, FAINT))                       # client → vercel (REST)
    b.append(arrow(372, 360, 430, 232, CYAN, dash="5 5", label="x-api-key", label_dy=-4, label_size=10))
    b.append(arrow(586, 232, 614, 238, CYAN))                        # api gw → api lambda
    b.append(arrow(586, 320, 614, 330, RED, dash="3 4"))             # authz gate
    b.append(arrow(786, 240, 806, 240, AMBER))  # api → dynamo (write)
    b.append(arrow(806, 338, 786, 350, GREEN))  # dsql → api (read / query)
    b.append(arrow(806, 270, 786, 330, AMBER, dash="2 5", label="Streams", label_dy=-2, label_size=10))  # stream→projector
    b.append(arrow(786, 360, 806, 410, BLUE, dash="3 4", label="presign", label_dy=14, label_size=9))    # api → s3 presign
    b.append(arrow(198, 392, 856, 510, BLUE, dash="5 6", label="signed audio · 206", label_dy=-6, label_size=9.5))  # browser → cloudfront
    b.append(arrow(956, 430, 956, 396, RED, dash="3 4"))             # kms → s3
    b.append(arrow(956, 478, 940, 462, RED, dash="3 4"))             # kms/cf
    b.append(arrow(786, 226, 972, 224, VIOLET, dash="4 4"))          # api → bedrock
    b.append(arrow(700, 636, 700, 472, ROSE, dash="4 4"))           # stripe → webhook (api)
    b.append(arrow(372, 414, 372, 636, GOLD, dash="4 4"))           # vercel → external (otp/email)

    return page("ARCHITECTURE · MASTER", "The entire AWS system",
                ["Three planes: a synchronous request/billing path (Browser → Vercel proxy → API Gateway → tollroad-api λ),",
                 "an asynchronous CQRS projection (DynamoDB Streams → ProjectorConsumerFn → Aurora DSQL), and an audio plane (KMS → S3 → signed CloudFront). One region, one CDK stack."],
                "".join(b), 1, TOTAL)


# ============================================================================ P2 dynamodb
def p2():
    b = []
    cx, cy = 250, 318
    b.append(rect(cx - 98, cy - 66, 196, 132, PANEL, AMBER, 18, sw=2))
    b.append(text(cx, cy - 28, "tollroad", 25, TEXT, "middle", "800"))
    b.append(text(cx, cy - 4, "single table", 12, MUTED, "middle", family=MONO))
    b.append(text(cx, cy + 19, "PK + SK", 13, AMBER, "middle", "700", family=MONO))
    b.append(text(cx, cy + 41, "on-demand", 11, FAINT, "middle", family=MONO))

    b.append(chip(150, 466, 200, 50, "TTL", "attr: ttl · auto-expire", AMBER))
    b.append(chip(150, 526, 200, 50, "GSI1 · ARTIST#id", "reverse lookups", BLUE))

    # the atomic write callout
    b.append(rect(60, 582, 580, 104, PANEL2, STROKE, 12))
    b.append(text(78, 608, "THE ATOMIC WRITE  ·  one TransactWriteItems", 12, ROSE, "start", "700", spacing=1.2, family=MONO))
    b.append(text(78, 631, "1 · conditional debit  USER#id/BAL  −1 metered minute  (stop-at-zero)", 12, MUTED, "start", family=MONO))
    b.append(text(78, 652, "2 · append  EVT#minute#track  METER event", 12, MUTED, "start", family=MONO))
    b.append(text(78, 674, "balance & proof-of-pay move together, or not at all — never a partial charge", 11, FAINT, "start", family=MONO))

    # item types (right)
    items = [
        ("Balance (authoritative)", "USER#id / BAL",        AMBER, "conditional −, millicents"),
        ("Meter event",            "EVT#minute#track",     ROSE,  "proof of one paid minute"),
        ("Top-up event",           "TOPUP#ref",            GREEN, "Stripe credit · idempotent"),
        ("Artist reverse index",   "GSI1 ARTIST#id",       BLUE,  "earnings rollup keys"),
    ]
    ix, iy, iw, ih, gap = 470, 176, 430, 70, 16
    b.append(text(ix, iy - 14, "ITEM TYPES · THE KEY PREFIX IS THE TYPE", 11, MUTED, "start", "700", spacing=1.4, family=MONO))
    for i, (t, k, ac, note) in enumerate(items):
        y = iy + i * (ih + gap)
        b.append(rect(ix, y, iw, ih, PANEL2, STROKE, 10))
        b.append(f'<rect x="{ix:.1f}" y="{y:.1f}" width="4.5" height="{ih:.1f}" rx="2.2" fill="{ac}"/>')
        b.append(text(ix + 16, y + 27, t, 15, TEXT, "start", "700"))
        b.append(text(ix + 16, y + 50, k, 12, MUTED, "start", family=MONO))
        b.append(text(ix + iw - 14, y + 27, note, 10.5, ac, "end", "600", family=MONO))
        b.append(line(cx + 98, cy, ix, y + ih / 2, ac, 1, dash="2 5", opacity=0.26))

    # stream out
    b.append(node(940, 300, 150, 70, "Streams", ["NEW + OLD", "→ projector"], VIOLET, title_size=14, tag="CHANGE LOG"))
    b.append(arrow(900, 335, 940, 335, AMBER, dash="3 4"))

    return page("DATA · DYNAMODB", "The command side — money, at write speed",
                ["DynamoDB is the authoritative ledger of record for balance: every play is an atomic, conditional decrement that stops exactly at zero.",
                 "A single table holds balance, meter events and top-ups; the key prefix is the type, TTL ages events out, and the Stream is the change-log that feeds Aurora DSQL."],
                "".join(b), 2, TOTAL)


# ============================================================================ P3 dsql
def p3():
    b = []
    cx, cy = 660, 244
    b.append(rect(cx - 156, cy - 52, 312, 106, PANEL, GREEN, 16, sw=2))
    b.append(text(cx, cy - 16, "Aurora DSQL", 24, TEXT, "middle", "800"))
    b.append(text(cx, cy + 10, "TollroadDsql · serverless postgres 16", 11.5, MUTED, "middle", family=MONO))
    b.append(text(cx, cy + 32, "<clusterId>.dsql.us-east-1.on.aws", 11, GREEN, "middle", "700", family=MONO))

    # two auth paths
    b.append(node(110, 196, 232, 96, "tollroad-api  (admin)",
                  ["catalog + balance reads", "dsql:DbConnectAdmin", "fresh IAM token / conn"], VIOLET,
                  title_size=15, tag="IAM · ADMIN"))
    b.append(node(110, 326, 232, 110, "projector  (least-priv)",
                  ["role: projector", "dsql:DbConnect", "only writes read model", "TLS verified"], TEXT,
                  fill=PANEL2, title_size=14, tag="IAM · LEAST-PRIV"))
    b.append(arrow(342, 242, cx - 156, 240, VIOLET, label="read", label_dy=-8))
    b.append(arrow(342, 372, cx - 156, 296, TEXT, dash="4 4", label="project", label_dy=-8))

    # tables list (right)
    tables = [
        ("artists · tracks",       "catalog · system of record",          CYAN,  "slug · is_active*"),
        ("royalty_ledger",         "append-only · idempotency_key",       GREEN, "exactly-once"),
        ("artist_daily_summary",   "earnings rollup per artist/day",      AMBER, "projector upsert"),
        ("wallet_topups",          "payment_ref · credited_millicents",   ROSE,  "ON CONFLICT skip"),
        ("listener_profiles",      "balance_millicents · reconciliation", GREEN, "mirror of BAL"),
        ("projector_checkpoint",   "last stream seq · best-effort",       VIOLET,"resume marker"),
    ]
    ix, iy, iw, ih, gap = 836, 196, 444, 58, 10
    b.append(text(ix, iy - 12, "RELATIONAL READ MODEL · queried by the app", 11, MUTED, "start", "700", spacing=1.2, family=MONO))
    for i, (t, c, ac, note) in enumerate(tables):
        y = iy + i * (ih + gap)
        b.append(rect(ix, y, iw, ih, PANEL2, STROKE, 10))
        b.append(f'<rect x="{ix:.1f}" y="{y:.1f}" width="4.5" height="{ih:.1f}" rx="2.2" fill="{ac}"/>')
        b.append(text(ix + 16, y + 24, t, 14.5, TEXT, "start", "700"))
        b.append(text(ix + 16, y + 44, c, 10.5, MUTED, "start", family=MONO))
        b.append(text(ix + iw - 14, y + 24, note, 10, ac, "end", "700", family=MONO))
        b.append(line(cx + 156, cy, ix, y + ih / 2, ac, 1, dash="2 5", opacity=0.20))

    b.append(chip(110, 476, 232, 100, "DSQL realities",
                  "scale-to-zero · no idle cost", DIM, title_size=13))
    b.append(text(124, 536, "OCC retries on 40001", 10.5, MUTED, "start", family=MONO))
    b.append(text(124, 554, "IAM-token auth, no passwords", 10.5, MUTED, "start", family=MONO))

    return page("DATA · AURORA DSQL", "The query side — relational truth",
                ["Everything you read — the catalog, an artist's earnings, the royalty ledger, top-ups, the reconciled balance — lives in Aurora DSQL.",
                 "The API connects as admin to read; only the projector writes, under a least-privilege role with a fresh IAM token per connection. Serverless: it scales to zero, so idle costs nothing."],
                "".join(b), 3, TOTAL)


# ============================================================================ P4 metering loop / CQRS
def p4():
    b = []
    # top: the charge path (a play becomes a charge)
    steps = [
        ("Player dock", "accrues 60 s", CYAN),
        ("POST /charge", "via /api/v1 proxy", TEXT),
        ("API Gateway", "x-api-key · v1", CYAN),
        ("tollroad-api", "TransactWrite", VIOLET),
        ("DynamoDB", "BAL − · EVT +", AMBER),
    ]
    x = 60
    for i, (t, s, ac) in enumerate(steps):
        w = 218
        b.append(node(x, 176, w, 74, t, [s], ac, fill=PANEL2 if t == "POST /charge" else PANEL,
                      title_size=15, tag=None))
        if i < len(steps) - 1:
            b.append(arrow(x + w, 213, x + w + 18, 213, MUTED))
        x += w + 18

    # the projection (middle) — DynamoDB → stream → projector → DSQL
    b.append(node(60, 320, 230, 96, "DynamoDB Stream",
                  ["NEW_AND_OLD_IMAGES", "filter INSERT · METER|TOPUP"], AMBER, title_size=15, tag="CHANGE LOG"))
    b.append(node(372, 320, 240, 96, "ProjectorConsumerFn",
                  ["batch 100 · bisectOnError", "retry 3 · OCC 40001 backoff"], VIOLET, title_size=15, tag="CQRS PROJECTOR"))
    b.append(node(700, 320, 250, 96, "Aurora DSQL",
                  ["INSERT royalty_ledger", "ON CONFLICT (idem) DO NOTHING"], GREEN, title_size=15, tag="READ MODEL"))
    b.append(node(1010, 320, 270, 96, "If row is new",
                  ["artist_daily_summary  +=", "balance_millicents  −="], GREEN, title_size=15, tag="SETTLE"))
    b.append(arrow(290, 368, 372, 368, AMBER, label="b100", label_dy=-9, label_size=10))
    b.append(arrow(612, 368, 700, 368, VIOLET, label="project", label_dy=-9))
    b.append(arrow(950, 368, 1010, 368, GREEN))

    # idempotency anchor
    b.append(rect(372, 440, 578, 56, PANEL2, ROSE, 10, sw=1.4))
    b.append(text(384, 466, "IDEMPOTENCY KEY", 11, ROSE, "start", "700", spacing=1.4, family=MONO))
    b.append(text(384, 486, "user#track#minute — same key in the DynamoDB event and the DSQL ledger row → exactly-once", 11.5, MUTED, "start", family=MONO))

    # the stream / playback gate (bottom)
    b.append(text(70, 552, "AUDIO PLANE · pay-then-play", 12, BLUE, "start", "700", spacing=2, family=MONO))
    b.append(node(60, 566, 200, 80, "GET /stream/{id}",
                  ["recent-meter gate", "< ~150 s"], CYAN, title_size=14, tag="GATE"))
    b.append(node(300, 566, 210, 80, "tollroad-api",
                  ["sign CloudFront URL", "CF key pair"], VIOLET, title_size=14, tag="SIGN"))
    b.append(node(556, 566, 200, 80, "CloudFront",
                  ["OAC origin", "trusted KeyGroup"], BLUE, title_size=14, tag="CDN"))
    b.append(node(802, 566, 200, 80, "S3 · audio",
                  ["SSE-KMS decrypt", "206 partial"], BLUE, title_size=14, tag="OBJECT"))
    b.append(node(1048, 566, 232, 80, "KMS · CMK",
                  ["alias/tollroad-audio", "OAC kms:Decrypt"], RED, title_size=14, tag="ENCRYPT"))
    b.append(arrow(260, 606, 300, 606, MUTED))
    b.append(arrow(510, 606, 556, 606, BLUE, label="signed", label_dy=-8, label_size=10))
    b.append(arrow(756, 606, 802, 606, BLUE))
    b.append(arrow(1048, 606, 1002, 606, RED, dash="3 4"))

    return page("FLOW · METERING & CQRS", "How a play becomes money",
                ["The player meters real playback and fires POST /charge every whole minute — one atomic DynamoDB write debits the balance and records proof of payment together.",
                 "The Stream replays each event into Aurora DSQL idempotently: the royalty ledger, the artist's daily earnings, the reconciled balance. Audio is pay-then-play: a signed CloudFront URL gated on a recent charge."],
                "".join(b), 4, TOTAL)


# ============================================================================ P5 app pages
def p5():
    b = []
    panels = [
        ("MARKETING", "public · unauthenticated", CYAN, 60, [
            ("/", "landing · catalog preview"),
            ("/for-artists", "pitch → /artist/join"),
            ("/developers", "x402 · MCP · API pitch"),
            ("/connect", "agent / API connect"),
            ("/signup", "OTP start+verify · ZeptoMail"),
        ]),
        ("LISTENER", "authed · player-docked", GREEN, 380, [
            ("/browse", "GET /catalog  · DSQL"),
            ("/search", "POST /discover · Bedrock"),
            ("/library", "playlists · recents · DSQL"),
            ("/liked", "likes · DSQL"),
            ("/wallet", "GET /balance · Stripe top-up"),
            ("/artists/[slug]", "profile · DSQL · img CDN"),
            ("/playlist/[id]", "playlist · DSQL"),
            ("/u/[handle]", "public profile · DSQL"),
        ]),
        ("ARTIST", "authed · creator", AMBER, 700, [
            ("/artist", "earnings (daily_summary)"),
            ("", "track CRUD → S3 presign"),
            ("", "payouts → Stripe Connect"),
            ("/artist/join", "onboard · DSQL upsert"),
        ]),
        ("PUBLIC SHARE", "unauth · shareable", VIOLET, 1020, [
            ("/a/[slug]", "artist share · DSQL"),
            ("/s/[slug]", "song share · catalog"),
            ("", "play → /charge → /stream"),
            ("", "signed CloudFront · S3"),
        ]),
    ]
    pw = 260
    for title, sub, ac, px, rows in panels:
        b.append(rect(px, 168, pw, 412, PANEL, STROKE, 14))
        b.append(f'<rect x="{px:.1f}" y="{178:.1f}" width="4.5" height="392" rx="2.2" fill="{ac}"/>')
        b.append(text(px + 18, 198, title, 15.5, TEXT, "start", "800"))
        b.append(text(px + 18, 217, sub, 10, ac, "start", "700", spacing=0.8, family=MONO))
        b.append(line(px + 16, 228, px + pw - 16, 228, STROKE, 1))
        ry = 252
        for route, desc in rows:
            if route:
                b.append(text(px + 18, ry, route, 13.5, TEXT, "start", "700", family=MONO))
                b.append(text(px + 18, ry + 17, desc, 10, MUTED, "start", family=MONO))
                ry += 44
            else:
                b.append(text(px + 30, ry - 6, "· " + desc, 10, MUTED, "start", family=MONO))
                ry += 22

    # bottom band: the proxy + agent surface
    b.append(rect(60, 592, 760, 94, PANEL2, STROKE, 12))
    b.append(text(78, 616, "EVERY PAGE GOES THROUGH ONE DOOR", 12, CYAN, "start", "700", spacing=1.2, family=MONO))
    b.append(text(78, 639, "/api/v1/[...path]  Vercel route  →  injects x-api-key + cookie→Bearer  →  API Gateway", 11.5, MUTED, "start", family=MONO))
    b.append(text(78, 661, "listener dock fires /charge per minute; reads from Aurora DSQL, money from DynamoDB, audio from signed CloudFront", 11, FAINT, "start", family=MONO))

    b.append(node(840, 592, 200, 50, "x402 agents", ["402 → /charge → 200"], VIOLET, title_size=13, tag="AGENT-NATIVE"))
    b.append(node(1058, 592, 222, 50, "MCP server", ["catalog · charge · stream"], CYAN, title_size=13, tag="TOOLS"))
    b.append(text(840, 676, "an AI agent licenses music by the second over the same metered API", 10.5, FAINT, "start", family=MONO))

    return page("PRODUCT · PAGES", "Every page, and the AWS it touches",
                ["Four surfaces — marketing, the docked listener app, the artist studio, and public share links — all funnel through one Vercel proxy into API Gateway.",
                 "Reads resolve against Aurora DSQL; the meter writes to DynamoDB; audio streams straight from signed CloudFront. The same API is agent-native via x402 + MCP."],
                "".join(b), 5, TOTAL)


# ============================================================================ P6 payments + identity
def p6():
    b = []
    # --- top-up path (top) ---
    b.append(text(70, 168, "WALLET TOP-UP", 12, ROSE, "start", "700", spacing=2, family=MONO))
    b.append(node(60, 182, 180, 78, "POST /wallet/topup", ["PaymentIntent"], ROSE, title_size=13.5, tag="API"))
    b.append(node(280, 182, 170, 78, "Stripe", ["Checkout · live mode"], ROSE, title_size=15, tag="EXTERNAL"))
    b.append(node(490, 182, 200, 78, "/stripe/webhook", ["key-exempt · HMAC", "idempotent credit"], ROSE, title_size=14, tag="WEBHOOK"))
    b.append(node(730, 182, 180, 78, "DynamoDB", ["TOPUP#ref event"], AMBER, title_size=15, tag="COMMAND"))
    b.append(node(950, 182, 200, 78, "projector → DSQL", ["wallet_topups", "balance credit"], GREEN, title_size=14, tag="SETTLE"))
    b.append(arrow(240, 221, 280, 221, ROSE))
    b.append(arrow(450, 221, 490, 221, ROSE, label="event", label_dy=-8, label_size=10))
    b.append(arrow(690, 221, 730, 221, ROSE))
    b.append(arrow(910, 221, 950, 221, AMBER, dash="3 4", label="Streams", label_dy=-8, label_size=10))

    # --- x402 agent flow (middle) ---
    b.append(text(70, 332, "x402 · AGENT-NATIVE PAYMENT", 12, VIOLET, "start", "700", spacing=2, family=MONO))
    b.append(node(60, 346, 200, 82, "GET /stream/{id}", ["no recent charge", "→ 402 Payment Req"], ROSE, title_size=14, tag="402"))
    b.append(node(300, 346, 210, 82, "402 terms", ["price · asset · pay-to", "machine-readable"], VIOLET, title_size=14, tag="HANDSHAKE"))
    b.append(node(550, 346, 200, 82, "POST /charge", ["debit one minute", "DynamoDB BAL"], AMBER, title_size=14, tag="PAY"))
    b.append(node(790, 346, 220, 82, "GET /stream/{id}", ["200 + signed URL", "agent plays"], GREEN, title_size=14, tag="GRANTED"))
    b.append(node(1050, 346, 230, 82, "MCP server", ["exposes catalog /", "charge / stream tools"], CYAN, title_size=14, tag="TOOLS"))
    b.append(arrow(260, 387, 300, 387, ROSE))
    b.append(arrow(510, 387, 550, 387, VIOLET))
    b.append(arrow(750, 387, 790, 387, AMBER, label="paid", label_dy=-8, label_size=10))
    b.append(arrow(1010, 387, 1050, 387, FAINT, dash="3 4"))

    # --- identity + payouts (bottom) ---
    b.append(text(70, 480, "IDENTITY", 12, RED, "start", "700", spacing=2, family=MONO))
    b.append(node(60, 494, 220, 96, "Email OTP", ["/auth/otp/start+verify", "ZeptoMail SMTP", "code in DynamoDB · TTL"], GOLD, title_size=15, tag="PASSWORDLESS"))
    b.append(node(310, 494, 210, 96, "Session", ["HS256 JWT · httpOnly", "cookie → Bearer", "TOLLROAD_SESSION_SECRET"], TEXT, fill=PANEL2, title_size=15, tag="COOKIE"))
    b.append(arrow(280, 542, 310, 542, GOLD))

    b.append(text(600, 480, "ARTIST PAYOUTS", 12, GREEN, "start", "700", spacing=2, family=MONO))
    b.append(node(590, 494, 220, 96, "Stripe Connect", ["/artist/payouts/onboard", "status · withdraw", "TOLLROAD_APP_BASE_URL"], ROSE, title_size=15, tag="EXPRESS"))
    b.append(node(840, 494, 200, 96, "Aurora DSQL", ["artist_daily_summary", "→ amount owed"], GREEN, title_size=15, tag="EARNINGS"))
    b.append(node(1070, 494, 210, 96, "Bank payout", ["artist gets paid", "money leaves AWS"], GREEN, title_size=14, tag="OFF-RAMP"))
    b.append(arrow(810, 542, 840, 542, ROSE, dash="3 4"))
    b.append(arrow(1040, 542, 1070, 542, GREEN))

    return page("FLOW · MONEY & IDENTITY",
                "Money in, money out, and who's who",
                ["Money in: Stripe top-ups land via a key-exempt webhook → a DynamoDB TOPUP event → the projector credits Aurora DSQL.",
                 "Identity is passwordless email OTP (ZeptoMail) → an HS256 session cookie. Money out: an artist's DSQL earnings settle to their bank via Stripe Connect."],
                "".join(b), 6, TOTAL)


# ============================================================================ P7 inventory
def p7():
    b = []
    cols = [(70, 210, "RESOURCE"), (280, 150, "TYPE"), (430, 250, "TRIGGER / SOURCE"), (680, 230, "TALKS TO")]
    rows = [
        ("TollroadStack",        "CDK Stack",     "cdk deploy · us-east-1",       "every resource", SIGNAL),
        ("tollroad",             "DynamoDB",      "REST + Streams · on-demand",   "api · projector", AMBER),
        ("  GSI1",               "DDB index",     "ARTIST#id · reverse",          "earnings lookups", AMBER),
        ("  Stream",             "DDB stream",    "NEW_AND_OLD_IMAGES",           "ProjectorConsumerFn", AMBER),
        ("TollroadDsql",         "Aurora DSQL",   "IAM admin + projector role",   "api + projector", GREEN),
        ("tollroad-api",         "API Gateway",   "REST · stage v1 · API-key",    "tollroad-api λ", CYAN),
        ("ApiFn (tollroad-api)", "Lambda",        "API GW proxy · ESM",           "DDB · DSQL · S3 · Bedrock", VIOLET),
        ("ProjectorConsumerFn",  "Lambda",        "DDB Stream · batch 100",       "DynamoDB → Aurora DSQL", VIOLET),
        ("DsqlDepsLayer",        "Lambda Layer",  "pg · @aws-sdk/dsql-signer",    "projector", DIM),
        ("JWT authorizer",       "Lambda",        "REQUEST authorizer (opt)",     "API Gateway", RED),
        ("TollroadAudioBucket",  "S3 bucket",     "SSE-KMS · OAC · block public", "CloudFront · presign", BLUE),
        ("TollroadCdn",          "CloudFront",    "signed URL · trusted KeyGroup","S3 audio origin", BLUE),
        ("TollroadImagesBucket", "S3 bucket",     "covers · avatars",             "TollroadImagesCdn", BLUE),
        ("TollroadImagesCdn",    "CloudFront",    "public · OAC",                 "S3 images origin", BLUE),
        ("TollroadAudioKey",     "KMS CMK",       "alias/tollroad-audio · rotate","S3 · CloudFront OAC", RED),
        ("Bedrock",              "AI",            "titan-embed-text-v2 · 1024-d", "tollroad-api (vibe search)", VIOLET),
        ("Stripe",               "External",      "PaymentIntent + webhook",      "wallet · payouts", ROSE),
        ("ZeptoMail",            "External SMTP", "OTP delivery · :587",          "auth", GOLD),
        ("Secrets",              "Env / config",  "session · CF key · SMTP · Stripe","api λ", RED),
        ("MCP server",           "External",      "agent tool surface",           "metered API (x402)", CYAN),
    ]
    y0 = 158
    rh = 23.4
    for x, w, label in cols:
        b.append(text(x, y0, label, 10.5, MUTED, "start", "700", spacing=1.4, family=MONO))
    b.append(line(70, y0 + 8, 1270, y0 + 8, STROKE, 1.2))
    for i, (r, t, trig, talks, ac) in enumerate(rows):
        y = y0 + 26 + i * rh
        if i % 2 == 0:
            b.append(rect(64, y - 16, 1212, rh, PANEL, rx=5, opacity=0.45))
        b.append(f'<rect x="64" y="{y-16:.1f}" width="4" height="{rh:.1f}" fill="{ac}" opacity="0.9"/>')
        indent = r.startswith("  ")
        b.append(text(cols[0][0] + (14 if indent else 0), y, r.strip(),
                      12 if not indent else 11, (MUTED if indent else TEXT), "start",
                      "600" if not indent else "400", family=MONO if indent else SANS))
        b.append(text(cols[1][0], y, t, 11, ac, "start", "600", family=MONO))
        b.append(text(cols[2][0], y, trig, 11, MUTED, "start", family=MONO))
        b.append(text(cols[3][0], y, talks, 11, MUTED, "start", family=MONO))

    b.append(text(70, H - 92, "polyglot by design · DynamoDB = command/write side · Aurora DSQL = query/read side · CQRS bridged by one projector · single region · one CDK stack",
                  10.5, FAINT, "start", family=MONO))
    return page("REFERENCE · INVENTORY", "Every resource, one table",
                ["The complete production inventory — construct, type, what fires it, and what it touches.",
                 "Two AWS databases chosen on purpose: DynamoDB for the high-write metering ledger, Aurora DSQL for relational truth — joined by exactly one CQRS projector."],
                "".join(b), 7, TOTAL)


# ----------------------------------------------------------------------------- render
HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: {w}px {h}px; margin: 0; }}
* {{ margin: 0; padding: 0; }}
.page {{ width: {w}px; height: {h}px; overflow: hidden; }}
.page:not(:last-child) {{ page-break-after: always; }}
svg {{ display: block; }}
</style></head><body>{pages}</body></html>"""


def main():
    pages = "".join([p1(), p2(), p3(), p4(), p5(), p6(), p7()])
    html = HTML.format(w=W, h=H, pages=pages)
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", ".."))
    with open(os.path.join(here, "_aws_diagram.html"), "w") as f:
        f.write(html)
    from weasyprint import HTML as WP
    out = os.path.join(root, "TOLLROAD_AWS_ARCHITECTURE.pdf")
    WP(string=html).write_pdf(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
