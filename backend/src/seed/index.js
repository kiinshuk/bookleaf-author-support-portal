import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "bookleaf_sample_data.json"), "utf8"));

async function main() {
  // authors & books
  for (const a of data.authors) {
    await prisma.author.upsert({
      where: { id: a.author_id },
      create: {
        id: a.author_id,
        name: a.name,
        email: a.email,
        phone: a.phone,
        city: a.city,
        joinedDate: a.joined_date,
      },
      update: {},
    });
    for (const b of a.books) {
      await prisma.book.upsert({
        where: { id: b.book_id },
        create: {
          id: b.book_id,
          authorId: a.author_id,
          title: b.title,
          isbn: b.isbn,
          genre: b.genre,
          publicationDate: b.publication_date,
          status: b.status,
          mrp: b.mrp,
          authorRoyaltyPerCopy: b.author_royalty_per_copy,
          totalCopiesSold: b.total_copies_sold,
          totalRoyaltyEarned: b.total_royalty_earned,
          royaltyPaid: b.royalty_paid,
          royaltyPending: b.royalty_pending,
          lastRoyaltyPayoutDate: b.last_royalty_payout_date,
          printPartner: b.print_partner,
          availableOn: JSON.stringify(b.available_on || []),
        },
        update: {},
      });
    }
    // author user
    await prisma.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        name: a.name,
        passwordHash: await bcrypt.hash("author123", 10),
        role: "AUTHOR",
        authorId: a.author_id,
      },
      update: {},
    });
  }
  // admin user
  await prisma.user.upsert({
    where: { email: "admin@bookleaf.com" },
    create: {
      email: "admin@bookleaf.com",
      name: "BookLeaf Admin",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
    },
    update: {},
  });
  console.log("Seeded");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
