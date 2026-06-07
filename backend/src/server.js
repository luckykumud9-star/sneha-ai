const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 45 * 1024 * 1024 }
});

const PORT = process.env.PORT || 10000;

const supabaseUrl = (process.env.SUPABASE_URL || "")
  .replace("/rest/v1/", "")
  .replace("/rest/v1", "")
  .replace(/\/$/, "");

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const SNEHA_SYSTEM_PROMPT = `
Tum Sneha YS ho — Yash ki Hindi/Hinglish personal AI mentor, study coach, programming teacher, creator assistant aur life growth partner.

Rules:
- Hindi/Hinglish me friendly, caring, practical jawab do.
- Yash ko step-by-step guide karo.
- Study me zero se hero approach follow karo.
- Programming me concept, example, dry run, mistake, practice aur project do.
- Creator me plan -> lock -> generate -> review -> improve -> download workflow follow karo.
- Cybersecurity me sirf legal, ethical, defensive help do.
- Illegal hacking, password stealing, malware, private info stealing, unauthorized access kabhi mat sikhana.
- Agar user stressed ho to supportive tone me jawab do.
`;

async function logMission(module, event, details = "") {
  try {
    await supabase.from("mission_logs").insert({ module, event, details });
  } catch (err) {
    console.log("Mission log failed:", err.message);
  }
}

async function createJob(job_type, details = "") {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      job_type,
      status: "running",
      progress: 5,
      eta: "calculating",
      details
    })
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

async function updateJob(id, status, progress, details, eta = null) {
  try {
    await supabase
      .from("jobs")
      .update({
        status,
        progress,
        details,
        eta: eta || null
      })
      .eq("id", id);
  } catch (err) {
    console.log("Job update failed:", err.message);
  }
}

async function getMemories() {
  const { data } = await supabase
    .from("memories")
    .select("category,title,content")
    .order("created_at", { ascending: false })
    .limit(15);

  if (!data || data.length === 0) return "";
  return data
    .map((m, i) => `${i + 1}. [${m.category || "general"}] ${m.title || ""}: ${m.content || ""}`)
    .join("\n");
}

async function getRecentMessages() {
  const { data } = await supabase
    .from("messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";
  return data.reverse().map((m) => `${m.role}: ${m.content}`).join("\n");
}

async function buildPrompt(userMessage) {
  const memories = await getMemories();
  const history = await getRecentMessages();

  return `
${SNEHA_SYSTEM_PROMPT}

Saved Memories:
${memories || "Abhi koi saved memory nahi."}

Recent Chat:
${history || "Abhi koi recent chat nahi."}

Yash ka current message:
${userMessage}
`;
}

async function saveMessage(role, content, provider = null, source = "website") {
  try {
    await supabase.from("messages").insert({
      role,
      content,
      provider,
      source
    });
  } catch (err) {
    console.log("Save message failed:", err.message);
  }
}

async function saveMemoryIfImportant(message) {
  try {
    const t = message.toLowerCase();
    const important =
      t.includes("yaad rakh") ||
      t.includes("remember") ||
      t.includes("goal") ||
      t.includes("semester") ||
      t.includes("subject") ||
      t.includes("padhai") ||
      t.includes("career") ||
      t.includes("health") ||
      t.includes("creator") ||
      t.includes("programming");

    if (!important) return;

    await supabase.from("memories").insert({
      category: "auto",
      title: "Auto memory",
      content: message.slice(0, 700),
      importance: 2
    });
  } catch (err) {
    console.log("Memory save failed:", err.message);
  }
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30000 }
  );

  const reply =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) throw new Error("Gemini empty response");
  return reply;
}

async function askGroq(message) {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SNEHA_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq empty response");
  return reply;
}

async function askOpenRouter(message) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OpenRouter key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3.1-8b-instruct:free",
      messages: [
        { role: "system", content: SNEHA_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
        "X-Title": "Sneha YS"
      },
      timeout: 30000
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenRouter empty response");
  return reply;
}

async function askOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SNEHA_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenAI empty response");
  return reply;
}

async function askSneha(message) {
  const errors = {};

  try {
    return { provider: "gemini", reply: await askGemini(message) };
  } catch (err) {
    errors.gemini = err.response?.data || err.message;
  }

  try {
    return { provider: "groq", reply: await askGroq(message) };
  } catch (err) {
    errors.groq = err.response?.data || err.message;
  }

  try {
    return { provider: "openrouter", reply: await askOpenRouter(message) };
  } catch (err) {
    errors.openrouter = err.response?.data || err.message;
  }

  try {
    return { provider: "openai", reply: await askOpenAI(message) };
  } catch (err) {
    errors.openai = err.response?.data || err.message;
  }

  return {
    provider: "local",
    reply:
      "Yash ❤️ AI providers abhi unavailable/quota issue me ho sakte hain. Tum topic simple words me likho, main basic local help karungi.",
    debug: errors
  };
}

async function extractPdfText(buffer) {
  const parsed = await pdfParse(buffer);
  return (parsed.text || "").trim();
}

async function uploadToStorage(buffer, filename, mimetype, folder = "uploads") {
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const path = `${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("study-files")
    .upload(path, buffer, {
      contentType: mimetype,
      upsert: true
    });

  if (error) {
    console.log("Storage upload failed:", error.message);
    return null;
  }

  return path;
}

async function analyzeResource(resource) {
  if (!resource.content || resource.content.length < 80) {
    throw new Error("Readable content nahi mila. Scanned PDF/photo ke liye OCR required hai.");
  }

  const prompt = `
Uploaded study material ko sirf diye gaye content ke basis par analyze karo. Apni taraf se syllabus invent mat karo.

Title: ${resource.title}
Subject: ${resource.subject || "Unknown"}
Unit: ${resource.unit || "Unknown"}

Content:
${resource.content.slice(0, 18000)}

Output Hindi/Hinglish me:
1. Short summary
2. Detailed notes
3. Important points
4. Expected exam questions
5. 10 MCQs with answers
6. Flashcards
7. Last-minute revision plan
`;

  const result = await askSneha(prompt);

  const { data, error } = await supabase
    .from("pdf_analysis")
    .insert({
      resource_id: resource.id,
      summary: result.reply,
      notes: result.reply,
      mcqs: result.reply,
      flashcards: result.reply,
      expected_questions: result.reply
    })
    .select();

  if (error) throw new Error(error.message);

  return {
    provider: result.provider,
    reply: result.reply,
    analysis: data[0]
  };
}

function telegramKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["🎬 Create", "📚 Learn"],
        ["🧠 Sneha", "📊 Dashboard"],
        ["📂 Vault", "🌍 Opportunities"],
        ["⚙ Settings", "🩺 Health"]
      ],
      resize_keyboard: true
    }
  };
}

function splitTelegram(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3800) {
    chunks.push(text.slice(i, i + 3800));
  }
  return chunks;
}

/* =========================
   CORE ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Sneha YS Backend",
    message: "Sneha YS Backend Running"
  });
});

app.get("/health", async (req, res) => {
  const status = {
    success: true,
    service: "Sneha YS",
    status: "ok",
    supabaseUrlSet: Boolean(supabaseUrl),
    supabaseKeySet: Boolean(supabaseKey),
    geminiSet: Boolean(process.env.GEMINI_API_KEY),
    groqSet: Boolean(process.env.GROQ_API_KEY),
    openrouterSet: Boolean(process.env.OPENROUTER_API_KEY),
    openaiSet: Boolean(process.env.OPENAI_API_KEY),
    telegramSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    elevenlabsSet: Boolean(process.env.ELEVENLABS_API_KEY),
    falSet: Boolean(process.env.FAL_KEY),
    replicateSet: Boolean(process.env.REPLICATE_API_TOKEN),
    runwaySet: Boolean(process.env.RUNWAY_API_KEY),
    stabilitySet: Boolean(process.env.STABILITY_API_KEY),
    serpapiSet: Boolean(process.env.SERPAPI_API_KEY)
  };

  try {
    await supabase.from("health_checks").insert({
      service_name: "backend",
      status: "ok",
      last_error: null
    });
  } catch {}

  res.json(status);
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.json({ success: false, reply: "Yash, message khaali hai." });
    }

    await saveMessage("yash", message, null, "website");
    await saveMemoryIfImportant(message);

    const result = await askSneha(message);

    await saveMessage("sneha", result.reply, result.provider, "website");

    res.json({
      success: true,
      provider: result.provider,
      reply: result.reply,
      debug: result.debug || null
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/chat-test", async (req, res) => {
  const result = await askSneha("Sneha YS mujhe DBMS zero se samjhao");
  res.json({ success: true, ...result });
});

/* =========================
   MEMORY / MISSION / JOBS
========================= */

app.get("/memories", async (req, res) => {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/memories", async (req, res) => {
  const { category, title, content, importance } = req.body;

  const { data, error } = await supabase
    .from("memories")
    .insert({
      category: category || "manual",
      title: title || "Memory",
      content,
      importance: importance || 1
    })
    .select();

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.get("/mission", async (req, res) => {
  const { data, error } = await supabase
    .from("mission_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.get("/jobs", async (req, res) => {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/jobs", async (req, res) => {
  try {
    const job = await createJob(req.body.job_type || "manual", req.body.details || "");
    res.json({ success: true, data: [job] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =========================
   RESOURCES / PDF
========================= */

app.get("/resources", async (req, res) => {
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/resources", async (req, res) => {
  const { title, subject, unit, resource_type, content, file_url } = req.body;

  if (!title) {
    return res.json({ success: false, message: "title required hai" });
  }

  const { data, error } = await supabase
    .from("resources")
    .insert({
      title,
      subject,
      unit,
      resource_type: resource_type || "text",
      content,
      file_url
    })
    .select();

  await logMission("resources", "resource_created", title);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  let job = null;

  try {
    const { title, subject, unit } = req.body;

    if (!req.file) return res.json({ success: false, message: "File required hai" });
    if (!title) return res.json({ success: false, message: "Title required hai" });

    job = await createJob("file_upload_analysis", "File upload started");
    await updateJob(job.id, "running", 15, "Reading file", "1-3 min");

    let content = "";
    let resourceType = "file";

    if (req.file.mimetype === "application/pdf") {
      content = await extractPdfText(req.file.buffer);
