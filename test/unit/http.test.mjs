import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fail,
  HttpStatus,
  MAX_NAME_LENGTH,
  MAX_SCORE,
  parseName,
  parseNonNegativeInteger,
  parseScore,
  readJsonBody,
  succeed,
} from "../../server/http.js";

describe("parseName", () => {
  it("trims and caps the length", () => {
    assert.equal(parseName("  Giannis  "), "Giannis");
    assert.equal(parseName("x".repeat(50)).length, MAX_NAME_LENGTH);
  });

  it("is undefined for empty or non-string input", () => {
    assert.equal(parseName("   "), undefined);
    assert.equal(parseName(undefined), undefined);
    assert.equal(parseName(42), undefined);
  });
});

describe("parseNonNegativeInteger", () => {
  it("accepts integers and digit strings", () => {
    assert.equal(parseNonNegativeInteger(7), 7);
    assert.equal(parseNonNegativeInteger("12"), 12);
    assert.equal(parseNonNegativeInteger(0), 0);
  });

  it("rejects negatives, fractions, and other strings", () => {
    assert.equal(parseNonNegativeInteger(-1), undefined);
    assert.equal(parseNonNegativeInteger(1.5), undefined);
    assert.equal(parseNonNegativeInteger("1e3"), undefined);
    assert.equal(parseNonNegativeInteger(""), undefined);
  });
});

describe("parseScore", () => {
  it("clamps to the maximum score", () => {
    assert.equal(parseScore(3), 3);
    assert.equal(parseScore(500), MAX_SCORE);
    assert.equal(parseScore(undefined), undefined);
    assert.equal(parseScore("abc"), undefined);
  });
});

describe("readJsonBody", () => {
  it("returns the object body, or an empty object for anything else", async () => {
    const json = (body) => new Request("https://x", { method: "POST", body });
    assert.deepEqual(await readJsonBody(json('{"a":1}')), { a: 1 });
    assert.deepEqual(await readJsonBody(json("not json")), {});
    assert.deepEqual(await readJsonBody(json("[1,2]")), [1, 2]);
    assert.deepEqual(await readJsonBody(json("null")), {});
  });
});

describe("outcomes", () => {
  it("shape success and failure consistently", () => {
    assert.deepEqual(succeed(), { status: HttpStatus.OK, body: { ok: true }, changed: false });
    assert.deepEqual(succeed({ x: 1 }, { changed: true }), {
      status: HttpStatus.OK,
      body: { x: 1 },
      changed: true,
    });
    assert.deepEqual(fail(HttpStatus.FORBIDDEN, "NOT_HOST", "No."), {
      status: HttpStatus.FORBIDDEN,
      body: { error: "NOT_HOST", message: "No." },
      changed: false,
    });
  });
});
