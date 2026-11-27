// news-image-20261127 v2 — "The World in One Day"
// Hand-written from zero. Plain JS, Node builtins only (fs, path, zlib).
// Draws a 1024x1024 newspaper front page summing up Friday 27 November 2026
// into MAKEFUN_OUTPUT_DIR (default /output) as entry.png + manifest.json.
// Deterministic: no clock, no random, no network, no CWD-relative reads.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const C = {
  paper: [250, 248, 243],
  ink: [18, 40, 75],
  navy: [11, 31, 58],
  navy2: [31, 78, 121],
  red: [176, 30, 40],
  gold: [212, 175, 55],
  goldLt: [232, 205, 110],
  grey: [90, 96, 104],
  greyLt: [216, 220, 227],
  white: [255, 255, 255],
  green: [14, 124, 107],
  amber: [199, 125, 10],
  purple: [106, 63, 160],
  steel: [74, 123, 166],
  teal: [14, 124, 107],
  midEast: [176, 30, 40],
  europe: [31, 78, 121],
  africa: [199, 125, 10],
  asia: [14, 124, 107],
  americas: [106, 63, 160],
  oceania: [74, 123, 166],
  world: [85, 85, 85],
  sky: [214, 232, 245],
  land: [201, 214, 168],
  sand: [232, 213, 163],
  storm: [58, 74, 96],
  cardBg: [255, 255, 255],
};

// ---------------------------------------------------------------- pixel buffer
const buf = new Uint8Array(W * H * 3);
function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      i += 3;
    }
  }
}
function rectOutline(x, y, w, h, c, t = 1) {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}
function hline(x, y, len, c) { fillRect(x, y, len, 1, c); }
function vline(x, y, len, c) { fillRect(x, y, 1, len, c); }
// Bresenham line
function line(x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function fillCircle(cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}
function circleOutline(cx, cy, r, c) {
  let x = r, y = 0, e = 1 - r;
  while (x >= y) {
    setPx(cx + x, cy + y, c); setPx(cx + y, cy + x, c);
    setPx(cx - y, cy + x, c); setPx(cx - x, cy + y, c);
    setPx(cx - x, cy - y, c); setPx(cx - y, cy - x, c);
    setPx(cx + y, cy - x, c); setPx(cx + x, cy - y, c);
    y++;
    if (e <= 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
  }
}
// filled triangle via scanline interpolation
function fillTriangle(x0, y0, x1, y1, x2, y2, c) {
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const a = Math.max(0, Math.floor(Math.min(...xs)));
      const b = Math.min(W - 1, Math.ceil(Math.max(...xs)));
      fillRect(a, y, b - a + 1, 1, c);
    }
  }
}
// filled ellipse
function fillEllipse(cx, cy, rx, ry, c) {
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(t));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}

// ---------------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows, 5 bits each (bit 4 = leftmost column).
const FONT = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  g: [0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x11, 0x11],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "@": [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "*": [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "\u00a3": [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x1f],
  "\u20ac": [0x0e, 0x11, 0x10, 0x1e, 0x10, 0x11, 0x0e],
  "\u00b7": [0, 0, 0, 0x0c, 0x0c, 0, 0],
  "\u00b0": [0x0e, 0x11, 0x11, 0x0e, 0, 0, 0],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  _: [0, 0, 0, 0, 0, 0, 0x1f],
  "~": [0, 0, 0, 0x0a, 0x15, 0, 0],
};
const FALLBACK = FONT["?"];

function textWidth(text, scale) {
  return text.length === 0 ? 0 : text.length * 6 * scale - scale;
}
// Draw one glyph at (x,y), top-left, at scale. bold draws a second pass 1px right.
function drawChar(x, y, ch, scale, color, bold = false) {
  const g = FONT[ch] || FALLBACK;
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let ccol = 0; ccol < 5; ccol++) {
      if (row & (1 << (4 - ccol))) {
        fillRect(x + ccol * scale, y + r * scale, scale, scale, color);
        if (bold) fillRect(x + ccol * scale + 1, y + r * scale, scale, scale, color);
      }
    }
  }
}
// align: 'l' | 'c' | 'r'. Returns width drawn.
function drawText(x, y, text, scale, color, opts = {}) {
  const { align = "l", bold = false } = opts;
  const w = textWidth(text, scale) + (bold ? 1 : 0);
  let sx = x;
  if (align === "c") sx = x - Math.floor(w / 2);
  if (align === "r") sx = x - w;
  for (let i = 0; i < text.length; i++) {
    drawChar(sx + i * 6 * scale, y, text[i], scale, color, bold);
  }
  return w;
}
// Fail loudly at build time if a line would overflow its box.
function assertFits(text, scale, maxW, where) {
  const w = textWidth(text, scale);
  if (w > maxW) {
    throw new Error(`OVERFLOW at ${where}: "${text}" is ${w}px wide, box is ${maxW}px`);
  }
}

// ---------------------------------------------------------------- illustrations
// Hero 1 — DWP cyber incident: laptop with a warning triangle, on navy.
function drawHeroDWP(x, y, w, h) {
  fillRect(x, y, w, h, [16, 42, 78]);
  fillRect(x, y + h - 18, w, 18, [10, 26, 50]);
  // laptop screen
  const sx = x + 58, sy = y + 10, sw = w - 116, sh = 56;
  fillRect(sx, sy, sw, sh, [214, 232, 245]);
  rectOutline(sx, sy, sw, sh, [90, 96, 104], 2);
  // warning triangle
  const tx = sx + Math.floor(sw / 2) + 20, ty = sy + 8;
  fillTriangle(tx - 18, ty + 36, tx + 18, ty + 36, tx, ty, [199, 125, 10]);
  rectOutline(tx - 18, ty + 36, 36, 1, [199, 125, 10]);
  fillRect(tx - 1, ty + 13, 3, 15, C.white);
  fillRect(tx - 1, ty + 31, 3, 3, C.white);
  // fake UI text lines on the screen, left of the warning
  fillRect(sx + 10, sy + 12, 44, 4, [150, 160, 175]);
  fillRect(sx + 10, sy + 22, 56, 4, [150, 160, 175]);
  fillRect(sx + 10, sy + 32, 38, 4, [150, 160, 175]);
  fillRect(sx + 10, sy + 42, 50, 4, [150, 160, 175]);
  // keyboard base
  fillRect(sx - 14, sy + sh + 2, sw + 28, 8, [90, 96, 104]);
  fillRect(sx - 14, sy + sh + 10, sw + 28, 2, [60, 66, 74]);
  // lock icon + offline label on the bottom bar
  const lx = x + w - 40, ly = y + h - 16;
  fillRect(lx, ly + 5, 14, 10, C.gold);
  fillRect(lx + 3, ly, 8, 6, C.gold);
  fillRect(lx + 5, ly + 2, 4, 4, [16, 42, 78]);
  drawText(x + 12, y + h - 14, "SYSTEMS OFFLINE", 1, C.gold, { bold: true });
}
// Hero 2 — Kuwait drone strike: desert, radar dish, explosion star.
function drawHeroKuwait(x, y, w, h) {
  fillRect(x, y, w, h, [242, 227, 192]);
  fillRect(x, y + h - 22, w, 22, C.sand);
  fillRect(x, y + h - 22, w, 2, [199, 170, 110]);
  // sun
  fillCircle(x + w - 34, y + 18, 12, [232, 180, 80]);
  // radar mast + dish
  const mx = x + 62, my = y + h - 22;
  vline(mx, y + 26, my - (y + 26), [90, 80, 60]);
  line(mx - 8, y + 30, mx + 8, y + 30, [90, 80, 60]);
  fillEllipse(mx, y + 22, 26, 10, [176, 30, 40]);
  fillEllipse(mx, y + 20, 26, 8, [214, 232, 245]);
  line(mx, y + 22, mx - 30, y + 4, [176, 30, 40]);
  // explosion star, right side
  const ex = x + w - 108, ey = y + 44;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const a2 = a + Math.PI / 8;
    line(ex, ey, Math.round(ex + 26 * Math.cos(a)), Math.round(ey + 26 * Math.sin(a)), [240, 120, 20]);
    line(ex, ey, Math.round(ex + 12 * Math.cos(a2)), Math.round(ey + 12 * Math.sin(a2)), [240, 120, 20]);
  }
  fillCircle(ex, ey, 9, [240, 120, 20]);
  fillCircle(ex, ey, 4, [250, 220, 90]);
  // ground rocks
  fillCircle(x + 150, y + h - 22, 4, [170, 140, 95]);
  fillCircle(x + 250, y + h - 22, 6, [170, 140, 95]);
}
// Hero 3 — Thanksgiving storm: dark sky, rain, bent tree, house, power line.
function drawHeroStorm(x, y, w, h) {
  fillRect(x, y, w, h, C.storm);
  fillRect(x, y + h - 20, w, 20, [40, 52, 70]);
  // clouds
  fillEllipse(x + 60, y + 16, 34, 10, [90, 104, 126]);
  fillEllipse(x + 230, y + 10, 40, 11, [90, 104, 126]);
  // lightning
  fillTriangle(x + 250, y + 8, x + 262, y + 8, x + 252, y + 30, [250, 220, 90]);
  fillTriangle(x + 258, y + 28, x + 246, y + 28, x + 256, y + 48, [250, 220, 90]);
  // rain
  for (let i = 0; i < 14; i++) {
    const rx = x + 12 + i * 22, ry = y + 30 + (i % 3) * 8;
    line(rx, ry, rx - 4, ry + 12, [150, 175, 205]);
  }
  // house
  const hx = x + 40, hy = y + h - 58;
  fillRect(hx, hy + 14, 56, 24, [220, 205, 175]);
  fillTriangle(hx - 6, hy + 14, hx + 62, hy + 14, hx + 28, hy - 2, [140, 40, 45]);
  fillRect(hx + 22, hy + 24, 12, 14, [60, 50, 40]);
  fillRect(hx + 8, hy + 20, 10, 8, [250, 220, 90]);
  // bent tree
  line(x + 130, y + h - 20, x + 150, y + h - 62, [70, 60, 45]);
  fillCircle(x + 156, y + h - 66, 12, [46, 110, 70]);
  fillCircle(x + 146, y + h - 58, 9, [46, 110, 70]);
  // power pole + sagging line
  vline(x + w - 40, y + 24, y + h - 44, [30, 38, 52]);
  line(x + w - 52, y + 28, x + w - 28, y + 28, [30, 38, 52]);
  line(x + w - 40, y + 28, x + w - 96, y + 40, [30, 38, 52]);
  line(x + w - 40, y + 28, x + w - 8, y + 36, [30, 38, 52]);
}

// Small card icons (area x,y,w,h). Each is a flat mini-scene on a pale tint.
function drawIconKyiv(x, y, w, h) {
  fillRect(x, y, w, h, [214, 226, 242]);
  // Ukrainian flag bars
  fillRect(x + 18, y + 8, 60, 12, [0, 91, 187]);
  fillRect(x + 18, y + 20, 60, 12, [255, 213, 0]);
  // microphone
  fillCircle(x + w - 34, y + 26, 9, [18, 40, 75]);
  fillRect(x + w - 36, y + 34, 4, 10, [18, 40, 75]);
  fillRect(x + w - 42, y + 44, 16, 3, [18, 40, 75]);
  // sound arcs
  circleOutline(x + w - 34, y + 26, 15, [176, 30, 40]);
  circleOutline(x + w - 34, y + 26, 21, [176, 30, 40]);
}
function drawIconKim(x, y, w, h) {
  fillRect(x, y, w, h, [232, 222, 214]);
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  circleOutline(cx, cy, 20, [140, 40, 45]);
  line(cx - 17, cy - 10, cx + 17, cy + 10, [140, 40, 45]);
  line(cx - 17, cy + 10, cx + 17, cy - 10, [140, 40, 45]);
  fillCircle(cx, cy, 6, [140, 40, 45]);
}
function drawIconGaza(x, y, w, h) {
  fillRect(x, y, w, h, [242, 224, 200]);
  fillCircle(x + w - 30, y + 12, 8, [240, 150, 60]); // dawn sun
  // skyline
  fillRect(x + 10, y + h - 26, 22, 26, [90, 80, 70]);
  fillRect(x + 36, y + h - 36, 18, 36, [70, 62, 54]);
  fillRect(x + 58, y + h - 20, 26, 20, [90, 80, 70]);
  fillRect(x + 88, y + h - 32, 16, 32, [70, 62, 54]);
  // smoke plume
  fillCircle(x + 45, y + 12, 7, [120, 115, 110]);
  fillCircle(x + 50, y + 6, 5, [140, 135, 130]);
}
function drawIconBerlin(x, y, w, h) {
  fillRect(x, y, w, h, [222, 228, 236]);
  const bx = x + 30, by = y + h - 12;
  // Reichstag-like block + dome
  fillRect(bx, by - 26, 110, 26, [150, 158, 168]);
  fillCircle(bx + 55, by - 26, 16, [90, 104, 126]);
  fillRect(bx + 52, by - 46, 6, 6, [90, 104, 126]);
  for (let i = 0; i < 5; i++) fillRect(bx + 8 + i * 20, by - 22, 6, 22, [90, 104, 126]);
  fillRect(bx - 4, by - 30, 118, 4, [90, 104, 126]);
}
function drawIconKospi(x, y, w, h) {
  fillRect(x, y, w, h, [210, 235, 225]);
  // rising bars
  const base = y + h - 10;
  fillRect(x + 20, base - 14, 22, 14, [14, 124, 107]);
  fillRect(x + 52, base - 24, 22, 24, [14, 124, 107]);
  fillRect(x + 84, base - 36, 22, 36, [14, 124, 107]);
  fillRect(x + 116, base - 48, 22, 48, [14, 124, 107]);
  // arrow
  line(x + 20, base - 14, x + 150, base - 56, [176, 30, 40]);
  fillTriangle(x + 150, base - 56, x + 138, base - 56, x + 150, base - 44, [176, 30, 40]);
  fillRect(x + 160, y + 8, 52, 14, [176, 30, 40]);
  drawText(x + 164, y + 10, "+4.3%", 1, C.white, { bold: true });
}
function drawIconEU(x, y, w, h) {
  fillRect(x, y, w, h, [214, 226, 242]);
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  fillCircle(cx, cy, 22, [0, 51, 153]);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI * 2) / 12 - Math.PI / 2;
    fillCircle(Math.round(cx + 15 * Math.cos(a)), Math.round(cy + 15 * Math.sin(a)), 2, C.gold);
  }
  // crack in the circle (split)
  line(cx, cy - 22, cx + 4, cy + 22, [214, 226, 242]);
}
function drawIconNZ(x, y, w, h) {
  fillRect(x, y, w, h, [222, 236, 222]);
  // ballot box
  fillRect(x + 30, y + 18, 70, 30, [30, 90, 60]);
  fillRect(x + 30, y + 14, 70, 4, [18, 40, 75]);
  fillRect(x + 58, y + 8, 14, 8, C.white);
  rectOutline(x + 58, y + 8, 14, 8, [18, 40, 75]);
  // tick
  line(x + 120, y + 16, x + 132, y + 30, [176, 30, 40]);
  line(x + 132, y + 30, x + 152, y + 6, [176, 30, 40]);
  // seat counters
  fillRect(x + 30, y + h - 12, 40, 6, [30, 90, 60]);
  fillRect(x + 74, y + h - 12, 40, 6, [176, 30, 40]);
}
function drawIconTaiz(x, y, w, h) {
  fillRect(x, y, w, h, [242, 224, 200]);
  // building
  fillRect(x + 20, y + h - 26, 60, 26, [120, 105, 90]);
  fillRect(x + 90, y + h - 18, 40, 18, [120, 105, 90]);
  // explosion above
  const ex = x + 50, ey = y + 14;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    line(ex, ey, Math.round(ex + 14 * Math.cos(a)), Math.round(ey + 14 * Math.sin(a)), [240, 120, 20]);
  }
  fillCircle(ex, ey, 5, [240, 120, 20]);
  // warning flag
  fillRect(x + w - 34, y + 10, 2, 22, [90, 80, 60]);
  fillTriangle(x + w - 32, y + 10, x + w - 12, y + 15, x + w - 32, y + 20, [176, 30, 40]);
}

// ---------------------------------------------------------------- world map
// Coarse continents as ellipse blobs on a pale ocean, with numbered pins.
const LAND_BLOBS = [
  // North America
  [52, 16, 42, 14], [92, 30, 30, 12], [40, 34, 18, 10],
  // South America
  [96, 66, 16, 20], [104, 92, 10, 12],
  // Europe
  [140, 18, 14, 8], [152, 24, 10, 6],
  // Africa
  [142, 46, 16, 16], [150, 66, 12, 10],
  // Asia
  [176, 16, 34, 12], [200, 30, 26, 12], [228, 40, 12, 10],
  // Australia
  [238, 82, 16, 8],
];
const MAP_PINS = [
  // [label, lon, lat, nudgeX, nudgeY] — nudges keep crowded labels apart
  ["1", -0.1, 51.5, -12, -10],  // London (DWP)
  ["2", 48, 29.4, 10, -6],      // Kuwait
  ["3", -74, 40.7, -4, 2],      // New York
  ["4", 30.5, 50.4, 12, -8],    // Kyiv
  ["5", 125.8, 39, -14, -10],   // Pyongyang
  ["6", 34.5, 31.5, -12, 8],    // Gaza
  ["7", 13.4, 52.5, 2, -14],    // Berlin
  ["8", 127, 37.6, 10, 6],      // Seoul
  ["9", 4.4, 50.8, -16, 4],     // Brussels
  ["10", 174.8, -41.3, -14, 0], // Wellington
  ["11", 44, 13.6, 10, 8],      // Taiz
];
function drawWorldMap(x, y, w, h) {
  fillRect(x, y, w, h, C.sky);
  rectOutline(x, y, w, h, C.greyLt, 1);
  for (const [bx, by, brx, bry] of LAND_BLOBS) {
    const px = x + Math.round((bx / 280) * w);
    const py = y + Math.round((by / 120) * h);
    fillEllipse(px, py, Math.round((brx / 280) * w), Math.round((bry / 120) * h), C.land);
  }
  for (const [label, lon, lat, nx, ny] of MAP_PINS) {
    const px = x + Math.round(((lon + 170) / 360) * w) + nx;
    const py = y + Math.round(((75 - lat) / 130) * h) + ny;
    fillCircle(px, py, 4, C.red);
    drawText(px + 6, py - 3, label, 1, C.red, { bold: true });
  }
}

// ---------------------------------------------------------------- data
const HEROES = [
  {
    tag: "LONDON \u00b7 CYBER", draw: drawHeroDWP,
    head: ["UK BENEFITS GO", "OFFLINE IN", "CYBER ATTACK"],
    sum: ["Universal Credit, PIP,", "State Pension offline."],
    src: "GOV.UK \u00b7 Reuters", pill: "OFFICIAL",
  },
  {
    tag: "KUWAIT CITY \u00b7 DRONE STRIKE", draw: drawHeroKuwait,
    head: ["DRONE STRIKE", "KILLS TWO", "ITALIANS"],
    sum: ["Kuwait and Italy blame", "Iran; Tehran denies it."],
    src: "Reuters \u00b7 CNN \u00b7 WSJ", pill: "REPORTED",
  },
  {
    tag: "NEW YORK \u00b7 STORM", draw: drawHeroStorm,
    head: ["STORM CUTS POWER", "TO 961,000", "AT ITS PEAK"],
    sum: ["600,000 still out Fri", "morning; 454 flights cut."],
    src: "Reuters \u00b7 PowerOutage.us", pill: "REPORTED",
  },
];
const CARDS = [
  { tag: "KYIV \u00b7 WAR", draw: drawIconKyiv,
    head: ["Zelenskyy: Putin", "is no friend"],
    sum: ["'He's an aggressor", "a killer,' he says"],
    src: "BBC \u00b7 Reuters", pill: "REPORTED" },
  { tag: "PYONGYANG \u00b7 DEFENCE", draw: drawIconKim,
    head: ["Kim vows bigger", "nuclear arsenal"],
    sum: ["KCNA: inspected", "two nuclear plants"],
    src: "AP \u00b7 KCNA", pill: "REPORTED" },
  { tag: "GAZA CITY \u00b7 STRIKES", draw: drawIconGaza,
    head: ["Hamas chief's last", "son survives"],
    sum: ["Izzeldeen al-Hayya", "survives airstrike"],
    src: "Reuters", pill: "REPORTED" },
  { tag: "BERLIN \u00b7 BUDGET", draw: drawIconBerlin,
    head: ["Germany passes", "\u20ac556bn budget"],
    sum: ["Bundestag 317-260;", "new debt \u20ac210bn"],
    src: "Reuters", pill: "OFFICIAL" },
  { tag: "SEOUL \u00b7 MARKETS", draw: drawIconKospi,
    head: ["Asian stocks surge", "Kospi up 4.3%"],
    sum: ["Kospi 4,915.68;", "Nikkei up 2.1%"],
    src: "Yonhap", pill: "REPORTED" },
  { tag: "BRUSSELS \u00b7 SUMMIT", draw: drawIconEU,
    head: ["EU split over", "\u20ac45bn loan"],
    sum: ["24 of 27 back it;", "no deal on budget"],
    src: "Reuters", pill: "REPORTED" },
  { tag: "WELLINGTON \u00b7 ELECTION", draw: drawIconNZ,
    head: ["NZ final count:", "hung parliament"],
    sum: ["Coalition 65 seats", "one seat short"],
    src: "Reuters", pill: "OFFICIAL" },
  { tag: "TAIZ \u00b7 WAR", draw: drawIconTaiz,
    head: ["Houthis say Saudi", "strike kills 11"],
    sum: ["Al-Turbah strike", "unverified claim"],
    src: "AP", pill: "CLAIM" },
];
const LIST_ITEMS = [
  "12. HONG KONG Ferry hits dock, 22 hurt",
  "13. LONDON Tube strike begins, 8 days",
  "14. LONDON Net migration 77,000, low since '97",
  "15. PARIS Depardieu to stand trial over 2018 rape claim",
  "16. ROME UN: hunger to worsen in 16 hotspots",
  "17. BRISBANE Overton 5-12 as England rout Australia",
  "18. WORLD Amazon workers strike in 20+ countries",
  "19. WASHINGTON Musk: every US child gets SpaceX share",
  "20. BEIJING China tests Taiwan landing tactics",
  "21. NIAMEY 13 soldiers killed in Niger attack",
  "22. MUSCAT Iran says two oil tankers hit by mines",
  "23. ANKARA Erdogan ratifies Mecca defence pact",
  "24. SEOUL S. Korea repatriates six North Koreans",
  "25. MANILA Mount Mayon erupts, ash 3,000m",
  "26. CAIRO Egypt detains driver after tanker fire",
  "27. BUENOS AIRES Argentina bars central bank printing",
  "28. DHAKA Hasina sets 16 Dec return",
  "29. PARIS AFP platform offline after cyberattack",
  "30. WEST BANK Israel demolishes ~50 structures",
  "31. KYIV N. Korea halts arms aid, Ukraine intel says",
  "32. WASHINGTON US tariff case rejected by 14 economies",
  "33. LONDON Britain contacts 100,000 veterans",
  "34. LONDON Britain hardens aircraft bases",
  "35. SAN JOSE Court blocks Albanese deportation",
  "36. NAIROBI Ex-governor Obado jailed 25 years",
  "37. WASHINGTON Adobe: Black Friday online sales $12.9bn",
  "38. NEW YORK Chess: Gukesh, Sindarov draw Game 3",
];
const NUMBERS = [
  ["961,000", "WITHOUT POWER AT PEAK"],
  ["2", "ITALIANS KILLED IN KUWAIT"],
  ["\u20ac556bn", "GERMAN BUDGET PASSED"],
  ["+4.3%", "KOSPI CLOSE"],
  ["$12.9bn", "BLACK FRIDAY FORECAST"],
  ["65", "NZ COALITION SEATS"],
];
const PILLS = [
  ["EUROPE 10", C.europe], ["MIDDLE EAST 6", C.midEast], ["AFRICA 3", C.africa],
  ["ASIA 8", C.asia], ["AMERICAS 5", C.americas], ["OCEANIA 2", C.oceania],
  ["WORLD 4", C.world],
];
const PILL_COLOR = { REPORTED: C.navy2, OFFICIAL: C.green, CLAIM: C.red };

// ---------------------------------------------------------------- composition
function compose() {
  fillRect(0, 0, W, H, C.paper);

  // header bar
  fillRect(0, 0, W, 30, C.navy);
  drawText(16, 5, "THE WORLD IN ONE DAY", 3, C.gold);
  drawText(1008, 8, "38 STORIES \u00b7 7 REGIONS", 2, C.gold, { align: "r" });

  // title + subhead
  drawText(512, 36, "Friday 27 November 2026", 6, C.ink, { align: "c" });
  drawText(512, 84, "Cyber attack knocks UK benefits offline - Kuwait drone kills two Italians", 2, C.red, { align: "c" });
  drawText(512, 100, "Thanksgiving storm cuts power to 961,000 - Germany passes \u20ac556bn budget", 2, C.red, { align: "c" });

  // region pills
  let pillTotal = 0;
  for (const [t] of PILLS) pillTotal += textWidth(t, 2) + 16;
  pillTotal += (PILLS.length - 1) * 8;
  let px = Math.floor((W - pillTotal) / 2);
  for (const [t, col] of PILLS) {
    const w = textWidth(t, 2) + 16;
    fillRect(px, 120, w, 22, col);
    drawText(px + 8, 125, t, 2, C.white, { bold: true });
    px += w + 8;
  }

  // timeline strip
  fillRect(16, 148, 992, 22, C.navy);
  drawText(512, 154, "FIRST REPORTED, UTC  00:16 EU summit ends \u00b7 01:00 NZ count \u00b7 01:21 HK ferry \u00b7 08:11 DWP offline \u00b7 13:54 Bundestag passes", 1, C.goldLt, { align: "c", bold: true });

  // hero row: 3 cards, 320 wide
  HEROES.forEach((hero, i) => {
    const x = 16 + i * 336, y = 176, w = 320, h = 224;
    fillRect(x, y, w, h, C.cardBg);
    rectOutline(x, y, w, h, C.greyLt, 1);
    hero.draw(x + 1, y + 1, w - 2, 88);
    drawText(x + 10, y + 94, hero.tag, 1, C.red, { bold: true });
    hero.head.forEach((ln, k) => {
      assertFits(ln, 3, w - 20, `hero ${i} headline`);
      drawText(x + 10, y + 108 + k * 23, ln, 3, C.ink);
    });
    hero.sum.forEach((ln, k) => {
      assertFits(ln, 2, w - 20, `hero ${i} summary`);
      drawText(x + 10, y + 180 + k * 15, ln, 2, C.ink);
    });
    drawText(x + 10, y + 212, hero.src, 1, C.grey);
    const pw = textWidth(hero.pill, 1) + 8;
    fillRect(x + w - 10 - pw, y + 210, pw, 11, PILL_COLOR[hero.pill]);
    drawText(x + w - 6 - pw, y + 212, hero.pill, 1, C.white, { bold: true });
  });

  // numbers band
  fillRect(16, 408, 992, 44, C.navy);
  NUMBERS.forEach(([num, label], i) => {
    const cx = 16 + i * 165 + 82;
    assertFits(num, 3, 160, `numbers ${num}`);
    assertFits(label, 1, 160, `numbers ${label}`);
    drawText(cx, 414, num, 3, C.gold, { align: "c" });
    drawText(cx, 438, label, 1, C.white, { align: "c", bold: true });
  });

  // card rows: 4 per row, 240 wide
  CARDS.forEach((card, i) => {
    const row = Math.floor(i / 4), col = i % 4;
    const x = 16 + col * 250, y = 460 + row * 160, w = 240, h = 152;
    fillRect(x, y, w, h, C.cardBg);
    rectOutline(x, y, w, h, C.greyLt, 1);
    card.draw(x + 1, y + 1, w - 2, 58);
    drawText(x + 10, y + 62, card.tag, 1, C.red, { bold: true });
    card.head.forEach((ln, k) => {
      assertFits(ln, 2, w - 20, `card ${i} headline`);
      drawText(x + 10, y + 74 + k * 15, ln, 2, C.ink);
    });
    card.sum.forEach((ln, k) => {
      assertFits(ln, 2, w - 20, `card ${i} summary`);
      drawText(x + 10, y + 107 + k * 15, ln, 2, C.ink);
    });
    drawText(x + 10, y + 140, card.src, 1, C.grey);
    const pw = textWidth(card.pill, 1) + 8;
    fillRect(x + w - 10 - pw, y + 138, pw, 11, PILL_COLOR[card.pill]);
    drawText(x + w - 6 - pw, y + 140, card.pill, 1, C.white, { bold: true });
  });

  // bottom: also-list (left) + map + date check (right)
  drawText(16, 784, "ALSO ON FRIDAY 27 NOVEMBER", 2, C.ink, { bold: true });
  hline(16, 800, 688, C.greyLt);
  LIST_ITEMS.forEach((item, i) => {
    const col = Math.floor(i / 13), row = i % 13;
    const x = 16 + col * 352, y = 806 + row * 10;
    assertFits(item, 1, 336, `list ${i}`);
    drawText(x, y, item, 1, C.ink, { bold: true });
  });
  drawText(716, 784, "WHERE IT HAPPENED", 2, C.ink, { bold: true });
  drawWorldMap(716, 802, 292, 92);
  // date check box
  rectOutline(716, 898, 292, 58, C.red, 2);
  drawText(726, 902, "DATE CHECK", 1, C.red, { bold: true });
  const dc = [
    "Every story happened or was",
    "first reported on Fri 27 Nov 2026.",
    "Left out: Macy's parade (26 Nov),",
    "Bangkok blast (26 Nov), Cairo fire",
    "(25 Nov), Ebola 12,021, F-16 sale.",
  ];
  dc.forEach((ln, k) => drawText(726, 913 + k * 8, ln, 1, C.ink));

  // claimed vs confirmed strip
  drawText(16, 962, "CLAIMED", 1, C.red, { bold: true });
  drawText(16, 972, "Iran behind Kuwait attack - allies claim it, Tehran denies", 1, C.ink);
  drawText(16, 981, "Houthis blame Saudi Arabia for Taiz strike - unverified", 1, C.ink);
  vline(512, 962, 28, C.greyLt);
  drawText(528, 962, "CONFIRMED", 1, C.green, { bold: true });
  drawText(528, 972, "2 Italians killed in Kuwait; 961,000 without power at peak", 1, C.ink);
  drawText(528, 981, "Kospi closed 4,915.68, up 4.3%; Bundestag passed 317-260", 1, C.ink);

  // footer
  drawText(512, 993, "Sources: Reuters \u00b7 AP \u00b7 BBC \u00b7 CNN \u00b7 WSJ \u00b7 The Times \u00b7 GOV.UK \u00b7 ONS \u00b7 RTHK \u00b7 Yonhap \u00b7 Capital FM \u00b7 AFP", 1, C.grey, { align: "c" });
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
void __dirname;

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
compose();
const png = encodePNG();
if (png.length > 1048576) {
  throw new Error(`entry.png is ${png.length} bytes, over the 1 MiB cap`);
}
fs.writeFileSync(path.join(outDir, "entry.png"), png);
const manifest = {
  format: "png",
  width: W,
  height: H,
  date: "2026-11-27",
  stories: 38,
  title: "The World in One Day \u2014 Friday 27 November 2026",
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${path.join(outDir, "entry.png")} (${png.length} bytes)`);
console.log(`wrote ${path.join(outDir, "manifest.json")}`);
