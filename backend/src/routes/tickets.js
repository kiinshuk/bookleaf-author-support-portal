import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { classifyAndScore, draftResponse } from "../services/ai.js";
import { broadcast } from "../lib/websocket.js";

const router = Router();

function parseTicket(t) { if (!t) return t; return t; }

router.post("/", requireAuth, requireRole("AUTHOR"), async (req, res, next) => {
  try {
    const { bookId, subject, description } = req.body || {};
    if (!subject || !description) return res.status(400).json({ error: "subject and description required" });
    if (bookId) {
      const book = await prisma.book.findUnique({ where: { id: bookId } });
      if (!book || book.authorId !== req.user.authorId) return res.status(400).json({ error: "Invalid book" });
    }
    const ticket = await prisma.ticket.create({
      data: { authorId: req.user.authorId, bookId: bookId || null, subject, description },
    });
    // async AI triage (fire and forget) with graceful degradation: the ticket exists and is
    // usable before the model answers, and classification + priority come back in ONE call.
    (async () => {
      try {
        const { category, priority } = await classifyAndScore({ subject, description });
        await prisma.ticket.update({ where: { id: ticket.id }, data: { aiCategory: category, category, aiPriority: priority, priority } });
        broadcast({ type: "ticket.updated", payload: { ticketId: ticket.id } }, (info) => info.role === "ADMIN" || info.authorId === req.user.authorId);
      } catch (e) { console.error("AI classify error", e.message); }
    })();
    const full = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: { book: true, author: true } });
    broadcast({ type: "ticket.created", payload: { ticketId: ticket.id } }, (info) => info.role === "ADMIN" || info.authorId === req.user.authorId);
    res.status(201).json({ ticket: full });
  } catch (e) { next(e); }
});

const PRIORITY_ORDER = { "CRITICAL":0, "HIGH":1, "MEDIUM":2, "LOW":3 };
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let where = {};
    if (req.user.role === "AUTHOR") where.authorId = req.user.authorId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.category) where.category = req.query.category;
    if (req.query.priority) where.priority = req.query.priority;
    if (req.query.createdAfter) {
      const after = new Date(req.query.createdAfter);
      if (isNaN(after.getTime())) return res.status(400).json({ error: "createdAfter must be a valid ISO 8601 date" });
      where.createdAt = { gte: after };
    }
    const tickets = await prisma.ticket.findMany({
      where,
      include: { author: true, book: true, responses: { orderBy: { createdAt: "asc" } }, internalNotes: req.user.role === "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    tickets.sort((a,b)=>{ const pa=PRIORITY_ORDER[a.priority]??9; const pb=PRIORITY_ORDER[b.priority]??9; if(pa!==pb) return pa-pb; return new Date(a.createdAt)-new Date(b.createdAt); });
    res.json({ tickets });
  } catch (e) { next(e); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { author: true, book: true, responses: { orderBy: { createdAt: "asc" } }, internalNotes: true, assignedTo: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (req.user.role === "AUTHOR" && ticket.authorId !== req.user.authorId) return res.status(403).json({ error: "Forbidden" });
    // strip internal notes for authors
    if (req.user.role !== "ADMIN") ticket.internalNotes = [];
    res.json({ ticket });
  } catch (e) { next(e); }
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { status, category, priority, categoryOverride, priorityOverride, assignedToId } = req.body || {};
    const data = {};
    if (status) data.status = status;
    if (category) { data.category = category; data.categoryOverride = true; }
    if (priority) { data.priority = priority; data.priorityOverride = true; }
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (categoryOverride !== undefined) data.categoryOverride = categoryOverride;
    if (priorityOverride !== undefined) data.priorityOverride = priorityOverride;
    const ticket = await prisma.ticket.update({ where: { id: req.params.id }, data });
    broadcast({ type: "ticket.updated", payload: { ticketId: ticket.id } }, (info) => true);
    res.json({ ticket });
  } catch (e) { next(e); }
});

router.post("/:id/notes", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: "body required" });
    const note = await prisma.internalNote.create({ data: { ticketId: req.params.id, authorId: req.user.id, body } });
    res.status(201).json({ note });
  } catch (e) { next(e); }
});

router.post("/:id/responses", requireAuth, async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: "body required" });
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: { author: true, book: true } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (req.user.role === "AUTHOR" && ticket.authorId !== req.user.authorId) return res.status(403).json({ error: "Forbidden" });
    const fromAdmin = req.user.role === "ADMIN";
    const resp = await prisma.ticketResponse.create({
      data: {
        ticketId: ticket.id,
        body,
        fromAdmin,
        authorName: req.user.role === "ADMIN" ? "BookLeaf Support" : ticket.author.name,
        authorEmail: req.user.role === "ADMIN" ? "support@bookleaf.com" : ticket.author.email,
      },
    });
    if (fromAdmin) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } });
    }
    broadcast({ type: "ticket.response", payload: { ticketId: ticket.id } }, (info) => true);
    res.status(201).json({ response: resp });
  } catch (e) { next(e); }
});

router.post("/:id/draft", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: { author: true, book: true, responses: { orderBy: { createdAt: "asc" } } } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const draft = await draftResponse({ ticket, author: ticket.author, book: ticket.book, history: ticket.responses });
    res.json({ draft });
  } catch (e) { next(e); }
});

export default router;
