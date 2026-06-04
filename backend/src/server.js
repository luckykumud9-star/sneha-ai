const express = require("express");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 45 * 1024 * 1024 },
});

const PORT = process.env.PORT || 10000;

const supabaseUrl = (process.env.SUPABASE_URL || "")
  .replace("/rest/v1/", "")
  .replace("/rest/v1", "")
  .replace(/\/$/, "");

const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const SNEHA_PROMPT = `
Tum Sneha AI ho, Yash ki Hindi/Hinglish personal AI mentor.
Tum padhai, coding, health, career, opportunities, creator tools, reminders aur personal growth me help karti ho.
Hindi/Hinglish me jawab do. Yash ko naam se address karo.
Beginner-friendly, step-by-step, caring aur supportive jawab do.
Stress me emotional support do.
Illegal hacking, password stealing, malware, private info extraction ya unauthorized access mat sikhana.
Cybersecurity me sirf ethical, defensive aur legal guidance do.
`;

async function getMemoryText() {
  const { data } = await supabase
    .from("memories")
    .select("memory_text")
    .order("created_at", { ascending: false })
    .limit(10);
  return data?.map((m, i) => `${i + 1}. ${m.memory_text}`).join("\n") || "";
}

async function getRecentHistoryText() {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .order("created_at", { ascending: false })
    .limit(10);

  return data?.reverse().map((m) => `${m.role}: ${m.content}`).join("\n") || "";
}

async function buildPrompt(message) {
  const memories = await getMemoryText();
  const history = await getRecentHistoryText();

  return `
${SNEHA_PROMPT}

Saved memories:
${memories || "Abhi koi memory nahi."}

Recent chat:
${history || "Abhi koi recent chat nahi."}

Yash ka message:
${message}
`;
}

async function saveMessage(role, content, provider = null) {
  await supabase.from("messages").insert({ role, content, provider });
}

async function saveImportantMemory(message) {
  const t = message.toLowerCase();
  const shouldSave =
    t.includes("yaad rakh") ||
    t.includes("remember") ||
    t.includes("goal") ||
    t.includes("semester") ||
    t.includes("subject") ||
    t.includes("padhai") ||
    t.includes("career") ||
    t.includes("health") ||
    t.includes("stress");

  if (!shouldSave) return;

  await supabase.from("memories").insert({
    memory_text: message.slice(0, 500),
  });
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini key missing");
  const prompt = await buildPrompt(message);

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30000 }
  );

  const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Gemini empty response");
  return reply;
}

async function askGroq(message) {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq key missing");
  const prompt = await buildPrompt(message);

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SNEHA_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const reply = res.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq empty response");
  return reply;
}

async function askOpenRouter(message) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OpenRouter key missing");
  const prompt = await buildPrompt(message);

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3.1-8b-instruct:free",
      messages: [
        { role: "system", content: SNEHA_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sneha-ai.vercel.app",
        "X-Title": "Sneha AI",
      },
      timeout: 30000,
    }
  );

  const reply = res.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenRouter empty response");
  return reply;
}

async function askOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI key missing");
  const prompt = await buildPrompt(message);

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SNEHA_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const reply = res.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenAI empty response");
  return reply;
}

async function askSneha(message) {
  const errors = {};

  try {
    return { provider: "gemini", reply: await askGemini(message) };
  } catch (e) {
    errors.gemini = e.response?.data || e.message;
  }

  try {
    return { provider: "groq", reply: await askGroq(message) };
  } catch (e) {
    errors.groq = e.response?.data || e.message;
  }

  try {
    return { provider: "openrouter", reply: await askOpenRouter(message) };
  } catch (e) {
    errors.openrouter = e.response?.data || e.message;
  }

  try {
    return { provider: "openai", reply: await askOpenAI(message) };
  } catch (e) {
    errors.openai = e.response?.data || e.message;
  }

  return {
    provider: "local",
    reply: "Yash ❤️ AI providers busy hain, lekin main basic help kar sakti hoon. Topic simple words me likho.",
    debug: errors,
  };
}

async function saveResource({ title, subject, unit, resource_type, content, file_url, source }) {
  const { data, error } = await supabase
    .from("resources")
    .insert({
      title,
      subject,
      unit: unit || null,
      resource_type: resource_type || "text",
      content: content || null,
      file_url: file_url || null,
      source: source || "manual",
    })
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

async function uploadToSupabaseStorage(fileBuffer, fileName, mimeType, subject = "General") {
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const path = `${subject}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("study-files")
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) return null;
  return path;
}

async function analyzeResourceById(id) {
  const { data: resources, error } = await supabase
    .from("resources")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error || !resources || resources.length === 0) {
    throw new Error("Resource nahi mila");
  }

  const r = resources[0];

  const prompt = `
Is study resource ko exam ke hisaab se analyze karo.

Subject: ${r.subject}
Unit: ${r.unit || "Unknown"}
Title: ${r.title}
Type: ${r.resource_type}

Content:
${r.content || r.file_url || "No content"}

Hindi/Hinglish output:
1. Short summary
2. Important points
3. Important exam questions
4. 10 MCQs with answers
5. Last-minute revision notes
`;

  const result = await askSneha(prompt);

  const { data, error: insertError } = await supabase
    .from("resource_summaries")
    .insert({
      resource_id: id,
      summary: result.reply,
      important_points: result.reply,
      important_questions: result.reply,
      mcqs: result.reply,
      revision_notes: result.reply,
    })
    .select();

  if (insertError) throw new Error(insertError.message);

  return { provider: result.provider, reply: result.reply, data };
}

app.get("/", (req, res) => {
  res.json({ success: true, message: "Sneha AI Backend Running" });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Sneha AI",
    supabaseUrlSet: Boolean(supabaseUrl),
    supabaseKeySet: Boolean(supabaseKey),
    geminiSet: Boolean(process.env.GEMINI_API_KEY),
    groqSet: Boolean(process.env.GROQ_API_KEY),
    openrouterSet: Boolean(process.env.OPENROUTER_API_KEY),
    openaiSet: Boolean(process.env.OPENAI_API_KEY),
    telegramSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
});

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message?.trim()) {
    return res.json({ success: false, reply: "Yash, message khaali hai." });
  }

  await saveMessage("yash", message);
  await saveImportantMemory(message);

  const result = await askSneha(message);

  await saveMessage("sneha", result.reply, result.provider);

  res.json({
    success: true,
    provider: result.provider,
    reply: result.reply,
    debug: result.debug || null,
  });
});

app.get("/chat-test", async (req, res) => {
  const result = await askSneha("Sneha mujhe DBMS zero se samjhao");
  res.json({ success: true, ...result });
});

app.get("/history", async (req, res) => {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.get("/memories", async (req, res) => {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/resources", async (req, res) => {
  try {
    const { title, subject, unit, resource_type, content, file_url, source } = req.body;

    if (!title || !subject) {
      return res.json({ success: false, message: "title aur subject required hai" });
    }

    const resource = await saveResource({
      title,
      subject,
      unit,
      resource_type,
      content,
      file_url,
      source,
    });

    res.json({ success: true, data: [resource] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/resources", async (req, res) => {
  const { subject } = req.query;

  let query = supabase
    .from("resources")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (subject) query = query.eq("subject", subject);

  const { data, error } = await query;

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.delete("/resources/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("resources")
    .update({ status: "deleted" })
    .eq("id", req.params.id)
    .select();

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/resources/:id/analyze", async (req, res) => {
  try {
    const result = await analyzeResourceById(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/resource-summaries", async (req, res) => {
  const { resource_id } = req.query;

  let query = supabase
    .from("resource_summaries")
    .select("*")
    .order("created_at", { ascending: false });

  if (resource_id) query = query.eq("resource_id", resource_id);

  const { data, error } = await query;

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { title, subject, unit } = req.body;

    if (!req.file) {
      return res.json({ success: false, message: "File required hai" });
    }

    if (!title || !subject) {
      return res.json({ success: false, message: "title aur subject required hai" });
    }

    let extractedText = "";
    let resourceType = "file";

    if (req.file.mimetype === "application/pdf") {
      const parsed = await pdfParse(req.file.buffer);
      extractedText = parsed.text?.slice(0, 20000) || "";
      resourceType = "pdf";
    } else if (req.file.mimetype.startsWith("image/")) {
      extractedText = "Image upload hui hai. OCR/image reading next version me add hogi.";
      resourceType = "image";
    } else if (req.file.mimetype.startsWith("video/")) {
      extractedText = "Video upload hua hai. Video lecture analysis next version me add hoga.";
      resourceType = "video";
    }

    const storagePath = await uploadToSupabaseStorage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      subject
    );

    const resource = await saveResource({
      title,
      subject,
      unit,
      resource_type: resourceType,
      content: extractedText,
      file_url: storagePath,
      source: "upload",
    });

    res.json({
      success: true,
      message: "File upload aur resource save ho gaya",
      data: [resource],
      extractedTextPreview: extractedText.slice(0, 500),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/creator-status", (req, res) => {
  res.json({
    success: true,
    creatorStudio: {
      scriptAI: Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY),
      voiceAI: Boolean(process.env.ELEVENLABS_API_KEY),
      imageAI: Boolean(process.env.STABILITY_API_KEY || process.env.HUGGINGFACE_API_KEY || process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY),
      videoAI: Boolean(process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY || process.env.RUNWAY_API_KEY),
      alerts: Boolean(process.env.SERPAPI_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY),
      weather: Boolean(process.env.OPENWEATHER_API_KEY),
    },
  });
});

function telegramKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["📚 Study Hub", "🧠 Memory"],
        ["📎 Add Resource", "📋 My Resources"],
        ["🎯 Goals", "🎬 Creator Studio"],
        ["❤️ Health", "🤖 Ask Sneha"],
      ],
      resize_keyboard: true,
    },
  };
}

function splitTelegramMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3900) chunks.push(text.slice(i, i + 3900));
  return chunks;
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("polling_error", (error) => {
    console.log("Telegram polling error:", error.message);
  });

  bot.onText(/\/start/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Namaste Yash ❤️ Main Sneha AI hoon. Website aur Telegram dono par tumhari same AI mentor.",
      telegramKeyboard()
    );
  });

  bot.on("document", async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, "File mil gayi Yash ❤️ process kar rahi hoon...");

      const file = await bot.getFile(msg.document.file_id);
      const filePath = await bot.downloadFile(msg.document.file_id, "/tmp");
      const buffer = fs.readFileSync(filePath);

      let extractedText = "";
      let type = "file";

      if (msg.document.mime_type === "application/pdf") {
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text?.slice(0, 20000) || "";
        type = "pdf";
      }

      const title = msg.document.file_name || "Telegram Resource";
      const subject = "Telegram Upload";

      const storagePath = await uploadToSupabaseStorage(
        buffer,
        title,
        msg.document.mime_type || "application/octet-stream",
        subject
      );

      const resource = await saveResource({
        title,
        subject,
        unit: null,
        resource_type: type,
        content: extractedText || "Telegram file uploaded.",
        file_url: storagePath || file.file_path,
        source: "telegram",
      });

      await bot.sendMessage(
        msg.chat.id,
        `Saved ✅\nTitle: ${title}\nAb Sneha isko analyze kar sakti hai.`
      );

      if (extractedText) {
        const analysis = await analyzeResourceById(resource.id);
        for (const part of splitTelegramMessage(analysis.reply)) {
          await bot.sendMessage(msg.chat.id, part);
        }
      }
    } catch (err) {
      console.log("Telegram document error:", err.message);
      await bot.sendMessage(msg.chat.id, "Yash, file process me issue aa gaya.");
    }
  });

  bot.on("photo", async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Photo mil gayi Yash ✅ Image OCR next step me add karenge. Abhi text/PDF best work karega."
    );
  });

  bot.on("video", async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Video mil gaya Yash ✅ Video lecture analysis next step me add karenge."
    );
  });

  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/start")) return;

      if (msg.text === "📚 Study Hub") {
        return bot.sendMessage(
          msg.chat.id,
          "Study Hub 📚\nTum PDF/text/topic bhej sakte ho. Example:\nDBMS Unit 1 Normalization samjhao"
        );
      }

      if (msg.text === "🧠 Memory") {
        const memories = await getMemoryText();
        return bot.sendMessage(msg.chat.id, memories || "Abhi koi memory save nahi hai.");
      }

      if (msg.text === "📎 Add Resource") {
        return bot.sendMessage(
          msg.chat.id,
          "Resource add karne ke liye PDF bhejo ya text likho:\nadd resource: DBMS Unit 1 - Database basics"
        );
      }

      if (msg.text === "📋 My Resources") {
        const { data } = await supabase
          .from("resources")
          .select("title, subject, unit, resource_type")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(10);

        if (!data || data.length === 0) {
          return bot.sendMessage(msg.chat.id, "Abhi koi resource save nahi hai.");
        }

        const list = data
          .map((r, i) => `${i + 1}. ${r.title} — ${r.subject} ${r.unit || ""} (${r.resource_type})`)
          .join("\n");

        return bot.sendMessage(msg.chat.id, list);
      }

      if (msg.text === "🎯 Goals") {
        return bot.sendMessage(
          msg.chat.id,
          "Tumhara main goal: backlog + 4th sem clear karna, coding strong karna, career banana ❤️"
        );
      }

      if (msg.text === "🎬 Creator Studio") {
        return bot.sendMessage(
          msg.chat.id,
          "Creator Studio 🎬\nBolo: Sneha, DBMS topic ka YouTube script banao."
        );
      }

      if (msg.text === "❤️ Health") {
        return bot.sendMessage(
          msg.chat.id,
          "Health mode ❤️\nPaani piyo, aankhon ko rest do, aur 25 min study + 5 min break follow karo."
        );
      }

      if (msg.text.toLowerCase().startsWith("add resource:")) {
        const content = msg.text.replace(/add resource:/i, "").trim();

        const resource = await saveResource({
          title: content.slice(0, 60),
          subject: "Telegram Text",
          unit: null,
          resource_type: "text",
          content,
          file_url: null,
          source: "telegram",
        });

        return bot.sendMessage(msg.chat.id, `Resource saved ✅\nID: ${resource
