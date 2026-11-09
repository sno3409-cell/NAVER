# 네이버 검색광고 키워드 도구 MCP 서버

> 매일 저녁 의료·일반 블로그 글감을 찾는 예약 작업 지침은 `ROUTINE.md`, 기준 키워드와 조건은 `seeds.json`에 있습니다.

Claude Desktop에서 "캠핑의자 연관 키워드 알려줘"처럼 물으면, 네이버 검색광고 키워드 도구를 호출해 연관 키워드 **상위 20개**(월간 검색수 합계 순)의 검색수, 클릭수, 경쟁도를 표로 보여줍니다.

## 1. 준비물
- Node.js 18 이상 (https://nodejs.org 에서 LTS 설치)
- 네이버 검색광고 API 키 3개: 검색광고 관리 화면 > 도구 > API 사용 관리
  - 엑세스라이선스 → `NAVER_AD_API_KEY`
  - 비밀키 → `NAVER_AD_SECRET_KEY`
  - CUSTOMER_ID(숫자) → `NAVER_AD_CUSTOMER_ID`

## 2. 설치
압축을 원하는 폴더에 풀고, 그 폴더에서 아래 명령을 실행합니다.

```bash
npm install
```

## 3. Claude Desktop에 등록
Claude Desktop > 설정 > 개발자 > "설정 편집"을 누르면 `claude_desktop_config.json` 파일이 열립니다.
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

아래 내용을 넣습니다. 이미 `mcpServers`가 있으면 그 안에 `"naver-searchad": {...}` 항목만 추가하세요.
`args`에는 server.js의 **전체 경로**를 넣어야 합니다.

**Windows** (경로의 `\`는 `\\`로 두 번 씁니다)
```json
{
  "mcpServers": {
    "naver-searchad": {
      "command": "node",
      "args": ["C:\\Users\\내이름\\naver-searchad-mcp\\server.js"],
      "env": {
        "NAVER_AD_API_KEY": "엑세스라이선스",
        "NAVER_AD_SECRET_KEY": "비밀키",
        "NAVER_AD_CUSTOMER_ID": "1234567"
      }
    }
  }
}
```

**macOS**
```json
{
  "mcpServers": {
    "naver-searchad": {
      "command": "node",
      "args": ["/Users/내이름/naver-searchad-mcp/server.js"],
      "env": {
        "NAVER_AD_API_KEY": "엑세스라이선스",
        "NAVER_AD_SECRET_KEY": "비밀키",
        "NAVER_AD_CUSTOMER_ID": "1234567"
      }
    }
  }
}
```

저장한 뒤 Claude Desktop을 **완전히 종료**(트레이/메뉴 막대에서 종료)하고 다시 실행합니다.
macOS에서 `node`를 못 찾는다는 오류가 나면 터미널에서 `which node`로 나온 전체 경로(예: `/opt/homebrew/bin/node`)를 `command`에 넣으세요.

## 4. 사용
- "캠핑의자, 캠핑테이블 연관 키워드 검색수랑 경쟁도 보여줘"
- 기준 키워드는 쉼표로 최대 5개까지 넣을 수 있고, 공백은 자동으로 제거됩니다.
- 기본 20개 대신 더 많이 보려면 "50개 보여줘"처럼 요청하세요(최대 100).
- 검색수 범위, 경쟁도, 정렬로 거를 수 있습니다. 결과에는 모바일 비중도 함께 나옵니다.
  - 블로그 글감: "역류성식도염 연관 키워드 중 월 1,000~3,000회, 경쟁도 낮음만 보여주고 제목이랑 소제목까지 짜줘"
  - 상품명·태그: "텀블러 연관 키워드 중 경쟁도 낮음·중간에서 검색수 높은 걸로 상품명 3개, 태그 후보 10개"
  - 시즌 상품: "크리스마스선물 연관어 보고 뭘 먼저 올릴지 추천해줘"
  - 광고 리포트: "캠핑의자 연관 키워드에서 경쟁도 높음은 빼고 클릭수 순으로 표 정리하고, 공략 키워드 5개와 이유"
  - 모바일 비중이 높으면 일반 소비자, 낮으면 실무자·PC 사용자 검색이 많은 키워드입니다.

## 5. 오류가 날 때
실패하면 Claude가 원인 메시지를 그대로 보여줍니다.

| 메시지 | 확인할 것 |
|---|---|
| 환경 변수가 설정되지 않았습니다 | 설정 파일 `env`의 키 이름과 값, Claude Desktop 재시작 |
| HTTP 403 (서명 불일치) | 엑세스라이선스와 비밀키가 같은 쌍인지, CUSTOMER_ID가 맞는지, 값에 공백이 섞였는지, PC 시계 |
| HTTP 401 | 엑세스라이선스 값 |
| HTTP 429 | 호출 한도 초과, 잠시 후 재시도 |
| 연결하지 못했습니다 | 인터넷, 방화벽, 회사 프록시 |

서버 로그는 Claude Desktop의 MCP 로그 파일(`mcp-server-naver-searchad.log`)에서 볼 수 있습니다.
