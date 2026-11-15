import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const setup = `
import ctypes, errno, importlib.util, io, os, plistlib, tempfile
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('clones','skills/dev-tidy/chrome-clones.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
temp=tempfile.TemporaryDirectory();root=(Path(temp.name)/'X/com.google.Chrome.code_sign_clone').resolve();root.mkdir(parents=True)
def make(name='ABC123'):
 p=root/('code_sign_clone.'+name);contents=p/'Google Chrome.app.bundle/Contents';(contents/'MacOS').mkdir(parents=True)
 (contents/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.google.Chrome','CFBundleExecutable':'Google Chrome','CFBundleShortVersionString':'1.2.3'}))
 (contents/'MacOS/Google Chrome').write_text('executable')
 return p
`;
function check(script) {
  const result = spawnSync('python3', ['-c', setup + script], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

test('Chrome clone preview preserves files and apply removes only the selected unused copy', () => {
  const output = check(`
a=make();b=make('D_F-6.');data=Path(temp.name)/'profile';data.write_text('history')
lib=SimpleNamespace(ffsctl=Mock(return_value=0))
with patch.object(m.ctypes,'CDLL',return_value=lib):
 m.clean(root)
 assert a.exists() and b.exists()
 m.clean(root,True,['code_sign_clone.ABC123'])
 assert not a.exists() and b.exists() and data.read_text()=='history'
 m.clean(root,True)
 assert not list(root.iterdir())
 m.clean(root,True)
`);
  assert.match(output, /Chrome clones: 2 eligible, 0 removed, 0 kept/);
  assert.match(output, /Chrome clones: 1 eligible, 1 removed, 0 kept/);
  assert.match(output, /Chrome clones: 0 eligible, 0 removed, 0 kept/);
});

test('Chrome clone cleanup keeps busy or unsupported native references', () => {
  for (const code of ['errno.EBUSY', 'errno.ENOTTY']) check(`
p=make()
def busy(*args):ctypes.set_errno(${code});return -1
with patch.object(m.ctypes,'CDLL',return_value=SimpleNamespace(ffsctl=Mock(side_effect=busy))):m.clean(root,True)
assert (p/'Google Chrome.app.bundle/Contents/MacOS/Google Chrome').read_text()=='executable'
`);
});

test('Chrome clone cleanup rejects malformed bundles, traversal and symlinks', () => {
  check(`
p=make();outside=Path(temp.name)/'source';outside.mkdir();(outside/'file').write_text('source')
(p/'Google Chrome.app.bundle/Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'other'}))
invalid=make('GHI789');(invalid/'Google Chrome.app.bundle/Contents/Info.plist').write_bytes(plistlib.dumps([]))
(root/'code_sign_clone.LINK00').symlink_to(outside,target_is_directory=True)
with patch.object(m.ctypes,'CDLL',return_value=SimpleNamespace(ffsctl=Mock(return_value=0))):
 m.clean(root,True)
 try:m.clean(root,True,['../source']);raise AssertionError('traversal accepted')
 except ValueError:pass
assert p.exists() and invalid.exists() and (outside/'file').read_text()=='source'
assert (root/'code_sign_clone.LINK00').is_symlink()
`);
});

test('Chrome clone cleanup rechecks reference use and directory identity before removal', () => {
  for (const event of ['busy', 'replace']) check(`
p=make();calls=0
original=p/'Google Chrome.app.bundle/Contents/MacOS/Google Chrome'
def change(*args):
 global calls
 calls+=1
 if calls==2:
  if '${event}'=='busy':ctypes.set_errno(errno.EBUSY);return -1
  p.rename(root/'original');p.mkdir();(p/'source').write_text('new source')
 return 0
with patch.object(m.ctypes,'CDLL',return_value=SimpleNamespace(ffsctl=Mock(side_effect=change))):m.clean(root,True)
assert p.exists()
if '${event}'=='replace':assert (p/'source').read_text()=='new source'
else:assert original.read_text()=='executable'
`);
});

test('macOS kernel reference check protects a hardlinked executable until its last other reference closes', { skip: process.platform !== 'darwin' }, () => {
  check(`
p=make();exe=p/'Google Chrome.app.bundle/Contents/MacOS/Google Chrome';link=Path(temp.name)/'hardlink';os.link(exe,link)
fd=os.open(link,os.O_RDONLY)
try:
 m.clean(root,True)
 assert exe.exists()
finally:os.close(fd)
m.clean(root,True)
assert not p.exists() and link.read_text()=='executable'
`);
});

test('bounded Chrome cleanup sequences never remove a referenced clone or the external executable', { skip: process.platform !== 'darwin' }, () => {
  const output = check(`
from collections import deque
queue=deque([[]]);seen=set();paths=0
while queue:
 sequence=queue.popleft();paths+=1
 with tempfile.TemporaryDirectory() as world:
  root=(Path(world)/'X/com.google.Chrome.code_sign_clone').resolve();root.mkdir(parents=True)
  p=make();exe=p/'Google Chrome.app.bundle/Contents/MacOS/Google Chrome';outside=Path(world)/'installed-executable';os.link(exe,outside);fd=None
  try:
   for event in sequence:
    before=p.exists()
    if event=='open' and fd is None:fd=os.open(outside,os.O_RDONLY)
    elif event=='close' and fd is not None:os.close(fd);fd=None
    elif event in ['preview','apply']:
     with redirect_stdout(io.StringIO()):m.clean(root,event=='apply')
     assert not (before and fd is not None and not p.exists()),sequence
     if event=='preview':assert p.exists()==before,sequence
    assert outside.read_text()=='executable',sequence
   key=(p.exists(),fd is not None)
   if key in seen:continue
   seen.add(key)
   if len(sequence)<3:
    queue.extend(sequence+[event] for event in ['preview','apply','open','close'])
  finally:
   if fd is not None:os.close(fd)
assert len(seen)==4 and paths==17,(seen,paths)
print('Native Chrome properties hold to depth3:4states,17paths')
`);
  assert.match(output, /Native Chrome properties hold to depth3:4states,17paths/);
});
