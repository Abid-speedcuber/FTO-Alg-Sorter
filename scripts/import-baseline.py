#!/usr/bin/env python3
"""Import the source sheet once. Never overwrite a frozen baseline."""
import argparse
import csv
import hashlib
import io
import json
import re
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent

def build_baseline(raw, source_url):
    source_rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
    sections = OrderedDict()
    headers = []
    blanks = []
    for row_number, row in enumerate(source_rows, 1):
        if not any(cell.strip() for cell in row):
            blanks.append(row_number)
            continue
        if row[0].lower() == 'index' and len(row) >= 8 and row[5].lower() == 'alg':
            headers.append(row_number)
            continue
        if len(row) != 12:
            raise ValueError(f'Row {row_number}: expected 12 columns, found {len(row)}')
        index, family, case_name, group, setup, alg, thumb, cost, rotation, auf, stm, solution = row
        if not alg.strip() or not family or not group:
            raise ValueError(f'Row {row_number}: missing algorithm/family/group')
        if not re.fullmatch(r'\d+(?:\.\d+)?', cost):
            raise ValueError(f'Row {row_number}: invalid baseline cost {cost!r}')
        if thumb not in {'front', 'bottom', 'back+', 'back-', 'top'}:
            raise ValueError(f'Row {row_number}: unknown thumb {thumb!r}')
        key = (family, group)
        if key not in sections:
            sections[key] = {
                'id': group.lower(), 'label': f'{group} · {family.removeprefix("LL ")}',
                'family': family, 'group': group, 'entries': []
            }
        sections[key]['entries'].append({
            'id': f'sheet-row-{row_number}', 'sourceRow': row_number,
            'caseNumber': int(index), 'caseName': case_name, 'caseGroup': group,
            'referenceAlgorithm': setup, 'algorithm': alg,
            'baseline': {'cost': float(cost), 'costText': cost, 'startThumb': thumb, 'rotation': rotation, 'auf': auf},
            'stm': int(stm), 'solution': solution
        })
    total = sum(len(section['entries']) for section in sections.values())
    if total + len(headers) + len(blanks) != len(source_rows):
        raise ValueError('Source row reconciliation failed')
    gid = parse_qs(urlparse(source_url).query).get('gid', ['1131196825'])[0]
    url = source_url.split('/export')[0] + f'/edit?gid={gid}' if '/export' in source_url else source_url
    return {
        'schemaVersion': 1,
        'source': {
            'title': 'FTO Nautilus LL', 'url': url, 'gid': gid,
            'retrievedAt': datetime.now(timezone.utc).isoformat(),
            'csvSha256': hashlib.sha256(raw).hexdigest(),
            'columns': ['Index', 'Algset', 'Name', 'Group', 'Setup', 'alg', 'thumb', 'cost', 'rot', 'auf', 'stm', 'solution'],
            'sourceRowCount': len(source_rows), 'headerRows': headers, 'blankRows': blanks,
            'sectionCount': len(sections), 'caseCount': len({e['caseNumber'] for s in sections.values() for e in s['entries']}),
            'algorithmCount': total,
            'grouping': 'Family and Group columns in first-appearance sheet order. Includes T0; source has 36 groups, not 35.'
        },
        'comparison': 'Preserve source algorithm, orientation, and starting thumb. Baseline costs are immutable sheet values.',
        'sections': list(sections.values())
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Google Sheets CSV export URL')
    parser.add_argument('--csv', type=Path, help='Use a previously downloaded CSV instead of downloading')
    args = parser.parse_args()
    output = ROOT / 'data/algorithm-baseline.json'
    if output.exists():
        raise SystemExit('Baseline already exists; refusing to overwrite the original sheet costs.')
    raw = args.csv.read_bytes() if args.csv else urlopen(args.source, timeout=60).read()
    baseline = build_baseline(raw, args.source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {baseline["source"]["algorithmCount"]} algorithms, {baseline["source"]["caseCount"]} cases, {len(baseline["sections"])} sections. No source rows lost.')

if __name__ == '__main__':
    main()
