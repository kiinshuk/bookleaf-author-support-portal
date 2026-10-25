import { prisma } from "../src/lib/prisma.js";
async function main() {
  const authors = await prisma.author.count();
  const books = await prisma.book.count();
  console.log("authors:", authors, "books:", books);
  if (authors !== 10) throw new Error("expected 10 authors");
  if (books !== 18) throw new Error("expected 18 books");
  const sample = await prisma.book.findUnique({ where: { id: "BK013" } });
  if (sample.status !== "In Production - Cover Design" || sample.mrp !== null) throw new Error("BK013 null mismatch");
  const bk005 = await prisma.book.findUnique({ where: { id: "BK005" } });
  if (bk005.royaltyPending !== 2546) throw new Error("pending mismatch");
  console.log("dataset verification passed");
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
