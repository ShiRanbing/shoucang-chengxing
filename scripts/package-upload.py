"""Validate and zip the sibling upload build. No source or regular release changes."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
folder = root / 'dist-upload'
original = root / 'dist'
files = sorted(p for p in folder.rglob('*') if p.is_file())
expected = {p.relative_to(original).as_posix().replace('-atlas.png', '-atlas.webp') for p in original.rglob('*') if p.is_file()}
assert {p.relative_to(folder).as_posix() for p in files} == expected
assert len(list((folder / 'assets').glob('place-*.webp'))) == 42
assert len(list((folder / 'assets').glob('cover-*.jpg'))) == 22
for path in files:
    rel = path.relative_to(folder).as_posix()
    if rel != 'js/assets.js' and not rel.endswith('-atlas.webp'):
        assert path.read_bytes() == (original / rel).read_bytes(), rel
archive = root / 'deliverables/scx-upload.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, allowZip64=False) as z:
    for path in files:
        z.write(path, path.relative_to(folder).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'index.html' in z.namelist()
    assert not any(i.flag_bits & 1 for i in z.infolist())
report = {'entries': len(files), 'sizeMiB': round(archive.stat().st_size / 1024**2, 2), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'rootEntry': 'index.html', 'uniqueLandmarks': 42, 'uniqueCovers': 22, 'crc': 'OK'}
(root / 'deliverables/upload-package-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
