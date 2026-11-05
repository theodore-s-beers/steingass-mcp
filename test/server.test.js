import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../server.js";

const entry = {
  headword_persian: "آب",
  headword_latin: "āb",
  definitions: "Water",
  page: 1,
};

async function connect(t, fetchImpl) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer({ fetchImpl }), {
    transport: serverTransport,
  });
  const client = new Client(
    { name: "steingass-tests", version: "1.0.0" },
    {
      versionNegotiation: {
        mode: { pin: "2026-07-28" },
      },
    },
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  return client;
}

function search(client, args) {
  return client.callTool({ name: "search_dictionary", arguments: args });
}

test(`tool discovery and defaults`, async (t) => {
  const client = await connect(t, async () => Response.json([]));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  const tool = tools[0];
  assert.equal(tool.name, "search_dictionary");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ["term"]);
  assert.equal(tool.inputSchema.properties.term.type, "string");
  assert.deepEqual(tool.inputSchema.properties.field.enum, [
    "headword_persian",
    "headword_full",
    "definitions",
  ]);
  assert.equal(tool.inputSchema.properties.field.default, "headword_persian");
  assert.deepEqual(tool.inputSchema.properties.match_type.enum, ["exact", "prefix", "contains"]);
  assert.equal(tool.inputSchema.properties.match_type.default, "exact");
});

test(`term, defaults, URL encoding, and single-entry formatting`, async (t) => {
  const term = " آب & + #? /ی\u200cی ";
  let calls = 0;
  const client = await connect(t, async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://steingass.theobeers.com");
    assert.equal(url.pathname, "/api/entries");
    assert.deepEqual(
      [...url.searchParams],
      [
        ["field", "headword_persian"],
        ["match-type", "exact"],
        ["term", term],
      ],
    );
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json([entry]);
  });
  const result = await search(client, { term });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [
    {
      type: "text",
      text: `Found 1 entry for “${term}”:\n\n**آب** (āb) (p. 1)\nWater\n`,
    },
  ]);
  assert.equal(calls, 1);
});

test("search options are passed to the API", async (t) => {
  let actual;
  const client = await connect(t, async (url) => {
    actual = [url.searchParams.get("field"), url.searchParams.get("match-type")];
    return Response.json([]);
  });
  for (const [field, match_type, apiMatch] of [
    ["headword_persian", "exact", "exact"],
    ["headword_full", "prefix", "prefix"],
    ["definitions", "contains", "token"],
  ]) {
    actual = undefined;
    const result = await search(client, { term: "water", field, match_type });
    assert.equal(result.isError, undefined);
    assert.deepEqual(actual, [field, apiMatch]);
  }
});

test("exact matching on other fields fails without fetching", async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    return Response.json([]);
  });
  for (const field of ["headword_full", "definitions"]) {
    const result = await search(client, { term: "water", field, match_type: "exact" });
    assert.equal(result.isError, true);
    assert.equal(
      result.content[0].text,
      "Exact match is supported only for the headword_persian field",
    );
  }
  assert.equal(calls, 0);
});

test(`multiple results preserve order and missing-field fallbacks`, async (t) => {
  const client = await connect(t, async () => Response.json([entry, {}]));
  const result = await search(client, { term: "آب" });
  assert.equal(
    result.content[0].text,
    "Found 2 entries for “آب”:\n\n**آب** (āb) (p. 1)\nWater\n\n---\n**N/A** (N/A)\nNo definitions available\n",
  );
});

for (const [label, response] of [
  ["404", () => new Response("not found", { status: 404 })],
  ["empty array", () => Response.json([])],
  ["non-array", () => Response.json({ message: "none" })],
  ["null", () => Response.json(null)],
]) {
  test(`${label} is a successful no-results response`, async (t) => {
    const client = await connect(t, response);
    const result = await search(client, { term: "آب" });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.content, [
      {
        type: "text",
        text: "No entries found for “آب” in the specified field",
      },
    ]);
  });
}

test(`malformed arguments cannot reach the API`, async (t) => {
  let calls = 0;
  const client = await connect(t, async () => {
    calls++;
    return Response.json([]);
  });
  for (const args of [
    {},
    { term: " \n\t " },
    { term: 3 },
    { term: "a", field: "bad" },
    { term: "a", match_type: "bad" },
  ]) {
    const result = await search(client, args);
    assert.equal(result.isError, true);
  }
  assert.equal(calls, 0);
});

for (const [label, fetchImpl, message] of [
  ["400", async () => new Response("bad query", { status: 400 }), "Invalid request: bad query"],
  [
    "500",
    async () =>
      new Response("unavailable", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    "API request failed: 500 Internal Server Error",
  ],
  [
    "network failure",
    async () => {
      throw new Error("offline");
    },
    "Error searching dictionary: offline",
  ],
  ["invalid JSON", async () => new Response("not JSON"), /Error searching dictionary:/],
]) {
  test(`${label} is a recoverable tool error`, async (t) => {
    const client = await connect(t, fetchImpl);
    const result = await search(client, { term: "آب" });
    assert.equal(result.isError, true);
    if (typeof message === "string") assert.equal(result.content[0].text, message);
    else assert.match(result.content[0].text, message);
  });
}

test(`upstream requests have a 30-second timeout`, async (t) => {
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 30_000);
    return AbortSignal.abort(new DOMException("Request timed out", "TimeoutError"));
  });
  const client = await connect(t, async (_url, { signal }) => {
    signal.throwIfAborted();
    assert.fail("aborted request must not complete");
  });
  const result = await search(client, { term: "آب" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Error searching dictionary: Request timed out");
});

test("client cancellation aborts the upstream request", { timeout: 5_000 }, async (t) => {
  const started = Promise.withResolvers();
  const aborted = Promise.withResolvers();
  const client = await connect(t, async (_url, { signal }) => {
    return new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted.resolve();
          reject(signal.reason);
        },
        { once: true },
      );
      started.resolve();
    });
  });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const call = client.callTool(
    { name: "search_dictionary", arguments: { term: "آب" } },
    { signal: controller.signal },
  );
  const rejected = assert.rejects(call);
  await started.promise;
  controller.abort();
  await Promise.all([rejected, aborted.promise]);
});
