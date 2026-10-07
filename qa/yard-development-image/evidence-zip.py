"""Deterministic lossless ZIP of every original, with verification on both sides."""
import hashlib,json,pathlib,stat,sys,zipfile
raw,manifest_path,target=map(pathlib.Path,sys.argv[1:])
manifest=json.loads(manifest_path.read_bytes())
assert manifest['format']=='yard-lossless-evidence/v1'
entries={row['path']:row for row in manifest['files']}
assert len(entries)==len(manifest['files'])
assert set(entries)=={p.name for p in raw.iterdir()}
reserved='MANIFEST.sha256.json'
assert reserved not in entries
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9,allowZip64=True) as archive:
    for name in sorted([*entries,reserved]):
        if name==reserved:
            data=manifest_path.read_bytes()
        else:
            assert pathlib.PurePosixPath(name).name==name and name not in ['.','..']
            source=raw/name
            assert source.is_file() and not source.is_symlink()
            data=source.read_bytes()
            assert len(data)==entries[name]['bytes']
            assert hashlib.sha256(data).hexdigest()==entries[name]['sha256']
        info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))
        info.create_system=3
        info.external_attr=(stat.S_IFREG|0o644)<<16
        info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
with zipfile.ZipFile(target) as archive:
    assert archive.namelist()==sorted([*entries,reserved])
    assert archive.testzip() is None
    for name,row in entries.items():
        data=archive.read(name)
        assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256']
print(json.dumps({'verifiedOriginals':len(entries),'archiveBytes':target.stat().st_size}))
