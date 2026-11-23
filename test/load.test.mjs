import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { linkFor, parseJsonc, sectionsOf } from "../scripts/load.mjs";

const manifest = JSON.parse(readFileSync(new URL("../app/app.json", import.meta.url), "utf8"));

test("parseJsonc reads Make's commented sections and keeps // inside strings", () => {
  const text = '{\n\t// Request\n\t"url": "https://x.example/a", /* note */\n\t"list": [1, 2,],\n}';
  assert.deepEqual(parseJsonc(text), { url: "https://x.example/a", list: [1, 2] });
  assert.deepEqual(parseJsonc('{\n\t// "url": "x"\n}'), {});
  assert.deepEqual(parseJsonc('{"a": "say \\"hi\\" // not a comment"}'), { a: 'say "hi" // not a comment' });
});

test("links map the manifest's names to the names Make generated", () => {
  const names = { skryvo: "skryvo-ab12", skryvoEvents: "skryvo-cd34" };
  const watch = manifest.modules.find((m) => m.name === "watchEvents");
  assert.deepEqual(linkFor(watch, names), { connection: "skryvo-ab12", webhook: "skryvo-cd34" });
  assert.deepEqual(linkFor(manifest.webhook, names), { connection: "skryvo-ab12", webhook: undefined });
});

test("every section the loader sends has its file, and the instant trigger sends no api", () => {
  const sections = sectionsOf(manifest);
  for (const s of sections) assert.ok(existsSync(new URL(`../${s.source}`, import.meta.url)), s.source);
  assert.ok(!sections.some((s) => s.name === "watchEvents" && s.section === "api"));
  assert.equal(sections.filter((s) => s.kind === "module" && s.section === "parameters").length, manifest.modules.length);
});
