#! /usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

const handle = serveStdio(() => createServer(), {
  onerror: (error) => console.error("MCP server error:", error),
});

console.error("MCP server for Steingass Persian-English dictionary running on stdio");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    handle.close().catch((error) => {
      console.error("Error closing MCP server:", error);
      process.exitCode = 1;
    });
  });
}
