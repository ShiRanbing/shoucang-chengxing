"""打包静态部署和源码，并验证归档根路径与资源完整性；不启动服务。"""
from pathlib import Path
import hashlib
import json
import struct
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / "deliverables"
output.mkdir(exist_ok=True)
dist = root / "dist"
files = sorted(p for p in dist.rglob("*") if p.is_file())
assert (dist / "index.html").is_file(), "请先执行 npm run build"
cover_files = sorted((dist / "assets").glob("cover-*.jpg"))
assert len(cover_files) == 22, "社区应包含22张封面"
assert len({hashlib.sha256(p.read_bytes()).hexdigest() for p in cover_files}) == 22, "封面内容不应重复"
landmark_files = sorted((dist / "assets").glob("place-*.webp"))
assert len(landmark_files) == 42, "14个景点应各有3种风格独立插画"
assert len({hashlib.sha256(p.read_bytes()).hexdigest() for p in landmark_files}) == 42, "景点插画不应重复"
for path in files:
    relative = path.relative_to(dist)
    assert path.read_bytes() == (root / "public" / relative).read_bytes(), f"构建文件过期：{relative}"

deploy = output / "收藏成形-REDCowork.zip"
with zipfile.ZipFile(deploy, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(dist).as_posix())
with zipfile.ZipFile(deploy) as archive:
    assert "index.html" in archive.namelist()
    assert archive.testzip() is None
    for path in files:
        assert archive.read(path.relative_to(dist).as_posix()) == path.read_bytes()

source = output / "收藏成形-源码.zip"
with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
    for folder in ["public", "src", "scripts", "tests", "docs"]:
        for path in sorted((root / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and not path.name.endswith('.local.json'):
                archive.write(path, path.relative_to(root).as_posix())
    for filename in ["package.json", "package-lock.json", "README.md", ".gitignore"]:
        archive.write(root / filename, filename)

for path in output.glob("路书-*.png"):
    assert struct.unpack(">II", path.read_bytes()[16:24]) == (1080, 1440)
screens = sorted(output.glob("0*-*.png"))
assert len(screens) <= 6
assert all(p.stat().st_size < 1024 * 1024 for p in screens)
report = {
    "静态包文件数": len(files),
    "ZIP根目录入口": "index.html",
    "截图数量": len(screens),
    "截图均小于1MB": True,
    "社区独立封面数": len(cover_files),
    "景点独立插画数": len(landmark_files),
    "文件": [{"名称": p.name, "字节": p.stat().st_size,
              "SHA256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in [deploy, source]],
}
(output / "打包校验.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
