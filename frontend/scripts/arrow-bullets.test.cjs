const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("modal points are marked with the arrow, not a dot", () => {
  for (const file of ["src/features/owner/owner-ui.tsx", "src/features/tenancy/request-timeline-sheet.tsx"]) {
    const source = read(file);
    assert.match(source, /<ArrowBullet\b/, file);
    assert.doesNotMatch(source, /•/, file);
  }
});
