#!/usr/bin/env python3
"""Generate ARCHITECTURE.pdf — a visual map of the TollRoad metered-listening flow,
from a listener pressing play down to every AWS service and piece of infra.

Four pages, same dark "radar" brand as COST_VISUAL.pdf:
  1. Master topology — every component + AWS service, with directional data flow.
  2. The listening sequence — play → charge → stream → meter loop → settle.
  3. The metering data path — DynamoDB hot path → Streams → DSQL, exactly-once.
  4. AWS service & infra inventory — constructs, roles, key config, deploy drift.

Source of truth: backend/src/{handlers,domain}, infra/lib/tollroad-stack.ts,
infra/lambda/rollup, frontend/context/PlayerProvider.tsx, docs/data-model.md.

    python3 docs/generate_architecture_pdf.py
"""
import math
import os

# ----------------------------------------------------------------------------- palette (dark radar brand)
BG, PANEL, PANEL2, STROKE = "#0a0f1c", "#141c30", "#1b2540", "#2c3a5c"
TEXT, MUTED, FAINT = "#eaf0fb", "#94a3c4", "#5a6788"
CYAN, AMBER, ROSE = "#22d3ee", "#f5a524", "#fb7185"
VIOLET, GREEN, BLUE, RED = "#a855f7", "#34d399", "#3b82f6", "#ef4444"
FONT = "DejaVu Sans, Helvetica, Arial, sans-serif"
MONO = "DejaVu Sans Mono, monospace"
W, H = 1280, 800


# ----------------------------------------------------------------------------- svg primitives
def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size, color, anchor="start", weight="400", spacing=None, opacity=1, family=FONT):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
            f'fill="{color}" text-anchor="{anchor}" font-weight="{weight}"{ls} opacity="{opacity}">{esc(s)}</text>')


def rect(x, y, w, h, fill, stroke=None, rx=0, sw=1.5, opacity=1, dash=None):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"{s}{d} opacity="{opacity}"/>'


def line(x1, y1, x2, y2, color=MUTED, sw=2, dash=None, opacity=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" '
            f'stroke-width="{sw}"{d} opacity="{opacity}" stroke-linecap="round"/>')


def circle(cx, cy, r, fill="none", stroke=None, sw=1.5, opacity=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{s} opacity="{opacity}"/>'


def radar_motif(cx, cy, r, color=CYAN):
    out = [circle(cx, cy, r * f, stroke=color, sw=1, opacity=0.06) for f in (1, .7, .44, .2)]
    a0, a1 = -1.15, -0.55
    out.append(f'<path d="M {cx} {cy} L {cx+r*math.cos(a0):.1f} {cy+r*math.sin(a0):.1f} '
               f'A {r} {r} 0 0 1 {cx+r*math.cos(a1):.1f} {cy+r*math.sin(a1):.1f} Z" fill="{color}" opacity="0.05"/>')
    return "".join(out)


def page(kicker, title, body, n, total=4, sub=None):
    head = [rect(0, 0, W, H, BG), radar_motif(W - 140, 150, 240),
            text(70, 52, kicker, 13, CYAN, "start", "700", spacing=3),
            text(68, 96, title, 34, TEXT, "start", "800"),
            line(70, 112, 250, 112, CYAN, 3)]
    if sub:
        head.append(text(70, 138, sub, 15, MUTED, "start"))
    foot = [text(W - 70, H - 34, f"{n:02d} / {total:02d}", 12, FAINT, "end", "700", spacing=1),
            text(70, H - 34, "TollRoad · metered-billing DSP · listening + settlement architecture · AWS us-east-1", 11, FAINT, "start", spacing=1)]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           + "".join(head) + body + "".join(foot) + "</svg>")
    return f'<div class="page">{svg}</div>'


# ----------------------------------------------------------------------------- node + arrow helpers
def node(x, y, w, h, title, sub, color, tag=None, title_size=16):
    out = [rect(x, y, w, h, PANEL, STROKE, 12),
           f'<rect x="{x+0.5:.1f}" y="{y+11:.1f}" width="4.5" height="{h-22:.1f}" rx="2.2" fill="{color}"/>']
    ty = y + (29 if (sub or tag) else h / 2 + 6)
    out.append(text(x + 18, ty, title, title_size, TEXT, "start", "800"))
    if sub:
        out.append(text(x + 18, ty + 19, sub, 11.5, MUTED, "start"))
    if tag:
        out.append(text(x + 18, y + h - 12, tag, 9.5, color, "start", "700", spacing=1.2))
    return "".join(out)


# anchors on a node rect (x,y,w,h)
def L(n): return (n[0], n[1] + n[3] / 2)
def R(n): return (n[0] + n[2], n[1] + n[3] / 2)
def T(n): return (n[0] + n[2] / 2, n[1])
def B(n): return (n[0] + n[2] / 2, n[1] + n[3])
def CX(n): return n[0] + n[2] / 2
def CY(n): return n[1] + n[3] / 2


def _head(x1, y1, x2, y2, color, hl=10, hw=6):
    a = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - hl * math.cos(a), y2 - hl * math.sin(a)
    p1 = (bx + hw * math.sin(a), by - hw * math.cos(a))
    p2 = (bx - hw * math.sin(a), by + hw * math.cos(a))
    poly = (f'<polygon points="{x2:.1f},{y2:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" fill="{color}"/>')
    return poly, (bx, by)


def _elabel(mx, my, s, color, dy=0):
    w = len(s) * 6.0 + 14
    return (rect(mx - w / 2, my - 10 + dy, w, 18, BG, rx=4, opacity=0.9)
            + text(mx, my + 3.5 + dy, s, 10.5, color, "middle", "700"))


def conn(points, color=MUTED, sw=2.2, label=None, dash=None, lbl_seg=None, lbl_dy=0):
    """Arrow through a polyline; head at the last point; optional label on a segment."""
    out = []
    poly, base = _head(points[-2][0], points[-2][1], points[-1][0], points[-1][1], color)
    pts = list(points[:-1]) + [base]
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    da = f' stroke-dasharray="{dash}"' if dash else ""
    out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}"{da} '
               f'stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>')
    out.append(poly)
    if label:
        i = lbl_seg if lbl_seg is not None else max(0, len(points) // 2 - 1)
        (x1, y1), (x2, y2) = points[i], points[i + 1]
        out.append(_elabel((x1 + x2) / 2, (y1 + y2) / 2, label, color, dy=lbl_dy))
    return "".join(out)


def legend(x, y, items, gap=190):
    out = []
    for i, (col, lab) in enumerate(items):
        lx = x + i * gap
        out.append(circle(lx + 6, y - 4, 6, col))
        out.append(text(lx + 20, y, lab, 12, TEXT, "start", "700"))
    return "".join(out)


# ============================================================================= PAGE 1 — master topology
def p1():
    b = []
    NH = 80
    # --- nodes ---------------------------------------------------------------
    browser = (70, 182, 152, NH)
    vercel = (262, 182, 168, NH)
    apigw = (470, 182, 168, NH)
    lam = (678, 182, 162, NH)
    dsql = (904, 182, 184, NH)
    ddb = (904, 304, 184, NH)
    streams = (904, 432, 184, NH)
    rollup = (678, 432, 162, NH)
    s3 = (70, 432, 152, NH)
    kms = (70, 560, 152, NH)
    cf = (262, 552, 168, NH)

    # --- edges (drawn first, under nodes) -----------------------------------
    # synchronous request chain (short tokens — narrow gaps; full detail on p.2)
    b.append(conn([R(browser), L(vercel)], CYAN, label="/api/v1"))
    b.append(conn([R(vercel), L(apigw)], CYAN, label="+auth"))
    b.append(conn([R(apigw), L(lam)], AMBER, label="proxy"))
    # lambda -> data: catalog READ from DSQL; the CHARGE command writes DynamoDB
    b.append(conn([R(lam), L(dsql)], GREEN, label="catalog", dash="5 4", sw=1.8))
    b.append(conn([(812, B(lam)[1]), (812, 358), (904, 358)], BLUE,
                  label="debit + METER", lbl_seg=1))
    # async projection (CQRS read model)
    b.append(conn([B(ddb), T(streams)], BLUE, label="stream", lbl_dy=2))
    b.append(conn([L(streams), R(rollup)], AMBER, label="batch 100"))
    b.append(conn([(CX(rollup), T(rollup)[1]), (CX(rollup), 286), (CX(dsql), 286), B(dsql)], GREEN,
                  label="project → ledger + summary", lbl_seg=1))
    # audio plane
    b.append(conn([(CX(kms), T(kms)[1]), (CX(s3), B(s3)[1])], ROSE, label="SSE-KMS"))
    b.append(conn([R(s3), (244, CY(s3)), (244, CY(cf)), L(cf)], ROSE, label="origin · OAC", lbl_seg=1))
    b.append(conn([T(cf), (CX(cf), 322), (CX(browser), 322), B(browser)], ROSE,
                  label="signed GET → 206 audio bytes", lbl_seg=1))

    # --- nodes ---------------------------------------------------------------
    b.append(node(*browser, "Browser", "PlayerProvider · <audio>", CYAN, tag="LISTENER CLIENT"))
    b.append(node(*vercel, "Vercel Edge", "Next.js /api/v1/[...] proxy", CYAN, tag="NEXT.JS · cookie→Bearer"))
    b.append(node(*apigw, "API Gateway", "REST · stage v1 · 50 rps", AMBER, tag="AMAZON API GATEWAY"))
    b.append(node(*lam, "tollroad-api", "charge · stream · wallet · auth", AMBER, tag="AWS LAMBDA · Node20"))
    b.append(node(*dsql, "Aurora DSQL", "catalog · ledger projection", GREEN, tag="AURORA DSQL · PG16 · READ MODEL"))
    b.append(node(*ddb, "DynamoDB", "tollroad · BAL + METER", BLUE, tag="AMAZON DYNAMODB · COMMAND STORE"))
    b.append(node(*streams, "DynamoDB Streams", "NEW_AND_OLD_IMAGES", BLUE, tag="INSERT + type=METER filter"))
    b.append(node(*rollup, "Rollup λ", "idempotent settlement", AMBER, tag="AWS LAMBDA · pg + dsql-signer"))
    b.append(node(*s3, "S3 audio", "private · OAC only", ROSE, tag="AMAZON S3 · SSE-KMS"))
    b.append(node(*kms, "KMS CMK", "alias/tollroad-audio", ROSE, tag="AWS KMS · rotation on"))
    b.append(node(*cf, "CloudFront", "signed URL · 150s · key grp", ROSE, tag="AMAZON CLOUDFRONT · OAC"))

    # plane labels
    b.append(text(70, 168, "SYNCHRONOUS REQUEST / BILLING PLANE", 11, CYAN, "start", "700", spacing=1.5))
    b.append(text(678, 418, "ASYNC PROJECTION PLANE (CQRS)", 11, BLUE, "start", "700", spacing=1.5))
    b.append(text(70, 418, "AUDIO DELIVERY PLANE", 11, ROSE, "start", "700", spacing=1.5))

    # legend + caption
    b.append(legend(74, 712, [(CYAN, "Client / Vercel"), (AMBER, "Compute (API GW · Lambda)"),
                              (GREEN, "Aurora DSQL"), (BLUE, "DynamoDB"), (ROSE, "Audio (S3·KMS·CloudFront)")],
                    gap=224))
    b.append(text(74, 740, "CQRS: the charge is one DynamoDB transaction (write model); Aurora DSQL is the async projection + catalog.  Audio bytes never traverse the API — signed CloudFront serves them edge-direct.",
                  12, MUTED, "start"))
    return page("ARCHITECTURE", "The whole listening machine, one picture",
                "".join(b), 1, sub="Press play → charge → stream → meter → settle — every component and AWS service")


# ============================================================================= PAGE 2 — sequence
def p2():
    b = []
    lanes = [("Browser", "player · <audio>", CYAN),
             ("Vercel", "Next.js proxy", CYAN),
             ("API · Lambda", "API GW v1 · tollroad-api", AMBER),
             ("Aurora DSQL", "catalog + ledger (read model)", GREEN),
             ("DynamoDB", "balance + METER (command store)", BLUE),
             ("Rollup λ", "projector", AMBER),
             ("CloudFront·S3", "audio plane", ROSE)]
    n = len(lanes)
    x0, x1 = 110, 1180
    lx = [x0 + i * (x1 - x0) / (n - 1) for i in range(n)]
    top, bot = 168, 752
    # lifelines + heads
    for i, (nm, sub, col) in enumerate(lanes):
        x = lx[i]
        b.append(rect(x - 78, top, 156, 50, PANEL, col, 11, sw=1.6))
        b.append(f'<rect x="{x-78:.1f}" y="{top:.1f}" width="4.5" height="50" rx="2.2" fill="{col}"/>')
        b.append(text(x, top + 22, nm, 14, TEXT, "middle", "800"))
        b.append(text(x, top + 39, sub, 10, MUTED, "middle"))
        b.append(line(x, top + 50, x, bot, STROKE, 1.4, dash="3 6", opacity=0.7))

    # messages: (from, to, label, dashed, color)
    msgs = [
        (0, 1, "play() → POST /charge", False, CYAN),
        (1, 2, "+Bearer +x-api-key", False, CYAN),
        (2, 3, "getTrackBilling() — price, artist  (catalog read)", False, GREEN),
        (3, 2, "track { price, artistId, audioKey }", True, GREEN),
        (2, 4, "debitMinute() TransactWrite — BAL-- (stop-at-zero) + METER", False, BLUE),
        (4, 2, "{ balanceCents, charged }", True, BLUE),
        (2, 0, "200 {balance}  — or 402 payment-required → top-up", True, AMBER),
        (0, 2, "GET /stream/{trackId}", False, CYAN),
        (2, 4, "hasRecentMeter() proof-of-payment  ( < 150 s )", False, BLUE),
        (2, 0, "{ url, expiresAt, mode: signed-url }", True, AMBER),
        (0, 6, "<audio src> GET  (CloudFront signed URL)", False, ROSE),
        (6, 0, "206 partial content — audio bytes ▶", True, ROSE),
        (4, 5, "Streams INSERT + type=METER  (batch 100)", False, BLUE),
        (5, 3, "project → royalty_ledger ON CONFLICT; bump summary", False, GREEN),
    ]
    y = top + 84
    dy = 33
    for k, (a, c, lab, dash, col) in enumerate(msgs):
        yy = y + k * dy
        xa, xc = lx[a], lx[c]
        b.append(text(x0 - 64, yy + 4, f"{k+1:02d}", 12, FAINT, "start", "800"))
        rightward = xc > xa
        # number badge at source
        b.append(circle(xa, yy, 4, col))
        b.append(conn([(xa + (5 if rightward else -5), yy), (xc + (-5 if rightward else 5), yy)],
                      col, sw=2, dash="5 5" if dash else None))
        midx = (xa + xc) / 2
        b.append(_elabel(midx, yy - 11, lab, col))

    # self-loop: meter repeats every 60 real-seconds
    yloop = y + len(msgs) * dy + 4
    b.append(conn([(lx[0] + 6, yloop), (lx[0] + 120, yloop), (lx[0] + 120, yloop + 18), (lx[0] + 6, yloop + 18)],
                  VIOLET, sw=2))
    b.append(text(lx[0] + 132, yloop + 14, "METER LOOP — PlayerProvider accrues real playback secs; every whole minute → repeat step 01 (postCharge). Seeks pause the meter.",
                  12, VIOLET, "start", "700"))

    # phase markers (left gutter, between numbered rows so they don't collide)
    b.append(text(46, y - 16, "CHARGE", 10, AMBER, "start", "700", spacing=1.5))
    b.append(text(46, y + 7 * dy - 14, "STREAM", 10, AMBER, "start", "700", spacing=1.5))
    b.append(text(46, y + 12 * dy - 14, "SETTLE", 10, BLUE, "start", "700", spacing=1.5))
    return page("SEQUENCE", "Play → charge → stream → meter → settle",
                "".join(b), 2, sub="One metered minute, end to end — numbered messages across seven lifelines")


# ============================================================================= PAGE 3 — metering data path
def p3():
    b = []
    # left card: DynamoDB single table (command / write model)
    lc = (70, 190, 360, 350)
    b.append(rect(*lc, PANEL, BLUE, 16, sw=1.8))
    b.append(text(lc[0] + 22, lc[1] + 32, "DynamoDB  tollroad", 17, TEXT, "start", "800"))
    b.append(text(lc[0] + 22, lc[1] + 51, "COMMAND STORE (write model) · on-demand · TTL · GSI1", 10.5, BLUE, "start", "700"))
    items = [
        ("Authoritative balance", BLUE,
         ["PK  USER#<userId>      SK  BAL",
          "ADD balanceCents :neg   IF balanceCents >= :amt",
          "→ never negative · hard stop-at-zero"]),
        ("Metered minute  (type=METER)", CYAN,
         ["PK USER#<userId>  SK EVT#<min>#<trackId>",
          "( like → EVT#like#.. )   idempotencyKey =",
          "<user>#<track>#<minute>   ·  attr_not_exists(PK)",
          "GSI1 ARTIST#<id> → recent events · ttl +30 d"]),
    ]
    yy = lc[1] + 78
    for title_, col, rows in items:
        b.append(rect(lc[0] + 16, yy, lc[2] - 32, 22 + 16 * len(rows), PANEL2, STROKE, 9))
        b.append(f'<rect x="{lc[0]+16.5:.1f}" y="{yy+8:.1f}" width="4" height="{6+16*len(rows):.1f}" rx="2" fill="{col}"/>')
        b.append(text(lc[0] + 30, yy + 18, title_, 12.5, col, "start", "800"))
        for j, r in enumerate(rows):
            b.append(text(lc[0] + 30, yy + 36 + j * 16, r, 9.6, MUTED, "start", family=MONO))
        yy += 34 + 16 * len(rows)
    b.append(text(lc[0] + 22, yy + 10, "debitMinute() commits BAL-- + METER in", 11, TEXT, "start", "700"))
    b.append(text(lc[0] + 22, yy + 26, "ONE TransactWriteItems — no DSQL write.", 11, TEXT, "start", "700"))

    # right card: Aurora DSQL
    rc = (850, 190, 360, 350)
    b.append(rect(*rc, PANEL, GREEN, 16, sw=1.8))
    b.append(text(rc[0] + 22, rc[1] + 32, "Aurora DSQL", 16, TEXT, "start", "800"))
    b.append(text(rc[0] + 22, rc[1] + 51, "READ MODEL (projection) + CATALOG · PG-16 · scale-to-zero", 10.5, GREEN, "start", "700"))
    dtables = [
        ("royalty_ledger", GREEN,
         ["PK idempotency_key = <user>#<track>#<minute>",
          "user_id, track_id, artist_id, minute_epoch,",
          "amount_cents  — APPEND-ONLY (projection)",
          "INSERT ... ON CONFLICT DO NOTHING RETURNING"]),
        ("artist_daily_summary", CYAN,
         ["PK (artist_id, day)   — precomputed BI",
          "minutes += 1, amount_cents += :amt",
          "bumped only when ledger row is NEW"]),
        ("tracks / artists", AMBER,
         ["catalog — read synchronously by the API",
          "getTrackBilling(): price, artistId, audio_key",
          "( the live balance lives in DynamoDB )"]),
    ]
    yy = rc[1] + 78
    for title_, col, rows in dtables:
        b.append(rect(rc[0] + 16, yy, rc[2] - 32, 22 + 15 * len(rows), PANEL2, STROKE, 9))
        b.append(f'<rect x="{rc[0]+16.5:.1f}" y="{yy+8:.1f}" width="4" height="{6+15*len(rows):.1f}" rx="2" fill="{col}"/>')
        b.append(text(rc[0] + 30, yy + 18, title_, 12.5, col, "start", "800"))
        for j, r in enumerate(rows):
            b.append(text(rc[0] + 30, yy + 35 + j * 15, r, 9.4, MUTED, "start", family=MONO))
        yy += 32 + 15 * len(rows)

    # center: streams -> rollup
    cx = 640
    b.append(rect(470, 248, 340, 120, PANEL2, STROKE, 14))
    b.append(text(cx, 274, "Streams → Rollup λ", 15, TEXT, "middle", "800"))
    b.append(text(cx, 296, "INSERT + type=METER", 11, BLUE, "middle", "700"))
    b.append(text(cx, 314, "batch 100 · retry + bisect", 10.5, MUTED, "middle"))
    b.append(text(cx, 338, "retry on SQLSTATE 40001", 10.5, MUTED, "middle"))
    b.append(text(cx, 356, "(OCC serialization)", 10.5, MUTED, "middle"))
    b.append(conn([(430, 308), (470, 308)], BLUE, sw=2.4))
    b.append(conn([(810, 308), (850, 308)], GREEN, sw=2.4))

    # CQRS projection note
    b.append(text(cx, 224, "PROJECT  (CQRS)", 10.5, AMBER, "middle", "700", spacing=2))

    # bottom band: idempotency thread + invariants
    band = (70, 576, 1140, 158)
    b.append(rect(*band, PANEL, STROKE, 16))
    b.append(text(94, 606, "EXACTLY-ONCE BY CONSTRUCTION", 13, CYAN, "start", "800", spacing=1.5))
    key = "<user>#<track>#<minute>"
    b.append(text(94, 636, "The idempotency key", 13, TEXT, "start", "600"))
    b.append(rect(252, 622, 220, 22, PANEL2, CYAN, 6))
    b.append(text(362, 637, key, 12, CYAN, "middle", "800", family=MONO))
    b.append(text(486, 636, "is the same anchor in the DSQL charge txn, the DynamoDB METER item, and the rollup ledger row.", 13, TEXT, "start", "600"))
    bullets = [
        ("①  Command store (DynamoDB): BAL debit + METER event commit in ONE TransactWriteItems — balance is authoritative, stop-at-zero.", BLUE),
        ("②  The METER guard (attribute_not_exists) is checked first → a replayed minute is an idempotent no-op even if the balance moved.", CYAN),
        ("③  Stream is at-least-once → projector re-inserts the SAME key → royalty_ledger ON CONFLICT DO NOTHING → exactly-once ledger.", AMBER),
        ("④  artist_daily_summary is bumped only when the ledger row is new → artist earnings can never double-count.", VIOLET),
    ]
    for i, (s, col) in enumerate(bullets):
        b.append(circle(100, 666 + i * 17 - 4, 3, col))
        b.append(text(112, 666 + i * 17, s, 12, MUTED, "start"))
    return page("DATA PATH", "Metering — command store, stream, projection",
                "".join(b), 3, sub="DynamoDB is the command/write store; Aurora DSQL is the projected read model + catalog (CQRS)")


# ============================================================================= PAGE 4 — inventory
def p4():
    b = []
    cols = [(70, "SERVICE", 150), (228, "CONSTRUCT / NAME", 200), (438, "ROLE IN THE LISTENING FLOW", 392),
            (840, "KEY CONFIG", 370)]
    rows = [
        ("API Gateway", AMBER, "tollroad-api (REST, v1)", "Edge entry; API-key usage plan gates the app",
         "50 rps / 100 burst · CORS · webhook key-exempt"),
        ("Lambda", AMBER, "tollroad-api", "All HTTP handlers: charge / stream / wallet / auth / library",
         "Node 20 · 256 MB · 30 s · ESM · proxy integ"),
        ("Lambda", AMBER, "RollupConsumerFn", "Stream projector → builds DSQL ledger + summary (read model)",
         "batch 100 · retry+bisect · pg + dsql-signer layer"),
        ("Aurora DSQL", GREEN, "cluster (PG-16)", "Catalog (sync read) + royalty ledger & summaries (projection)",
         "scale-to-zero · IAM DbConnectAdmin · no FK/triggers"),
        ("DynamoDB", BLUE, "tollroad (single table)", "Command store: authoritative balance (BAL) + METER/TOPUP events",
         "on-demand · TTL 30 d · GSI1 · NEW_AND_OLD_IMAGES"),
        ("S3", ROSE, "tollroad-audio-<acct>", "Encrypted audio objects at rest (private origin)",
         "SSE-KMS · OAC-only read · CORS for Vercel origin"),
        ("KMS", ROSE, "alias/tollroad-audio", "CMK encrypting audio; CloudFront OAC decrypts",
         "rotation on · OAC decrypt policy scoped to distro"),
        ("CloudFront", ROSE, "TollroadCdn", "Serves audio edge-direct via signed URLs (the meter gate)",
         "OAC origin · signed URL / key group · 150 s TTL"),
        ("S3 + CloudFront", ROSE, "images-<acct> / ImagesCdn", "Public cover art delivery",
         "S3-managed enc · OAC · presigned PUT upload"),
        ("Stripe", VIOLET, "PaymentIntent + webhook", "Wallet top-ups credit balance idempotently",
         "live mode · /stripe/webhook exempt from API key"),
        ("Vercel", CYAN, "Next.js app + /api proxy", "Player UI + same-origin proxy to the API",
         "httpOnly cookie → Bearer · injects x-api-key"),
    ]
    # header
    hy = 184
    b.append(rect(70, hy, 1140, 30, PANEL2, STROKE, 8))
    for x, label, w in cols:
        b.append(text(x + 14, hy + 20, label, 11, CYAN, "start", "800", spacing=1))
    ry = hy + 30
    rh = 40
    for i, (svc, col, name, role, cfg) in enumerate(rows):
        y = ry + i * rh
        if i % 2 == 0:
            b.append(rect(70, y, 1140, rh, PANEL, opacity=0.55))
        b.append(f'<rect x="70" y="{y:.1f}" width="4" height="{rh}" fill="{col}"/>')
        b.append(text(cols[0][0] + 14, y + 25, svc, 12.5, col, "start", "800"))
        b.append(text(cols[1][0] + 14, y + 25, name, 11.5, TEXT, "start", "700", family=MONO))
        b.append(text(cols[2][0] + 14, y + 25, role, 11.5, MUTED, "start"))
        b.append(text(cols[3][0] + 14, y + 25, cfg, 11, MUTED, "start"))
    tbot = ry + len(rows) * rh

    # deploy drift callout
    cy = tbot + 18
    b.append(rect(70, cy, 1140, 86, PANEL, ROSE, 14, sw=1.8))
    b.append(text(92, cy + 26, "⚠  DEPLOY DRIFT WATCH — secrets/config a plain `cdk deploy` silently drops or reverts", 13, ROSE, "start", "800"))
    drift = ("TOLLROAD_CF_PRIVATE_KEY + TOLLROAD_CF_KEY_PAIR_ID (set outside CDK) · TOLLROAD_SESSION_SECRET · "
             "TOLLROAD_SMTP_PASS · all 3 Stripe keys must share mode")
    b.append(text(92, cy + 50, drift, 11.5, TEXT, "start"))
    b.append(text(92, cy + 70, "Redeploy passing secrets via -c / --env-file backend/.env (see safe-backend-deploy); audio streaming requires the CF key pair restored.",
                  11, MUTED, "start"))
    return page("INVENTORY", "Every AWS service in the path",
                "".join(b), 4, sub="What each construct is, what it does in the listening flow, and how it's configured")


# ----------------------------------------------------------------------------- render
HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: {w}px {h}px; margin: 0; }}
* {{ margin:0; padding:0; }}
.page {{ width:{w}px; height:{h}px; overflow:hidden; }}
.page:not(:last-child) {{ page-break-after: always; }}
svg {{ display:block; }}
</style></head><body>{pages}</body></html>"""


def main():
    pages = "".join([p1(), p2(), p3(), p4()])
    html = HTML.format(w=W, h=H, pages=pages)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "_architecture.html"), "w") as f:
        f.write(html)
    from weasyprint import HTML as WP
    out = os.path.join(here, "ARCHITECTURE.pdf")
    WP(string=html).write_pdf(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
