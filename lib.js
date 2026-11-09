// 네이버 검색광고 API(키워드 도구) 호출 공통 로직. server.js(MCP)와 cli.js(예약 작업)가 함께 쓴다.

import crypto from "node:crypto";

const BASE_URL = (process.env.NAVER_AD_BASE_URL || "https://api.searchad.naver.com").replace(/\/+$/, "");
const KEYWORD_TOOL_URI = "/keywordstool";
const TIMEOUT_MS = 15000;

export class UserFacingError extends Error {}

// ---------- 설정 / 인증 ----------

export function loadCredentials() {
  const names = ["NAVER_AD_API_KEY", "NAVER_AD_SECRET_KEY", "NAVER_AD_CUSTOMER_ID"];
  // 복사·붙여넣기 때 섞여 들어간 앞뒤 공백이나 따옴표는 403의 흔한 원인이라 제거한다.
  const values = Object.fromEntries(
    names.map((n) => [n, (process.env[n] || "").trim().replace(/^["']|["']$/g, "")])
  );
  const missing = names.filter((n) => !values[n]);
  if (missing.length) {
    throw new UserFacingError(
      `환경 변수가 설정되지 않았습니다: ${missing.join(", ")}\n` +
        "Claude Desktop 설정(claude_desktop_config.json)의 이 서버 항목 \"env\"에 값을 넣고 Claude Desktop을 완전히 종료한 뒤 다시 실행하세요."
    );
  }
  if (!/^\d+$/.test(values.NAVER_AD_CUSTOMER_ID)) {
    throw new UserFacingError(
      `NAVER_AD_CUSTOMER_ID는 숫자로 된 광고주 고객 ID여야 합니다(현재 값: "${values.NAVER_AD_CUSTOMER_ID}").\n` +
        "검색광고 관리 화면 > 도구 > API 사용 관리에서 CUSTOMER_ID를 확인하세요. 로그인 아이디가 아닙니다."
    );
  }
  return {
    apiKey: values.NAVER_AD_API_KEY,
    secretKey: values.NAVER_AD_SECRET_KEY,
    customerId: values.NAVER_AD_CUSTOMER_ID,
  };
}

// 서명 = Base64(HMAC-SHA256(비밀키, "{timestamp}.{METHOD}.{URI}"))
// URI에는 쿼리 문자열을 넣지 않는다. 쿼리까지 넣으면 403이 난다.
export function makeSignature(timestamp, method, uri, secretKey) {
  return crypto.createHmac("sha256", secretKey).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

// ---------- 입력 정리 ----------

export function normalizeKeywords(input) {
  const list = String(input)
    .split(/[,\n]/)
    .map((k) => k.replace(/\s+/g, "")) // 키워드 도구는 공백이 들어간 키워드를 거부(400)한다.
    .filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length === 0) throw new UserFacingError("조회할 키워드를 1개 이상 입력하세요.");
  if (unique.length > 5) {
    throw new UserFacingError(`키워드는 한 번에 최대 5개까지 조회할 수 있습니다(입력: ${unique.length}개).`);
  }
  return unique;
}

// ---------- API 호출 ----------

function describeHttpError(status, body) {
  let detail = "";
  try {
    const j = JSON.parse(body);
    detail = [j.code, j.title, j.detail, j.message, j.header && `헤더: ${j.header}`].filter(Boolean).join(" / ");
  } catch {
    detail = body.slice(0, 300);
  }
  const hints = {
    400: "요청 형식이 잘못되었습니다. 키워드에 특수문자가 있거나 지원하지 않는 형식인지 확인하세요.",
    401: "인증에 실패했습니다. NAVER_AD_API_KEY(엑세스라이선스)가 올바른지 확인하세요.",
    403:
      "권한이 거부되었습니다(서명 불일치). 다음을 확인하세요:\n" +
      "  1) NAVER_AD_API_KEY(엑세스라이선스)와 NAVER_AD_SECRET_KEY(비밀키)가 같은 API 키 쌍인지\n" +
      "  2) NAVER_AD_CUSTOMER_ID가 그 키를 발급한 계정의 CUSTOMER_ID인지\n" +
      "  3) 키 값 앞뒤에 공백이나 줄바꿈이 섞이지 않았는지\n" +
      "  4) 컴퓨터 시계가 정확한지(타임스탬프 오차가 크면 거부됩니다)",
    404: "API 주소를 찾을 수 없습니다. NAVER_AD_BASE_URL을 바꿨다면 확인하세요.",
    429: "호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
  };
  const hint = hints[status] || (status >= 500 ? "네이버 검색광고 서버 오류입니다. 잠시 후 다시 시도하세요." : "알 수 없는 오류입니다.");
  return `네이버 API 오류 (HTTP ${status})\n${hint}${detail ? `\n서버 응답: ${detail}` : ""}`;
}

export async function fetchKeywordStats(keywords, creds) {
  const timestamp = String(Date.now());
  const signature = makeSignature(timestamp, "GET", KEYWORD_TOOL_URI, creds.secretKey);
  const query = new URLSearchParams({ hintKeywords: keywords.join(","), showDetail: "1" });

  let res;
  try {
    res = await fetch(`${BASE_URL}${KEYWORD_TOOL_URI}?${query}`, {
      method: "GET",
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": creds.apiKey,
        "X-Customer": creds.customerId,
        "X-Signature": signature,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new UserFacingError(`네이버 API 응답이 ${TIMEOUT_MS / 1000}초 안에 오지 않았습니다. 네트워크 상태를 확인하세요.`);
    }
    const cause = err.cause;
    const code = cause?.code || cause?.errors?.[0]?.code || cause?.message || err.code || err.message;
    throw new UserFacingError(`네이버 API에 연결하지 못했습니다(${code}). 인터넷 연결, 방화벽, 프록시 설정을 확인하세요.`);
  }

  const body = await res.text();
  if (!res.ok) throw new UserFacingError(describeHttpError(res.status, body));

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new UserFacingError(`네이버 API 응답을 해석하지 못했습니다: ${body.slice(0, 200)}`);
  }
  if (!Array.isArray(data.keywordList)) {
    throw new UserFacingError(`예상과 다른 응답 형식입니다: ${body.slice(0, 200)}`);
  }
  return data.keywordList;
}

// ---------- 결과 가공 ----------

// 검색수가 아주 적으면 숫자 대신 "< 10" 문자열이 온다.
function toNumber(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function addCounts(a, b) {
  const x = toNumber(a), y = toNumber(b);
  if (x === null && y === null) return { value: 0, label: "< 20" };
  const sum = (x ?? 0) + (y ?? 0);
  return { value: sum, label: String(Math.round(sum * 10) / 10) };
}

function show(v) {
  const n = toNumber(v);
  return n === null ? String(v) : String(Math.round(n * 10) / 10);
}

// options: { minSearch, maxSearch, competition: ["낮음","중간"], sort: "search" | "click" }
export function summarize(keywordList, limit, options = {}) {
  const { minSearch, maxSearch, competition, sort = "search" } = options;
  return keywordList
    .map((k) => {
      const search = addCounts(k.monthlyPcQcCnt, k.monthlyMobileQcCnt);
      const click = addCounts(k.monthlyAvePcClkCnt, k.monthlyAveMobileClkCnt);
      const mobile = toNumber(k.monthlyMobileQcCnt) ?? 0;
      return {
        keyword: k.relKeyword,
        searchPc: show(k.monthlyPcQcCnt),
        searchMobile: show(k.monthlyMobileQcCnt),
        searchTotal: search.label,
        mobileShare: search.value > 0 ? `${Math.round((mobile / search.value) * 100)}%` : "-",
        clickPc: show(k.monthlyAvePcClkCnt),
        clickMobile: show(k.monthlyAveMobileClkCnt),
        clickTotal: click.label,
        competition: k.compIdx ?? "-",
        _search: search.value,
        _click: click.value,
      };
    })
    .filter((r) => (minSearch == null || r._search >= minSearch) && (maxSearch == null || r._search <= maxSearch))
    .filter((r) => !competition?.length || competition.includes(r.competition))
    .sort((a, b) => (sort === "click" ? b._click - a._click : b._search - a._search))
    .slice(0, limit)
    .map(({ _search, _click, ...rest }) => rest);
}

export function describeOptions({ minSearch, maxSearch, competition, sort } = {}) {
  const parts = [];
  if (minSearch != null || maxSearch != null) parts.push(`월간 검색수 ${minSearch ?? 0}~${maxSearch ?? "∞"}회`);
  if (competition?.length) parts.push(`경쟁도 ${competition.join("·")}`);
  parts.push(sort === "click" ? "클릭수 합계 순" : "월간 검색수 합계 순");
  return parts.join(" · ");
}

export function toMarkdown(hints, rows, options = {}) {
  const header =
    `**연관 키워드 ${rows.length}개** (기준 키워드: ${hints.join(", ")} · ${describeOptions(options)})\n\n` +
    "| # | 키워드 | 검색수 PC | 검색수 모바일 | 검색수 합계 | 모바일 비중 | 클릭수 합계 | 경쟁도 |\n" +
    "|---|---|---:|---:|---:|---:|---:|---|\n";
  const lines = rows.map(
    (r, i) =>
      `| ${i + 1} | ${r.keyword} | ${r.searchPc} | ${r.searchMobile} | ${r.searchTotal} | ${r.mobileShare} | ${r.clickTotal} | ${r.competition} |`
  );
  return header + lines.join("\n") + "\n\n검색수·클릭수는 최근 30일 기준이며, 클릭수는 월평균 추정치입니다. 모바일 비중이 높으면 일반 소비자, 낮으면 실무자·PC 사용자 검색이 많은 키워드입니다.";
}
