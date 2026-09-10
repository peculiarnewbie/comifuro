# CF22 interactive floor map

Open `/map`. The original PDF's vector artwork supplies the floor plan; transparent SVG boxes provide hover, keyboard, and touch interaction. Search accepts circle names and booth codes (for example `Ichigowarano`, `AA-01`, or `a40a`). Selecting a listing highlights all of its shared booth halves. The day filter preserves separate Saturday and Sunday assignments.

The imported directory has **1,477 entries**, mapped to **2,612 physical circle booth halves/boxes**. All listed addresses resolve to geometry. Some boxes have no directory entry: these explicitly display “No circle listed in the PDF.” Food stalls, corporate booths, and facilities remain visible as landmarks; the circle directory supplies no names for those areas.

## Source and regeneration

- `public/maps/cf22/source.pdf`: the supplied two-page PDF.
- `public/maps/cf22/floor.svg`: page 1 as vectors, including outlined original text and symbols.
- `src/lib/cf22-map.generated.json`: source SHA-256, geometry, and page 2 directory.
- `../../scripts/import-cf22-map.py`: reproducible extraction, specific to this PDF's layout.

From the repository root:

```sh
python3 -m venv /tmp/cf22-import
/tmp/cf22-import/bin/pip install pymupdf==1.28.2
/tmp/cf22-import/bin/python scripts/import-cf22-map.py packages/www/public/maps/cf22/source.pdf
pnpm exec vp fmt packages/www/src/lib/cf22-map.generated.json
```

The importer finds the actual PDF rectangles and labels, maps `ab` entries to both halves, expands slash-separated shared addresses, and retains day assignments. Each hover area includes its share of the booth's central number cell. It rejects unmapped directory addresses and duplicate physical booth codes. Its coordinate bands are specific to CF22; a revised layout requires adjusting and visually checking the importer.

## Verification

```sh
bun test packages/www/src/lib/cf22-map.test.ts
pnpm typecheck
pnpm build
```

For browser checks, start `pnpm dev` in another terminal, then:

```sh
pnpm --filter www exec playwright install chromium
pnpm test:map
# Alternatively:
MAP_TEST_URL=http://localhost:5174/map pnpm test:map
```

The browser check covers hover names, shared booths, day filtering, missing entries, keyboard navigation, pan, wheel zoom, reset, mobile taps and pinch zoom. It also checks for browser runtime errors and mobile horizontal overflow.
