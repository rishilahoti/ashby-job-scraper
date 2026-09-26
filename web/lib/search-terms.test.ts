import test from "node:test";
import assert from "node:assert/strict";
import { isSpecialTerm, buildSearchSql } from "./search-terms.ts";

test("isSpecialTerm flags only what FTS loses: +/# terms, lone caps letters, caps stopwords", () => {
  assert.equal(isSpecialTerm("C++"), true);
  assert.equal(isSpecialTerm("C#"), true);
  assert.equal(isSpecialTerm("IT"), true);
  assert.equal(isSpecialTerm("C"), true);
  assert.equal(isSpecialTerm("of"), false); // lowercase filler, leave to FTS to drop
  assert.equal(isSpecialTerm("director"), false);
  assert.equal(isSpecialTerm("node"), false);
  // FTS handles these (and searches description/location too) — a title-only
  // literal match would lose "London, UK", "front-end" in descriptions, etc.
  for (const t of ["AI", "UK", "Node.js", "front-end", "Engineer,", "Sr."]) {
    assert.equal(isSpecialTerm(t), false, t);
  }
});

test("buildSearchSql: symbol terms get a title regex, distinguishing C/C++/C#", () => {
  const params: (string | number | boolean | string[])[] = [];
  const sql = buildSearchSql(params, "C++");
  assert.match(sql, /title ~\*/);
  assert.doesNotMatch(sql, /job_search_ids/);
  assert.equal(params[0], "(^|[^a-zA-Z0-9+#])C\\+\\+($|[^a-zA-Z0-9+#])");
});

test("buildSearchSql: mixed query ANDs a literal title match with FTS on the rest", () => {
  const params: (string | number | boolean | string[])[] = [];
  const sql = buildSearchSql(params, "Director of IT");
  assert.match(sql, /title ~\* \$1[\s\S]*AND[\s\S]*job_search_ids/);
  assert.equal(params[1], "Director of"); // "IT" pulled out; "of" left for FTS to drop as a stopword
});

test("buildSearchSql: quoted websearch syntax is left untouched", () => {
  const params: (string | number | boolean | string[])[] = [];
  const sql = buildSearchSql(params, '"machine learning"');
  assert.match(sql, /job_search_ids/);
  assert.doesNotMatch(sql, /title ~\*/);
  assert.equal(params.length, 1);
  assert.equal(params[0], '"machine learning"');
});

test("buildSearchSql: every FTS query is compound-split to match the indexed side", () => {
  for (const q of ['"node.js engineer"', "Node.js developer"]) {
    const sql = buildSearchSql([], q);
    assert.match(sql, /websearch_to_tsquery\('english', split_compound_words\(\$1\)\)/, q);
  }
});
