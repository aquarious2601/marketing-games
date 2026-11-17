# -*- coding: utf-8 -*-
"""Divided Light - a plate book of six atmospheres for a turning field."""
import math
import os
import random

from reportlab.pdfgen import canvas as rl_canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color

FONTS = os.path.join(
    r"C:\Users\aquarious\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin",
    r"75ac46e7-b9e5-4060-8b6e-bcd730b918d1\cdd74412-129f-4b7d-b6b9-dd18d2d0de6c",
    r"skills\canvas-design\canvas-fonts")
OUT = r"C:\Users\aquarious\marketing-games\roulette\design\divided-light.pdf"

pdfmetrics.registerFont(TTFont("Display", os.path.join(FONTS, "Italiana-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Label", os.path.join(FONTS, "Jura-Light.ttf")))
pdfmetrics.registerFont(TTFont("LabelM", os.path.join(FONTS, "Jura-Medium.ttf")))
pdfmetrics.registerFont(TTFont("Mono", os.path.join(FONTS, "GeistMono-Regular.ttf")))

W, H = 680.3, 907.1
M = 72.0
FY0, FY1 = 72.0, H - 72.0
CX = W / 2.0

HERO_Y = 470.0      # the axis every figure turns on
R = 156.0           # the declared radius, identical on every atmosphere
COLLAR = R + 12.0   # the degree collar
MOTIF_Y = 694.0     # the band above the figure
TEXT_BANDS = ((74, 98), (110, 134), (140, 238), (238, 260), (722, 804),
              (808, 832))


# ------------------------------------------------------------------ colour
def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)


def C(h, a=1.0):
    r, g, b = hx(h)
    return Color(r, g, b, alpha=a)


def mix(h1, h2, t):
    a, b = hx(h1), hx(h2)
    return "#%02X%02X%02X" % tuple(
        int(round((a[i] + (b[i] - a[i]) * t) * 255)) for i in range(3))


def lum(h):
    def ch(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = hx(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(f, b):
    a, c = lum(f), lum(b)
    return (max(a, c) + 0.05) / (min(a, c) + 0.05)


# ------------------------------------------------------------------ the themes
SLICES = ["#475569", "#E11D48", "#0369A1", "#B45309", "#047857", "#7C3AED",
          "#C2410C", "#0F766E", "#C026D3", "#4D7C0F", "#0E7490", "#4F46E5"]

ORDER = ["background", "backgroundDeep", "accent", "accentSoft", "stage",
         "stageEdge", "stageBorder", "heading", "body", "danger", "buttonBg",
         "buttonShine", "buttonText", "panelBg", "panelBorder", "panelHeading",
         "panelText", "wheelRim"]

T = {}
T["plain"] = dict(
    background="#F8FAFC", backgroundDeep="#DEE6F0", accent="#334155",
    accentSoft="#94A3B8", stage="#FFFFFF", stageEdge="#F4F7FB",
    stageBorder="#E2E8F0", heading="#0F172A", body="#475569", danger="#B91C1C",
    buttonBg="#0F172A", buttonShine="#334155", buttonText="#FFFFFF",
    panelBg="#ECFDF5", panelBorder="#A7F3D0", panelHeading="#065F46",
    panelText="#064E3B", wheelRim="#CBD5E1")
T["black-friday"] = dict(
    background="#0B0B0C", backgroundDeep="#000000", accent="#F59E0B",
    accentSoft="#FCD34D", stage="#141416", stageEdge="#0C0C0E",
    stageBorder="#45403A", heading="#FFFFFF", body="#D4D4D8", danger="#FCA5A5",
    buttonBg="#F59E0B", buttonShine="#FCD34D", buttonText="#0B0B0C",
    panelBg="#1C1917", panelBorder="#92400E", panelHeading="#FBBF24",
    panelText="#E7E5E4", wheelRim="#F59E0B")
T["christmas"] = dict(
    background="#0B3D2E", backgroundDeep="#04201A", accent="#DC2626",
    accentSoft="#FCD9A0", stage="#0A3527", stageEdge="#06281E",
    stageBorder="#1F7A4D", heading="#FFF7ED", body="#CFE3D6", danger="#FCA5A5",
    buttonBg="#A81A1A", buttonShine="#C62222", buttonText="#FFFFFF",
    panelBg="#052E22", panelBorder="#15803D", panelHeading="#FCA5A5",
    panelText="#E7E5E4", wheelRim="#E9C46A")
T["new-year"] = dict(
    background="#0B1437", backgroundDeep="#04081E", accent="#D4AF37",
    accentSoft="#F5D77A", stage="#121C47", stageEdge="#0B1333",
    stageBorder="#3B4C8A", heading="#FFFFFF", body="#CBD5E1", danger="#FCA5A5",
    buttonBg="#C79C27", buttonShine="#E8C457", buttonText="#0B1437",
    panelBg="#111C4A", panelBorder="#B08D2A", panelHeading="#F5D77A",
    panelText="#E2E8F0", wheelRim="#D4AF37")
T["halloween"] = dict(
    background="#1A0B2E", backgroundDeep="#0A0415", accent="#F97316",
    accentSoft="#FDBA74", stage="#241139", stageEdge="#190B29",
    stageBorder="#6B21A8", heading="#FFFFFF", body="#E9D5FF", danger="#FCA5A5",
    buttonBg="#F97316", buttonShine="#FB923C", buttonText="#1A0B2E",
    panelBg="#2A1246", panelBorder="#7E22CE", panelHeading="#FDBA74",
    panelText="#EDE9FE", wheelRim="#F97316")
T["birthday"] = dict(
    background="#FDF2F8", backgroundDeep="#F6BBD5", accent="#DB2777",
    accentSoft="#FBCFE8", stage="#FFFFFF", stageEdge="#FFF4FA",
    stageBorder="#F9A8D4", heading="#9D174D", body="#86198F", danger="#B91C1C",
    buttonBg="#A8124F", buttonShine="#C5165C", buttonText="#FFFFFF",
    panelBg="#FFFFFF", panelBorder="#F9A8D4", panelHeading="#9D174D",
    panelText="#3F3F46", wheelRim="#F9A8D4")

PLATES = [
    ("plain", "PLAIN", "PAPER \u00b7 INK \u00b7 NO SEASON",
     "Stillness held as a decision, not an absence.", "II", "000"),
    ("black-friday", "BLACK FRIDAY", "ONE LAMP \u00b7 A ROOM OF BLACK",
     "A single source, and everything it fails to reach.", "III", "045"),
    ("christmas", "CHRISTMAS", "GREEN NIGHT \u00b7 LAMPLIGHT FROM BELOW",
     "Warmth, measured against a pine horizon.", "IV", "090"),
    ("new-year", "NEW YEAR", "MIDNIGHT \u00b7 GOLD LEAF \u00b7 ASCENT",
     "Light sent upward on the last minute of the year.", "V", "180"),
    ("halloween", "HALLOWEEN", "FULL MOON \u00b7 VIOLET DEPTH",
     "Specimens arranged beneath a cold circular light.", "VI", "270"),
    ("birthday", "HAPPY BIRTHDAY", "CONFETTI \u00b7 BROUGHT TO ORDER",
     "Three spheres, and a thousand fragments counted.", "VII", "315"),
]


# ------------------------------------------------------------------ primitives
def tx(c, x, y, s, font, size, cs=0.0, align="l", col=None, alpha=1.0):
    if col is not None:
        c.setFillColor(col if isinstance(col, Color) else C(col, alpha))
    w = pdfmetrics.stringWidth(s, font, size) + cs * max(0, len(s) - 1)
    if align == "c":
        x -= w / 2.0
    elif align == "r":
        x -= w
    t = c.beginText(x, y)
    t.setFont(font, size)
    t.setCharSpace(cs)
    t.textOut(s)
    c.drawText(t)
    return w


def vband(c, x, y, w, h, top, bot, steps=440, gamma=1.0):
    """A graded field, laid down as many fine bands rather than as an effect."""
    sh = h / float(steps)
    for i in range(steps):
        t = (i / float(steps - 1)) ** gamma
        c.setFillColor(C(mix(top, bot, t)))
        c.rect(x, y + h - (i + 1) * sh, w, sh + 0.6, stroke=0, fill=1)


def glow(c, x, y, r, col, a0=0.16, rings=70, gamma=1.8):
    for i in range(rings, 0, -1):
        t = i / float(rings)
        c.setFillColor(C(col, a0 * (1 - t) ** gamma))
        c.circle(x, y, r * t, stroke=0, fill=1)


def ring(c, x, y, r, col, a=1.0, lw=0.3):
    c.setStrokeColor(C(col, a))
    c.setLineWidth(lw)
    c.circle(x, y, r, stroke=1, fill=0)


def spoke(c, x, y, a_deg, r0, r1, col, a=1.0, lw=0.3):
    t = math.radians(a_deg)
    c.setStrokeColor(C(col, a))
    c.setLineWidth(lw)
    c.line(x + r0 * math.cos(t), y + r0 * math.sin(t),
           x + r1 * math.cos(t), y + r1 * math.sin(t))


def dial(c, x, y, r, col, tcol, n=180, every=15):
    """The systematic marker: a degree collar with four cardinal readings."""
    step = n // (360 // every)
    for i in range(n):
        d = i * 360.0 / n
        spoke(c, x, y, d, r, r + (5.6 if i % step == 0 else 2.0), col, 0.42, 0.25)
    ring(c, x, y, r, col, 0.30, 0.25)
    for d, lab in ((90, "000"), (0, "090"), (270, "180"), (180, "270")):
        t = math.radians(d)
        rr = r + 14
        tx(c, x + rr * math.cos(t), y + rr * math.sin(t) - 1.7, lab,
           "Mono", 4.2, 0.6, "c", tcol, 0.55)


def field(c, n, col, seed, keep_out=None, amin=0.10, amax=0.60, smax=0.95):
    """A dot field laid across the whole sheet, so it has no edge of its own."""
    rnd = random.Random(seed)
    for _ in range(n):
        px, py = rnd.random() * W, rnd.random() * H
        if math.hypot(px - CX, py - HERO_Y) < (keep_out or 0):
            continue
        # no mark is ever allowed to land on a word
        if any(y0 <= py <= y1 for y0, y1 in TEXT_BANDS):
            continue
        s = rnd.random()
        c.setFillColor(C(col, amin + (amax - amin) * s ** 3))
        c.circle(px, py, 0.26 + smax * s ** 4, stroke=0, fill=1)


def beam(c, x0, y0, half, xa, xb, ybase, col, a0, steps=56):
    """A shaft of light, laid in slices that fade out before they land."""
    for i in range(steps):
        t0, t1 = i / float(steps), (i + 1) / float(steps)
        ya, yb = y0 + (ybase - y0) * t0, y0 + (ybase - y0) * t1
        la, lb = x0 - half + (xa - x0 + half) * t0, x0 - half + (xa - x0 + half) * t1
        ra, rb = x0 + half + (xb - x0 - half) * t0, x0 + half + (xb - x0 - half) * t1
        c.setFillColor(C(col, a0 * (1 - t0) ** 1.9))
        p = c.beginPath()
        p.moveTo(la, ya)
        p.lineTo(ra, ya)
        p.lineTo(rb, yb)
        p.lineTo(lb, yb)
        p.close()
        c.drawPath(p, stroke=0, fill=1)


# ------------------------------------------------------------------ chrome
def chrome(c, plate, code, foot, rule, label):
    c.setStrokeColor(C(rule, 0.55))
    c.setLineWidth(0.4)
    c.rect(M, FY0, W - 2 * M, FY1 - FY0, stroke=1, fill=0)
    c.setStrokeColor(C(rule, 0.95))
    c.setLineWidth(0.6)
    for sx in (M, W - M):
        for sy in (FY0, FY1):
            dx = 10 if sx == M else -10
            dy = 10 if sy == FY0 else -10
            c.line(sx, sy, sx + dx, sy)
            c.line(sx, sy, sx, sy + dy)
    tx(c, M + 0.5, FY1 - 16, plate, "Mono", 5.4, 1.6, "l", label, 0.75)
    tx(c, W - M - 0.5, FY1 - 16, code, "Mono", 5.4, 1.6, "r", label, 0.6)
    c.setStrokeColor(C(rule, 0.8))
    c.setLineWidth(0.35)
    for i in range(37):
        yy = 290 + i * (430 / 36.0)
        c.line(W - M, yy, W - M - (6.5 if i % 9 == 0 else 3.0), yy)
    c.setStrokeColor(C(rule, 0.5))
    c.setLineWidth(0.35)
    c.line(M, 104, W - M, 104)
    tx(c, M + 0.5, 84, foot, "Mono", 5.0, 1.3, "l", label, 0.6)
    tx(c, W - M - 0.5, 84, "DIVIDED LIGHT", "Mono", 5.0, 1.9, "r", label, 0.5)


def register(c, th, form, label, rule):
    """The chromatic register: eighteen declared values, read left to right."""
    x0, bw = M, (W - 2 * M) / 18.0
    c.setStrokeColor(C(rule, 0.5))
    c.setLineWidth(0.35)
    c.line(M, 236, W - M, 236)
    c.line(M, 142, W - M, 142)
    for i, k in enumerate(ORDER):
        h = th[k]
        cx = x0 + bw * i + bw / 2.0
        c.setFillColor(C(h))
        # every value is declared, including the ones the ground would swallow
        c.setStrokeColor(C(label, 0.32))
        c.setLineWidth(0.3)
        if form == "flat":
            c.rect(x0 + bw * i + 1.3, 196, bw - 2.6, 34, stroke=1, fill=1)
        elif form == "stair":
            c.rect(x0 + bw * i + 1.3, 196, bw - 2.6,
                   9 + 25 * (lum(h) ** 0.5), stroke=1, fill=1)
        elif form == "comb":
            c.rect(cx - 4.2, 196, 8.4, 34, stroke=1, fill=1)
        elif form == "square":
            c.rect(cx - 11, 208, 22, 22, stroke=1, fill=1)
        elif form == "disc":
            c.circle(cx, 219, 11, stroke=1, fill=1)
        elif form == "diamond":
            c.saveState()
            c.translate(cx, 219)
            c.rotate(45)
            c.rect(-8.0, -8.0, 16.0, 16.0, stroke=1, fill=1)
            c.restoreState()
        c.saveState()
        c.translate(cx + 2.0, 151)
        c.rotate(90)
        tx(c, 0, 0, h.replace("#", ""), "Mono", 4.5, 0.8, "l", label, 0.8)
        c.restoreState()
        c.saveState()
        c.translate(cx - 4.8, 151)
        c.rotate(90)
        tx(c, 0, 0, "%02d" % (i + 1), "Mono", 4.0, 0.4, "l", label, 0.4)
        c.restoreState()


def plate_type(c, name, sub, cap, label, rule, heading):
    tx(c, CX, 762, name, "Display", 31, 7.4, "c", heading)
    c.setStrokeColor(C(rule, 0.65))
    c.setLineWidth(0.4)
    c.line(CX - 96, 795, CX + 96, 795)
    tx(c, CX, 737, sub, "Label", 6.6, 3.0, "c", label, 0.85)
    tx(c, CX, 120, cap, "Label", 7.4, 1.2, "c", label, 0.9)


def readings(c, th, label):
    s = "   ".join("%s %4.2f:1" % (k, ratio(th[a], th[b])) for k, a, b in (
        ("H/S", "heading", "stage"),
        ("B/S", "body", "stage"),
        ("T/B", "buttonText", "buttonBg")))
    tx(c, CX, 246, s, "Mono", 4.8, 1.1, "c", label, 0.62)


# ------------------------------------------------------------------ the figures
def fig_plain(c, th):
    ac, soft = th["accent"], th["accentSoft"]
    cy = HERO_Y
    c.setStrokeColor(C(ac, 0.20))
    c.setLineWidth(0.3)
    c.line(M + 16, cy, W - M - 16, cy)
    for i in range(240):
        d = i * 1.5
        # the modulation is locked to the twelve, so the lobes are a decision
        m = 0.5 + 0.5 * math.cos(math.radians(12 * (d - 15)))
        spoke(c, CX, cy, d, 44 + 18 * m, R, ac, 0.10 + 0.16 * m, 0.28)
    for k in range(7):
        ring(c, CX, cy, 44 + k * (R - 44) / 6.0, soft, 0.32, 0.25)
    ring(c, CX, cy, 44, ac, 0.55, 0.5)
    for i in range(12):
        spoke(c, CX, cy, i * 30 + 15, 44, R, ac, 0.40, 0.45)
    dial(c, CX, cy, COLLAR, ac, th["body"])
    c.setFillColor(C(ac, 0.9))
    c.circle(CX, cy, 1.5, stroke=0, fill=1)


def fig_bf(c, th):
    ac, soft = th["accent"], th["accentSoft"]
    cy = HERO_Y
    lx, ly = CX - 126, cy + 152
    beam(c, lx + 12, ly - 16, 6, M + 10, M + 148, 268, ac, 0.10)
    beam(c, lx + 14, ly - 16, 6, M + 224, M + 362, 268, ac, 0.085)
    glow(c, lx, ly, 128, soft, 0.17, 80, 2.4)
    for i in range(360):
        lit = max(0.0, math.cos(math.radians(i - 134))) ** 1.5
        spoke(c, CX, cy, i, 50, R, mix(th["backgroundDeep"], soft, lit),
              0.10 + 0.70 * lit, 0.32)
    for k in range(5):
        ring(c, CX, cy, 50 + k * (R - 50) / 4.0, ac, 0.16, 0.25)
    ring(c, CX, cy, 50, ac, 0.8, 0.6)
    dial(c, CX, cy, COLLAR, ac, soft)
    c.setFillColor(C(soft, 1))
    c.circle(CX, cy, 1.8, stroke=0, fill=1)
    # the fixture reads as a silhouette inside its own light
    ring(c, lx, ly, 15, th["buttonText"], 0.55, 0.5)
    ring(c, lx, ly, 20, th["buttonText"], 0.22, 0.3)
    c.setFillColor(C(th["buttonText"], 0.75))
    c.circle(lx, ly, 2.4, stroke=0, fill=1)
    tx(c, lx + 29, ly - 2, "SOURCE", "Mono", 4.4, 1.5, "l", th["buttonText"], 0.6)


def fig_xmas(c, th):
    ac, soft, rim = th["accent"], th["accentSoft"], th["wheelRim"]
    cy = HERO_Y
    glow(c, CX, 350, 124, soft, 0.15, 70, 1.8)
    field(c, 620, "#FFFFFF", 3, R + 26, 0.07, 0.42, 0.8)
    hub = 20.0
    for i in range(12):
        a0, a1 = i * 30.0, i * 30.0 + 30.0
        n = 14
        p = c.beginPath()
        p.moveTo(CX + hub * math.cos(math.radians(a0)),
                 cy + hub * math.sin(math.radians(a0)))
        for j in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * j / n)
            p.lineTo(CX + R * math.cos(a), cy + R * math.sin(a))
        for j in range(n + 1):
            a = math.radians(a1 - (a1 - a0) * j / n)
            p.lineTo(CX + hub * math.cos(a), cy + hub * math.sin(a))
        p.close()
        c.setFillColor(C(th["stage"] if i % 2 else th["backgroundDeep"], 0.92))
        c.drawPath(p, stroke=0, fill=1)
    for k in range(25):
        ring(c, CX, cy, hub + k * (R - hub) / 24.0, rim, 0.11, 0.22)
    for i in range(12):
        spoke(c, CX, cy, i * 30, hub, R, rim, 0.45, 0.32)
    ring(c, CX, cy, R, rim, 0.85, 0.7)
    ring(c, CX, cy, R - 4.0, rim, 0.3, 0.25)
    ring(c, CX, cy, hub, rim, 0.7, 0.45)
    c.setFillColor(C(ac, 0.85))
    c.circle(CX, cy, 2.0, stroke=0, fill=1)
    dial(c, CX, cy, COLLAR, rim, soft)
    gy, gw, sag = 712.0, 228.0, 24.0
    pts = [(CX - gw + 2 * gw * (i / 80.0),
            gy - sag * math.sin(math.pi * (i / 80.0))) for i in range(81)]
    c.setStrokeColor(C(rim, 0.5))
    c.setLineWidth(0.4)
    for i in range(80):
        c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    for i in range(15):
        t = (i + 0.5) / 15.0
        px = CX - gw + 2 * gw * t
        py = gy - sag * math.sin(math.pi * t)
        col = soft if i % 2 == 0 else ac
        c.setStrokeColor(C(col, 0.7))
        c.setLineWidth(0.35)
        c.line(px, py, px, py - 6.5)
        glow(c, px, py - 9.8, 8.5, col, 0.5, 14, 1.4)
        c.setFillColor(C(col, 0.95))
        c.circle(px, py - 9.8, 2.0, stroke=0, fill=1)


def fig_ny(c, th):
    ac, soft = th["accent"], th["accentSoft"]
    cy = HERO_Y
    field(c, 900, "#FFFFFF", 7, COLLAR + 24)
    for i in range(360):
        spoke(c, CX, cy, i, 40, R if i % 2 == 0 else R - 22, ac,
              0.13 + 0.17 * (i % 2), 0.3)
    for i in range(72):
        spoke(c, CX, cy, i * 5 + 2.5, R - 10, R + 6, soft, 0.5, 0.3)
    ring(c, CX, cy, R, ac, 0.85, 0.8)
    ring(c, CX, cy, R - 5.0, ac, 0.45, 0.3)
    ring(c, CX, cy, 40, soft, 0.6, 0.4)
    dial(c, CX, cy, COLLAR, ac, soft)
    c.setFillColor(C(soft, 1))
    c.circle(CX, cy, 1.9, stroke=0, fill=1)
    for bx, by, br, n in ((CX - 198, 672, 30, 30), (CX + 4, 696, 19, 24),
                          (CX + 196, 660, 35, 36)):
        glow(c, bx, by, br * 1.25, soft, 0.10, 24, 1.6)
        for i in range(n):
            d = i * 360.0 / n
            spoke(c, bx, by, d, br * 0.24, br, soft, 0.6, 0.28)
            t = math.radians(d)
            c.setFillColor(C(soft, 0.85))
            c.circle(bx + br * math.cos(t), by + br * math.sin(t), 0.75,
                     stroke=0, fill=1)
        c.setFillColor(C("#FFFFFF", 0.9))
        c.circle(bx, by, 1.3, stroke=0, fill=1)


def fig_hw(c, th):
    ac, soft = th["accent"], th["accentSoft"]
    cy = HERO_Y
    mx, my = CX + 152, cy + 150
    glow(c, CX, 344, 120, ac, 0.17, 70, 1.8)
    glow(c, mx, my, 74, "#FFFFFF", 0.11, 50, 1.8)
    c.setFillColor(C("#F6EEDC", 0.92))
    c.circle(mx, my, 28, stroke=0, fill=1)
    c.setFillColor(C("#E3D4B6", 0.5))
    for dx, dy, rr in ((-9, 6, 4.8), (7, -8, 3.4), (2, 11, 2.5),
                       (12, 6, 1.9), (-13, -7, 2.3)):
        c.circle(mx + dx, my + dy, rr, stroke=0, fill=1)
    for i in range(12):
        spoke(c, CX, cy, i * 30, 7, R, soft, 0.45, 0.3)
    for k in range(9):
        rr = 24 + k * (R - 24) / 8.0
        c.setStrokeColor(C(soft, 0.34))
        c.setLineWidth(0.26)
        for i in range(12):
            a0, a1 = math.radians(i * 30), math.radians((i + 1) * 30)
            x0, y0 = CX + rr * math.cos(a0), cy + rr * math.sin(a0)
            x1, y1 = CX + rr * math.cos(a1), cy + rr * math.sin(a1)
            mxp = CX + ((x0 + x1) / 2.0 - CX) * 0.90
            myp = cy + ((y0 + y1) / 2.0 - cy) * 0.90
            p = c.beginPath()
            p.moveTo(x0, y0)
            p.curveTo(mxp, myp, mxp, myp, x1, y1)
            c.drawPath(p, stroke=1, fill=0)
    ring(c, CX, cy, R, ac, 0.75, 0.6)
    dial(c, CX, cy, COLLAR, ac, soft)
    c.setFillColor(C(ac, 0.95))
    c.circle(CX, cy, 2.0, stroke=0, fill=1)
    for i in range(9):
        sx = CX - 184 + i * 46.0
        s = 0.50 + 0.062 * (4 - abs(i - 4))
        c.saveState()
        c.translate(sx, MOTIF_Y)
        c.scale(s, s)
        p = c.beginPath()
        p.moveTo(0, 1.6)
        p.curveTo(-6, 7.0, -14, 7.4, -21, 3.4)
        p.curveTo(-17, 5.0, -13.5, 1.8, -11.5, -2.0)
        p.curveTo(-7.5, -1.2, -3.5, -2.6, 0, -5.0)
        p.curveTo(3.5, -2.6, 7.5, -1.2, 11.5, -2.0)
        p.curveTo(13.5, 1.8, 17, 5.0, 21, 3.4)
        p.curveTo(14, 7.4, 6, 7.0, 0, 1.6)
        p.close()
        c.setFillColor(C(th["backgroundDeep"], 0.97))
        c.drawPath(p, stroke=0, fill=1)
        c.restoreState()
        c.setStrokeColor(C(soft, 0.4))
        c.setLineWidth(0.3)
        c.line(sx, MOTIF_Y - 12, sx, MOTIF_Y - 17)
        tx(c, sx, MOTIF_Y - 25, "%02d" % (i + 1), "Mono", 3.9, 0.4, "c", soft, 0.5)


def fig_bday(c, th):
    ac, soft = th["accent"], th["accentSoft"]
    cy = HERO_Y
    # the card: the one light atmosphere earns its contrast from a white ground
    glow(c, CX, cy, 214, "#FFFFFF", 0.45, 60, 1.6)
    c.setFillColor(C("#FFFFFF", 0.96))
    c.circle(CX, cy, 186, stroke=0, fill=1)
    ring(c, CX, cy, 186, th["stageBorder"], 0.9, 0.5)
    ring(c, CX, cy, 181, th["stageBorder"], 0.4, 0.25)
    seq = [ac, th["buttonBg"], soft, "#F472B6"]
    TILT = (0, 26, 52, 78, 104, 130, 156)
    for k in range(9):
        rr = 22 + k * 16.0
        n = 10 + k * 7
        for i in range(n):
            d = i * 360.0 / n + k * 7.5
            t = math.radians(d)
            c.saveState()
            c.translate(CX + rr * math.cos(t), cy + rr * math.sin(t))
            # declared angles, repeating: order that still reads as scatter
            c.rotate(d + TILT[(i * 3 + k * 2) % 7])
            c.setFillColor(C(seq[(i + k) % 4], 0.85))
            w2 = (2.9, 2.2, 3.3)[(i + k) % 3]
            c.rect(-w2, -1.1, w2 * 2, 2.2, stroke=0, fill=1)
            c.restoreState()
        ring(c, CX, cy, rr, ac, 0.11, 0.22)
    dial(c, CX, cy, COLLAR, ac, th["body"])
    c.setFillColor(C(ac, 0.9))
    c.circle(CX, cy, 1.6, stroke=0, fill=1)
    for i, (bx, br) in enumerate(((CX - 176, 23), (CX, 27), (CX + 176, 20))):
        by = MOTIF_Y + 10 + (27 - br) * 0.5
        c.setFillColor(C([ac, soft, th["buttonBg"]][i], 0.10))
        c.circle(bx, by, br, stroke=0, fill=1)
        ring(c, bx, by, br, ac, 0.6, 0.45)
        c.setFillColor(C(ac, 0.6))
        p = c.beginPath()
        p.moveTo(bx - 2.2, by - br)
        p.lineTo(bx + 2.2, by - br)
        p.lineTo(bx, by - br - 3.4)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.setStrokeColor(C(ac, 0.4))
        c.setLineWidth(0.3)
        p = c.beginPath()
        p.moveTo(bx, by - br - 3.4)
        p.curveTo(bx + 4, by - br - 8, bx - 4, by - br - 12, bx + 1, by - br - 17)
        c.drawPath(p, stroke=1, fill=0)
    c.setStrokeColor(C(ac, 0.35))
    c.setLineWidth(0.3)
    c.line(CX - 176, MOTIF_Y - 32, CX - 176, MOTIF_Y - 37)
    tx(c, CX - 176, MOTIF_Y - 45, "n 03", "Mono", 4.2, 0.8, "c", th["body"], 0.55)


FIGURES = {"plain": fig_plain, "black-friday": fig_bf, "christmas": fig_xmas,
           "new-year": fig_ny, "halloween": fig_hw, "birthday": fig_bday}
FORMS = {"plain": "flat", "black-friday": "stair", "christmas": "comb",
         "new-year": "square", "halloween": "disc", "birthday": "diamond"}


# ------------------------------------------------------------------ pages
def frontispiece(c):
    th = T["plain"]
    vband(c, 0, 0, W, H, "#FFFFFF", "#D7E0EC", 440, 1.25)
    glow(c, CX, 560, 420, "#FFFFFF", 0.45, 60, 1.2)
    cy, r, hub = 496.0, 182.0, 101.0
    for i in range(12):
        a0, a1 = i * 30 + 0.9, i * 30 + 29.1
        n = 16
        p = c.beginPath()
        p.moveTo(CX + hub * math.cos(math.radians(a0)),
                 cy + hub * math.sin(math.radians(a0)))
        for j in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * j / n)
            p.lineTo(CX + r * math.cos(a), cy + r * math.sin(a))
        for j in range(n + 1):
            a = math.radians(a1 - (a1 - a0) * j / n)
            p.lineTo(CX + hub * math.cos(a), cy + hub * math.sin(a))
        p.close()
        c.setFillColor(C(SLICES[i], 0.93))
        c.drawPath(p, stroke=0, fill=1)
    for i in range(12):
        spoke(c, CX, cy, i * 30, hub, r, "#FFFFFF", 0.95, 0.9)
    for k in range(5):
        ring(c, CX, cy, hub - 13.0 - k * 13.0, th["accent"], 0.13, 0.25)
    for i in range(360):
        spoke(c, CX, cy, i, hub - 2, hub - (7.5 if i % 30 == 0 else 3.2),
              th["accent"], 0.25, 0.22)
    for i in range(12):
        a = math.radians(i * 30 + 15)
        tx(c, CX + (hub - 18) * math.cos(a), cy + (hub - 18) * math.sin(a) - 1.5,
           "%02d" % (i + 1), "Mono", 4.2, 0.5, "c", th["body"], 0.5)
    ring(c, CX, cy, r, th["accent"], 0.5, 0.6)
    ring(c, CX, cy, hub, "#FFFFFF", 0.9, 1.0)
    ring(c, CX, cy, hub, th["accent"], 0.3, 0.3)
    dial(c, CX, cy, r + 18, th["accent"], th["body"], 360, 10)
    t = math.radians(27)
    c.setStrokeColor(C(th["heading"], 0.8))
    c.setLineWidth(0.6)
    c.line(CX + (r + 33) * math.cos(t), cy + (r + 33) * math.sin(t),
           CX + (r + 47) * math.cos(t), cy + (r + 47) * math.sin(t))
    ring(c, CX + (r + 52) * math.cos(t), cy + (r + 52) * math.sin(t), 2.1,
         th["heading"], 0.8, 0.5)
    tx(c, CX + (r + 68) * math.cos(t), cy + (r + 68) * math.sin(t) + 4,
       "027", "Mono", 4.6, 1.0, "c", th["heading"], 0.7)
    c.setFillColor(C(th["heading"], 0.95))
    c.circle(CX, cy, 2.2, stroke=0, fill=1)

    tx(c, CX, 772, "DIVIDED LIGHT", "Display", 42, 14.5, "c", th["heading"])
    c.setStrokeColor(C(th["accent"], 0.5))
    c.setLineWidth(0.4)
    c.line(CX - 150, 752, CX + 150, 752)
    tx(c, CX, 732, "SIX ATMOSPHERES FOR A TURNING FIELD", "Label", 7.4, 3.7,
       "c", th["body"], 0.9)
    iy = 238.0
    c.setStrokeColor(C(th["accent"], 0.35))
    c.setLineWidth(0.35)
    c.line(CX - 172, iy + 20, CX + 172, iy + 20)
    for i, (key, name, sub, cap, roman, code) in enumerate(PLATES):
        yy = iy - i * 17.0
        c.setFillColor(C(T[key]["accent"], 0.95))
        c.circle(CX - 166, yy + 2.2, 3.0, stroke=0, fill=1)
        tx(c, CX - 152, yy, roman, "Mono", 5.0, 1.0, "l", th["body"], 0.55)
        tx(c, CX - 126, yy, name, "Label", 7.4, 2.3, "l", th["heading"], 0.9)
        tx(c, CX + 172, yy, T[key]["accent"].replace("#", ""), "Mono", 4.8, 0.9,
           "r", th["body"], 0.55)
    c.line(CX - 172, iy - 5 * 17.0 - 10, CX + 172, iy - 5 * 17.0 - 10)
    tx(c, CX, 120, "The division is visible. The weighting is not.", "Label",
       7.6, 1.2, "c", th["body"], 0.95)
    chrome(c, "PLATE I", "360\u00b0 / n 12", "THE MASTER DIVISION",
           th["accent"], th["body"])
    c.showPage()


def theme_plate(c, key, name, sub, cap, roman, code, idx):
    th = T[key]
    vband(c, 0, 0, W, H, th["background"], th["backgroundDeep"], 440, 1.15)
    FIGURES[key](c, th)
    plate_type(c, name, sub, cap, th["body"], th["stageBorder"], th["heading"])
    readings(c, th, th["body"])
    register(c, th, FORMS[key], th["body"], th["stageBorder"])
    chrome(c, "PLATE %s" % roman, "%s\u00b0 / n 18" % code,
           "ATMOSPHERE %02d OF 06" % idx, th["stageBorder"], th["body"])
    c.showPage()


c = rl_canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle("Divided Light \u2014 Six Atmospheres for a Turning Field")
frontispiece(c)
for i, (key, name, sub, cap, roman, code) in enumerate(PLATES):
    theme_plate(c, key, name, sub, cap, roman, code, i + 1)
c.save()
print("ok", OUT)
