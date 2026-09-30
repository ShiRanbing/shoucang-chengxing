"""Build a standard ZIP with both archive and extracted payload below 10 MB."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
folder = root / 'dist-small'
manifest = json.loads((root / 'deliverables/small-upload-assets.json').read_text(encoding='utf-8'))
files = sorted(path for path in folder.rglob('*') if path.is_file())
expected = {path.relative_to(root / 'dist').as_posix() for path in (root / 'dist').rglob('*') if path.is_file() and path.parent.name != 'assets'}
expected.update('assets/' + item['filename'] for item in manifest['records'])
assert {path.relative_to(folder).as_posix() for path in files} == expected
assert len(files) == 86
archive = root / 'deliverables/scx-under-10mb-v2.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as target:
    for path in files:
        name = path.relative_to(folder).as_posix()
        assert name.isascii() and not name.startswith('/') and '..' not in name.split('/')
        target.write(path, name)

with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert 'index.html' in package.namelist()
    assert not any(entry.flag_bits & 1 for entry in package.infolist())
    extracted_bytes = sum(entry.file_size for entry in package.infolist())
    # 10 MB interpreted strictly as 10,000,000 bytes, not the larger 10 MiB.
    assert archive.stat().st_size < 9_500_000, '压缩包必须为10 MB上限留出至少0.5 MB余量'
    assert extracted_bytes < 10_000_000, '解压后的资源也需小于10 MB'
    extracted = root / 'test-results/scx-under-10mb-extracted'
    for entry in package.infolist():
        output = (extracted / entry.filename).resolve()
        assert output.is_relative_to(extracted.resolve())
        output.parent.mkdir(parents=True, exist_ok=True)
        data = package.read(entry)
        assert data == (folder / entry.filename).read_bytes()
        output.write_bytes(data)

size = archive.stat().st_size
report = {
    'release': manifest['release'], 'archive': archive.name,
    'entries': len(files), 'bytes': size, 'sizeMB': round(size / 1_000_000, 3),
    'sizeMiB': round(size / 1024**2, 3), 'extractedBytes': extracted_bytes,
    'headroomBytes': 10_000_000 - size,
    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'rootEntry': 'index.html', 'rootEntryBytes': (folder / 'index.html').stat().st_size,
    'uniqueLandmarks': 42, 'uniqueCovers': 22, 'assets': 74,
    'crc': 'OK', 'encryption': False, 'compression': 'DEFLATE',
    'extractedForBrowserCheck': extracted.relative_to(root).as_posix(),
}
(root / 'deliverables/small-upload-package-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
