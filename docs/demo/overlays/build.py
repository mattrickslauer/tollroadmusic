#!/usr/bin/env python3
"""Generate TollRoad demo overlay cards as standalone HTML (1920x1080, transparent).
Render to PNG with the sibling render.sh (headless chromium). Pure stdlib."""
import html, os, pathlib

OUT = pathlib.Path(__file__).parent / "_html"
OUT.mkdir(parents=True, exist_ok=True)

AMBER = "#FFB020"
BLUE = "#4DA3FF"
GREEN = "#28c840"
RED = "#ff5f57"
SANS = "'Liberation Sans','Noto Sans',sans-serif"
MONO = "'Noto Sans Mono',monospace"

def cssfmt(s):
    return (s.replace("@AMBER@", AMBER).replace("@BLUE@", BLUE)
             .replace("@GREEN@", GREEN).replace("@RED@", RED)
             .replace("@MONO@", MONO).replace("@SANS@", SANS))

BASE = f"""
html,body{{margin:0;padding:0;width:1920px;height:1080px;background:transparent;
  font-family:{SANS};-webkit-font-smoothing:antialiased}}
*{{box-sizing:border-box}}
.panel{{background:rgba(14,16,20,.85);border-radius:14px}}
.accent{{background:{AMBER}}}
.scrim{{position:absolute;inset:0;background:radial-gradient(ellipse at center,
  rgba(8,10,14,.74) 0%,rgba(8,10,14,.58) 55%,rgba(8,10,14,.40) 100%)}}
"""

def esc(s): return html.escape(s, quote=False)

def page(body, extra=""):
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{BASE}{extra}"
            f"</style></head><body>{body}</body></html>")

cards = {}  # id -> html

# ---- A. Lower-thirds -------------------------------------------------------
def lower_third(cid, name, role):
    css = """
    .bar{position:absolute;left:120px;bottom:130px;display:flex;align-items:stretch;
      filter:drop-shadow(0 12px 30px rgba(0,0,0,.45))}
    .accent{width:11px;border-radius:4px 0 0 4px}
    .panel{padding:26px 44px 26px 38px;border-radius:0 12px 12px 0}
    .name{font-size:58px;font-weight:700;color:#fff;letter-spacing:.4px;line-height:1}
    .role{font-size:31px;color:%s;margin-top:12px;font-style:italic}
    """ % AMBER
    body = (f"<div class='bar'><div class='accent'></div><div class='panel'>"
            f"<div class='name'>{esc(name)}</div>"
            f"<div class='role'>{esc(role)}</div></div></div>")
    cards[cid] = page(body, css)

lower_third("A1-lower-amanda", "AMANDA KURT", "Independent artist")
lower_third("A2-lower-founder", "ANTHONY TEDESCO", "Built TollRoad · solo · 17 days")
lower_third("A3-lower-role", "ANTHONY TEDESCO", "Looking for: Solutions Architect, AWS")

# ---- B. Stat cards ---------------------------------------------------------
def stat(cid, big, sub, foot=None):
    css = """
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center}
    .big{font-family:%s;font-size:240px;font-weight:700;color:%s;line-height:.9;
      letter-spacing:-2px;text-shadow:0 10px 40px rgba(0,0,0,.5)}
    .sub{font-size:46px;color:#fff;margin-top:30px;max-width:1300px;line-height:1.25}
    .foot{font-size:26px;color:#9aa3ad;margin-top:22px;font-style:italic}
    """ % (MONO, AMBER)
    f = f"<div class='foot'>{esc(foot)}</div>" if foot else ""
    body = (f"<div class='scrim'></div><div class='wrap'><div class='big'>{esc(big)}</div>"
            f"<div class='sub'>{esc(sub)}</div>{f}</div>")
    cards[cid] = page(body, css)

stat("B1-stat-2mo", "~$2/mo", "the entire bill at demo traffic")
stat("B2-stat-peruser", "$0.085", "per user — on a platform that moves real money")
stat("B3-stat-writes", "16–23K", "writes / second", "built for — a stated design target, not current load")
stat("B4-stat-streams", "1,000,000", "concurrent streams", "design target")
stat("B5-stat-key", "~150s", "and the key expires")
stat("B6-stat-price", "$0.000 – $1.00", "the artist sets it · per minute · tenth-of-a-cent steps")
stat("B7-stat-zero", "$0", "idle cost. by design.")

# ---- C. Term callouts ------------------------------------------------------
def term(cid, t, plain):
    css = """
    .card{position:absolute;left:120px;bottom:150px;max-width:1100px;
      filter:drop-shadow(0 12px 30px rgba(0,0,0,.45))}
    .panel{padding:30px 40px;border-left:8px solid %s;border-radius:0 12px 12px 0}
    .term{font-family:%s;font-size:52px;font-weight:700;color:%s;letter-spacing:1px}
    .plain{font-size:34px;color:#e6e9ed;margin-top:14px;line-height:1.3}
    """ % (AMBER, MONO, AMBER)
    body = (f"<div class='card'><div class='panel'>"
            f"<div class='term'>{esc(t)}</div>"
            f"<div class='plain'>{esc(plain)}</div></div></div>")
    cards[cid] = page(body, css)

term("C1-term-cqrs", "POLYGLOT CQRS", "Two databases. Each does the one thing it's best at.")
term("C2-term-millicents", "MILLICENTS", "cents × 1000 — a minute of music costs less than a penny")
term("C3-term-ledger", "APPEND-ONLY LEDGER", "You never edit money. You only add a row.")
term("C4-term-x402", "x402", "HTTP 402 Payment Required — the agent pays, then plays")
term("C5-term-scalezero", "SCALE-TO-ZERO", "Idle cost is a design output — you architect for it")
term("C6-term-ssekms", "SSE-KMS", "encrypted at rest — the track is literally locked")

# ---- D. Dual-caption pairs -------------------------------------------------
def dual(cid, flex, plain):
    css = """
    .stack{position:absolute;left:120px;right:120px;bottom:120px;
      display:flex;flex-direction:column;gap:18px;align-items:flex-start;
      filter:drop-shadow(0 10px 26px rgba(0,0,0,.45))}
    .row{display:flex;align-items:center;gap:22px;max-width:100%%}
    .chip{font-size:46px;width:84px;height:84px;flex:0 0 84px;border-radius:14px;
      display:flex;align-items:center;justify-content:center}
    .flexchip{background:rgba(255,176,32,.16);border:2px solid %s}
    .plainchip{background:rgba(77,163,255,.16);border:2px solid %s}
    .flextxt{font-size:38px;color:#fff;font-weight:600}
    .plaintxt{font-size:38px;color:%s;font-style:italic}
    .panel{padding:18px 30px;border-radius:12px}
    """ % (AMBER, BLUE, BLUE)
    body = (f"<div class='stack'>"
            f"<div class='row'><div class='chip flexchip'>\U0001f527</div>"
            f"<div class='panel'><span class='flextxt'>{esc(flex)}</span></div></div>"
            f"<div class='row'><div class='chip plainchip'>\U0001f3a7</div>"
            f"<div class='panel'><span class='plaintxt'>{esc(plain)}</span></div></div>"
            f"</div>")
    cards[cid] = page(body, css)

dual("D1-dual-atomic", "One all-or-nothing write charges you and logs the play",
     "“Can't double-charge. Can't overspend. Ever.”")
dual("D2-dual-vibe", "Embedded with Bedrock, matched inside DynamoDB — no vector DB",
     "“Tell it the mood. It builds the playlist.”")
dual("D3-dual-mcp", "An AI agent licenses music by the second over MCP",
     "“The same music your apps and AI can legally use.”")
dual("D4-dual-encryption", "AES-256-GCM at rest, key expires in ~150s",
     "“You can't keep the song. You're paying for the moment.”")
dual("D5-dual-stripe", "Every listener-minute = one ledger row = withdrawable",
     "“Amanda sees exactly which minute paid her.”")

# ---- H. Code receipt cards -------------------------------------------------
def code(cid, code_line, caption):
    css = """
    .card{position:absolute;left:120px;bottom:150px;max-width:1680px;
      filter:drop-shadow(0 12px 30px rgba(0,0,0,.5))}
    .term{display:inline-flex;align-items:stretch;border-radius:12px;overflow:hidden}
    .dots{background:#1b1e24;padding:0 22px;display:flex;align-items:center;gap:10px}
    .dot{width:14px;height:14px;border-radius:50%%}
    .code{background:#0c0e12;font-family:%s;font-size:31px;color:#e6e9ed;
      padding:26px 34px;border-left:1px solid #20242b;white-space:nowrap}
    .kw{color:%s}
    .cap{font-size:30px;color:%s;margin-top:18px;font-style:italic;padding-left:6px}
    """ % (MONO, AMBER, BLUE)
    body = (f"<div class='card'><div class='term'>"
            f"<div class='dots'><span class='dot' style='background:#ff5f57'></span>"
            f"<span class='dot' style='background:#febc2e'></span>"
            f"<span class='dot' style='background:#28c840'></span></div>"
            f"<div class='code'>{code_line}</div></div>"
            f"<div class='cap'>{esc(caption)}</div></div>")
    cards[cid] = page(body, css)

code("H1-code-debit",
     "balanceMillicents <span class='kw'>&gt;=</span> :amt &nbsp;<span class='kw'>AND</span>&nbsp; attribute_not_exists(PK)",
     "the database refuses to overspend")
code("H2-code-idempotency",
     "&lt;user&gt;<span class='kw'>#</span>&lt;track&gt;<span class='kw'>#</span>&lt;minute&gt;",
     "replay this and nothing double-charges")
code("H3-code-402",
     "HTTP/1.1 <span class='kw'>402</span> Payment Required",
     "machine-readable. the agent just pays.")
code("H4-code-footnote",
     "AES-256-GCM <span class='kw'>·</span> SSE-KMS + signed CloudFront <span class='kw'>·</span> DSQL scales to zero",
     "the receipts, for the bench")

# ---- J. Title / section cards ----------------------------------------------
def title(cid, num, label):
    css = """
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center}
    .num{font-family:%s;font-size:40px;color:%s;letter-spacing:8px;margin-bottom:24px}
    .label{font-size:108px;font-weight:700;color:#fff;letter-spacing:1px;line-height:1}
    .rule{width:160px;height:8px;background:%s;border-radius:4px;margin-top:36px}
    """ % (MONO, AMBER, AMBER)
    body = (f"<div class='scrim'></div><div class='wrap'><div class='num'>{esc(num)}</div>"
            f"<div class='label'>{esc(label)}</div><div class='rule'></div></div>")
    cards[cid] = page(body, css)

title("J1-title-metered", "01", "METERED BY THE SECOND")
title("J2-title-twodb", "02", "TWO DATABASES, ONE FLOW")
title("J3-title-cool", "03", "WHAT'S ACTUALLY COOL")

# End card (special)
def endcard(cid):
    css = """
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center}
    .mark{font-size:150px;font-weight:700;color:#fff;letter-spacing:-1px}
    .mark b{color:%s}
    .stack{font-family:%s;font-size:34px;color:#9aa3ad;margin-top:30px;letter-spacing:1px}
    """ % (AMBER, MONO)
    body = (f"<div class='scrim'></div><div class='wrap'><div class='mark'>Toll<b>Road</b></div>"
            f"<div class='stack'>Polyglot CQRS · DynamoDB + Aurora DSQL · Bedrock · Vercel</div></div>")
    cards[cid] = page(body, css)
endcard("J4-endcard")

# ---- K. Pull-quote cards ---------------------------------------------------
def quote(cid, text, attrib=None):
    css = """
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:0 200px}
    .mark{font-family:%s;font-size:200px;color:%s;line-height:.4;height:90px;opacity:.5}
    .q{font-size:72px;font-weight:600;color:#fff;line-height:1.18;max-width:1500px}
    .at{font-size:34px;color:%s;margin-top:40px;font-style:italic}
    """ % (MONO, AMBER, AMBER)
    at = f"<div class='at'>— {esc(attrib)}</div>" if attrib else ""
    body = (f"<div class='scrim'></div><div class='wrap'><div class='mark'>“</div>"
            f"<div class='q'>{esc(text)}</div>{at}</div>")
    cards[cid] = page(body, css)

quote("K1-quote-billing", "Every minute you stream is a billing event.")
quote("K2-quote-stripe", "Stripe for music royalties. The streaming is almost incidental.")
quote("K3-quote-amanda", "I get paid the instant you press play. I've never had that.", "Amanda")
quote("K4-quote-idle", "Idle cost is a design output — you architect for it, or you pay for it.")

# ---- E. Architecture diagram cards ----------------------------------------
DCSS = cssfmt("""
.stage{position:absolute;inset:0;font-family:@SANS@}
.wires{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:visible}
.wire{fill:none;stroke:#cfd6dd;stroke-width:5}
.wire.amber{stroke:@AMBER@}.wire.blue{stroke:@BLUE@}
.wire.green{stroke:@GREEN@}.wire.red{stroke:@RED@}
.box{position:absolute;background:rgba(18,21,27,.96);border:3px solid #3a414b;
  border-radius:18px;padding:24px 28px;text-align:center;
  box-shadow:0 14px 40px rgba(0,0,0,.5)}
.box .svc{font-size:44px;font-weight:700;color:#fff;line-height:1.05}
.box .role{font-family:@MONO@;font-size:24px;color:#9aa3ad;margin-top:12px}
.box.amber{border-color:@AMBER@}.box.amber .svc{color:@AMBER@}
.box.blue{border-color:@BLUE@}.box.blue .svc{color:@BLUE@}
.box.green{border-color:@GREEN@}.box.green .svc{color:@GREEN@}
.box.soft{background:rgba(18,21,27,.96)}
.wlabel{position:absolute;font-family:@MONO@;font-size:25px;color:#e6e9ed;
  background:rgba(8,10,14,.9);padding:7px 16px;border-radius:9px;
  transform:translateX(-50%);text-align:center;white-space:nowrap}
.wlabel.red{color:@RED@}.wlabel.green{color:@GREEN@}
.dtitle{position:absolute;left:120px;top:96px;font-size:62px;font-weight:700;
  color:#fff;letter-spacing:.3px}
.dtitle b{color:@AMBER@}
.dstamp{position:absolute;left:120px;bottom:104px;font-family:@MONO@;
  font-size:31px;color:@AMBER@}
.rows{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.rows i{display:block;height:14px;border-radius:4px;background:@BLUE@;opacity:.55}
.big{font-size:64px;font-weight:700}
""")

ARROW_DEFS = ("<defs>"
  "<marker id='ah' markerWidth='12' markerHeight='12' refX='9' refY='5' orient='auto'>"
  "<path d='M0,0 L10,5 L0,10 z' fill='#cfd6dd'/></marker>"
  "<marker id='ah-r' markerWidth='12' markerHeight='12' refX='9' refY='5' orient='auto'>"
  f"<path d='M0,0 L10,5 L0,10 z' fill='{RED}'/></marker>"
  "<marker id='ah-g' markerWidth='12' markerHeight='12' refX='9' refY='5' orient='auto'>"
  f"<path d='M0,0 L10,5 L0,10 z' fill='{GREEN}'/></marker>"
  "</defs>")

def diagram(cid, title, stamp, wires_svg, boxes_html, labels_html=""):
    svg = (f"<svg class='wires' viewBox='0 0 1920 1080'>{ARROW_DEFS}{wires_svg}</svg>")
    body = (f"<div class='scrim'></div><div class='stage'>"
            f"<div class='dtitle'>{title}</div>{svg}{boxes_html}{labels_html}"
            f"<div class='dstamp'>{stamp}</div></div>")
    cards[cid] = page(body, DCSS)

def box(x, y, w, svc, role=None, cls=""):
    r = f"<div class='role'>{esc(role)}</div>" if role else ""
    return (f"<div class='box {cls}' style='left:{x}px;top:{y}px;width:{w}px'>"
            f"<div class='svc'>{svc}</div>{r}</div>")

def wlabel(x, y, text, cls=""):
    return f"<div class='wlabel {cls}' style='left:{x}px;top:{y}px'>{esc(text)}</div>"

def wire(x1, y1, x2, y2, cls="", mk="ah"):
    return f"<path class='wire {cls}' d='M{x1},{y1} L{x2},{y2}' marker-end='url(#{mk})'/>"

# E1 — two lanes (polyglot CQRS)
diagram("E1-arch-twolanes",
  "Two databases, <b>one flow</b>",
  "POLYGLOT CQRS · one app, two databases",
  wire(560, 470, 770, 470, "amber") + wire(560, 720, 770, 720, "blue"),
  box(160, 408, 380, "Listening<br>· Paying ·", "you do the fast stuff", "amber")
  + box(770, 408, 380, "DynamoDB", "command side · writes", "amber")
  + box(160, 658, 380, "Aurora DSQL", "query side · reads", "blue")
  + box(770, 658, 470, "Dashboards<br>· Earnings ·", "you read it back", "blue"),
  wlabel(665, 408, "WRITES →") + wlabel(665, 658, "← READS"))

# E2 — one atomic write
diagram("E2-arch-atomic",
  "One <b>atomic</b> write",
  "all-or-nothing · can't double-charge · can't overspend",
  wire(640, 470, 900, 540, "amber") + wire(640, 700, 900, 580, "blue"),
  box(280, 410, 360, "&minus; charge<br>balance", None, "amber")
  + box(280, 640, 360, "&plus; log<br>the play", None, "blue")
  + box(900, 450, 460, "\U0001f512 ONE WRITE", "succeeds together — or not at all", "green"))

# E3 — the permanent record (append-only ledger -> dashboard)
diagram("E3-arch-ledger",
  "The <b>permanent record</b>",
  "dashboard = pre-totalled · instant read",
  wire(420, 540, 560, 540) + wire(1100, 540, 1280, 540, "blue"),
  box(150, 478, 270, "▶ a play")
  + ("<div class='box blue' style='left:560px;top:430px;width:520px'>"
     "<div class='svc'>Aurora DSQL</div>"
     "<div class='rows'><i style='width:90%'></i><i style='width:70%'></i>"
     "<i style='width:96%'></i><i style='width:60%'></i></div>"
     "<div class='role'>append-only royalty_ledger</div></div>")
  + box(1280, 452, 480, "<span class='big'>$</span> Dashboard", "already added up · never recounts", "blue"))

# E4 — encrypted, key on payment
diagram("E4-arch-encryption",
  "Encrypted. <b>Key on payment.</b>",
  "no pay, no key · nothing cached to rip",
  wire(820, 410, 690, 500, "amber") + wire(680, 540, 1300, 540, "green"),
  box(200, 446, 480, "\U0001f512 the track", "AES-256-GCM at rest", "amber")
  + box(760, 300, 420, "\U0001f511 paid second", "this key expires in ~150s", "amber")
  + box(1300, 446, 380, "▶ playing", "decrypts just in time", "green"))

# E5 — the seam (DynamoDB Streams -> projector -> DSQL)
diagram("E5-arch-cqrs-pipeline",
  "The seam: <b>DynamoDB Streams</b>",
  "the command side never blocks the query side",
  wire(500, 500, 740, 500) + wire(1120, 500, 1360, 500),
  box(120, 432, 380, "DynamoDB", "command side · hot writes", "amber")
  + box(740, 432, 380, "Projector λ", "the sole DSQL writer", "soft")
  + box(1360, 432, 420, "Aurora DSQL", "query side · ledger + reads", "blue"),
  wlabel(620, 420, "Streams") + wlabel(1240, 420, "projects"))

# E6 — x402 handshake
diagram("E6-arch-x402",
  "<b>x402</b> — pay, then play",
  "the agent pays and plays — no human, no checkout",
  wire(520, 350, 1100, 350) + wire(1100, 470, 520, 470, "red", "ah-r")
  + wire(520, 590, 1100, 590) + wire(1100, 710, 520, 710, "green", "ah-g"),
  box(160, 360, 360, "AI agent<br>or game", None, "amber")
  + box(1100, 360, 360, "TollRoad<br>server", None, "blue"),
  wlabel(810, 308, "GET /track")
  + wlabel(810, 428, "402 Payment Required", "red")
  + wlabel(810, 548, "pay from wallet")
  + wlabel(810, 668, "200 · signed URL", "green"))

# E7 — describe-a-vibe (Bedrock + vector-in-DynamoDB)
diagram("E7-arch-vibe",
  "Describe a <b>feeling</b>",
  "the vector search runs inside DynamoDB — no vector DB",
  wire(640, 470, 770, 500) + wire(1190, 500, 1330, 470)
  + wire(1530, 590, 1530, 690) + wire(1530, 760, 1010, 760, "blue"),
  ("<div class='box' style='left:140px;top:430px;width:500px'>"
   "<div class='svc' style='font-size:38px'>“late-night drive,<br>synthwave”</div></div>")
  + box(770, 432, 420, "Amazon Bedrock", "Titan v2 · 1024-dim", "amber")
  + box(1330, 432, 400, "match inside<br>DynamoDB", "cosine over TVEC", "blue")
  + box(1010, 698, 520, "♪ ♪ ♪ ranked tracks", "the set you actually hear", "blue"))

# ---- M. App-styled meter overlays ------------------------------------------
# Faithful recreations of the real TollRoad UI (tokens from globals.css /
# styles/tokens.css). JetBrains Mono + Manrope embedded; Fraunces is system.
FONTDIR = (pathlib.Path(__file__).parent / "fonts").resolve()
def _ff(fam, fn, w, st="normal"):
    return (f"@font-face{{font-family:'{fam}';font-style:{st};font-weight:{w};"
            f"src:url('file://{FONTDIR}/{fn}') format('woff2')}}")
MFONT = "".join([
    _ff("JetBrains Mono", "jetbrains-mono-400.woff2", 400),
    _ff("JetBrains Mono", "jetbrains-mono-700.woff2", 700),
    _ff("Manrope", "manrope-500.woff2", 500),
    _ff("Manrope", "manrope-700.woff2", 700),
    _ff("Manrope", "manrope-800.woff2", 800),
])
MCSS = MFONT + """
.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.serif{font-family:'Fraunces',Georgia,serif;font-style:italic;
  background:linear-gradient(135deg,#ffe1a0 0%,#ffb02e 46%,#c77f12 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.body{font-family:'Manrope',system-ui,sans-serif}
/* ---- the taximeter card (components/Meter.tsx) ---- */
.meter{position:absolute;width:560px;padding:34px;border-radius:18px;
  background:linear-gradient(180deg,#16161d,#101015);border:1px solid #2a2a35;
  box-shadow:0 50px 100px -34px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.05);
  font-family:'Manrope',sans-serif}
.meter::after{content:'';position:absolute;top:-1px;left:24px;right:24px;height:2px;
  background:linear-gradient(90deg,transparent,#ffb02e,transparent);opacity:.6}
.meter-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.live{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.18em;
  color:#ffb02e;display:flex;align-items:center;gap:11px}
.live[data-on='false']{color:#79766d}
.live .dot{width:11px;height:11px;border-radius:50%;background:#ffb02e}
.live[data-on='false'] .dot{background:#79766d}
.meter-btn{width:62px;height:62px;border-radius:50%;border:1px solid #c77f12;
  background:linear-gradient(135deg,#ffe1a0,#ffb02e 46%,#c77f12);color:#2a1c05;
  display:flex;align-items:center;justify-content:center;font-size:26px}
.meter-readout{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;
  font-size:84px;font-weight:700;letter-spacing:-.02em;line-height:1;color:#f4efe3;
  display:flex;align-items:baseline;gap:6px}
.meter-readout .cur{color:#ffb02e;font-size:.55em}
.meter-readout .unit{font-size:.30em;color:#79766d;letter-spacing:.05em}
.meter-sub{font-family:'JetBrains Mono',monospace;font-size:23px;color:#b7b2a6;margin-top:16px}
.meter-bar{height:9px;border-radius:5px;background:#1f1f28;margin:24px 0;overflow:hidden}
.meter-bar .fill{height:100%;background:linear-gradient(135deg,#ffe1a0,#ffb02e 46%,#c77f12)}
.meter-split{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden}
.meter-cell{background:#101015;padding:18px 20px}
.meter-cell .k{font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:.12em;
  text-transform:uppercase;color:#79766d}
.meter-cell .v{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;
  font-size:30px;color:#f4efe3;margin-top:7px}
.meter-cell .v.green{color:#66e6a6}
/* ---- wallet balance (components/WalletPanel.tsx) ---- */
.wallet{position:absolute;width:430px;padding:30px 34px;background:#101015;
  border:1px solid #2a2a35;border-radius:26px;
  box-shadow:0 40px 90px -34px rgba(0,0,0,.85)}
.wallet[data-low='true']{border-color:#c77f12}
.wallet .k{font-family:'JetBrains Mono',monospace;font-size:19px;letter-spacing:.06em;
  text-transform:uppercase;color:#79766d}
.wallet .v{font-size:84px;line-height:1;margin-top:12px}
.wallet .note{font-family:'Manrope',sans-serif;color:#ffc861;font-size:22px;margin-top:16px}
/* ---- in-player meter chip (.lx-meter) ---- */
.chip{position:absolute;display:flex;gap:26px;align-items:center;border:1px solid rgba(255,255,255,.08);
  background:#121218;border-radius:14px;padding:18px 26px;
  box-shadow:0 30px 70px -30px rgba(0,0,0,.85)}
.chip .col{display:flex;flex-direction:column;font-family:'JetBrains Mono',monospace;
  font-variant-numeric:tabular-nums;font-size:40px;font-weight:700;color:#f6f1e6;line-height:1.1}
.chip .col.amber{color:#ffb02e}
.chip .col small{font-family:'Manrope',sans-serif;font-size:16px;font-weight:500;
  letter-spacing:.08em;text-transform:uppercase;color:#6f6c63;margin-top:6px}
/* ---- artist earnings (styles/artist.css) ---- */
.az{position:absolute;width:520px;padding:34px;background:#101015;
  border:1px solid rgba(255,255,255,.07);border-radius:26px;
  box-shadow:0 40px 90px -34px rgba(0,0,0,.85)}
.az .eyebrow{font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:.16em;
  text-transform:uppercase;color:#79766d}
.az .total{font-family:'Fraunces',serif;font-weight:600;font-size:78px;color:#66e6a6;
  line-height:1;margin:14px 0 26px}
.az .row{display:flex;align-items:center;justify-content:space-between;
  padding:14px 0;border-top:1px solid rgba(255,255,255,.07)}
.az .row .t{font-family:'Manrope',sans-serif;font-size:24px;color:#f4efe3}
.az .row .min{font-family:'JetBrains Mono',monospace;font-size:21px;color:#b7b2a6}
.az .row .amt{font-family:'JetBrains Mono',monospace;font-size:26px;color:#66e6a6}
/* ---- rate chip (.cat-rate) ---- */
.rate{position:absolute;display:inline-flex;align-items:baseline;gap:10px;
  background:#101015;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 28px;
  box-shadow:0 30px 70px -30px rgba(0,0,0,.85)}
.rate .v{font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:700;color:#66e6a6}
.rate .u{font-family:'JetBrains Mono',monospace;font-size:26px;color:#79766d}
/* ---- full now-playing player bar (.lx-player) ---- */
.lx{position:absolute;left:0;right:0;bottom:0;height:150px;display:grid;
  grid-template-columns:minmax(320px,1fr) minmax(560px,1.8fr) minmax(360px,1fr);
  gap:30px;padding:0 40px;align-items:center;
  background:linear-gradient(180deg,rgba(18,18,24,.96),rgba(10,10,14,.99));
  border-top:1px solid rgba(255,255,255,.08)}
.lx-l{display:flex;align-items:center;gap:18px}
.lx-cover{width:84px;height:84px;border-radius:12px;flex:0 0 84px;
  background:linear-gradient(135deg,#ffb02e,#c77f12)}
.lx-title{font-family:'Manrope',sans-serif;font-weight:700;font-size:30px;color:#f6f1e6}
.lx-artist{font-family:'Manrope',sans-serif;font-size:23px;color:#aaa69b;margin-top:4px}
.lx-c{display:flex;flex-direction:column;align-items:center;gap:14px}
.lx-ctrls{display:flex;align-items:center;gap:34px;color:#aaa69b;font-size:30px}
.lx-main{width:64px;height:64px;border-radius:50%;background:#f6f1e6;color:#08080a;
  display:flex;align-items:center;justify-content:center;font-size:28px}
.lx-seek{display:flex;align-items:center;gap:16px;width:100%}
.lx-t{font-family:'JetBrains Mono',monospace;font-size:20px;color:#6f6c63}
.lx-track{flex:1;height:7px;border-radius:4px;background:#1a1a22;overflow:hidden}
.lx-track .f{height:100%;width:46%;background:#ffb02e}
.lx-r{display:flex;align-items:center;justify-content:flex-end;gap:24px}
.lx-live{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.14em;
  color:#66e6a6;display:flex;align-items:center;gap:9px}
.lx-live .d{width:10px;height:10px;border-radius:50%;background:#66e6a6}
"""

def mcard(cid, inner):
    cards[cid] = page(f"<div class='body'>{inner}</div>", MCSS)

def taximeter(cid, cost, minutes, permin, barpct, playing=True):
    on = "true" if playing else "false"
    tag = "LIVE · METERING" if playing else "PAUSED"
    btn = "❚❚" if playing else "▶"
    inner = (f"<div class='meter' style='right:150px;bottom:160px'>"
      f"<div class='meter-head'><div class='live' data-on='{on}'>"
      f"<span class='dot'></span>{tag}</div>"
      f"<div class='meter-btn'>{btn}</div></div>"
      f"<div class='meter-readout'><span class='cur'>$</span>{cost:.4f}"
      f"<span class='unit'>USD</span></div>"
      f"<div class='meter-sub'>Neon Mile · Amanda Kurt</div>"
      f"<div class='meter-bar'><div class='fill' style='width:{barpct}%'></div></div>"
      f"<div class='meter-split'>"
      f"<div class='meter-cell'><div class='k'>Minutes billed</div>"
      f"<div class='v'>{minutes:.2f}</div></div>"
      f"<div class='meter-cell'><div class='k'>Per minute</div>"
      f"<div class='v'>${permin:.4f}</div></div></div></div>")
    mcard(cid, inner)

taximeter("M1-meter-tick-low",  0.0011, 1.00, 0.0011, 16)
taximeter("M2-meter-tick-mid",  0.0042, 3.82, 0.0011, 44)
taximeter("M3-meter-tick-high", 0.0193, 17.55, 0.0011, 82)
taximeter("M4-meter-paused",    0.0042, 3.82, 0.0011, 44, playing=False)

# M5 — wallet balance card
mcard("M5-wallet-balance",
  "<div class='wallet' style='left:120px;bottom:150px'>"
  "<div class='k'>Wallet balance</div>"
  "<div class='v serif'>$4.20</div>"
  "<div class='note'>+ Add funds</div></div>")

# M6 — in-player meter chip (balance + session)
mcard("M6-player-chip",
  "<div class='chip' style='right:150px;bottom:170px'>"
  "<div class='col'>$4.20<small>balance</small></div>"
  "<div class='col amber'>$0.0042<small>session</small></div></div>")

# M7 — artist earnings card (metering green)
mcard("M7-artist-earnings",
  "<div class='az' style='left:120px;bottom:140px'>"
  "<div class='eyebrow'>Amanda Kurt · earnings</div>"
  "<div class='total'>$128.40</div>"
  "<div class='row'><span class='t'>Neon Mile</span>"
  "<span class='min'>9,420 min</span><span class='amt'>+$10.36</span></div>"
  "<div class='row'><span class='t'>Midnight Toll</span>"
  "<span class='min'>6,118 min</span><span class='amt'>+$6.73</span></div>"
  "<div class='row'><span class='t'>Asphalt Hymn</span>"
  "<span class='min'>3,902 min</span><span class='amt'>+$4.29</span></div></div>")

# M8 — per-minute rate chip
mcard("M8-rate-chip",
  "<div class='rate' style='left:120px;bottom:200px'>"
  "<span class='v'>0.5¢</span><span class='u'>/min</span></div>")

# M9 — full now-playing player bar (docked, like the app)
mcard("M9-player-bar",
  "<div class='lx'>"
  "<div class='lx-l'><div class='lx-cover'></div>"
  "<div><div class='lx-title'>Neon Mile</div>"
  "<div class='lx-artist'>Amanda Kurt</div></div></div>"
  "<div class='lx-c'><div class='lx-ctrls'>⏮<div class='lx-main'>❚❚</div>⏭</div>"
  "<div class='lx-seek'><span class='lx-t'>1:23</span>"
  "<div class='lx-track'><div class='f'></div></div>"
  "<span class='lx-t'>3:01</span></div></div>"
  "<div class='lx-r'><div class='lx-live'><span class='d'></span>METERING</div>"
  "<div class='chip' style='position:static'>"
  "<div class='col'>$4.20<small>balance</small></div>"
  "<div class='col amber'>$0.0042<small>session</small></div></div></div></div>")

# ---- write ------------------------------------------------------------------
for cid, doc in cards.items():
    (OUT / f"{cid}.html").write_text(doc, encoding="utf-8")
print(f"wrote {len(cards)} html files to {OUT}")
for cid in sorted(cards): print(" ", cid)
