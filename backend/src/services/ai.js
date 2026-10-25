import { config } from "../config.js";
import OpenAI from "openai";

let openaiClient = null;
function getOpenAI() {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

const KNOWLEDGE_BASE = `BookLeaf Publishing: self-publishing in India & US.
Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium with marketing/distribution).
Services: cover design, typesetting, ISBN assignment, printing, distribution, royalty management.
Printing: in-house facility + warehouse in Delhi; partners Repro India and Epitome Books.
Royalty: 80/20 split (80% to author). Net profit = MRP - printing cost - platform commission - shipping. Quarterly payouts within 45 days of quarter end. Minimum payout threshold 1000 INR rolling over. Bank transfer to linked account. Detailed breakdown per platform available.
ISBN: unique ISBN assigned by BookLeaf under BookLeaf imprint. To get author own imprint, obtain independently. ISBN errors reported treated high-priority, escalated to production.
Printing & Quality: standard turnaround 5-7 business days. Quality issues (misprints, binding, color) get free reprint after verification; may need photos. Reprint timeline 5-7 days.
Distribution: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store. New listings go live 7-10 business days after publication. Unavailable usually stock sync issue; re-sync within 24-48 hours.
Production stages: Manuscript Received -> Editing -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live. Updates via email. Delays typically Cover Design (waiting author approval) and Proofreading.
Tone: empathetic, professional, authors are partners. Acknowledge concern before solutions. Specific numbers/dates/statuses. Own BookLeaf faults. Clear timeline for escalation. End with clear next steps.`;

function buildAuthorContext(author, book) {
  if (!author) return "";
  const parts = [
    `Author: ${author.name} (${author.email}), city ${author.city}, joined ${author.joinedDate}.`,
  ];
  if (book) {
    parts.push(
      `Book: "${book.title}" (${book.id}), ISBN ${book.isbn || "N/A"}, genre ${book.genre}, status ${book.status}, publication ${book.publicationDate || "N/A"}, MRP ${book.mrp ?? "N/A"}, royalty per copy ${book.authorRoyaltyPerCopy ?? "N/A"}, sold ${book.totalCopiesSold}, earned ${book.totalRoyaltyEarned}, paid ${book.royaltyPaid}, pending ${book.royaltyPending}, last payout ${book.lastRoyaltyPayoutDate || "none"}, print partner ${book.printPartner || "N/A"}, platforms ${(Array.isArray(book.availableOn) ? book.availableOn : (function(v){try{return JSON.parse(v||"[]")}catch{return []}})(book.availableOn)).join(", ")}.`
    );
  }
  return parts.join(" ");
}

async function callLLM(systemPrompt, userPrompt) {
  const openai = getOpenAI();
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: config.openaiModel,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      return res.choices[0]?.message?.content?.trim() || "";
    } catch (e) {
      console.error("OpenAI error:", e.message);
    }
  }
  // Ollama fallback
  if (config.ollamaModel) {
    try {
      const resp = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        return j.message?.content?.trim() || "";
      }
    } catch (e) {
      console.error("Ollama error:", e.message);
    }
  }
  return null;
}

const VALID_CATEGORIES = ["Royalty & Payments", "ISBN & Metadata Issues", "Printing & Quality", "Distribution & Availability", "Book Status & Production Updates", "General Inquiry"];
const VALID_PRIORITIES = ["CRITICAL","HIGH","MEDIUM","LOW"];
export async function classifyTicket({ subject, description }) {
  const system = `You are a support ticket classifier for BookLeaf Publishing. Classify the ticket into exactly one category: "Royalty & Payments", "ISBN & Metadata Issues", "Printing & Quality", "Distribution & Availability", "Book Status & Production Updates", or "General Inquiry". Respond with JSON only: {"category":"...","confidence":0.0-1.0}.`;
  const user = `Subject: ${subject}\nDescription: ${description}`;
  const raw = await callLLM(system, user);
  if (raw) {
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (parsed.category && VALID_CATEGORIES.includes(parsed.category)) return parsed.category;
    } catch {}
    // try find category in text
    const cats = ["Royalty & Payments","ISBN & Metadata Issues","Printing & Quality","Distribution & Availability","Book Status & Production Updates","General Inquiry"];
    const found = cats.find(c => raw.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  // deterministic fallback
  const text = (subject + " " + description).toLowerCase();
  if (text.includes("royalt") || text.includes("payment") || text.includes("payout")) return "Royalty & Payments";
  if (text.includes("isbn") || text.includes("metadata")) return "ISBN & Metadata Issues";
  if (text.includes("print") || text.includes("quality") || text.includes("binding")) return "Printing & Quality";
  if (text.includes("unavailable") || text.includes("amazon") || text.includes("distribution")) return "Distribution & Availability";
  if (text.includes("typeset") || text.includes("production") || text.includes("status")) return "Book Status & Production Updates";
  return "General Inquiry";
}

export async function scorePriority({ subject, description }) {
  const system = `You are a support ticket priority scorer for BookLeaf. Score priority as one of CRITICAL, HIGH, MEDIUM, LOW based on impact/urgency. Respond JSON only: {"priority":"CRITICAL|HIGH|MEDIUM|LOW","reason":"..."}.`;
  const user = `Subject: ${subject}\nDescription: ${description}`;
  const raw = await callLLM(system, user);
  if (raw) {
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (parsed.priority && VALID_PRIORITIES.includes(parsed.priority)) return parsed.priority;
    } catch {}
    const found = ["CRITICAL","HIGH","MEDIUM","LOW"].find(p => raw.toUpperCase().includes(p));
    if (found) return found;
  }
  const text = (subject + " " + description).toLowerCase();
  if (text.includes("haven't received") && text.includes("royalt")) return "HIGH";
  if (text.includes("isbn") && (text.includes("error") || text.includes("wrong"))) return "HIGH";
  if (text.includes("urgent")) return "HIGH";
  return "MEDIUM";
}

export async function draftResponse({ ticket, author, book, history }) {
  const system = `You are a BookLeaf Publishing support representative. Use the knowledge base below. Tone: empathetic, professional, specific numbers/dates/status. Acknowledge concern before solution. Own BookLeaf faults. Clear timeline for escalation. End with clear next steps. Do not invent facts beyond provided context. Keep under 250 words.\n\nKNOWLEDGE BASE:\n${KNOWLEDGE_BASE}`;
  const ctx = buildAuthorContext(author, book);
  const hist = (history || []).map(r => `${r.fromAdmin ? "Admin" : "Author"}: ${r.body}`).join("\n");
  const user = `Ticket subject: ${ticket.subject}\nCategory: ${ticket.category || ticket.aiCategory}\nPriority: ${ticket.priority}\nDescription: ${ticket.description}\n${ctx}\n${hist ? "Prior messages:\n" + hist : ""}\n\nDraft a response to this author.`;
  const raw = await callLLM(system, user);
  if (raw) return raw;
  return `Hi ${author?.name || "there"},\n\nThank you for reaching out, and I'm sorry to hear about this. I've logged your concern and our team will review it shortly. Based on your account details${book ? ` for "${book.title}"` : ""}, we'll get back to you within 48 hours with a clear update and next steps.\n\nWarm regards,\nBookLeaf Support Team`;
}
