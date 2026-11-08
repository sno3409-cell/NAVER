#!/usr/bin/env node
// 네이버 검색광고 API(키워드 도구) MCP 서버
// 필요한 환경 변수: NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID
// 주의: stdout은 MCP 통신에 쓰이므로 로그는 반드시 console.error(stderr)로만 남긴다.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { UserFacingError, loadCredentials, normalizeKeywords, fetchKeywordStats, summarize, toMarkdown } from "./lib.js";

// ---------- MCP 서버 ----------

const server = new McpServer({ name: "naver-searchad", version: "1.0.0" });

server.registerTool(
  "naver_keyword_tool",
  {
    title: "네이버 키워드 도구",
    description:
      "네이버 검색광고 키워드 도구로 연관 키워드를 조회해, 월간 검색수 합계가 큰 순서로 상위 키워드의 검색수(PC/모바일), 월평균 클릭수(PC/모바일), 경쟁도를 돌려줍니다.",
    inputSchema: {
      keywords: z
        .string()
        .describe("기준 키워드. 여러 개는 쉼표로 구분(최대 5개). 공백은 자동으로 제거됩니다. 예: 캠핑의자,캠핑테이블"),
      limit: z.number().int().min(1).max(100).optional().describe("돌려줄 연관 키워드 수(기본 20)"),
    },
  },
  async ({ keywords, limit = 20 }) => {
    try {
      const creds = loadCredentials();
      const hints = normalizeKeywords(keywords);
      const list = await fetchKeywordStats(hints, creds);
      if (list.length === 0) {
        return { content: [{ type: "text", text: `"${hints.join(", ")}"에 대한 연관 키워드가 없습니다.` }] };
      }
      const rows = summarize(list, limit);
      return {
        content: [
          { type: "text", text: toMarkdown(hints, rows) },
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
