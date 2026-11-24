"""실제 사진과 같은 시점의 렌더를 Gemini 로 비교해 차이점 목록(JSON)을 받는다.

  python gemini_review.py <사진> <렌더> <출력.json> [모델]

키는 환경 프록시가 Authorization 헤더로 넣어 준다 (OpenAI 호환 주소 사용).
"""
import base64, io, json, subprocess, sys, time, urllib.request

photo, render, out = sys.argv[1:4]
model = sys.argv[4] if len(sys.argv) > 4 else 'gemini-3.1-pro-preview'
URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'


def jpeg_b64(path, width=1280):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={width}:-1', '-q:v', '3', '-f', 'mjpeg', '-'],
                         check=True, capture_output=True).stdout
    return base64.b64encode(raw).decode()


PROMPT = """두 이미지는 같은 위치·같은 화각에서 본 고척스카이돔(서울 실내 야구장)이다.
이미지 1은 실제 사진(360° 가상투어 캡처, 화면 UI 포함), 이미지 2는 우리가 만든 3D 모델 렌더다.
3D 모델을 실제와 같게 고치기 위한 차이점을 찾아라. 사람·화면 UI·조명 밝기 차이는 무시하고,
형상(위치·크기·높이·개수·경사), 구조물(철골·지붕·난간·계단·전광판·간판·더그아웃·그물), 재질과 색을 본다.
중요한 것부터 최대 15개, 아래 JSON 형식으로만 답하라.
{"items":[{"area":"이미지 속 위치(예: 오른쪽 위 지붕)","element":"대상","real":"실제 모습","model":"모델 모습",
"fix":"모델을 어떻게 고칠지 구체적으로(가능하면 m·개수·색상 hex)","severity":"high|medium|low"}],
"overall_score":0~100 (형상 일치도), "summary":"한 줄 요약"}"""

body = {
    'model': model,
    'messages': [{'role': 'user', 'content': [
        {'type': 'text', 'text': PROMPT},
        {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + jpeg_b64(photo)}},
        {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + jpeg_b64(render)}},
    ]}],
    'response_format': {'type': 'json_object'},
}
req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST',
                             headers={'Content-Type': 'application/json', 'Authorization': 'Bearer proxy-injected'})
t0 = time.time()
with urllib.request.urlopen(req, timeout=300) as r:
    resp = json.load(r)
text = resp['choices'][0]['message']['content']
try:
    data = json.loads(text)
except json.JSONDecodeError:
    data = json.loads(text[text.index('{'):text.rindex('}') + 1])
data['_usage'] = resp.get('usage'); data['_model'] = model; data['_sec'] = round(time.time() - t0, 1)
json.dump(data, open(out, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(data, ensure_ascii=False, indent=1)[:6000])
