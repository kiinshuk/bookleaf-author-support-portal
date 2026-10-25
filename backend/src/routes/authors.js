import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const authors = await prisma.author.findMany({ include: { books: true, user: true } });
    res.json({ authors });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const author = await prisma.author.findUnique({ where: { id: req.user.authorId }, include: { books: true } });
    if (!author) return res.status(404).json({ error: "Author not found" });
    res.json({ author });
  } catch (e) { next(e); }
});

export default router;
