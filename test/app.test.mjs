import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8"));
const spec = JSON.parse(readFileSync(new URL("./openapi.json", import.meta.url), "utf8"));
const app = read("app.json");
const P = "/api/v1/agent";
const template = (path) => path.replace(/\{\{[^}]+\}\}|\{[^}]+\}/g, "{}");

function specOperation(method, url) {
  for (const [path, item] of Object.entries(spec.paths)) {
    if (template(path.slice(P.length)) === template(url) && item[method.toLowerCase()]) return item[method.toLowerCase()];
  }
  return undefined;
}

function requestSchema(op) {
  const ref = op.requestBody?.content?.["application/json"]?.schema?.$ref;
  return ref ? spec.components.schemas[ref.split("/").pop()] : { properties: {}, required: [] };
}

const omitted = (body) => [...(body.match(/omit\(parameters;(.*)\)/)?.[1].matchAll(/"([^"]+)"/g) ?? [])].map((m) => m[1]);

test("every file is valid JSON and every component listed has its files", () => {
  const walk = (dir) =>
    readdirSync(new URL(`../app/${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`],
    );
  for (const file of walk("")) read(file);
  for (const m of app.modules) {
    for (const section of ["parameters", "expect", "interface", "samples"]) {
      assert.ok(existsSync(new URL(`../app/modules/${m.name}/${section}.json`, import.meta.url)), `${m.name}/${section}`);
    }
  }
  for (const r of app.rpcs) read(`rpcs/${r.name}/api.json`);
});

test("names, labels and descriptions follow Make's conventions", () => {
  for (const m of app.modules) {
    assert.match(m.name, /^[a-zA-Z][0-9a-zA-Z]+[0-9a-zA-Z]$/, m.name);
    assert.ok(m.name.length >= 3 && m.name.length <= 48, m.name);
    assert.match(m.label, /^[A-Z][a-z]+( [a-z]+| API)*$/, `${m.name}: sentence case "${m.label}"`);
    assert.match(m.description, /^[A-Z][a-z]+s .*\.$/, `${m.name}: third person, ends with a period`);
  }
  assert.match(app.name, /^[a-z][0-9a-z-]+[0-9a-z]$/);
});

test("every module calls a route in the published spec and sends only its fields", () => {
  for (const m of app.modules.filter((x) => x.typeId !== 10 && x.typeId !== 12)) {
    const api = read(`modules/${m.name}/api.json`);
    const op = specOperation(api.method, api.url);
    assert.ok(op, `${m.name} calls ${api.method} ${api.url}, which the spec lacks`);
    const expect = read(`modules/${m.name}/expect.json`);
    if (typeof api.body === "string" && api.body.includes("parameters")) {
      const schema = requestSchema(op);
      const sent = expect.map((p) => p.name).filter((n) => !omitted(api.body).includes(n));
      for (const name of sent) assert.ok(name in schema.properties, `${m.name} sends "${name}", not in ${api.url}`);
      for (const name of schema.required ?? []) assert.ok(sent.includes(name), `${m.name} never sends required "${name}"`);
    }
    const query = (op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name);
    for (const key of Object.keys(api.qs ?? {})) assert.ok(query.includes(key), `${m.name} sends query "${key}"`);
  }
});

test("searches take a limit, and every dropdown's RPC exists", () => {
  const rpcs = new Set(app.rpcs.map((r) => r.name));
  for (const m of app.modules) {
    const expect = read(`modules/${m.name}/expect.json`);
    if (m.typeId === 9) assert.ok(expect.some((p) => p.name === "limit" && p.required), `${m.name} needs a limit`);
    const walk = (params) =>
      params.forEach((p) => {
        if (typeof p.options === "string") assert.ok(rpcs.has(p.options.replace("rpc://", "")), `${m.name}: ${p.options}`);
        if (Array.isArray(p.spec)) walk(p.spec);
      });
    walk(expect);
  }
});

test("the key never reaches a log, and a bad key fails the connection", () => {
  assert.deepEqual(read("base.json").log.sanitize, ["request.headers.authorization"]);
  const connection = read("connections/skryvo/api.json");
  assert.deepEqual(connection.log.sanitize, ["request.headers.authorization"]);
  assert.equal(connection.url, "https://api.skryvo.ai/api/v1/agent/me");
  assert.ok(connection.response.error["401"]);
  assert.equal(read("connections/skryvo/parameters.json")[0].type, "password");
});

test("the events webhook subscribes and unsubscribes through the webhook routes", () => {
  const attach = read("webhooks/skryvoEvents/attach.json");
  const detach = read("webhooks/skryvoEvents/detach.json");
  assert.ok(specOperation(attach.method, attach.url));
  assert.ok(specOperation(detach.method, detach.url));
  assert.equal(attach.response.data.externalHookId, "{{body.id}}");
  assert.equal(detach.url, "/webhooks/{{webhook.externalHookId}}");
  const events = read("webhooks/skryvoEvents/parameters.json")[0].options.map((o) => o.value);
  assert.deepEqual(events.sort(), [...spec.components.schemas.NewWebhookRequest.properties.events.items.enum].sort());
});

test("drafting schedules nothing, and scheduling is its own module", () => {
  const byName = Object.fromEntries(app.modules.map((m) => [m.name, m]));
  assert.equal(read("modules/writePost/api.json").url, "/drafts");
  assert.match(byName.writePost.description, /Schedules nothing\./);
  assert.match(byName.schedulePost.description, /only after the person approved/);
});
