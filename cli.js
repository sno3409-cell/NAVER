#!/usr/bin/env node
// 예약 작업용 명령줄 도구. 기준 키워드를 5개씩 나눠 조회하고, 연관 키워드를 합쳐 JSON으로 출력한다.
// 사용법:
//   node cli.js                     → seeds.json의 키워드 전체 조회
//   node cli.js 당뇨,고혈압 [개수]   → 지정한 키워드만 조회
// 성공: stdout에 JSON, 종료 코드 0 / 실패: stderr에 원인 메시지, 종료 코드 1

import { readFileSync } from "node:fs";
import { UserFacingError, loadCredentials, normalizeKeywords, fetchKeywordStats, summarize } from "./lib.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [arg, limitArg] = process.argv.slice(2);
  const limit = Number(limitArg) || 50;
  const seeds = arg
    ? arg.split(/[,\n]/)
    : JSON.parse(readFileSync(new URL("./seeds.json", import.meta.url), "utf8")).keywords;

  const creds = loadCredentials();
  const all = String(seeds.join(",")).split(",").map((s) => s.replace(/\s+/g, "")).filter(Boolean);
  const unique = [...new Set(all)];
  const batches = [];
  for (let i = 0; i < unique.length; i += 5) batches.push(normalizeKeywords(unique.slice(i, i + 5).join(",")));

  const merged = new Map();
  const failures = [];
  for (const batch of batches) {
    try {
      for (const k of await fetchKeywordStats(batch, creds)) merged.set(k.relKeyword, k);
    } catch (err) {
      if (!(err instanceof UserFacingError)) throw err;
      failures.push({ batch, error: err.message });
      // 인증 오류는 다른 묶음도 똑같이 실패하므로 바로 멈춘다.
      if (/HTTP 40[13]/.test(err.message)) break;
    }
    await sleep(500); // 호출 한도(429) 예방
  }

  if (merged.size === 0) {
    throw new UserFacingError(failures.map((f) => `[${f.batch.join(",")}] ${f.error}`).join("\n\n") || "조회 결과가 없습니다.");
  }
  const rows = summarize([...merged.values()], limit);
  console.log(JSON.stringify({ fetchedAt: new Date().toISOString(), seeds: unique, total: merged.size, rows, failures }, null, 2));
}

main().catch((err) => {
  console.error(`❌ 키워드 조회 실패\n${err instanceof UserFacingError ? err.message : err.stack || err}`);
  process.exit(1);
});
