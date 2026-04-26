# UI Redesign TODO

## Color Palette: Dark Navy + Teal + Warm Amber

- [x] 1. Update `apps/web/index.html` — Add Lucide icons CDN
- [x] 2. Rewrite `apps/web/src/styles.css` — Dark navy theme, glassmorphism, modern cards
- [x] 3. Update `apps/web/src/App.jsx` — Layout adjustments for new theme
- [x] 4. Update `apps/web/src/components/MetricsPanel.jsx` — Icons, better cards, severity colors
- [x] 5. Update `apps/web/src/components/ScenarioForm.jsx` — Modern form styling, severity badges
- [x] 6. Update `apps/web/src/components/ChatBox.jsx` — Message bubbles, avatars, modern styling
- [x] 7. Update `apps/web/src/components/Map.jsx` — Dark theme overlay, polished legend
- [x] 8. Update `apps/web/src/components/PlaybackBar.jsx` — Modern controls
- [x] 9. Update `apps/web/src/components/ReasoningCard.jsx` — Modern card styling
- [x] 10. Run web tests to verify

## Map.jsx Changes Applied

1. **Fixed syntax error** — Missing `if (baselineLine.length > 1 && playbackStep <= 1)` block was causing build failure
2. **Switched to dark map tiles** — Changed from CartoDB Voyager (light) to CartoDB Dark Matter (`dark_all`) to match the dark navy UI theme
3. **Legend already styled** — `.floating-legend`, `.floating-banner`, `.map-pin`, `.map-disruption` classes all defined in `styles.css` with glassmorphism and dark theme colors

## Notes

- All components already use the new CSS variables and class names from `styles.css`
- Lucide icons loaded via CDN in `index.html` with auto-initialization
- Web tests pass (4/4)

