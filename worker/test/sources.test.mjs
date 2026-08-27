import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTarget } from "../sources.mjs";

test("classifyTarget routes github URLs to git", () => {
    assert.equal(classifyTarget("https://github.com/owner/repo"), "git");
    assert.equal(classifyTarget("git@github.com:owner/repo.git"), "git");
    assert.equal(classifyTarget("https://gitlab.com/x/y.git"), "git");
});

test("classifyTarget routes plain sites to web (DAST)", () => {
    assert.equal(classifyTarget("https://example.com"), "web");
    assert.equal(classifyTarget("acme.io"), "web");
});
