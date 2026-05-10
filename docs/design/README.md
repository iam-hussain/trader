# Design Canvas

Static HTML reference of the full Trader UI — the source of truth for visual
language, spacing, color, type, and component patterns. Everything in
`apps/web/` is implemented to match these mocks.

## Open it

Serve this folder over any static server, then open `index.html`:

```bash
cd docs/design
python3 -m http.server 5173
# open http://localhost:5173/
```

`index.html` is a React-Babel design canvas that loads each screen as an
iframe inside a draggable artboard layout (the source canvas tool).

## Files

| File | Screen |
| --- | --- |
| `dashboard.html` | 01 · Dashboard / Today |
| `brief.html` | 02 · Brief / Report |
| `orders.html` | 03 · Order Staging |
| `stock-detail.html` | 04 · Stock Detail |
| `watchlist.html` | 05 · Watchlist |
| `forecast.html` | 06 · Forecast |
| `backtest.html` | 07 · Backtest |
| `journal.html` | 08 · Journal |
| `settings.html` | 09 · Settings |
| `components.html` | Components catalog |
| `shared.css` | Design tokens + utility classes (mirrored into `apps/web/app/globals.css`) |
| `shared.js` | Sidebar, topbar, theme toggle, sparkline helpers |
| `design-canvas.jsx` | The iframe canvas tool |

## Design language (one-page summary)

- **Font**: Geist (sans) + Geist Mono (numerics, with `tabular-nums`,
  `tnum`, `zero` features). Body 13px/1.45.
- **Colors**: oklch-based primary/success/danger/warning. Background scale
  `#0a0a0c → #1c1c21`. Border `#25252c`.
- **Layout**: 200px sidebar + 1fr content. Sticky 44px topbar.
- **Cards**: 10px radius, hairline border, `bg-elev-1`.
- **Buttons**: 28px default (sm 24, lg 36). Primary blue, danger red (kill
  switch only), ghost transparent.
- **Chips**: 20px high. Tones: pos/neg/warn/info/solid.
- **Numerics**: always `mono` + tabular-nums.
- **Live**: green pulsing dot. Live trading mode wraps a red gradient banner
  with a type-to-confirm modal at the entry point.
- **Tooltips**: dotted-underline `tip` class, hover reveals.
- **Skeleton**: `skel` class, shimmer animation.

These tokens are mirrored into `apps/web/app/globals.css` so the React app
renders identically to the static mocks.
