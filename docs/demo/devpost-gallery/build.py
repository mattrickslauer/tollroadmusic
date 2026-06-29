#!/usr/bin/env python3
"""Generate TollRoad Devpost gallery images (1920x1080, opaque).

Fifteen branded cards that tell the whole TollRoad story to a hackathon judge:
the problem, the metered-billing fix, the listener + artist product, the
polyglot-CQRS architecture (DynamoDB command side -> Streams -> projector
Lambda -> Aurora DSQL query side / system of record), x402 agents, Superfan
Bonds, delivery, the AWS stack, and a closing card.

Aesthetic is lifted from the Sonar architecture-overlay technique: a flat dark
"asphalt" field, ONE dominant accent (toll-signage amber / royal gold), a big
headline + uppercase-mono kicker, and crisp inline-SVG glyphs (ping rings,
database cylinders, gradient bars, meter rings, panel cards). Money reads in
metering-green; the read-side database reads in electric blue.

Pipeline: build a self-contained HTML doc (inline SVG + base64 fonts) per card,
then screenshot each with headless Chromium. Run:  python3 build.py
Output: png/NN-slug.png  (numbered so the Devpost gallery keeps this order).
"""
import base64
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1920, 1080

# ------------------------------------------------------------------ brand palette
BG       = "#08080a"          # asphalt-900 — the field
BG2      = "#0b0b0e"          # asphalt-850
FG       = "#f4efe3"          # bone — primary text
DIM      = "#b7b2a6"          # bone-dim
FAINT    = "#79766d"          # bone-faint
LINE     = "#2a2a35"          # hairlines
AMBER    = "#ffb02e"          # toll-signage amber — PRIMARY accent
AMBERHI  = "#ffc861"          # amber-bright
AMBERLO  = "#c77f12"          # amber-deep / gold shadow
GREEN    = "#66e6a6"          # metering-green — money / earned
BLUE     = "#5ad7ff"          # electric blue — read model / data / DSQL
RED      = "#ff4d72"          # devotee / 402 / stop
PANEL    = "#0e0e14"          # card fill
PANELB   = "#23232e"          # card border
MONOFAINT= "rgba(244,239,227,0.55)"

# tier ramp (Superfan Bonds): Listener -> Regular -> Fan -> Superfan -> Devotee
TIERS = [("#7c8aa5", "Listener"), ("#34cfe0", "Regular"), ("#66e6a6", "Fan"),
         (AMBER, "Superfan"), (RED, "Devotee")]

# ------------------------------------------------------------------ fonts (base64)
def _b64(path):
    with open(os.path.join(HERE, "fonts", path), "rb") as f:
        return base64.b64encode(f.read()).decode()

_F = {
    "fraunces":     ("Fraunces.ttf", "truetype", "normal"),
    "fraunces-it":  ("Fraunces-Italic.ttf", "truetype", "italic"),
    "manrope5":     ("manrope-500.woff2", "woff2", "normal"),
    "manrope7":     ("manrope-700.woff2", "woff2", "normal"),
    "manrope8":     ("manrope-800.woff2", "woff2", "normal"),
    "mono4":        ("jetbrains-mono-400.woff2", "woff2", "normal"),
    "mono7":        ("jetbrains-mono-700.woff2", "woff2", "normal"),
}

def _face(family, file, fmt, style, weight):
    mt = "font/woff2" if fmt == "woff2" else "font/ttf"
    return (f"@font-face{{font-family:'{family}';font-style:{style};"
            f"font-weight:{weight};src:url(data:{mt};base64,{_b64(file)}) "
            f"format('{fmt}');}}")

FONT_CSS = "".join([
    _face("Fraunces",  "Fraunces.ttf", "truetype", "normal", "100 900"),
    _face("Fraunces",  "Fraunces-Italic.ttf", "truetype", "italic", "100 900"),
    _face("Manrope",   "manrope-500.woff2", "woff2", "normal", "500"),
    _face("Manrope",   "manrope-700.woff2", "woff2", "normal", "700"),
    _face("Manrope",   "manrope-800.woff2", "woff2", "normal", "800"),
    _face("JetBrains Mono", "jetbrains-mono-400.woff2", "woff2", "normal", "400"),
    _face("JetBrains Mono", "jetbrains-mono-700.woff2", "woff2", "normal", "700"),
])

DISPLAY = "'Fraunces', Georgia, serif"           # editorial headlines / wordmark
BODY    = "'Manrope', system-ui, sans-serif"      # body / clean headlines
MONO    = "'JetBrains Mono', ui-monospace, monospace"  # instrument readouts

# ------------------------------------------------------------------ svg helpers
_uid = [0]
def uid():
    _uid[0] += 1
    return f"u{_uid[0]}"

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def txt(x, y, s, size, color=FG, anchor="start", weight="500", spacing="0",
        family=BODY, opacity="1", style="normal"):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" '
            f'font-size="{size}" fill="{color}" text-anchor="{anchor}" '
            f'font-weight="{weight}" letter-spacing="{spacing}" '
            f'font-style="{style}" opacity="{opacity}">{esc(s)}</text>')

def kicker(x, y, s, color=AMBER, anchor="start"):
    """Small uppercase mono label — the 'instrument readout' voice."""
    return txt(x, y, s.upper(), 22, color=color, family=MONO, weight="700",
               spacing="5", anchor=anchor)

def headline(x, y, s, size=46, color=FG, anchor="middle", weight="800"):
    return txt(x, y, s, size, color=color, anchor=anchor, weight=weight,
               family=BODY, spacing="-0.5")

def ping(cx, cy, base_r, color=AMBER, n=3, gap=70, op0=0.42):
    out = []
    for i in range(n):
        r = base_r + i * gap
        op = op0 * (1 - i / n)
        sw = 3.2 - i * 0.7
        out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" '
                   f'stroke="{color}" stroke-width="{max(0.8, sw):.1f}" '
                   f'opacity="{op:.3f}"/>')
    return "".join(out)

def glow(cx, cy, r, color=AMBER, op=0.20):
    gid = uid()
    return (f'<defs><radialGradient id="{gid}" cx="50%" cy="50%" r="50%">'
            f'<stop offset="0" stop-color="{color}" stop-opacity="{op}"/>'
            f'<stop offset="1" stop-color="{color}" stop-opacity="0"/>'
            f'</radialGradient></defs>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#{gid})"/>')

def cylinder(cx, cy, w, h, color, fill_op=0.10):
    x = cx - w / 2
    top = cy - h / 2
    ry = w * 0.18
    body = (f'<path d="M {x} {top+ry} A {w/2} {ry} 0 0 1 {x+w} {top+ry} '
            f'L {x+w} {top+h-ry} A {w/2} {ry} 0 0 1 {x} {top+h-ry} Z" '
            f'fill="{color}" fill-opacity="{fill_op}" stroke="{color}" stroke-width="2.5"/>')
    discs = (f'<ellipse cx="{cx}" cy="{top+ry}" rx="{w/2}" ry="{ry}" '
             f'fill="{color}" fill-opacity="{fill_op+0.10}" stroke="{color}" stroke-width="2.5"/>')
    bands = ""
    for k in (0.42, 0.66):
        yy = top + h * k
        bands += (f'<path d="M {x} {yy} A {w/2} {ry} 0 0 0 {x+w} {yy}" '
                  f'fill="none" stroke="{color}" stroke-width="1.4" opacity="0.45"/>')
    return body + bands + discs

def chip(cx, cy, label, color, w=None, size=24, family=MONO, weight="700"):
    w = w or (len(label) * size * 0.62 + 48)
    h = size + 28
    return (f'<rect x="{cx-w/2:.1f}" y="{cy-h/2:.1f}" width="{w:.1f}" height="{h}" '
            f'rx="{h/2}" fill="{color}" fill-opacity="0.13" stroke="{color}" '
            f'stroke-width="1.6"/>' +
            txt(cx, cy + size*0.36, label, size, color=color, anchor="middle",
                family=family, weight=weight))

def panel(x, y, w, h, r=22, stroke=PANELB, fill=PANEL, sw=1.5):
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

def meter_ring(cx, cy, R, frac, color=AMBER, track=AMBERLO, sw=11, glowring=True):
    """A taximeter dial: faint full track + bright progress arc from 12 o'clock."""
    out = []
    if glowring:
        out.append(ping(cx, cy, R + 28, color=color, n=2, gap=58, op0=0.18))
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{track}" '
               f'stroke-width="{sw}" opacity="0.45"/>')
    a0, a1 = -90, -90 + 360 * frac
    def pt(a, r):
        return (cx + r*math.cos(math.radians(a)), cy + r*math.sin(math.radians(a)))
    x0, y0 = pt(a0, R); x1, y1 = pt(a1, R)
    large = 1 if (a1 - a0) > 180 else 0
    out.append(f'<path d="M {x0:.1f} {y0:.1f} A {R} {R} 0 {large} 1 {x1:.1f} {y1:.1f}" '
               f'fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
    ex, ey = pt(a1, R)
    out.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{sw*0.78:.1f}" fill="{color}"/>')
    return "".join(out)

def gbar(x, y, w, h, grad_id, frac=None, knob_color=FG):
    """Gradient bar; if frac given, draw a knob at that position."""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="url(#{grad_id})"/>']
    if frac is not None:
        kx = x + w * frac
        out.append(f'<circle cx="{kx:.1f}" cy="{y+h/2:.1f}" r="{h*0.85:.1f}" '
                   f'fill="{BG}" stroke="{knob_color}" stroke-width="4"/>')
    return "".join(out)

def flow_bar(cx, by, bw, steps, highlight_last=True, fs=23):
    """Horizontal step bar with arrows between mono labels."""
    out = [panel(cx - bw/2, by, bw, 96, r=18)]
    n = len(steps)
    x0 = cx - bw/2
    for i, st in enumerate(steps):
        sx = x0 + (bw/n) * (i + 0.5)
        last = highlight_last and i == n-1
        col = AMBER if last else FG
        out.append(txt(sx, by+58, st, fs, color=col, anchor="middle",
                       family=MONO, weight="700" if last else "400"))
        if i < n-1:
            ax = x0 + (bw/n) * (i + 1)
            out.append(txt(ax, by+58, "→", 30, color=AMBER, anchor="middle"))
    return "".join(out)

def wire(x1, y1, x2, y2, color=AMBER, dash=None, sw=2.2, op=0.85, arrow=True):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    mk = ' marker-end="url(#arrow)"' if arrow else ""
    return (f'<path d="M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}" fill="none" '
            f'stroke="{color}" stroke-width="{sw}"{d} opacity="{op}"{mk}/>')

# ------------------------------------------------------------------ shared defs
def DEFS():
    return (
        '<defs>'
        # gold wordmark gradient (≈135deg)
        f'<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{AMBERHI}"/>'
        f'<stop offset="0.46" stop-color="{AMBER}"/>'
        f'<stop offset="1" stop-color="{AMBERLO}"/></linearGradient>'
        # rate ramp: free (green) -> $1.00 (amber)
        f'<linearGradient id="rate" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{GREEN}"/>'
        f'<stop offset="1" stop-color="{AMBER}"/></linearGradient>'
        # tier ramp
        f'<linearGradient id="tier" x1="0" y1="0" x2="1" y2="0">'
        + "".join(f'<stop offset="{i/(len(TIERS)-1):.3f}" stop-color="{c}"/>'
                  for i, (c, _) in enumerate(TIERS)) +
        '</linearGradient>'
        # arrowhead
        f'<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{AMBER}"/></marker>'
        '</defs>'
    )

# ================================================================== 1. HERO
def d_hero():
    s = []
    cx = W/2
    s.append(glow(cx, 430, 560, AMBER, 0.16))
    # meter dial glyph
    s.append(meter_ring(cx, 410, 120, 0.72, AMBER, AMBERLO, sw=10))
    s.append(txt(cx, 398, "metered", 22, color=DIM, anchor="middle", family=MONO))
    s.append(txt(cx, 446, "$0.04 / min", 34, color=FG, anchor="middle",
                 family=MONO, weight="700"))
    # wordmark — "Toll" bone + "Road" gold
    s.append(f'<text x="{cx}" y="730" font-family="{DISPLAY}" font-size="150" '
             f'text-anchor="middle" font-weight="600" letter-spacing="-2">'
             f'<tspan fill="{FG}">Toll</tspan><tspan fill="url(#gold)">Road</tspan></text>')
    # tagline (editorial italic gold)
    s.append(txt(cx, 820, "Pay for the minutes you actually hear.", 42,
                 color=AMBER, anchor="middle", family=DISPLAY, style="italic",
                 weight="500"))
    s.append(kicker(cx, 900, "Streaming, metered like a utility", color=DIM,
                    anchor="middle"))
    return "".join(s)

# ================================================================== 2. PROBLEM
def d_problem():
    s = []
    s.append(kicker(W/2, 150, "The problem", anchor="middle"))
    s.append(headline(W/2, 222, "Streaming is all-you-can-eat — with a pooled payout.", 44))
    # two stat panels
    pw, ph, py = 720, 470, 320
    lx = W*0.27; rx = W*0.73
    s.append(panel(lx - pw/2, py, pw, ph))
    s.append(panel(rx - pw/2, py, pw, ph))
    # left: flat fee
    s.append(kicker(lx, py+90, "what you pay", color=DIM, anchor="middle"))
    s.append(txt(lx, py+220, "$11.99", 110, color=FG, anchor="middle",
                 family=MONO, weight="700"))
    s.append(txt(lx, py+278, "/ month · flat", 30, color=DIM, anchor="middle", family=MONO))
    s.append(txt(lx, py+360, "every fee dropped in one bucket,", 26, color=DIM, anchor="middle"))
    s.append(txt(lx, py+398, "split by share of total streams", 26, color=DIM, anchor="middle"))
    # right: fair per-minute
    s.append(kicker(rx, py+90, "a fair per-minute rate", color=GREEN, anchor="middle"))
    s.append(txt(rx, py+220, "~$8", 110, color=GREEN, anchor="middle",
                 family=MONO, weight="700"))
    s.append(txt(rx, py+278, "/ month · 9,800 min played", 30, color=DIM, anchor="middle", family=MONO))
    s.append(txt(rx, py+360, "light listeners subsidize heavy ones;", 26, color=DIM, anchor="middle"))
    s.append(txt(rx, py+398, "you fund whoever is trending", 26, color=DIM, anchor="middle"))
    # bottom punch
    s.append(txt(W/2, 900, "A song you loved and a song you skipped are paid exactly the same.",
                 32, color=AMBER, anchor="middle", family=DISPLAY, style="italic", weight="500"))
    return "".join(s)

# ================================================================== 3. CONCEPT
def d_concept():
    s = []
    s.append(kicker(W/2, 150, "The fix", anchor="middle"))
    s.append(headline(W/2, 222, "Meter music the way a utility meters electricity.", 44))
    cx, cy = W/2, 600
    s.append(glow(cx, cy, 420, AMBER, 0.12))
    s.append(meter_ring(cx, cy, 165, 0.62, AMBER, AMBERLO, sw=12))
    s.append(txt(cx, cy-36, "this session", 24, color=DIM, anchor="middle", family=MONO))
    s.append(txt(cx, cy+30, "$0.17", 76, color=FG, anchor="middle", family=MONO, weight="700"))
    s.append(txt(cx, cy+78, "4 min played", 24, color=AMBER, anchor="middle", family=MONO))
    # left chip: play
    s.append(chip(330, 520, "▶  playing", GREEN, size=26, w=240))
    s.append(txt(330, 590, "the meter ticks up", 24, color=DIM, anchor="middle", family=MONO))
    # right chip: stop
    s.append(chip(1590, 520, "■  stop", RED, size=26, w=240))
    s.append(txt(1590, 590, "the meter stops", 24, color=DIM, anchor="middle", family=MONO))
    # connectors
    s.append(wire(420, 520, cx-180, cy-20, color=AMBERLO, dash="6 7", sw=2, op=0.6, arrow=False))
    s.append(wire(1500, 520, cx+180, cy-20, color=AMBERLO, dash="6 7", sw=2, op=0.6, arrow=False))
    s.append(txt(W/2, 940, "Every minute streamed is one metered billing event — one listener, one artist.",
                 30, color=DIM, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 4. LISTENER
def d_listener():
    s = []
    s.append(kicker(W/2, 140, "For listeners", anchor="middle"))
    s.append(headline(W/2, 210, "A prepaid wallet and a live taximeter.", 42))
    # wallet panel
    px, py, pw, ph = W/2-560, 290, 1120, 560
    s.append(panel(px, py, pw, ph, r=26))
    s.append(kicker(px+56, py+78, "wallet · balance", color=DIM))
    s.append(txt(px+56, py+200, "$12.40", 104, color=GREEN, family=MONO, weight="700"))
    s.append(chip(px+pw-200, py+150, "+  TOP UP $10", AMBER, size=26, w=300))
    s.append(txt(px+pw-200, py+210, "$3 welcome gift", 22, color=DIM, anchor="middle", family=MONO))
    # divider
    s.append(f'<line x1="{px+56}" y1="{py+280}" x2="{px+pw-56}" y2="{py+280}" stroke="{LINE}" stroke-width="1.5"/>')
    # now playing meter row
    s.append(txt(px+56, py+360, "♪  Now playing — Amanda Kurt", 30, color=FG, weight="700"))
    s.append(txt(px+56, py+404, "$0.04 / min", 26, color=AMBER, family=MONO))
    # meter bar ticking
    bx, bw2, byy = px+56, pw-112, py+440
    s.append(f'<rect x="{bx}" y="{byy}" width="{bw2}" height="22" rx="11" fill="{AMBER}" opacity="0.14"/>')
    s.append(f'<rect x="{bx}" y="{byy}" width="{bw2*0.62}" height="22" rx="11" fill="{AMBER}"/>')
    s.append(txt(bx, byy+70, "minutes this session", 24, color=DIM, family=MONO))
    s.append(txt(bx+bw2, byy+70, "04:12  ↓ $0.17", 28, color=GREEN, family=MONO, weight="700", anchor="end"))
    s.append(txt(W/2, 910, "Stop listening, stop paying. A hard stop-at-zero gate — you can't stream past your balance.",
                 28, color=DIM, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 5. ARTIST
def d_artist():
    s = []
    s.append(kicker(W/2, 140, "For artists", anchor="middle"))
    s.append(headline(W/2, 210, "Earn for the minutes actually played.", 42))
    px, py, pw, ph = W/2-560, 290, 1120, 560
    s.append(panel(px, py, pw, ph, r=26))
    s.append(kicker(px+56, py+78, "earnings · royalty ledger", color=GREEN))
    s.append(txt(px+56, py+196, "$1,284.50", 96, color=GREEN, family=MONO, weight="700"))
    s.append(chip(px+pw-230, py+150, "WITHDRAW → Stripe", AMBER, size=24, w=360))
    s.append(txt(px+pw-230, py+210, "Stripe Connect (Express)", 22, color=DIM, anchor="middle", family=MONO))
    s.append(f'<line x1="{px+56}" y1="{py+270}" x2="{px+pw-56}" y2="{py+270}" stroke="{LINE}" stroke-width="1.5"/>')
    # ledger rows
    rows = [("Midnight Asphalt", "8,412 min", "+$336.48"),
            ("Gold Signal", "5,109 min", "+$255.45"),
            ("Two Lanes (free)", "12,003 min", "+$0.00")]
    ry = py + 340
    s.append(txt(px+56, ry-18, "TRACK", 22, color=FAINT, family=MONO, weight="700"))
    s.append(txt(px+pw*0.62, ry-18, "MINUTES", 22, color=FAINT, family=MONO, weight="700", anchor="end"))
    s.append(txt(px+pw-56, ry-18, "EARNED", 22, color=FAINT, family=MONO, weight="700", anchor="end"))
    for i, (t, m, e) in enumerate(rows):
        yy = ry + 30 + i*64
        s.append(txt(px+56, yy, t, 30, color=FG, weight="500"))
        s.append(txt(px+pw*0.62, yy, m, 28, color=DIM, family=MONO, anchor="end"))
        col = GREEN if e != "+$0.00" else FAINT
        s.append(txt(px+pw-56, yy, e, 28, color=col, family=MONO, weight="700", anchor="end"))
    s.append(txt(W/2, 910, "Off precomputed DSQL rollups — a clean line from the minute you heard to the cent earned.",
                 28, color=DIM, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 6. RATES
def d_rates():
    s = []
    s.append(kicker(W/2, 160, "Variable rates", anchor="middle"))
    s.append(headline(W/2, 234, "Artists set the rate: free → $1.00 / min.", 46))
    bx, by, bw, bh = W/2-560, 520, 1120, 30
    s.append(gbar(bx, by, bw, bh, "rate", frac=0.34, knob_color=AMBER))
    s.append(txt(bx, by+88, "FREE", 34, color=GREEN, family=MONO, weight="700"))
    s.append(txt(bx+bw, by+88, "$1.00 / min", 34, color=AMBER, family=MONO, weight="700", anchor="end"))
    # knob readout
    kx = bx + bw*0.34
    s.append(txt(kx, by-46, "$0.04 / min", 32, color=FG, family=MONO, weight="700", anchor="middle"))
    s.append(txt(kx, by-90, "this track", 22, color=DIM, family=MONO, anchor="middle"))
    s.append(txt(W/2, 700, "0.1¢ precision · the exact value the meter already honors.", 30,
                 color=DIM, anchor="middle", family=MONO))
    s.append(txt(W/2, 800, "Free isn't a special case — a $0 track meters at zero down the same path.",
                 30, color=AMBER, anchor="middle", family=DISPLAY, style="italic", weight="500"))
    return "".join(s)

# ================================================================== 7. CQRS
def d_cqrs():
    s = []
    s.append(kicker(W/2, 110, "Polyglot CQRS", anchor="middle"))
    s.append(headline(W/2, 178, "One write path, one read path — joined by a projector.", 40))
    midy = 560
    # command lambda
    cmd_x = 250
    s.append(panel(cmd_x-130, midy-150, 260, 110, r=16))
    s.append(txt(cmd_x, midy-105, "API Gateway", 24, color=FG, anchor="middle", family=MONO, weight="700"))
    s.append(txt(cmd_x, midy-72, "+ Lambda", 22, color=DIM, anchor="middle", family=MONO))
    # DynamoDB cylinder (command)
    ddb_x = 250
    s.append(cylinder(ddb_x, midy+150, 230, 230, AMBER, fill_op=0.12))
    s.append(txt(ddb_x, midy+310, "DynamoDB", 30, color=AMBER, anchor="middle", family=MONO, weight="700"))
    s.append(txt(ddb_x, midy+348, "balance · METER events", 22, color=DIM, anchor="middle", family=MONO))
    s.append(wire(cmd_x, midy-40, ddb_x, midy+40, color=AMBER, sw=2.4))
    s.append(txt(cmd_x+18, midy+10, "debit", 20, color=AMBER, family=MONO))
    # projector lambda (center)
    pjx = W/2
    s.append(panel(pjx-150, midy-60, 300, 120, r=16, stroke=GREEN))
    s.append(txt(pjx, midy-12, "Projector", 28, color=GREEN, anchor="middle", family=MONO, weight="700"))
    s.append(txt(pjx, midy+22, "Lambda", 24, color=GREEN, anchor="middle", family=MONO))
    s.append(txt(pjx, midy+50, "sole DSQL writer", 18, color=DIM, anchor="middle", family=MONO))
    # streams wire ddb -> projector
    s.append(wire(ddb_x+130, midy+120, pjx-160, midy, color=AMBER, sw=2.6))
    s.append(txt((ddb_x+pjx)/2-30, midy+70, "Streams", 22, color=AMBER, family=MONO, weight="700", anchor="middle"))
    s.append(txt((ddb_x+pjx)/2-30, midy+98, "at-least-once", 18, color=DIM, family=MONO, anchor="middle"))
    # DSQL cylinder (query)
    dsx = W-300
    s.append(cylinder(dsx, midy+60, 250, 250, BLUE, fill_op=0.12))
    s.append(txt(dsx, midy+235, "Aurora DSQL", 30, color=BLUE, anchor="middle", family=MONO, weight="700"))
    s.append(txt(dsx, midy+275, "royalty ledger (SoR)", 22, color=DIM, anchor="middle", family=MONO))
    s.append(txt(dsx, midy+307, "summaries · library · bonds", 20, color=DIM, anchor="middle", family=MONO))
    s.append(wire(pjx+150, midy, dsx-130, midy+40, color=GREEN, sw=2.6))
    s.append(txt((pjx+dsx)/2+10, midy-10, "idempotent insert", 20, color=GREEN, family=MONO, anchor="middle"))
    # bottom labels
    s.append(txt(W*0.20, 1010, "COMMAND · high-velocity writes", 24, color=AMBER, anchor="middle", family=MONO, weight="700"))
    s.append(txt(W*0.78, 1010, "QUERY · read models + system of record", 24, color=BLUE, anchor="middle", family=MONO, weight="700"))
    s.append(f'<line x1="120" y1="970" x2="{W-120}" y2="970" stroke="{LINE}" stroke-width="1.4" stroke-dasharray="2 10"/>')
    return "".join(s)

# ================================================================== 8. TWO DBs
def d_twodb():
    s = []
    s.append(headline(W/2, 150, "Two AWS databases, each for the grain it's best at.", 44))
    s.append(f'<line x1="{W/2}" y1="240" x2="{W/2}" y2="940" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="2 10"/>')
    def card(cx, title, sub, lines, color, kick):
        out = [panel(cx-380, 290, 760, 590)]
        out.append(txt(cx, 256, kick, 24, color=DIM, anchor="middle", family=MONO))
        out.append(cylinder(cx, 470, 230, 210, color, fill_op=0.12))
        out.append(txt(cx, 700, title, 42, color=color, anchor="middle", family=MONO, weight="700"))
        out.append(txt(cx, 744, sub, 26, color=FG, anchor="middle", opacity="0.85"))
        for i, ln in enumerate(lines):
            out.append(txt(cx, 800+i*38, ln, 24, color=DIM, anchor="middle", family=MONO))
        return "".join(out)
    s.append(card(W*0.27, "DynamoDB", "the meter",
                  ["conditional debit · TTL · Streams", "single-digit-ms · ~16–23K writes/s"],
                  AMBER, "what must be instant"))
    s.append(card(W*0.73, "Aurora DSQL", "the system of record",
                  ["serverless · scales to zero", "append-only royalty ledger"],
                  BLUE, "what must be exact"))
    return "".join(s)

# ================================================================== 9. LEDGER
def d_ledger():
    s = []
    s.append(kicker(W/2, 140, "The system of record", anchor="middle"))
    s.append(headline(W/2, 210, "An append-only royalty ledger.", 44))
    px, py, pw, ph = W/2-620, 290, 1240, 520
    s.append(panel(px, py, pw, ph, r=22))
    s.append(txt(px+48, py+70, "royalty_ledger", 30, color=AMBER, family=MONO, weight="700"))
    s.append(chip(px+pw-200, py+58, "IMMUTABLE", GREEN, size=22, w=230))
    s.append(f'<line x1="{px+48}" y1="{py+110}" x2="{px+pw-48}" y2="{py+110}" stroke="{LINE}" stroke-width="1.5"/>')
    # header
    cols = [(px+48, "MINUTE @ TS", "start"), (px+pw*0.50, "LISTENER → ARTIST", "middle"),
            (px+pw-48, "CREDIT (millicents)", "end")]
    for x, lab, anc in cols:
        s.append(txt(x, py+158, lab, 20, color=FAINT, family=MONO, weight="700", anchor=anc))
    rows = [("12:04:01", "amanda → midnight-asphalt", "+40000"),
            ("12:04:02", "kojo → gold-signal", "+50000"),
            ("12:04:02", "amanda → two-lanes", "+0"),
            ("12:04:03", "rae → midnight-asphalt", "+40000"),
            ("12:04:04", "kojo → gold-signal", "+50000")]
    for i, (ts, who, c) in enumerate(rows):
        yy = py + 210 + i*60
        s.append(txt(px+48, yy, ts, 26, color=DIM, family=MONO))
        s.append(txt(px+pw*0.50, yy, who, 26, color=FG, family=MONO, anchor="middle"))
        col = GREEN if c != "+0" else FAINT
        s.append(txt(px+pw-48, yy, c, 26, color=col, family=MONO, weight="700", anchor="end"))
    s.append(txt(W/2, 900, "One immutable credit row per metered minute · dedup on UNIQUE(idempotency_key) · millicents precision.",
                 26, color=DIM, anchor="middle", family=MONO))
    s.append(txt(W/2, 950, "Superfan bonds & leaderboards are derived in-SQL — no separate store.",
                 26, color=AMBER, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 10. ATOMIC
def d_atomic():
    s = []
    s.append(kicker(W/2, 150, "One minute = one atomic write", anchor="middle"))
    s.append(headline(W/2, 222, "You can never stream past zero.", 46))
    px, py, pw, ph = W/2-560, 320, 1120, 420
    s.append(panel(px, py, pw, ph, r=20))
    s.append(txt(px+48, py+70, "POST /v1/charge", 28, color=AMBER, family=MONO, weight="700"))
    s.append(txt(px+pw-48, py+70, "DynamoDB · TransactWriteItems", 24, color=DIM, family=MONO, anchor="end"))
    s.append(f'<line x1="{px+48}" y1="{py+106}" x2="{px+pw-48}" y2="{py+106}" stroke="{LINE}" stroke-width="1.5"/>')
    lines = [
        ("UpdateItem  balance", GREEN),
        ("  ADD  balanceMillicents  -cost", FG),
        ("  COND balanceMillicents >= cost", AMBER),
        ("Put  METER event   (guarded, idempotent)", FG),
    ]
    for i, (ln, col) in enumerate(lines):
        s.append(txt(px+72, py+170+i*52, ln, 28, color=col, family=MONO,
                     weight="700" if col == AMBER else "400"))
    # result chips
    s.append(chip(px+260, py+ph-46, "✓  1 minute debited", GREEN, size=24, w=380))
    s.append(chip(px+760, py+ph-46, "✓  1 stream record", GREEN, size=24, w=380))
    s.append(txt(W/2, 850, "Balance hits zero → the next charge returns HTTP 402 → the stream stops.",
                 30, color=DIM, anchor="middle", family=MONO))
    s.append(txt(W/2, 910, "Can't listen free · can't wash-stream to inflate earnings.",
                 30, color=AMBER, anchor="middle", family=DISPLAY, style="italic", weight="500"))
    return "".join(s)

# ================================================================== 11. x402 / AGENTS
def d_x402():
    s = []
    s.append(kicker(W/2, 140, "Agents are first-class clients", anchor="middle"))
    s.append(headline(W/2, 212, "AI agents discover, pay, and stream — over x402.", 42))
    # the loop
    cy = 470
    steps = ["request stream", "402 + terms", "pay per minute", "retry", "♪ streaming"]
    cols  = [FG, RED, AMBER, FG, GREEN]
    n = len(steps)
    x0, x1 = 220, W-220
    for i, (st, col) in enumerate(zip(steps, cols)):
        sx = x0 + (x1-x0)*(i/(n-1))
        s.append(f'<circle cx="{sx:.0f}" cy="{cy}" r="58" fill="{col}" fill-opacity="0.12" '
                 f'stroke="{col}" stroke-width="2.4"/>')
        s.append(txt(sx, cy+8, str(i+1), 40, color=col, anchor="middle", family=MONO, weight="700"))
        s.append(txt(sx, cy+120, st, 26, color=FG, anchor="middle", family=MONO))
        if i < n-1:
            nx = x0 + (x1-x0)*((i+1)/(n-1))
            s.append(wire(sx+62, cy, nx-62, cy, color=AMBER, sw=2.4))
    # MCP panel
    px, py, pw, ph = W/2-560, 680, 1120, 220
    s.append(panel(px, py, pw, ph, r=20))
    s.append(txt(px+48, py+70, "MCP server — the Vibe DJ", 30, color=AMBER, family=MONO, weight="700"))
    tools = "search_music · start_session · next_track · get_stream · get_balance"
    s.append(txt(px+48, py+125, tools, 26, color=DIM, family=MONO))
    s.append(txt(px+48, py+180, "An agent runs a no-repeat DJ session and pays-per-minute over the x402 loop.",
                 24, color=FG, family=MONO))
    return "".join(s)

# ================================================================== 12. BONDS
def d_bonds():
    s = []
    s.append(kicker(W/2, 140, "Superfan Bonds", anchor="middle"))
    s.append(headline(W/2, 212, "Every metered minute becomes a ranked bond.", 42))
    # tier ramp as ascending chips
    bx, by, bw, bh = W/2-620, 470, 1240, 26
    s.append(gbar(bx, by, bw, bh, "tier"))
    n = len(TIERS)
    for i, (c, name) in enumerate(TIERS):
        tx = bx + bw*(i/(n-1))
        s.append(f'<circle cx="{tx:.0f}" cy="{by+bh/2:.0f}" r="13" fill="{BG}" stroke="{c}" stroke-width="4"/>')
        s.append(txt(tx, by-30, name, 26, color=c, anchor="middle", family=MONO, weight="700"))
        s.append(txt(tx, by+72, f"L{i}", 22, color=DIM, anchor="middle", family=MONO))
    # leaderboard panel
    px, py, pw, ph = W/2-440, 620, 880, 250
    s.append(panel(px, py, pw, ph, r=20))
    s.append(txt(px+44, py+58, "Fan leaderboard — Midnight Asphalt", 28, color=AMBER, family=MONO, weight="700"))
    lb = [("1", "rae", "8,412 min", AMBER), ("2", "kojo", "5,109 min", GREEN), ("3", "amanda", "2,044 min", BLUE)]
    for i, (r, who, m, col) in enumerate(lb):
        yy = py + 110 + i*46
        s.append(txt(px+44, yy, f"#{r}", 26, color=col, family=MONO, weight="700"))
        s.append(txt(px+120, yy, who, 26, color=FG, family=MONO))
        s.append(txt(px+pw-44, yy, m, 26, color=DIM, family=MONO, anchor="end"))
    s.append(txt(W/2, 940, "Minutes are real money — so standing can't be farmed.",
                 30, color=AMBER, anchor="middle", family=DISPLAY, style="italic", weight="500"))
    return "".join(s)

# ================================================================== 13. DELIVERY
def d_delivery():
    s = []
    s.append(kicker(W/2, 140, "Delivery & money", anchor="middle"))
    s.append(headline(W/2, 212, "The meter controls access; KMS protects the bytes.", 42))
    # audio flow
    s.append(flow_bar(W/2, 330, 1400,
                      ["meter authorizes", "signed URL · 150s", "CloudFront · OAC", "S3 · SSE-KMS"],
                      highlight_last=False, fs=24))
    s.append(txt(W/2, 300, "AUDIO PATH", 22, color=DIM, anchor="middle", family=MONO, weight="700"))
    # money flow (two panels)
    pw, ph, py = 720, 300, 540
    lx, rx = W*0.27, W*0.73
    s.append(panel(lx-pw/2, py, pw, ph, r=22))
    s.append(panel(rx-pw/2, py, pw, ph, r=22))
    s.append(kicker(lx, py+78, "money in", color=GREEN, anchor="middle"))
    s.append(txt(lx, py+170, "Stripe top-ups", 40, color=FG, anchor="middle", family=MONO, weight="700"))
    s.append(txt(lx, py+225, "$10 packs → DynamoDB balance", 26, color=DIM, anchor="middle", family=MONO))
    s.append(txt(lx, py+263, "reconciled into DSQL", 26, color=DIM, anchor="middle", family=MONO))
    s.append(kicker(rx, py+78, "money out", color=AMBER, anchor="middle"))
    s.append(txt(rx, py+170, "Stripe Connect", 40, color=FG, anchor="middle", family=MONO, weight="700"))
    s.append(txt(rx, py+225, "artist payouts (Express)", 26, color=DIM, anchor="middle", family=MONO))
    s.append(txt(rx, py+263, "fed by the DSQL ledger", 26, color=DIM, anchor="middle", family=MONO))
    s.append(txt(W/2, 930, "A paid minute → a 150-second signed URL. No paid minute → HTTP 402.",
                 28, color=DIM, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 14. AWS STACK
def d_stack():
    s = []
    s.append(kicker(W/2, 150, "Built on AWS", anchor="middle"))
    s.append(headline(W/2, 222, "The metering core, end to end.", 46))
    services = [
        ("Amazon DynamoDB", AMBER), ("DynamoDB Streams", AMBER), ("Amazon Aurora DSQL", BLUE),
        ("AWS Lambda", GREEN), ("Amazon API Gateway", FG), ("Amazon S3", FG),
        ("Amazon CloudFront", FG), ("AWS KMS", FG), ("Amazon Bedrock · Titan v2", BLUE),
    ]
    cols = 3
    cw, ch = 540, 130
    gx = W/2 - (cols*cw + (cols-1)*40)/2
    gy = 320
    for i, (name, col) in enumerate(services):
        r, c = divmod(i, cols)
        x = gx + c*(cw+40)
        y = gy + r*(ch+34)
        s.append(panel(x, y, cw, ch, r=18, stroke=col, sw=1.5))
        s.append(f'<circle cx="{x+44}" cy="{y+ch/2}" r="9" fill="{col}"/>')
        s.append(txt(x+80, y+ch/2+10, name, 30, color=FG, family=MONO, weight="700"))
    s.append(txt(W/2, 970, "All in us-east-1 · plus Stripe for money movement and Vercel at the edge.",
                 28, color=DIM, anchor="middle", family=MONO))
    return "".join(s)

# ================================================================== 15. CLOSE
def d_close():
    s = []
    cx = W/2
    s.append(glow(cx, 470, 620, AMBER, 0.14))
    s.append(meter_ring(cx, 360, 92, 1.0, AMBER, AMBERLO, sw=8))
    s.append(f'<circle cx="{cx}" cy="360" r="22" fill="{AMBER}"/>')
    s.append(f'<text x="{cx}" y="640" font-family="{DISPLAY}" font-size="140" '
             f'text-anchor="middle" font-weight="600" letter-spacing="-2">'
             f'<tspan fill="{FG}">Toll</tspan><tspan fill="url(#gold)">Road</tspan></text>')
    s.append(txt(cx, 728, "Streaming, metered like a utility.", 42, color=AMBER,
                 anchor="middle", family=DISPLAY, style="italic", weight="500"))
    s.append(kicker(cx, 800, "Stripe for music royalties", color=DIM, anchor="middle"))
    s.append(txt(cx, 900, "tollroadmusic.xyz", 34, color=FG, anchor="middle",
                 family=MONO, weight="700"))
    return "".join(s)

# ------------------------------------------------------------------ assemble
CARDS = [
    ("01-hero",        d_hero),
    ("02-problem",     d_problem),
    ("03-concept",     d_concept),
    ("04-listener",    d_listener),
    ("05-artist",      d_artist),
    ("06-rates",       d_rates),
    ("07-cqrs",        d_cqrs),
    ("08-two-databases", d_twodb),
    ("09-royalty-ledger", d_ledger),
    ("10-atomic-minute", d_atomic),
    ("11-x402-agents", d_x402),
    ("12-superfan-bonds", d_bonds),
    ("13-delivery",    d_delivery),
    ("14-aws-stack",   d_stack),
    ("15-close",       d_close),
]

def page(inner):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
           f'viewBox="0 0 {W} {H}">{DEFS()}'
           f'<rect width="{W}" height="{H}" fill="{BG}"/>{inner}</svg>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>'
            f'{FONT_CSS} *{{margin:0;padding:0}} '
            f'html,body{{width:{W}px;height:{H}px;background:{BG};overflow:hidden}}'
            f'</style></head><body>{svg}</body></html>')

def render(html_path, png_path):
    subprocess.run([
        "chromium-browser", "--headless", "--no-sandbox", "--disable-gpu",
        "--force-device-scale-factor=1", "--hide-scrollbars",
        "--force-color-profile=srgb", f"--window-size={W},{H}",
        "--screenshot=" + png_path, "file://" + html_path,
    ], check=True, capture_output=True)

def main():
    os.makedirs(os.path.join(HERE, "png"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "_html"), exist_ok=True)
    for name, fn in CARDS:
        _uid[0] = 0
        html = page(fn())
        hp = os.path.join(HERE, "_html", f"{name}.html")
        pp = os.path.join(HERE, "png", f"{name}.png")
        with open(hp, "w") as f:
            f.write(html)
        render(hp, pp)
        print("rendered", os.path.relpath(pp, HERE))

if __name__ == "__main__":
    main()
