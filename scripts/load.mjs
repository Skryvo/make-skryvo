#!/usr/bin/env node
// Loads app/ into a Make custom app through Make's API, then reads every section back and diffs it.
// Usage: MAKE_API_KEY=… node scripts/load.mjs <make-app-name> [version] [--check]
import { readFileSync, existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const file = (path) => new URL(path, ROOT);
const readJson = (path) => JSON.parse(readFileSync(file(path), "utf8"));
const optionalJson = (path) => (existsSync(file(path)) ? readJson(path) : undefined);

export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

// Make names a connection and webhook itself (e.g. skryvo-ab12), so manifest links are mapped to those names.
export function linkFor(component, names) {
  return {
    connection: component.connection ? names[component.connection] : undefined,
    webhook: component.webhook ? names[component.webhook] : undefined,
  };
}

export function sectionsOf(manifest) {
  const list = [
    { kind: "app", section: "base", source: "app/base.json" },
    { kind: "app", section: "groups", source: "app/groups.json" },
  ];
  const c = manifest.connection;
  for (const s of ["api", "parameters"]) list.push({ kind: "connection", name: c.name, section: s, source: `app/connections/${c.name}/${s}.json` });
  const w = manifest.webhook;
  for (const s of ["api", "parameters", "attach", "detach"]) list.push({ kind: "webhook", name: w.name, section: s, source: `app/webhooks/${w.name}/${s}.json` });
  for (const r of manifest.rpcs) for (const s of ["api", "parameters"]) list.push({ kind: "rpc", name: r.name, section: s, source: `app/rpcs/${r.name}/${s}.json` });
  for (const m of manifest.modules) {
    for (const s of ["api", "parameters", "expect", "interface", "samples"]) {
      const source = `app/modules/${m.name}/${s}.json`;
      if (existsSync(file(source))) list.push({ kind: "module", name: m.name, section: s, source });
    }
  }
  return list;
}

function client(token, zone) {
  const base = `https://${zone}/api/v2`;
  return async function call(method, path, { body, type } = {}) {
    const headers = { Authorization: `Token ${token}` };
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== "string") {
      payload = JSON.stringify(body);
      type ??= "application/json";
    }
    if (type) headers["Content-Type"] = type;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(base + path, { method, headers, body: payload }).catch((e) => {
        if (attempt >= 4) throw new Error(`${method} ${path} → ${e.cause?.code ?? e.message}`);
        return undefined;
      });
      if (!res) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      if (res.status === 429 && attempt < 6) {
        await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") || 0) * 1000 || 2000 * 2 ** attempt));
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
      const mediaType = (res.headers.get("content-type") || "").split(";")[0].trim();
      return mediaType === "application/json" && text ? JSON.parse(text) : text;
    }
  };
}

function sectionPath(app, version, names, s) {
  if (s.kind === "app") return `/sdk/apps/${app}/${version}/${s.section}`;
  if (s.kind === "connection") return `/sdk/apps/connections/${names[s.name]}/${s.section}`;
  if (s.kind === "webhook") return `/sdk/apps/webhooks/${names[s.name]}/${s.section}`;
  if (s.kind === "rpc") return `/sdk/apps/${app}/${version}/rpcs/${s.name}/${s.section}`;
  return `/sdk/apps/${app}/${version}/modules/${s.name}/${s.section}`;
}

const asJson = (v) => (typeof v === "string" ? parseJsonc(v) : v);

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const [app, version = "1"] = args.filter((a) => !a.startsWith("--"));
  const token = process.env.MAKE_API_KEY;
  if (!app || !token) {
    console.error("Usage: MAKE_API_KEY=… [MAKE_ZONE=us2.make.com] node scripts/load.mjs <make-app-name> [version] [--check]");
    process.exit(2);
  }
  const call = client(token, process.env.MAKE_ZONE || "us2.make.com");
  const manifest = readJson("app/app.json");
  const log = (...m) => console.log(...m);
  const differences = [];

  const { app: current } = await call("GET", `/sdk/apps/${app}/${version}`);
  const meta = { label: manifest.label, description: manifest.description, theme: manifest.theme.toLowerCase(), language: manifest.language };
  const metaDiff = Object.keys(meta).filter((k) => String(current[k]).toLowerCase() !== String(meta[k]).toLowerCase());
  if (metaDiff.length && !checkOnly) await call("PATCH", `/sdk/apps/${app}/${version}`, { body: meta });

  const names = {};
  const c = manifest.connection;
  const connections = (await call("GET", `/sdk/apps/${app}/connections`)).appConnections ?? [];
  let conn = connections.find((x) => x.label === c.label && x.type === c.type);
  if (!conn && !checkOnly) conn = (await call("POST", `/sdk/apps/${app}/connections`, { body: { type: c.type, label: c.label } })).appConnection;
  if (!conn) throw new Error(`No ${c.type} connection labelled "${c.label}" in ${app}.`);
  names[c.name] = conn.name;
  log(`connection ${c.name} → ${conn.name}`);

  const w = manifest.webhook;
  const webhooks = (await call("GET", `/sdk/apps/${app}/webhooks`)).appWebhooks ?? [];
  let hook = webhooks.find((x) => x.label === w.label && x.type === w.type);
  if (!hook && !checkOnly) hook = (await call("POST", `/sdk/apps/${app}/webhooks`, { body: { type: w.type, label: w.label } })).appWebhook;
  if (!hook) throw new Error(`No ${w.type} webhook labelled "${w.label}" in ${app}.`);
  names[w.name] = hook.name;
  log(`webhook ${w.name} → ${hook.name}`);
  hook = (await call("GET", `/sdk/apps/webhooks/${hook.name}`)).appWebhook;
  const hookLink = linkFor(w, names).connection;
  if (hook.connection !== hookLink) {
    if (checkOnly) differences.push(`webhook ${hook.name}: connection ${hook.connection} ≠ ${hookLink}`);
    else await call("PATCH", `/sdk/apps/webhooks/${hook.name}`, { body: { connection: hookLink } });
  }

  const rpcs = new Map(((await call("GET", `/sdk/apps/${app}/${version}/rpcs`)).appRpcs ?? []).map((r) => [r.name, r]));
  for (const r of manifest.rpcs) {
    if (!rpcs.has(r.name) && !checkOnly) await call("POST", `/sdk/apps/${app}/${version}/rpcs`, { body: { name: r.name, label: r.label } });
    const have = rpcs.has(r.name) ? (await call("GET", `/sdk/apps/${app}/${version}/rpcs/${r.name}`)).appRpc : {};
    const want = { label: r.label, connection: linkFor(r, names).connection };
    const patch = Object.fromEntries(Object.entries(want).filter(([k, v]) => have[k] !== v));
    if (Object.keys(patch).length && !checkOnly) await call("PATCH", `/sdk/apps/${app}/${version}/rpcs/${r.name}`, { body: patch });
  }

  const modules = new Map(((await call("GET", `/sdk/apps/${app}/${version}/modules`)).appModules ?? []).map((m) => [m.name, m]));
  for (const m of manifest.modules) {
    let have = modules.get(m.name);
    if (have && m.webhook) have = (await call("GET", `/sdk/apps/${app}/${version}/modules/${m.name}`)).appModule;
    if (have && have.typeId !== m.typeId) differences.push(`module ${m.name}: typeId ${have.typeId} ≠ ${m.typeId} (Make cannot change a module's type; delete it first)`);
    if (!have && !checkOnly) {
      const link = linkFor(m, names);
      const body = { name: m.name, typeId: m.typeId, label: m.label, description: m.description, moduleInitMode: "blank" };
      if (link.webhook) body.webhook = link.webhook;
      await call("POST", `/sdk/apps/${app}/${version}/modules`, { body });
      have = {};
    }
    if (!have) continue;
    const want = { label: m.label, description: m.description, ...linkFor(m, names) };
    if (!want.webhook) delete want.webhook;
    const patch = Object.fromEntries(Object.entries(want).filter(([k, v]) => have[k] !== v));
    if (Object.keys(patch).length && !checkOnly) await call("PATCH", `/sdk/apps/${app}/${version}/modules/${m.name}`, { body: patch });
  }

  if (!checkOnly) {
    await call("PUT", `/sdk/apps/${app}/${version}/common`, { body: readJson("app/common.json") });
    await call("PUT", `/sdk/apps/${app}/${version}/icon`, { body: new Uint8Array(readFileSync(file("icon.png"))), type: "image/png" });
    for (const s of sectionsOf(manifest)) {
      const path = sectionPath(app, version, names, s);
      const source = readJson(s.source);
      if (!isDeepStrictEqual(asJson(await call("GET", path)), source)) {
        await call("PUT", path, { body: JSON.stringify(source, null, 2), type: "application/jsonc" });
        log(`set ${s.kind} ${s.name ?? app} ${s.section}`);
      }
    }
    for (const m of manifest.modules) if (!modules.get(m.name)?.public) await call("POST", `/sdk/apps/${app}/${version}/modules/${m.name}/public`);
  }

  for (const s of sectionsOf(manifest)) {
    const live = asJson(await call("GET", sectionPath(app, version, names, s)));
    if (!isDeepStrictEqual(live, readJson(s.source))) differences.push(`${s.kind} ${s.name ?? app} ${s.section} differs from ${s.source}`);
  }
  if (!isDeepStrictEqual(asJson(await call("GET", `/sdk/apps/${app}/${version}/common`)), readJson("app/common.json"))) differences.push("common differs");
  const liveApp = (await call("GET", `/sdk/apps/${app}/${version}`)).app;
  for (const k of Object.keys(meta)) if (String(liveApp[k]).toLowerCase() !== String(meta[k]).toLowerCase()) differences.push(`app ${k}: ${liveApp[k]}`);
  const liveHook = (await call("GET", `/sdk/apps/webhooks/${names[w.name]}`)).appWebhook;
  if (liveHook.connection !== names[c.name]) differences.push(`webhook ${liveHook.name}: connection ${liveHook.connection}`);
  for (const r of manifest.rpcs) {
    const live = (await call("GET", `/sdk/apps/${app}/${version}/rpcs/${r.name}`).catch(() => ({}))).appRpc;
    if (!live) differences.push(`rpc ${r.name} missing`);
    else if (live.label !== r.label || live.connection !== names[r.connection]) differences.push(`rpc ${r.name}: ${JSON.stringify(live)}`);
  }
  const liveModules = new Map(((await call("GET", `/sdk/apps/${app}/${version}/modules`)).appModules ?? []).map((m) => [m.name, m]));
  for (const m of manifest.modules) {
    const link = linkFor(m, names);
    const live = link.webhook ? (await call("GET", `/sdk/apps/${app}/${version}/modules/${m.name}`)).appModule : liveModules.get(m.name);
    if (!live) differences.push(`module ${m.name} missing`);
    else if (live.typeId !== m.typeId || live.label !== m.label || live.description !== m.description || live.connection !== link.connection || (link.webhook && live.webhook !== link.webhook) || !live.public)
      differences.push(`module ${m.name}: ${JSON.stringify(live)}`);
  }
  const extra = [...liveModules.keys()].filter((n) => !manifest.modules.some((m) => m.name === n));
  if (extra.length) differences.push(`modules in Make but not in app.json: ${extra.join(", ")}`);

  log(`checked ${sectionsOf(manifest).length + 1} sections, ${manifest.rpcs.length} RPCs, ${manifest.modules.length} modules`);
  if (differences.length) {
    console.error(differences.join("\n"));
    process.exit(1);
  }
  log("Make matches app/.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
