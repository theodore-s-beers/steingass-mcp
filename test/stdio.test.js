import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const main = fileURLToPath(new URL("../main.js", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/mock-fetch.js", import.meta.url));

for (const version of ["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]) {
  test(
    `real stdio process: ${version} lists and calls the dictionary tool`,
    { timeout: 10_000 },
    async (t) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", fixture, main],
        stderr: "pipe",
        cwd: tmpdir(),
      });
      let stderr = "";
      transport.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const client = new Client(
        { name: "stdio-test", version: "1.0.0" },
        {
          supportedProtocolVersions: [version],
          versionNegotiation: {
            mode: version === "2026-07-28" ? { pin: version } : "legacy",
          },
        },
      );
      t.after(() => client.close());
      await client.connect(transport);
      assert.equal(client.getNegotiatedProtocolVersion(), version);
      assert.equal((await client.listTools()).tools[0].name, "search_dictionary");
      const result = await client.callTool({
        name: "search_dictionary",
        arguments: { term: "آب" },
      });
      assert.equal(result.isError, undefined);
      assert.equal(
        result.content[0].text,
        "Found 1 entry for “آب”:\n\n**آب** (āb) (p. 1)\nWater\n",
      );
      assert.match(stderr, /running on stdio/);
    },
  );
}

test(
  "stdout contains only protocol JSON and the process exits on stdin EOF",
  { timeout: 10_000 },
  async (t) => {
    const child = spawn(process.execPath, [main], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    t.after(() => child.kill());
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exited = once(child, "exit");
    const received = new Promise((resolve) => {
      child.stdout.on("data", () => {
        if (stdout.includes("\n")) resolve();
      });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "raw-test", version: "1" },
        },
      })}\n`,
    );
    await received;
    child.stdin.end();
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    const messages = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(messages[0].result.serverInfo.name, "steingass-mcp");
    assert.match(stderr, /running on stdio/);
  },
);
