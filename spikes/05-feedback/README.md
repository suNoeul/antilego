# Spike 05 — 피드백 (05-a: API)

읽다가 "여기 틀렸는데요" 를 **읽던 자리에서** 보낼 수 있게 한다. 받은 글은 Notion
`📮 Feedback` DB 에 쌓인다.

둘로 나눠 진행한다.

| | 무엇 | 어디 | 누가 |
|---|---|---|---|
| **05-a** | 받아서 Notion 에 쓰는 함수 | `api/` | 이 문서 |
| **05-b** | "피드백" 알약과 카드 | `web/` | [`RESULT.md`](RESULT.md) 의 `05-b · UI` |

## 왜 서버가 필요한가

사이트는 GitHub Pages 의 정적 파일이다. Notion 토큰을 브라우저에 둘 수 없다
(소스를 열면 누구나 우리 워크스페이스에 쓸 수 있게 된다). 그래서 토큰을 쥔
**작은 함수 하나**를 따로 띄우고, 브라우저는 그 함수에만 말을 건다.

Vercel Hobby 를 쓴다 — 비상업 전용 원칙(AGENTS.md)에 맞고, 함수 하나면 무료 한도 안이다.

## 결과

- 코드·배포 방법: [`api/README.md`](../../api/README.md)
- 검사 기록·판정: [`RESULT.md`](RESULT.md)

## 돌려 보는 법

```bash
cd api
node test/notion-mock.mjs          # 24개 검사, 네트워크 안 씀
MOCK_NOTION=1 node test/local.mjs  # :3300 에 띄우고 Notion 으로 보낼 본문을 찍는다
```

UI 쪽(05-b)은 `cd web && python3 -m http.server 8000` 으로 열고 오른쪽 `피드백` 알약을 누른다.
보내는 곳은 `web/app.js` 의 `FEEDBACK_URL` 한 줄이다:
`https://antilego-api.vercel.app/api/feedback`. 로컬 함수로 바꿔 보려면
`http://localhost:3300/api/feedback` 으로 고치면 된다 (CORS 가 localhost 를 통과시킨다).
