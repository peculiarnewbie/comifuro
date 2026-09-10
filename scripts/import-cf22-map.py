"""Rebuild CF22 assets: python -m pip install pymupdf==1.28.2
Usage: python scripts/import-cf22-map.py /path/to/floormap_circle_list_CF22.pdf
The PDF's vector geometry and directory are the source of truth; no network calls.
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

import pymupdf

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
doc = pymupdf.open(source)
page = doc[0]
words = sorted({tuple(w[:5]) for w in page.get_text('words')})
rects = {tuple(item[1]) for d in page.get_drawings() for item in d['items'] if item[0] == 're'}

def center(box):
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)

def distance(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

labels = {w[4].upper(): center(w) for w in words if re.fullmatch(r'[B-S]|A[b-g]', w[4]) and 400 < w[1] < 420}
# AG starts one island below the other double-letter columns.
labels['AG'] = (1046, 500)

def section(word):
    x, y = center(word)
    if 380 < x < 1000 and 410 < y < 795:
        return min((s for s in labels if len(s) == 1), key=lambda s: abs(labels[s][0] - x))
    if 380 < x < 1020 and 817 < y < 830:
        return 'A'
    if 470 < x < 955 and 379 < y < 391:
        return 'Z'
    if 1030 < x < 1260 and 420 < y < 780:
        return min((s for s in labels if len(s) == 2), key=lambda s: abs(labels[s][0] - x))
    if 1155 < x < 1315 and (378 < y < 390 or 810 < y < 829):
        return 'AA'
    return None

numbers = [w for w in words if re.fullmatch(r'\d{1,2}', w[4]) and section(w)]
booths = {}
for word in words:
    suffix = word[4]
    area = section(word)
    if suffix not in ('a', 'b') or area is None:
        continue
    pos = center(word)
    candidates = [r for r in rects if 4.4 < r[2] - r[0] < 4.6 and 4.4 < r[3] - r[1] < 4.6 and r[0] <= pos[0] <= r[2] and r[1] <= pos[1] <= r[3]]
    assert len(candidates) == 1, (word, candidates)
    number = min((w for w in numbers if section(w) == area), key=lambda w: distance(center(w), pos))
    assert distance(center(number), pos) < 45, (word, number)
    code = f'{area}-{int(number[4]):02}{suffix}'
    assert code not in booths, code
    r = candidates[0]
    number_pos = center(number)
    number_rects = [n for n in rects if ((4.4 < n[2]-n[0] < 4.6 and 8.9 < n[3]-n[1] < 9.1) or (8.9 < n[2]-n[0] < 9.1 and 4.4 < n[3]-n[1] < 4.6)) and n[0] <= number_pos[0] <= n[2] and n[1] <= number_pos[1] <= n[3]]
    assert number_rects, code
    n = min(number_rects, key=lambda r: distance(center(r), number_pos))
    # Each half includes its share of the number cell, eliminating dead hover areas.
    booths[code] = (min(r[0], n[0]), r[1], max(r[2], n[2]), r[3]) if n[3]-n[1] > 8 else (r[0], min(r[1], n[1]), r[2], max(r[3], n[3]))
for word in numbers:
    area = section(word)
    if len(area) != 2:
        continue
    pos = center(word)
    candidates = [r for r in rects if 9.9 < r[2] - r[0] < 10.1 and 9.9 < r[3] - r[1] < 10.1 and r[0] <= pos[0] <= r[2] and r[1] <= pos[1] <= r[3]]
    assert len(candidates) == 1, (word, candidates)
    code = f'{area}-{int(word[4]):02}'
    assert code not in booths, code
    booths[code] = candidates[0]

lines = []
for line in doc[1].get_text().splitlines():
    line = line.strip()
    if not line or re.fullmatch('[A-Z]{1,2}', line):
        continue
    if re.match(r'^[A-Z]{1,2}-\d', line):
        lines.append(line)
    else:
        assert lines, line
        lines[-1] += ' ' + line
entries = []
for line in lines:
    address, name = re.split(r' [–-] ', line, maxsplit=1)
    day = 'saturday' if '(SAT)' in address else 'sunday' if '(SUN)' in address else 'both'
    address = re.sub(r'\s*\((SAT|SUN)\)', '', address)
    codes = []
    for part in address.split('/'):
        match = re.fullmatch(r'([A-Z]{1,2})-(\d{1,2})(ab|a|b)?', part.strip())
        assert match, (line, part)
        area, number, suffix = match.groups()
        for half in list(suffix) if suffix else ['']:
            codes.append(f'{area}-{int(number):02}{half}')
    entries.append({'name': name, 'day': day, 'codes': codes})

missing = sorted({c for e in entries for c in e['codes']} - booths.keys())
assert not missing, f'Directory codes without geometry: {missing}'
assets = root / 'packages/www/public/maps/cf22'
assets.mkdir(parents=True, exist_ok=True)
# Paths preserve the source fonts, symbols and all hall landmarks at any zoom.
(assets / 'floor.svg').write_text(page.get_svg_image(), encoding='utf-8')
if source.resolve() != (assets / 'source.pdf').resolve():
    shutil.copyfile(source, assets / 'source.pdf')
data = {
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'bounds': {'x': 110, 'y': 160, 'width': 1574, 'height': 872},
    'booths': [{'code': c, 'x': round(r[0], 3), 'y': round(r[1], 3), 'width': round(r[2]-r[0], 3), 'height': round(r[3]-r[1], 3)} for c, r in sorted(booths.items())],
    'entries': entries,
}
(root / 'packages/www/src/lib/cf22-map.generated.json').write_text(json.dumps(data, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
print(f'Imported {len(booths)} boxes and {len(entries)} directory entries; every listed code matched.')
print('Unlisted boxes:', ', '.join(sorted(booths.keys() - {c for e in entries for c in e['codes']})))
