#! /usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

class SteingassMCP {
  constructor() {
    this.server = new Server(
      {
        name: "steingass-mcp",
        version: "0.1.0",
      },
      { capabilities: { tools: {} } },
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_dictionary",
            description:
              "Search Steingass' Persian-English dictionary for Persian words and their definitions",
            inputSchema: {
              type: "object",
              properties: {
                term: {
                  type: "string",
                  description:
                    "The term to search for (in Arabic/Persian script or transliteration)",
                },
                field: {
                  type: "string",
                  description: "Field in which to search",
                  enum: ["headword_persian", "headword_full", "definitions"],
                  default: "headword_persian",
                },
                match_type: {
                  type: "string",
                  description: "Type of matching to perform",
                  enum: ["exact", "prefix", "contains"],
                  default: "exact",
                },
              },
              required: ["term"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;

      if (name === "search_dictionary") {
        return await this.searchDictionary(args);
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${name}`);
    });
  }

  async searchDictionary(args) {
    const { term, field = "headword_persian", match_type = "exact" } = args;

    if (!term || !term.trim()) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Search term cannot be empty",
      );
    }

    if (match_type === "exact" && field !== "headword_persian") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Exact match is supported only for the headword_persian field",
      );
    }

    try {
      const encodedTerm = encodeURIComponent(term);
      const url = `https://steingass.theobeers.com/api/entries?field=${field}&match-type=${match_type}&term=${encodedTerm}`;

      const res = await fetch(url);

      if (!res.ok) {
        if (res.status === 404) {
          return {
            content: [
              {
                type: "text",
                text: `No entries found for "${term}" in the specified field`,
              },
            ],
          };
        }

        if (res.status === 400) {
          const errorText = await res.text();
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid request: ${errorText}`,
          );
        }

        throw new McpError(
          ErrorCode.InternalError,
          `API request failed: ${res.status} ${res.statusText}`,
        );
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No entries found for "${term}" in the specified field`,
            },
          ],
        };
      }

      const formattedResults = data
        .map((entry) => {
          const headword = entry.headword_persian || "N/A";
          const transliteration = entry.headword_latin || "N/A";
          const definitions = entry.definitions || "No definitions available";
          const page = entry.page ? ` (p. ${entry.page})` : "";

          return `**${headword}** (${transliteration})${page}\n${definitions}\n`;
        })
        .join("\n---\n");

      const countWord = data.length === 1 ? "entry" : "entries";

      return {
        content: [
          {
            type: "text",
            text: `Found ${data.length} ${countWord} for "${term}":\n\n${formattedResults}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;

      throw new McpError(
        ErrorCode.InternalError,
        `Error searching dictionary: ${error.message}`,
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "MCP server for Steingass Persian-English dictionary running on stdio",
    );
  }
}

const server = new SteingassMCP();
server.run().catch(console.error);
