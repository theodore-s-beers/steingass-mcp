# MCP Server for Steingass' Persian-English Dictionary

This is a basic MCP ([Model Context Protocol](https://modelcontextprotocol.io/)) server that provides access to [my API](https://steingass.theobeers.com/) for Steingass' Persian-English dictionary through [Claude Desktop](https://claude.com/download) and other MCP clients.

## Features

- Search across Persian headwords, full headwords, or definitions
- Look for exact matches, full words contained, or prefixes
- Results are shaped to be simple, clear, and usable by an LLM

## Installation

### Prerequisites

- Node.js 24 or later
- [pnpm](https://pnpm.io/)
- Claude Desktop or similar

### Setup

1. Clone this repository:

   ```sh
   git clone https://github.com/theodore-s-beers/steingass-mcp.git
   ```

2. Navigate to the project directory:

   ```sh
   cd steingass-mcp
   ```

3. Install the dependencies:

   ```sh
   pnpm install
   ```

4. Edit the config of your MCP client to add something like the following. Please note the use of _absolute paths_.

   ```json
   {
     "mcpServers": {
       "steingass-dictionary": {
         "command": "/abs/path/to/node",
         "args": ["/abs/path/to/steingass-mcp/main.js"]
       }
     }
   }
   ```

5. Make sure to restart your MCP client _completely_. You'll also likely be prompted to grant permissions to this MCP server the first time that you use it, since it requires network access.

## Usage

This should be self-explanatory! Ask your LLM to search for something.

## Development

```sh
pnpm check  # oxlint, oxfmt, and the offline test suite
pnpm audit  # audit runtime and dev dependencies
pnpm dev    # restart the server when source files change
```

Tests use Node's built-in test runner, mocked API responses, and real stdio child processes. They cover tool discovery, search options, Persian text and URL encoding, result formatting, errors, cancellation, and both legacy MCP clients (2025-03-26, 2025-06-18, 2025-11-25) and the 2026-07-28 protocol. Tests do not require the dictionary API to be online.

## MCP implementation

The server uses the stable v2 SDK's `McpServer.registerTool` and `serveStdio` factory API. There is one read-only tool, `search_dictionary`, using the same dictionary endpoint and result text. The tool accepts:

- `term`: a non-blank string, sent as-is to the API
- `field`: `headword_persian` (default), `headword_full`, or `definitions`
- `match_type`: `exact` (default), `prefix`, or `contains`. Exact matching is supported only for `headword_persian`. Here, `contains` means "contains the full word."

Invalid arguments and upstream failures are model-readable tool errors (`isError: true`), rather than JSON-RPC errors. Unknown tools are protocol errors, handled by the SDK. A `404` or empty/non-array response means no dictionary entries were found. API requests time out after 30 seconds and are cancelled when the client cancels its request. Diagnostics go to `stderr`, never to the protocol's `stdout`.
