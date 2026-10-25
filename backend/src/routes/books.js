import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let where = {};
    if (req.user.role === "AUTHOR") {
      where = { authorId: req.user.authorId };
    } else if (req.query.authorId) {
      where = { authorId: req.query.authorId };
    }
    const books = await prisma.book.findMany({ where });
    res.json({ books: books.map(b => ({ ...b, availableOn: safeParse(b.availableOn) })) });
  } catch (e) { next(e); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const book = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!book) return res.status(404).json({ error: "Book not found" });
    if (req.user.role === "AUTHOR" && book.authorId !== req.user.authorId) return res.status(403).json({ error: "Forbidden" });
    res.json({ book: { ...book, availableOn: safeParse(book.availableOn) } });
  } catch (e) { next(e); }
});

function safeParse(v) { try { return v ? JSON.parse(v) : []; } catch { return []; } }

export default router;
