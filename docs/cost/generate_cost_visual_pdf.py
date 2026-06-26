#!/usr/bin/env python3
"""Generate COST_VISUAL.pdf — a visual, chart-first take on TollRoad unit economics.

Scales: idle, 1, 10, 100, 1K, 10K, 100K, 1M users. Rake dimensions: 6 / 8.25 /
10 / 15 %. All AWS rates us-east-1 on-demand, verified via the Pricing API
(2026-06-12); cross-checked against the BCM workload estimate `tollroad-10k-mau`.

    python3 docs/generate_cost_visual_pdf.py
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

# ----------------------------------------------------------------------------- cost / revenue model
MINPM = 817  # minutes / user / month


def tiered_egress(gb):
    tiers = [(10240, .085), (51200, .080), (153600, .060), (512000, .040),
             (1048576, .030), (5242880, .025), (float("inf"), .020)]
    cost, lo = 0, 0
    for hi, rate in tiers:
        if gb > lo:
            cost += (min(gb, hi) - lo) * rate
        lo = hi
        if gb <= hi:
            break
    return cost


def cost_lines(users):
    # API re-platform topology (2026-06-18): Vercel client → API Gateway (REST)
    # → tollroad-api Lambda → Aurora DSQL; audio still S3 → signed CloudFront
    # (one mp3/track, ~2 range GETs/min, not 10 HLS segments). Metering is a
    # dual-write: authoritative DSQL txn + best-effort DynamoDB METER mirror.
    M = users * MINPM
    gb = M * 0.0012
    return M, {
        "CloudFront egress":   tiered_egress(gb) - min(gb, 1024) * 0.085,
        "CloudFront requests": 0.000001 * max(0, M * 2 - 10_000_000),
        "API Gateway":         0.0000035 * (M * 1.714),   # REST, $3.50/M, no perpetual free tier
        "DynamoDB writes":     M * 2 * 0.000000625,        # METER mirror only: 1 item + 1 GSI replica
        "DynamoDB storage":    0.25 * max(0, M * 0.3 / 1e6 - 25),
        "DSQL compute":        0.000008 * max(0, M * 0.220 - 100000),  # charge txn + reads + rollup
        "DSQL storage":        0.33 * max(0, M * 100 / 1e9 - 1),
        "Lambda requests":     0.0000002 * max(0, M * 1.811 - 1_000_000),  # one invoke / API request
        "Lambda duration":     0.0000166667 * max(0, M * 0.0453 - 400000),  # 256 MB, ~100 ms avg
        "KMS key":             1.0,
        "KMS decrypt":         0.000003 * max(0, M * 0.5 - 20000),
        "S3 storage":          0.023 * max(0, 36 - 5),
        "S3 origin GET":       0.0000004 * max(0, M * 0.5 - 20000),
    }


SCALES = [("idle", 0), ("1", 1), ("10", 10), ("100", 100),
          ("1K", 1000), ("10K", 10000), ("100K", 100000), ("1M", 1000000)]
RAKES = [0.06, 0.0825, 0.10, 0.15]
RAKE_COL = {0.06: BLUE, 0.0825: CYAN, 0.10: GREEN, 0.15: AMBER}

MODEL = {}
for nm, u in SCALES:
    M, lines = cost_lines(u)
    MODEL[nm] = {"users": u, "min": M, "lines": lines, "aws": sum(lines.values()),
                 "rev": M * 0.01}


def money(v, cents=False):
    s = "-" if v < 0 else ""
    v = abs(v)
    if v == 0:
        return "$0"
    if v >= 1e6:
        return f"{s}${v/1e6:.2f}M"
    if v >= 1e3:
        return f"{s}${v/1e3:.1f}K"
    if v >= 100:
        return f"{s}${v:,.0f}"
    if v >= 1 or not cents:
        return f"{s}${v:.2f}"
    return f"{s}${v:.4f}"


# ----------------------------------------------------------------------------- svg helpers
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


def arc(cx, cy, r, a0, a1, color, width):
    x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    large = 1 if (a1 - a0) > math.pi else 0
    return (f'<path d="M {x0:.2f} {y0:.2f} A {r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}" '
            f'fill="none" stroke="{color}" stroke-width="{width}"/>')


def radar_motif(cx, cy, r, color=CYAN):
    out = [circle(cx, cy, r * f, stroke=color, sw=1, opacity=0.06) for f in (1, .7, .44, .2)]
    a0, a1 = -1.15, -0.55
    out.append(f'<path d="M {cx} {cy} L {cx+r*math.cos(a0):.1f} {cy+r*math.sin(a0):.1f} '
               f'A {r} {r} 0 0 1 {cx+r*math.cos(a1):.1f} {cy+r*math.sin(a1):.1f} Z" fill="{color}" opacity="0.05"/>')
    return "".join(out)


def page(kicker, title, body, n, total=7, sub=None):
    head = [rect(0, 0, W, H, BG), radar_motif(W - 140, 150, 240),
            text(70, 52, kicker, 13, CYAN, "start", "700", spacing=3),
            text(68, 96, title, 34, TEXT, "start", "800"),
            line(70, 112, 250, 112, CYAN, 3)]
    if sub:
        head.append(text(70, 138, sub, 15, MUTED, "start"))
    foot = [text(W - 70, H - 34, f"{n:02d} / {total:02d}", 12, FAINT, "end", "700", spacing=1),
            text(70, H - 34, "TollRoad · metered-billing DSP · AWS us-east-1 list price (2026-06-12)", 11, FAINT, "start", spacing=1)]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           + "".join(head) + body + "".join(foot) + "</svg>")
    return f'<div class="page">{svg}</div>'


def legend_dot(x, y, color, label, sub=None, size=13):
    out = [circle(x + 6, y - 4, 6, color), text(x + 20, y, label, size, TEXT, "start", "700")]
    if sub:
        out.append(text(x + 20, y + 17, sub, 11.5, MUTED, "start"))
    return "".join(out)


# ----------------------------------------------------------------------------- PAGE 1 — the penny
def p1():
    b = []
    # one anchor: an active listener — $98 of music a year, $9.80 rake to the platform
    cards = [("MUSIC STREAMED / YR", "$98.00", "9,800 min @ $0.01/min", VIOLET),
             ("PLATFORM RAKE · 10%", "$9.80", "the platform's cut of that $98", CYAN),
             ("PLATFORM KEEPS · ACH", "$7.88", "recommended wallet — 80% of rake", GREEN)]
    cw, gap = 360, 26
    x0 = (W - (cw * 3 + gap * 2)) / 2
    for i, (k, big, sub, col) in enumerate(cards):
        x = x0 + i * (cw + gap)
        b.append(rect(x, 160, cw, 96, PANEL, STROKE, 16))
        b.append(f'<rect x="{x:.1f}" y="171" width="5" height="74" rx="2.5" fill="{col}"/>')
        b.append(text(x + 24, 190, k, 12, col, "start", "700", spacing=1.4))
        b.append(text(x + 24, 230, big, 34, TEXT, "start", "800"))
        b.append(text(x + 24, 250, sub, 12, MUTED, "start"))

    # the breakdown: of the $9.80 rake, where it goes — by wallet setup
    bx = 360
    bw = 600                       # bar width = the full $9.80 rake
    RAKE = 9.80
    b.append(text(90, 318, "OF THE PLATFORM'S $9.80 RAKE — WHAT INFRASTRUCTURE EATS, AND WHAT'S LEFT", 15, TEXT, "start", "700", spacing=0.5))
    # legend
    leg = [(90, "AWS (cloud)", ROSE), (320, "Payments (Stripe)", AMBER), (610, "Platform keeps", GREEN)]
    for lxp, txt, col in leg:
        b.append(rect(lxp, 332, 14, 14, col, rx=3))
        b.append(text(lxp + 22, 344, txt, 12.5, MUTED, "start", "700"))

    rows = [  # (label, aws, payments, recommended) — precise values; labels round to cents
        ("Card · monthly top-up", 1.121, 6.4417, False),
        ("Card · annual top-up", 1.121, 3.142, False),
        ("ACH wallet · $10 min", 1.121, 0.80, True),
        ("Pass-through (listener pays)", 1.121, 0.00, False),
    ]
    y0, rh, rgap = 372, 58, 18
    for i, (lab, aws, pay, rec) in enumerate(rows):
        y = y0 + i * (rh + rgap)
        keep = RAKE - aws - pay
        # config label + total cost (left gutter)
        b.append(text(bx - 20, y + 24, lab, 14.5, (CYAN if rec else TEXT), "end", "800" if rec else "700"))
        b.append(text(bx - 20, y + 44, f"cost ${aws + pay:.2f}", 11.5, MUTED, "end"))
        if rec:
            b.append(text(bx - 20, y + 6, "◀ recommended", 10.5, CYAN, "end", "700"))
        # the bar = $9.80, split AWS | Payments | Keep
        b.append(rect(bx, y, bw, rh, PANEL2, (CYAN if rec else STROKE), 8, sw=2 if rec else 1.5))
        segs = [(aws, ROSE), (pay, AMBER), (keep, GREEN)]
        x = bx
        for val, col in segs:
            w = bw * (val / RAKE)
            if w > 0.5:
                b.append(rect(x, y, w, rh, col, rx=4, opacity=0.9))
                if w > 42:
                    b.append(text(x + w / 2, y + rh / 2 + 5, f"${val:.2f}", 13,
                                  ("#06281c" if col is GREEN else TEXT), "middle", "800"))
            x += w
        # keep % at the far right
        b.append(text(bx + bw + 18, y + rh / 2 + 7, f"{keep / RAKE * 100:.0f}%", 22, GREEN, "start", "800"))
        b.append(text(bx + bw + 78, y + rh / 2 + 7, "kept", 12, MUTED, "start"))

    b.append(text(90, 694, "AWS is fixed at ~$1.12/listener/yr — the payment setup is the whole lever, swinging the rake kept from 23% to 88%.",
                  13.5, MUTED, "start", "600"))
    b.append(text(90, 714, "The artist's $88.20 royalty (90%) is separate; its payout fee comes from the artist's share, not this rake.",
                  13.5, MUTED, "start", "600"))
    return page("COST BREAKDOWN", "What it costs to run one listener",
                "".join(b), 1, sub="Per active listener / year — every cost, four wallet setups, one picture")


# ----------------------------------------------------------------------------- PAGE 2 — cost to run, idle→1M
def p2():
    b = []
    # intro paragraph (kept above the plot)
    b.append(text(110, 178, "Monthly AWS bill scales with one thing — bytes out of CloudFront. Below ~1,000 users the",
                  15, MUTED, "start"))
    b.append(text(110, 200, "always-free tiers swallow the whole stack; the bill is the $1.71 idle floor. The first real",
                  15, MUTED, "start"))
    b.append(text(110, 222, "step up is the egress cliff at ~10K users, after which volume tiers bend the curve back down.",
                  15, MUTED, "start"))
    ax, ay, aw, ah = 120, 600, W - 230, 300   # plot area (bottom axis at ay)
    vmin, vmax = 1.0, 70000.0
    def yof(v):
        v = max(v, vmin)
        return ay - (math.log10(v) - math.log10(vmin)) / (math.log10(vmax) - math.log10(vmin)) * ah
    # gridlines (log decades)
    for dec in [1, 10, 100, 1000, 10000, 70000]:
        yy = yof(dec)
        b.append(line(ax, yy, ax + aw, yy, STROKE, 1, dash="3 5", opacity=0.5))
        b.append(text(ax - 12, yy + 4, money(dec), 11, FAINT, "end"))
    bars = SCALES
    n = len(bars)
    slot = aw / n
    bw = slot * 0.52
    # shade the "effectively free" band behind first ~5 bars
    b.append(rect(ax, ay - ah, slot * 4.5, ah, GREEN, rx=0, opacity=0.05))
    b.append(text(ax + slot * 2.25, ay - ah + 26, "FREE TIER ABSORBS ≈ EVERYTHING", 12.5, GREEN, "middle", "700", spacing=1))
    b.append(text(ax + slot * 2.25, ay - ah + 46, "≤ ~1,000 users → bill ≈ the $1.71 floor", 11.5, MUTED, "middle"))
    # bars
    for i, (nm, u) in enumerate(bars):
        cx = ax + slot * (i + 0.5)
        v = MODEL[nm]["aws"]
        top = yof(v)
        col = GREEN if v < 10 else (CYAN if v < 1000 else (AMBER if v < 20000 else ROSE))
        b.append(rect(cx - bw / 2, top, bw, ay - top, col, rx=4, opacity=0.9))
        b.append(text(cx, top - 10, money(v), 13, TEXT, "middle", "800"))
        label = nm if nm != "idle" else "idle"
        b.append(text(cx, ay + 24, label, 14, TEXT, "middle", "700"))
        b.append(text(cx, ay + 42, "users" if nm not in ("idle",) else "0 users", 10.5, FAINT, "middle"))
    # axis line
    b.append(line(ax, ay, ax + aw, ay, STROKE, 2))
    # idle floor line across
    fy = yof(1.71)
    b.append(line(ax, fy, ax + aw, fy, GREEN, 1.5, dash="6 4", opacity=0.7))
    b.append(text(ax + aw + 6, fy + 4, "$1.71 floor", 11, GREEN, "start", "700"))
    # the cliff annotation
    cliff_x = ax + slot * 5.5
    b.append(text(cliff_x, yof(858) - 36, "◀ egress crosses", 12, ROSE, "middle", "700"))
    b.append(text(cliff_x, yof(858) - 20, "1 TB free tier", 12, ROSE, "middle", "700"))
    # y-axis title
    b.append(f'<text x="32" y="430" font-family="{FONT}" font-size="12" fill="{MUTED}" '
             f'text-anchor="middle" font-weight="700" transform="rotate(-90 32 430)" letter-spacing="2">AWS COST / MONTH  (log scale)</text>')
    return page("COST TO RUN", "Idle to one million users",
                "".join(b), 2, sub="Monthly AWS bill across eight scales — log scale, free tiers applied")


# ----------------------------------------------------------------------------- PAGE 3 — composition
def p3():
    b = []
    groups = [("CloudFront egress", AMBER), ("CloudFront requests", VIOLET),
              ("API Gateway", CYAN), ("KMS decrypt", ROSE), ("everything else", FAINT)]
    def grouped(nm):
        L = MODEL[nm]["lines"]
        rest = sum(v for k, v in L.items() if k not in
                   ("CloudFront egress", "CloudFront requests", "API Gateway", "KMS decrypt"))
        return [L["CloudFront egress"], L["CloudFront requests"], L["API Gateway"], L["KMS decrypt"], rest]
    b.append(text(110, 180, "CloudFront egress is the majority of every bill. After the API re-platform, API Gateway is the largest of the rest; DSQL, Lambda, DynamoDB, S3 and the KMS key stay small. TollRoad is a bandwidth business.",
                  14, MUTED, "start"))
    # stacked horizontal bars for 1K,10K,100K,1M
    rows = ["1K", "10K", "100K", "1M"]
    bx, by, bw = 410, 210, 700
    rh, rgap = 76, 30
    for i, nm in enumerate(rows):
        y = by + i * (rh + rgap)
        tot = MODEL[nm]["aws"]
        b.append(text(bx - 22, y + rh / 2 - 2, nm, 22, TEXT, "end", "800"))
        b.append(text(bx - 22, y + rh / 2 + 18, "users", 11, FAINT, "end"))
        b.append(text(bx - 22, y - 9, money(tot) + "/mo", 13, MUTED, "end", "700"))
        vals = grouped(nm)
        x = bx
        for (gname, gcol), v in zip(groups, vals):
            seg = bw * (v / tot)
            if seg > 0.4:
                b.append(rect(x, y, seg, rh, gcol, rx=2, opacity=0.9))
                if seg > 46:
                    pct = v / tot * 100
                    b.append(text(x + seg / 2, y + rh / 2 + 5, f"{pct:.0f}%", 14,
                                  "#06281c" if gcol in (AMBER, GREEN) else TEXT, "middle", "800"))
            x += seg
    # legend
    lx = bx
    for j, (gname, gcol) in enumerate(groups):
        b.append(legend_dot(lx, by + 4 * (rh + rgap) + 2, gcol, gname))
        lx += 170 if gname != "everything else" else 0
    # donut at 1M (left, clear of the row labels)
    dcx, dcy, dr = 175, 410, 92
    L = MODEL["1M"]; tot = L["aws"]
    vals = grouped("1M")
    a = -math.pi / 2
    for (gname, gcol), v in zip(groups, vals):
        sweep = 2 * math.pi * (v / tot)
        if sweep > 0.001:
            b.append(arc(dcx, dcy, dr, a, a + sweep, gcol, 28))
        a += sweep
    cf_pct = (L["lines"]["CloudFront egress"] + L["lines"]["CloudFront requests"]) / tot * 100
    b.append(text(dcx, dcy - 4, "1M", 28, TEXT, "middle", "800"))
    b.append(text(dcx, dcy + 18, money(tot) + "/mo", 12.5, MUTED, "middle", "700"))
    b.append(text(dcx, dcy + dr + 40, f"{cf_pct:.0f}% is CloudFront", 14, AMBER, "middle", "700"))
    b.append(text(dcx, dcy + dr + 60, "(egress + requests)", 12, MUTED, "middle"))
    return page("COST COMPOSITION", "Egress is the whole story",
                "".join(b), 3, sub="What each dollar of the AWS bill is actually spent on")


# ----------------------------------------------------------------------------- PAGE 4 — rake matrix
def p4():
    b = []
    cols = [s for s in SCALES if s[0] not in ("idle",)]
    # heatmap: rows = rake, cols = scale, cell = platform profit (rake - aws)
    gx, gy = 250, 200
    cw, ch = 118, 64
    cgap, rgap = 8, 8
    # column headers
    for j, (nm, u) in enumerate(cols):
        x = gx + j * (cw + cgap)
        b.append(text(x + cw / 2, gy - 26, nm, 17, TEXT, "middle", "800"))
        b.append(text(x + cw / 2, gy - 10, "users", 10.5, FAINT, "middle"))
    # find max profit for color scale (after AWS + 0.8% ACH payments)
    maxp = max(MODEL[nm]["rev"] * (0.15 - 0.008) - MODEL[nm]["aws"] for nm, u in cols)
    for i, r in enumerate(RAKES):
        y = gy + i * (ch + rgap)
        col = RAKE_COL[r]
        b.append(rect(gx - 130, y, 118, ch, PANEL, col, 12, sw=2))
        b.append(text(gx - 71, y + ch / 2 - 4, f"{r*100:g}%", 26, col, "middle", "800"))
        b.append(text(gx - 71, y + ch / 2 + 16, "rake", 11, MUTED, "middle"))
        for j, (nm, u) in enumerate(cols):
            x = gx + j * (cw + cgap)
            prof = MODEL[nm]["rev"] * (r - 0.008) - MODEL[nm]["aws"]  # rake − AWS − 0.8% ACH
            # color intensity by profit (green good, red negative)
            if prof < 0:
                fill, op = RED, 0.85
            else:
                op = 0.12 + 0.7 * (math.log10(max(prof, 1)) / math.log10(max(maxp, 10)))
                fill = col
            b.append(rect(x, y, cw, ch, fill, STROKE, 8, opacity=min(op, 0.92)))
            b.append(text(x + cw / 2, y + ch / 2 - 2, money(prof), 15, TEXT, "middle", "800"))
            b.append(text(x + cw / 2, y + ch / 2 + 16, "/mo profit", 9.5, MUTED, "middle"))
    b.append(text(gx - 130, gy + 4 * (ch + rgap) + 14, "Cell = platform profit after AWS + payments  (rake − AWS − 0.8% ACH).  Red = underwater.",
                  12.5, MUTED, "start"))

    # bottom: (AWS + payments)-as-%-of-rake line chart across scales for each rake
    lx, ly, lw, lh = 250, 700, 800, 120
    b.append(text(lx, ly - lh - 18, "AWS + PAYMENTS AS % OF RAKE — lower is better; the rake keeps 69–91% at scale (10K–1M)",
                  13.5, TEXT, "start", "700", spacing=0.5))
    pts_scales = [s for s in cols]
    ymax = 40  # cap % axis (small-scale 1-user outliers clipped)
    for gl in [0, 10, 20, 30, 40]:
        yy = ly - (gl / ymax) * lh
        b.append(line(lx, yy, lx + lw, yy, STROKE, 1, dash="3 5", opacity=0.4))
        b.append(text(lx - 8, yy + 4, f"{gl}%", 10.5, FAINT, "end"))
    npts = len(pts_scales)
    for r in RAKES:
        col = RAKE_COL[r]
        path = []
        for j, (nm, u) in enumerate(pts_scales):
            x = lx + (j / (npts - 1)) * lw
            pct = (MODEL[nm]["aws"] + 0.008 * MODEL[nm]["rev"]) / (MODEL[nm]["rev"] * r) * 100
            yv = ly - min(pct, ymax) / ymax * lh
            path.append((x, yv))
            b.append(circle(x, yv, 3.5, col))
        d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in path)
        b.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2.4" opacity="0.9"/>')
    for j, (nm, u) in enumerate(pts_scales):
        x = lx + (j / (npts - 1)) * lw
        b.append(text(x, ly + 18, nm, 11.5, MUTED, "middle", "700"))
    # mini legend
    for k, r in enumerate(RAKES):
        b.append(legend_dot(lx + lw + 16, ly - lh + 10 + k * 24, RAKE_COL[r], f"{r*100:g}% rake"))
    return page("THE RAKE DIMENSION", "The rake covers AWS + payments",
                "".join(b), 4, sub="Platform profit and cost-as-%-of-rake (AWS + 0.8% ACH) across scales × four rake levels")


# ----------------------------------------------------------------------------- PAGE 5 — per-minute + revenue
def p5():
    b = []
    # left: per-minute — the all-in cost STACK vs the rake levels
    lx, ly, lw, lh = 120, 560, 470, 300
    b.append(text(lx, 200, "PER STREAMED MINUTE — all-in cost vs. rake", 14, CYAN, "start", "700", spacing=1.5))
    b.append(text(lx, 230, "The three cost parts, their sum, and what each rake level takes.", 13.5, MUTED, "start"))
    vmax = 0.0016
    def yof(v):
        return ly - (v / vmax) * lh
    for gv in [0, 0.0005, 0.001, 0.0015]:
        yy = yof(gv)
        b.append(line(lx, yy, lx + lw, yy, STROKE, 1, dash="3 5", opacity=0.4))
        b.append(text(lx - 8, yy + 4, f"${gv:.4f}", 10.5, FAINT, "end"))
    items = [("AWS", 0.0001144, ROSE), ("pay", 0.00008, AMBER),
             ("PLATFORM", 0.0001944, CYAN),
             ("6%", 0.0006, BLUE), ("8.25%", 0.000825, VIOLET),
             ("10%", 0.001, GREEN), ("15%", 0.0015, AMBER)]
    n = len(items); slot = lw / n; bw = slot * 0.6
    for i, (lab, v, col) in enumerate(items):
        cx = lx + slot * (i + 0.5)
        top = yof(v)
        b.append(rect(cx - bw / 2, top, bw, ly - top, col, rx=3, opacity=0.95 if lab == "PLATFORM" else 0.85))
        b.append(text(cx, top - 7, f"{v*100:.4f}".rstrip('0') + "¢", 9, TEXT, "middle", "800"))
        b.append(text(cx, ly + 18, lab, 10, (CYAN if lab == "PLATFORM" else MUTED), "middle", "700"))
    b.append(line(lx, ly, lx + lw, ly, STROKE, 2))
    # divider between platform cost and rake levels
    xd = lx + slot * 3
    b.append(line(xd, yof(0.0016), xd, ly, FAINT, 1, dash="4 4"))
    b.append(text(lx + slot * 1.5, ly + 38, "← platform cost", 11, MUTED, "middle"))
    b.append(text(lx + slot * 5, ly + 38, "rake levels →", 11, MUTED, "middle"))
    b.append(text(lx, ly + 64, "Every rake level clears the platform cost — the 10% rake by ~5.1×.", 13, GREEN, "start", "700"))

    # right: ALL-IN flow at 1M — gross -> rake -> minus each cost -> profit
    rx, ry = 620, 220
    b.append(text(rx, ry, "ALL-IN FLOW AT 1,000,000 USERS / MONTH", 14, CYAN, "start", "700", spacing=1.2))
    g = 1_000_000 * 817 * 0.01            # $8.17M gross/mo
    aws_1m, pay_1m, pyt_1m = MODEL["1M"]["aws"], 0.008 * g, 0.0025 * g * 0.9
    rake = g * 0.10
    profit = rake - aws_1m - pay_1m       # payout is on the artist, not the platform
    flow = [("Gross billed", g, VIOLET, "listeners pay $0.01/min"),
            ("Platform rake · 10%", rake, GREEN, "TollRoad's take"),
            ("− AWS", -aws_1m, ROSE, "the whole stack"),
            ("− Payments · ACH", -pay_1m, AMBER, "0.8% of gross, inbound"),
            ("= Platform profit", profit, CYAN, "AWS + payments only")]
    gutx = rx + 188
    barx, barw = gutx + 14, 286
    yy = ry + 30
    for lab, v, col, sub in flow:
        w = barw * (abs(v) / g)
        b.append(rect(barx, yy, barw, 50, PANEL2, STROKE, 7))
        b.append(rect(barx, yy, max(w, 3), 50, col, rx=7, opacity=0.9))
        b.append(text(gutx, yy + 23, lab, 14, TEXT, "end", "800"))
        b.append(text(gutx, yy + 41, sub, 10.5, MUTED, "end"))
        b.append(text(barx + barw + 12, yy + 32, money(v), 19, col, "start", "800"))
        yy += 64
    b.append(text(rx, yy + 6, "Payments ($65K) now outweigh AWS ($50K). The platform keeps 86% of the rake here;",
                  12.5, MUTED, "start", "600"))
    b.append(text(rx, yy + 24, "the artist payout (~$18K/mo) is drawn from the $7.35M royalty, not this flow.",
                  12.5, MUTED, "start", "600"))
    b.append(rect(rx, yy + 40, 560, 58, PANEL, GREEN, 14, sw=2))
    b.append(text(rx + 20, yy + 64, "Annual platform profit @ 10% rake, 1M users:", 13.5, MUTED, "start"))
    b.append(text(rx + 20, yy + 88, money(profit * 12) + " / year", 21, GREEN, "start", "800"))
    return page("PER-MINUTE & FLOW", "All-in: cost vs. rake, and the flow at scale",
                "".join(b), 5, sub="Every cost merged — the unit that matters, and where a million users' money goes")


# ----------------------------------------------------------------------------- payments layer
# Published US standard rates (2026), NOT a metered API — flagged as assumptions.
# fee to load a $98/yr wallet, and % of that $98.
RAILS = [  # (label, fee_on_$98, pct, color, group)
    ("Stripe — card · 2.9% + $0.30",      3.14, 3.2, ROSE,   "card"),
    ("PayPal / Braintree · 2.59% + $0.49", 3.03, 3.1, ROSE,   "card"),
    ("Adyen — card · ~2.0% + $0.13",      2.09, 2.1, AMBER,  "card"),
    ("USDC / stablecoin · 1.5% flat",     1.47, 1.5, VIOLET, "alt"),
    ("Stripe — ACH · 0.8%, cap $5",       0.78, 0.8, CYAN,   "alt"),
    ("Adyen — ACH · $0.26 flat",          0.26, 0.3, GREEN,  "alt"),
]
CONFIGS = [  # (label, pay_$/yr, % of rake kept @10% (AWS + payments; payout on artist), color)
    ("1 · Naive: card, monthly top-up",      6.44, 23, RED),
    ("2 · Card, annual top-up",              3.14, 56, AMBER),
    ("3 · ACH-first, $10 min  ◀ recommended", 0.78, 80, CYAN),
    ("4 · ACH, $10 auto-reload",             0.80, 80, CYAN),
    ("5 · Adyen ACH (flat $0.26)",           0.26, 86, GREEN),
    ("6 · Pass-through (listener pays fee)",  0.00, 88, GREEN),
]


# ----------------------------------------------------------------------------- PAGE 6 — payment rails
def p6():
    b = []
    b.append(text(110, 178, "Pages 1–5 sized AWS at ~1% of gross. Card processing runs 3–7× that — payments, not compute,", 15, MUTED, "start"))
    b.append(text(110, 200, "set the real margin floor. The lever is the rail: a card's fixed $0.30 never amortizes, while bank", 15, MUTED, "start"))
    b.append(text(110, 222, "rails (ACH) CAP the fee — ideal for a prepaid wallet that loads in large, infrequent chunks.", 15, MUTED, "start"))
    bx, by = 470, 296
    bw, rh, gap = 600, 44, 12
    maxf = 3.14
    b.append(text(bx - 16, by - 24, "FEE TO LOAD A $98 WALLET — by rail (lower is better)", 14, TEXT, "start", "700", spacing=0.5))
    for i, (lab, fee, pct, col, grp) in enumerate(RAILS):
        y = by + i * (rh + gap)
        w = max(bw * fee / maxf, 3)
        b.append(rect(bx, y, w, rh, col, rx=5, opacity=0.9))
        b.append(text(bx - 16, y + rh / 2 + 5, lab, 13.5, TEXT, "end", "700"))
        b.append(text(bx + w + 12, y + rh / 2 + 5, f"${fee:.2f}   ·   {pct:.1f}% of top-up", 14, col, "start", "800"))
    # divider: cards above, capped rails below
    yd = by + 3 * (rh + gap) - gap / 2
    b.append(line(bx - 250, yd, bx + bw + 120, yd, STROKE, 1.2, dash="5 5"))
    b.append(text(bx - 250, by + rh - 6, "CARDS", 11, ROSE, "start", "700", spacing=2))
    b.append(text(bx - 250, by + rh + 12, "fixed $0.30 —", 10.5, FAINT, "start"))
    b.append(text(bx - 250, by + rh + 26, "never caps", 10.5, FAINT, "start"))
    b.append(text(bx - 250, by + 3 * (rh + gap) + rh - 6, "ALT RAILS", 11, GREEN, "start", "700", spacing=1.5))
    b.append(text(bx - 250, by + 3 * (rh + gap) + rh + 12, "capped / flat —", 10.5, FAINT, "start"))
    b.append(text(bx - 250, by + 3 * (rh + gap) + rh + 26, "wallet-friendly", 10.5, FAINT, "start"))
    # insight box
    iy = by + 6 * (rh + gap) + 10
    b.append(rect(110, iy, W - 220, 70, PANEL, GREEN, 14, sw=2))
    b.append(text(132, iy + 28, "Cards never escape the $0.30 fixed fee. ACH caps it — Stripe 0.8% to a $5 ceiling, Adyen a $0.26 flat — and USDC is a flat 1.5%.", 14, TEXT, "start", "600"))
    b.append(text(132, iy + 50, "A wallet loaded in big chunks barely feels a capped fee → make ACH the default and cards the instant fallback.", 14, MUTED, "start"))
    return page("PAYMENTS LAYER", "The rail is the real margin lever", "".join(b), 6,
                sub="Stripe vs. the alternatives — cost to top up a prepaid wallet")


# ----------------------------------------------------------------------------- PAGE 7 — wallet configs
def p7():
    b = []
    b.append(text(110, 178, "Same wallet, six configurations. The choice of rail + top-up size + who eats the fee swings the platform's", 15, MUTED, "start"))
    b.append(text(110, 200, "kept margin from 23% to 88% of the rake — a bigger lever than anything in the AWS stack.", 15, MUTED, "start"))
    bx, by = 430, 250
    bw, rh, gap = 470, 40, 11
    b.append(text(bx - 16, by - 22, "% OF RAKE KEPT @ 10% — after AWS + payments  (payout is on the artist)", 14, TEXT, "start", "700", spacing=0.5))
    for i, (lab, pay, keep, col) in enumerate(CONFIGS):
        y = by + i * (rh + gap)
        w = max(bw * keep / 100, 3)
        rec = "recommended" in lab
        b.append(rect(bx, y, bw, rh, PANEL2, STROKE, 6))
        b.append(rect(bx, y, w, rh, col, rx=6, opacity=0.9))
        b.append(text(bx - 16, y + rh / 2 + 5, lab.replace("  ◀ recommended", ""), 13, (CYAN if rec else TEXT), "end", "700" if rec else "600"))
        b.append(text(bx + bw + 14, y + rh / 2 + 5, f"{keep}%", 17, col, "start", "800"))
        b.append(text(bx + bw + 66, y + rh / 2 + 5, f"· ${pay:.2f}/yr fees", 11.5, MUTED, "start"))
        if rec:
            b.append(text(bx + w - 10, y + rh / 2 + 5, "◀ pick", 11, "#06281c", "end", "800"))
    # recommended money box (left)
    ry = by + 6 * (rh + gap) + 16
    b.append(rect(110, ry, 560, 130, PANEL, CYAN, 14, sw=2))
    b.append(text(132, ry + 30, "RECOMMENDED — ACH-first wallet, $10 minimum, card fallback", 14.5, CYAN, "start", "800"))
    b.append(text(132, ry + 62, "$9.80 rake  −  $1.12 AWS  −  $0.80 ACH (inbound)", 15, TEXT, "start", "700"))
    b.append(text(132, ry + 92, "= $7.88 kept", 26, GREEN, "start", "800"))
    b.append(text(305, ry + 92, "(80% of the rake)", 14, MUTED, "start"))
    b.append(text(132, ry + 118, "Pass-through → 88%. Artist payout is drawn from the royalty, not the rake.", 12, FAINT, "start"))
    # config knobs (right)
    kx = 700
    b.append(text(kx, ry + 16, "THE FOUR KNOBS", 13, AMBER, "start", "700", spacing=2))
    knobs = [("Default rail", "ACH-first · card fallback"),
             ("Minimum top-up", "$10 — keeps even card < 6%"),
             ("Fee handling", "platform absorbs (or pass-through)"),
             ("Reload", "auto-reload at low balance")]
    for i, (k, v) in enumerate(knobs):
        y = ry + 36 + i * 26
        b.append(circle(kx + 6, y - 4, 4, AMBER))
        b.append(text(kx + 20, y, k + ":", 13, TEXT, "start", "700"))
        b.append(text(kx + 138, y, v, 13, MUTED, "start"))
    return page("WALLET CONFIGURATION", "Six ways to run the top-up wallet", "".join(b), 7,
                sub="The configuration — not the cloud bill — sets the platform's take")


# ----------------------------------------------------------------------------- render
HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: {w}px {h}px; margin: 0; }}
* {{ margin:0; padding:0; }}
.page {{ width:{w}px; height:{h}px; overflow:hidden; }}
.page:not(:last-child) {{ page-break-after: always; }}
svg {{ display:block; }}
</style></head><body>{pages}</body></html>"""


def main():
    pages = "".join([p1(), p2(), p3(), p4(), p5(), p6(), p7()])
    html = HTML.format(w=W, h=H, pages=pages)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "_cost_visual.html"), "w") as f:
        f.write(html)
    from weasyprint import HTML as WP
    out = os.path.join(here, "COST_VISUAL.pdf")
    WP(string=html).write_pdf(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
