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

// The body fields a module sends: its own keys, plus the parameters a spread or whole-parameters body passes on.
function sentFields(body, expect) {
  const spread = typeof body === "string" ? body : body?.["{{...}}"];
  const fromParameters = typeof spread === "string" && spread.includes("parameters") ? expect.map((p) => p.name).filter((n) => !omitted(spread).includes(n)) : [];
  const own = typeof body === "object" && body ? Object.keys(body).filter((k) => k !== "{{...}}") : [];
  return [...new Set([...fromParameters, ...own])];
}

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
    if (api.body) {
      const schema = requestSchema(op);
      const sent = sentFields(api.body, expect);
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
    if (m.typeId === 9) {
      const limit = expect.find((p) => p.name === "limit");
      assert.ok(limit && !limit.required && limit.default === 10, `${m.name}: optional limit, default 10`);
      assert.equal(limit.help, "Maximum number of results to return and work with during one execution cycle.");
      assert.equal(read(`modules/${m.name}/api.json`).response.limit, "{{parameters.limit}}");
    }
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
  assert.equal(read("modules/schedulePost/api.json").url, "/posts");
});

test("every RPC calls a route in the published spec", () => {
  for (const r of app.rpcs) {
    const api = read(`rpcs/${r.name}/api.json`);
    const op = specOperation(api.method, api.url);
    assert.ok(op, `rpc ${r.name} calls ${api.method} ${api.url}`);
    const query = (op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name);
    for (const key of Object.keys(api.qs ?? {})) assert.ok(query.includes(key), `rpc ${r.name} sends query "${key}"`);
  }
});

test("errors read [status] message, retry 5xx, and never turn a scenario off for a 403", () => {
  const base = read("base.json").response.error;
  assert.deepEqual(read("connections/skryvo/api.json").response.error, base);
  assert.equal(base.type, undefined, "a top-level type would stop Make retrying 5xx");
  for (const [key, value] of Object.entries(base)) {
    const message = key === "message" ? value : value.message;
    assert.ok(message.startsWith("[{{statusCode}}] {{ifempty(body.detail; body.message)}}"), `${key}: ${message}`);
  }
  assert.equal(base["401"].type, "InvalidAccessTokenError");
  assert.equal(base["403"].type, "DataError");
  assert.match(base["422"].message, /body\.details/, "422 shows the fields that failed validation");
});

test("the universal module stays on Skryvo's host and merges into the base request", () => {
  const api = read("modules/makeApiCall/api.json");
  assert.equal(api.url, "https://api.skryvo.ai/api/{{parameters.url}}");
  assert.equal(api.qs["{{...}}"], '{{toCollection(parameters.qs; "key"; "value")}}');
  assert.equal(api.headers["{{...}}"], '{{toCollection(parameters.headers; "key"; "value")}}');
  assert.ok(read("modules/makeApiCall/expect.json").some((p) => p.name === "headers" && p.type === "array"));
  assert.equal(app.modules.find((m) => m.typeId === 12).description, "Performs an arbitrary authorized API call.");
});

test("every date in an interface is parsed in the output", () => {
  const dates = (fields) => fields.filter((f) => f.type === "date").map((f) => f.name);
  for (const m of app.modules) {
    const fields = dates(read(`modules/${m.name}/interface.json`));
    if (!fields.length) continue;
    const output = JSON.stringify(m.webhook ? read(`webhooks/${m.webhook}/api.json`).output : read(`modules/${m.name}/api.json`).response.output);
    for (const f of fields) assert.match(output, new RegExp(`parseDate\\((item|body)\\.${f};`), `${m.name}.${f}`);
  }
});

test("the webhook secret never reaches a log", () => {
  const created = spec.paths[`${P}/webhooks`].post.responses["201"].content["application/json"].schema;
  const props = created.$ref ? spec.components.schemas[created.$ref.split("/").pop()].properties : created.properties;
  assert.ok("secret" in props, "POST /webhooks returns the secret");
  assert.ok(read("webhooks/skryvoEvents/attach.json").log.sanitize.includes("response.body.secret"));
});

test("modules declare their action, and groups run Events first, then List, Get, Create, Update, Delete", () => {
  const byName = Object.fromEntries(app.modules.map((m) => [m.name, m]));
  for (const m of app.modules) {
    if (m.typeId === 4 || m.typeId === 9) assert.ok(["create", "read", "update", "delete"].includes(m.crud), `${m.name} action`);
    else assert.equal(m.crud, undefined, m.name);
  }
  const groups = read("groups.json");
  assert.equal(groups[0].label, "Events");
  const rank = (m) => (m.typeId === 9 ? 0 : { read: 1, create: 2, update: 3, delete: 4 }[m.crud] ?? 0);
  for (const g of groups) {
    const ranks = g.modules.map((n) => rank(byName[n]));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${g.label} order`);
  }
  assert.deepEqual(groups.flatMap((g) => g.modules).sort(), app.modules.map((m) => m.name).sort());
});

test("ids an update or delete acts on are picked from a list that opens for mapping", () => {
  for (const [module, field] of [["updatePost", "post_id"], ["cancelPost", "post_id"], ["publishArticle", "article_id"]]) {
    const p = read(`modules/${module}/expect.json`).find((x) => x.name === field);
    assert.equal(p.type, "select", module);
    assert.equal(p.mode, "edit", module);
    assert.match(p.options, /^rpc:\/\//, module);
  }
  assert.equal(read("modules/cancelPost/api.json").response.output, "{{undefined}}");
});

test("text a Make user reads is written for them, in US English", () => {
  const texts = [app.description, ...app.modules.map((m) => m.description)];
  const walk = (params) => params.forEach((p) => { if (p.help) texts.push(p.help); if (p.label) texts.push(p.label); if (Array.isArray(p.spec)) walk(p.spec); });
  for (const m of app.modules) {
    walk(read(`modules/${m.name}/expect.json`));
    walk(read(`modules/${m.name}/interface.json`));
  }
  walk(read("webhooks/skryvoEvents/parameters.json"));
  for (const t of texts) {
    assert.doesNotMatch(t, /\bthe person\b|\ban agent\b|cancell|for free/i, t);
    assert.match(t, /^[A-Z0-9]/, `starts with a capital: ${t}`);
  }
  for (const m of app.modules) for (const p of read(`modules/${m.name}/expect.json`)) if (p.help) assert.match(p.help, /[.!?]$/, `${m.name}.${p.name}: full sentence`);
});
