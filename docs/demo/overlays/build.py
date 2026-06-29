#!/usr/bin/env python3
"""Generate TollRoad demo overlay cards as standalone HTML (1920x1080, transparent).
Render to PNG with the sibling render.sh (headless chromium). Pure stdlib."""
import html, os, pathlib

OUT = pathlib.Path(__file__).parent / "_html"
OUT.mkdir(parents=True, exist_ok=True)

AMBER = "#FFB020"
BLUE = "#4DA3FF"
SANS = "'Liberation Sans','Noto Sans',sans-serif"
MONO = "'Noto Sans Mono',monospace"

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
lower_third("A2-lower-founder", "[YOUR NAME]", "Built TollRoad · solo · 17 days")
lower_third("A3-lower-role", "[YOUR NAME]", "Looking for: Solutions Architect, AWS")

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

# ---- write ------------------------------------------------------------------
for cid, doc in cards.items():
    (OUT / f"{cid}.html").write_text(doc, encoding="utf-8")
print(f"wrote {len(cards)} html files to {OUT}")
for cid in sorted(cards): print(" ", cid)
