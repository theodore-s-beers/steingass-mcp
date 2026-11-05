import assert from "node:assert/strict";

globalThis.fetch = async (url) => {
  assert.equal(url.origin, "https://steingass.theobeers.com");
  assert.equal(url.pathname, "/api/entries");
  assert.equal(url.searchParams.get("term"), "آب");
  return Response.json([
    {
      headword_persian: "آب",
      headword_latin: "āb",
      definitions: "Water",
      page: 1,
    },
  ]);
};
