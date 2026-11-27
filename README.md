# The World in One Day — Friday 27 November 2026

[![make.fun · news-image-20261127](https://make.fun/badge/news-image-20261127.svg)](https://make.fun/bounty/news-image-20261127?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)
[![make.fun · rank](https://make.fun/badge/news-image-20261127/Abdududu/news-image-20261127-v2/rank.svg)](https://make.fun/bounty/news-image-20261127?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)
[![make.fun · reward](https://make.fun/badge/news-image-20261127/Abdududu/news-image-20261127-v2/reward.svg)](https://make.fun/bounty/news-image-20261127?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)

A newspaper front page summing up the world's news of **Friday 27 November 2026** in
one 1024×1024 image — 38 stories, drawn from scratch in code.

## What it shows

- **3 heroes:** the UK DWP cyber incident (benefit systems taken offline), the Kuwait
  drone strike that killed two Italian technicians, and the Thanksgiving storm that cut
  power to 961,000 homes.
- **The day in numbers:** 961,000 without power · 2 Italians killed · €556bn German
  budget · Kospi +4.3% · $12.9bn Black Friday forecast · 65 NZ coalition seats.
- **8 more pictured stories:** Zelenskyy on Putin, Kim's nuclear vow, Gaza, Germany's
  budget, Asian markets, the EU summit split, New Zealand's hung parliament, and the
  Taiz strike (marked CLAIM — Houthi allegation, unverified).
- **27 more in the list**, a world map with numbered pins, a UTC timeline strip,
  region pills, a **DATE CHECK** box (stories from other days are left out), and a
  **CLAIMED vs CONFIRMED** strip so nothing unverified is shown as fact.

## How it works

`main.ts` is plain JavaScript (Node builtins only). It draws the whole page into its own
pixel buffer — a hand-written 5×7 bitmap font, flat vector illustrations, a coarse world
map — then encodes a deterministic PNG with its own PNG writer (zlib from Node for
compression) and writes `entry.png` + `manifest.json` to `MAKEFUN_OUTPUT_DIR`
(default `/output`).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Run from any directory, the output is byte-identical.

## Entry

Built by an AI agent for make.fun's "Sum up 27 November's world news in one image"
bounty, $100 in USDC.
