"""GPU 로 렌더한 360° 파노라마(JPEG)를 웹용으로 묶는다.

  python3 tools/pano_pack.py <렌더 폴더> <panos.json> [출력 폴더=assets/panos]

렌더 폴더의 pNNN.jpg 를 4K(4096x2048)·2K(2048x1024) WebP 로 바꾸고,
앱이 읽는 index.json([{id, file, row, num, pos}])을 만든다. 렌더가 없는 지점은 건너뛴다.
"""
import json, os, sys
from PIL import Image

src, listing = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', 'assets', 'panos')
for d in ('4k', '2k'):
    os.makedirs(os.path.join(out, d), exist_ok=True)

index = []
for p in json.load(open(listing)):
    jpg = os.path.join(src, p['name'] + '.jpg')
    if not os.path.exists(jpg):
        continue
    f = p['name'] + '.webp'
    im = Image.open(jpg).convert('RGB')
    if im.size != (4096, 2048):
        im = im.resize((4096, 2048), Image.LANCZOS)
    im.save(os.path.join(out, '4k', f), 'WEBP', quality=75, method=6)
    im.resize((2048, 1024), Image.LANCZOS).save(os.path.join(out, '2k', f), 'WEBP', quality=68, method=6)
    index.append({'id': p['id'], 'file': f, 'row': p['row'], 'num': p['num'], 'pos': [round(v, 3) for v in p['pos']]})

json.dump(index, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
size = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(out) for x in fs)
print('panos', len(index), 'total MB', round(size / 1e6, 1))
