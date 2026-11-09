#!/usr/bin/env node
// 네이버 검색광고 API(키워드 도구) MCP 서버
// 필요한 환경 변수: NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID
// 주의: stdout은 MCP 통신에 쓰이므로 로그는 반드시 console.error(stderr)로만 남긴다.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { UserFacingError, loadCredentials, normalizeKeywords, fetchKeywordStats, summarize, toMarkdown, describeOptions } from "./lib.js";

// ---------- MCP 서버 ----------

const server = new McpServer({ name: "naver-searchad", version: "1.0.0" });

server.registerTool(
  "naver_keyword_tool",
  {
    title: "네이버 키워드 도구",
    description:
      "네이버 검색광고 키워드 도구로 연관 키워드를 조회해 검색수(PC/모바일, 모바일 비중), 월평균 클릭수, 경쟁도를 돌려줍니다. 검색수 범위와 경쟁도로 거를 수 있어 '월 1,000~3,000회에 경쟁도 낮음' 같은 틈새 키워드 찾기, 상품명·태그 후보, 광고 키워드 리포트에 씁니다.",
    inputSchema: {
      keywords: z
        .string()
        .describe("기준 키워드. 여러 개는 쉼표로 구분(최대 5개). 공백은 자동으로 제거됩니다. 예: 캠핑의자,캠핑테이블"),
      limit: z.number().int().min(1).max(100).optional().describe("돌려줄 연관 키워드 수(기본 20)"),
      minSearch: z.number().int().min(0).optional().describe("월간 검색수 합계 최소값. 예: 1000"),
      maxSearch: z.number().int().min(0).optional().describe("월간 검색수 합계 최대값. 예: 3000"),
      competition: z
        .array(z.enum(["낮음", "중간", "높음"]))
        .optional()
        .describe('포함할 경쟁도. 예: ["낮음"] 또는 ["낮음","중간"]. 비우면 전부'),
      sort: z.enum(["search", "click"]).optional().describe("정렬 기준: search(검색수, 기본) 또는 click(클릭수)"),
    },
  },
  async ({ keywords, limit = 20, minSearch, maxSearch, competition, sort }) => {
    try {
      const creds = loadCredentials();
      const hints = normalizeKeywords(keywords);
      const list = await fetchKeywordStats(hints, creds);
      if (list.length === 0) {
        return { content: [{ type: "text", text: `"${hints.join(", ")}"에 대한 연관 키워드가 없습니다.` }] };
      }
      const options = { minSearch, maxSearch, competition, sort };
      const rows = summarize(list, limit, options);
      if (rows.length === 0) {
        return {
          content: [{ type: "text", text: `연관 키워드 ${list.length}개 중 조건(${describeOptions(options)})에 맞는 키워드가 없습니다. 검색수 범위나 경쟁도 조건을 넓혀 보세요.` }],
        };
      }
      return {
        content: [
          { type: "text", text: toMarkdown(hints, rows, options) },
          { type: "text", text: JSON.stringify(rows) },
        ],
      };
    } catch (err) {
      const message = err instanceof UserFacingError ? err.message : `예상하지 못한 오류: ${err.stack || err}`;
      console.error(`[naver-searchad] ${message}`);
      return { isError: true, content: [{ type: "text", text: `❌ 키워드 조회 실패\n${message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[naver-searchad] MCP 서버가 시작되었습니다.");
