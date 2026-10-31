#!/usr/bin/env python3
"""Build tami-<version>.vsix without npm or network. Run `npm run compile` first (the package ships out/, not src/).
  python3 pack.py            your own full build
  python3 pack.py --share    tami-<version>-share.vsix for other people: sidebar items that only work on this machine are removed
Install either with:  code --install-extension <file>.vsix --force"""
import json, mimetypes, pathlib, sys, zipfile
from xml.sax.saxutils import escape

root = pathlib.Path(__file__).parent
pkg = json.loads((root / 'package.json').read_text())
name, version, publisher = pkg['name'], pkg['version'], pkg['publisher']
SHARE = '--share' in sys.argv

# Items marked "local": true in sidebar.json only work on the author's machine and are left out of the shared build.
def share_config(raw: str) -> str:
    d = json.loads(raw)
    local = lambda it: it.get('local') is True
    for sec in d['sections']:
        if 'groups' in sec:
            for g in sec['groups']: g['items'] = [it for it in g['items'] if not local(it)]
            sec['groups'] = [g for g in sec['groups'] if g['items']]
    d['sections'] = [s for s in d['sections'] if s.get('groups') or s.get('rows')]
    return json.dumps(d, indent=2, ensure_ascii=False) + '\n'

files = [root / 'package.json', root / 'sidebar.json']
files += sorted(p for d in ('out', 'media') for p in (root / d).rglob('*') if p.is_file() and p.suffix != '.map')
assert (root / 'out' / 'extension.js').exists(), 'run `npm run compile` first'

exts = sorted({p.suffix.lstrip('.') for p in files} | {'vsixmanifest'})
types = {'json': 'application/json', 'js': 'application/javascript', 'png': 'image/png', 'svg': 'image/svg+xml', 'css': 'text/css', 'vsixmanifest': 'text/xml', 'md': 'text/markdown'}
content_types = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + ''.join(
    f'<Default Extension="{e}" ContentType="{types.get(e, mimetypes.types_map.get("." + e, "application/octet-stream"))}"/>' for e in exts) + '</Types>'

manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}"/>
    <DisplayName>{escape(pkg.get('displayName', name))}</DisplayName>
    <Description xml:space="preserve">{escape(pkg.get('description', ''))}</Description>
    <Tags></Tags>
    <Categories>{escape(','.join(pkg.get('categories', ['Other'])))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{escape(pkg['engines']['vscode'])}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace"/>
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
'''
out = root / f'{name}-{version}{"-share" if SHARE else ""}.vsix'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('extension.vsixmanifest', manifest)
    for p in files:
        if SHARE and p.name == 'sidebar.json': z.writestr('extension/sidebar.json', share_config(p.read_text()))
        else: z.write(p, 'extension/' + p.relative_to(root).as_posix())
print(f'{out.name}: {len(files)} files, {out.stat().st_size // 1024} KB')
