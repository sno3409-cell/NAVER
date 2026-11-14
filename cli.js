#!/usr/bin/env node
// 예약 작업용 명령줄 도구. seeds.json의 묶음(의료/일반)별로 기준 키워드를 5개씩 나눠 조회하고 JSON으로 출력한다.
// 사용법:
//   node cli.js                     → seeds.json 전체 조회
//   node cli.js 당뇨,고혈압 [개수]   → 지정한 키워드만 조회("직접" 묶음)
// 출력(묶음마다):
//   byCompetition.낮음/중간/높음
//     inRange:    seeds.json filter의 검색수 범위(기본 월 1,000~3,000회) 안, 검색수 순
//     outOfRange: 같은 경쟁도에서 범위 밖 키워드, 범위에 가까운 순(inRange가 모자랄 때 사용)
//     byVolume:   같은 경쟁도 전체를 검색수 큰 순으로(경쟁도 높음은 이 목록을 쓴다)
//   top: 전체 검색수 순 상위(흐름 파악용)
// 성공: stdout에 JSON, 종료 코드 0 / 실패: stderr에 원인 메시지, 종료 코드 1

import { readFileSync } from "node:fs";
import { UserFacingError, loadCredentials, normalizeKeywords, fetchKeywordStats, summarize } from "./lib.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collect(seeds, creds) {
  const unique = [...new Set(seeds.map((s) => String(s).replace(/\s+/g, "")).filter(Boolean))];
  const merged = new Map();
  const failures = [];
  for (let i = 0; i < unique.length; i += 5) {
    const batch = normalizeKeywords(unique.slice(i, i + 5).join(","));
    try {
      for (const k of await fetchKeywordStats(batch, creds)) merged.set(k.relKeyword, k);
    } catch (err) {
      if (!(err instanceof UserFacingError)) throw err;
      failures.push({ batch, error: err.message });
      if (/HTTP 40[13]/.test(err.message)) throw new UserFacingError(err.message); // 인증 오류는 전부 실패하므로 즉시 중단
    }
    await sleep(500); // 호출 한도(429) 예방
  }
  return { seeds: unique, keywordList: [...merged.values()], failures };
}

async function main() {
  const [arg, limitArg] = process.argv.slice(2);
  const limit = Number(limitArg) || 50;
  const config = JSON.parse(readFileSync(new URL("./seeds.json", import.meta.url), "utf8"));
  const filter = config.filter || {};
  const categories = arg ? { 직접: arg.split(/[,\n]/) } : config.categories;

  const creds = loadCredentials();
  const result = { fetchedAt: new Date().toISOString(), filter, categories: {} };
  for (const [name, seeds] of Object.entries(categories)) {
    const { seeds: used, keywordList, failures } = await collect(seeds, creds);
    const { minSearch = 0, maxSearch = Infinity } = filter;
    const byCompetition = {};
    for (const level of ["낮음", "중간", "높음"]) {
      const all = summarize(keywordList, 10000, { competition: [level] });
      const value = (r) => Number(String(r.searchTotal).replace(/[^0-9.]/g, "")) || 0;
      const inRange = all.filter((r) => value(r) >= minSearch && value(r) <= maxSearch).slice(0, limit);
      const distance = (r) => (value(r) < minSearch ? minSearch - value(r) : value(r) - maxSearch);
      const outOfRange = all
        .filter((r) => value(r) < minSearch || value(r) > maxSearch)
        .sort((a, b) => distance(a) - distance(b))
        .slice(0, limit);
      // byVolume: 검색수 범위와 상관없이 검색수 큰 순(경쟁도 높음 글감은 이 목록에서 고른다)
      byCompetition[level] = { inRange, outOfRange, byVolume: all.slice(0, limit) };
    }
    result.categories[name] = {
      seeds: used,
      total: keywordList.length,
      byCompetition,
      top: summarize(keywordList, 20),
      failures,
    };
  }
  const empty = Object.values(result.categories).every((c) => c.total === 0);
  if (empty) {
    const msgs = Object.values(result.categories).flatMap((c) => c.failures.map((f) => `[${f.batch.join(",")}] ${f.error}`));
    throw new UserFacingError(msgs.join("\n\n") || "조회 결과가 없습니다.");
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(`❌ 키워드 조회 실패\n${err instanceof UserFacingError ? err.message : err.stack || err}`);
  process.exit(1);
});
