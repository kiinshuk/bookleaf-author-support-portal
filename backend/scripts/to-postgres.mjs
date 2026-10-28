import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] || "backend/prisma/schema.prisma";
const marker = 'provider = "sqlite"';
const target = 'provider = "postgresql"';
const src = readFileSync(path, "utf8");
if (!src.includes(marker) && !src.includes(target)) {
  console.error("Expected sqlite or postgresql provider line not found in " + path);
  process.exit(1);
}
const out = src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
writeFileSync(path, out);
console.log("schema provider -> postgresql (" + path + ")");
