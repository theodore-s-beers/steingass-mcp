import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const inputSchema = z.object({
  term: z
    .string()
    .refine((term) => term.trim().length > 0, "Search term cannot be empty")
    .describe("The term to search for (in Arabic/Persian script or transliteration)"),
  field: z
    .enum(["headword_persian", "headword_full", "definitions"])
    .default("headword_persian")
    .describe("Field in which to search"),
  match_type: z
    .enum(["exact", "prefix", "contains"])
    .default("exact")
    .describe("Type of matching to perform (contains matches a full word)"),
});

function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

async function searchDictionary({ term, field, match_type }, fetchImpl, signal) {
  if (match_type === "exact" && field !== "headword_persian") {
    return textResult("Exact match is supported only for the headword_persian field", true);
  }

  const noEntries = () => textResult(`No entries found for “${term}” in the specified field`);

  try {
    const url = new URL("https://steingass.theobeers.com/api/entries");
    // The current API calls whole-word matching `token`.
    const matchType = match_type === "contains" ? "token" : match_type;
    url.search = new URLSearchParams({ field, "match-type": matchType, term });
    const timeout = AbortSignal.timeout(30_000);
    const res = await fetchImpl(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

    if (res.status === 404) return noEntries();
    if (res.status === 400) {
      return textResult(`Invalid request: ${await res.text()}`, true);
    }
    if (!res.ok) {
      return textResult(`API request failed: ${res.status} ${res.statusText}`, true);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return noEntries();

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
    return textResult(`Found ${data.length} ${countWord} for “${term}”:\n\n${formattedResults}`);
  } catch (error) {
    return textResult(
      `Error searching dictionary: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  }
}

export function createServer({ fetchImpl = fetch } = {}) {
  const server = new McpServer({ name: "steingass-mcp", version: "0.1.0" });
  server.registerTool(
    "search_dictionary",
    {
      description:
        "Search Steingass’ Persian-English dictionary for Persian words and their definitions",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (args, ctx) => searchDictionary(args, fetchImpl, ctx.mcpReq.signal),
  );
  return server;
}
