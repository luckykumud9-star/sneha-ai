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
      resourceType = "pdf";

      if (!content || content.length < 80) {
        await updateJob(job.id, "failed", 100, "PDF readable text nahi mila", "0");
        return res.json({
          success: false,
          message:
            "PDF upload hui, lekin readable text nahi mila. Ye scanned/photo PDF lag rahi hai. OCR next version me add karna hoga."
        });
      }
    } else if (req.file.mimetype.startsWith("image/")) {
      content = "Image uploaded. OCR/vision analysis advanced route me add hoga.";
      resourceType = "image";
    } else if (req.file.mimetype.startsWith("video/")) {
      content = "Video uploaded. Video analysis/shorts workflow creator route me handle hoga.";
      resourceType = "video";
    } else {
      content = "File uploaded.";
    }

    await updateJob(job.id, "running", 35, "Uploading to storage", "1-2 min");

    const storagePath = await uploadToStorage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      subject || "general"
    );

    const { data: saved, error } = await supabase
      .from("resources")
      .insert({
        title,
        subject,
        unit,
        resource_type: resourceType,
        content: content.slice(0, 20000),
        file_url: storagePath
      })
      .select();

    if (error) throw new Error(error.message);

    await updateJob(job.id, "running", 60, "Analyzing content", "1 min");

    let analysis = null;
    if (resourceType === "pdf") {
      analysis = await analyzeResource(saved[0]);
    }

    await updateJob(job.id, "completed", 100, "Upload and analysis completed", "0");
    await logMission("resources", "file_analyzed", title);

    res.json({
      success: true,
      data: saved,
      preview: content.slice(0, 600),
      extractedTextLength: content.length,
      analysis
    });
  } catch (err) {
    if (job) await updateJob(job.id, "failed", 100, err.message, "0");
    res.json({ success: false, error: err.message });
  }
});

app.post("/resources/:id/analyze", async (req, res) => {
  let job = null;

  try {
    job = await createJob("resource_analysis", "Resource analysis started");
    await updateJob(job.id, "running", 25, "Loading resource", "1 min");

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) throw new Error(error.message);

    await updateJob(job.id, "running", 55, "AI analysis running", "1 min");

    const analysis = await analyzeResource(data);

    await updateJob(job.id, "completed", 100, "Analysis completed", "0");

    res.json({ success: true, ...analysis });
  } catch (err) {
    if (job) await updateJob(job.id, "failed", 100, err.message, "0");
    res.json({ success: false, error: err.message });
  }
});

/* =========================
   CREATOR PROJECTS
========================= */

app.get("/projects", async (req, res) => {
  const { data, error } = await supabase
    .from("creator_projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/projects", async (req, res) => {
  try {
    const {
      title,
      category,
      platform,
      style,
      voice_type,
      story
    } = req.body;

    if (!title) return res.json({ success: false, message: "title required hai" });

    const { data, error } = await supabase
      .from("creator_projects")
      .insert({
        title,
        category,
        platform,
        style,
        voice_type,
        story,
        status: "draft"
      })
      .select();

    if (error) throw new Error(error.message);

    await logMission("creator", "project_created", title);

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/projects/:id/blueprint", async (req, res) => {
  let job = null;

  try {
    job = await createJob("creator_blueprint", "Creator blueprint started");

    const { data: project, error } = await supabase
      .from("creator_projects")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) throw new Error(error.message);

    await updateJob(job.id, "running", 30, "AI director planning", "1-2 min");

    const prompt = `
Sneha YS Creator Studio ke liye full production blueprint banao.

Project:
Title: ${project.title}
Category: ${project.category}
Platform: ${project.platform}
Style: ${project.style}
Voice: ${project.voice_type}

Story/Idea:
${project.story || "AI best story suggest kare"}

Output:
1. Requirement lock summary
2. Category/goal/platform validation
3. Character plan
4. Voice casting plan
5. Scene-by-scene storyboard
6. Image prompts
7. Video/motion prompts
8. Music/SFX plan
9. AI editor plan
10. Shorts ideas
11. Title/description/tags/hashtags
12. Download/export checklist
13. Risks + quality improvements
`;

    const result = await askSneha(prompt);

    await updateJob(job.id, "completed", 100, "Blueprint completed", "0");
    await logMission("creator", "blueprint_generated", project.title);

    res.json({
      success: true,
      provider: result.provider,
      reply: result.reply
    });
  } catch (err) {
    if (job) await updateJob(job.id, "failed", 100, err.message, "0");
    res.json({ success: false, error: err.message });
  }
});

/* =========================
   OPPORTUNITIES
========================= */

app.get("/opportunities", async (req, res) => {
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/opportunities/search", async (req, res) => {
  try {
    const query =
      req.body.query ||
      "free certificates scholarships internships govt exams for Indian students computer science";

    if (!process.env.SERPAPI_API_KEY) {
      return res.json({
        success: false,
        message: "SERPAPI_API_KEY missing hai"
      });
    }

    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: query,
        api_key: process.env.SERPAPI_API_KEY,
        engine: "google"
      },
      timeout: 30000
    });

    const results = response.data?.organic_results || [];

    const saved = [];

    for (const item of results.slice(0, 8)) {
      const { data } = await supabase
        .from("opportunities")
        .insert({
          title: item.title,
          type: "search",
          description: item.snippet,
          link: item.link,
          deadline: null
        })
        .select();

      if (data?.[0]) saved.push(data[0]);
    }

    res.json({ success: true, data: saved });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =========================
   PROVIDERS / SELF HEAL BASIC
========================= */

app.get("/providers", async (req, res) => {
  const providers = [
    { name: "Gemini", active: Boolean(process.env.GEMINI_API_KEY), type: "chat" },
    { name: "Groq", active: Boolean(process.env.GROQ_API_KEY), type: "chat" },
    { name: "OpenRouter", active: Boolean(process.env.OPENROUTER_API_KEY), type: "chat" },
    { name: "OpenAI", active: Boolean(process.env.OPENAI_API_KEY), type: "chat" },
    { name: "ElevenLabs", active: Boolean(process.env.ELEVENLABS_API_KEY), type: "voice" },
    { name: "Fal", active: Boolean(process.env.FAL_KEY), type: "media" },
    { name: "Replicate", active: Boolean(process.env.REPLICATE_API_TOKEN), type: "media" },
    { name: "Runway", active: Boolean(process.env.RUNWAY_API_KEY), type: "video" },
    { name: "Stability", active: Boolean(process.env.STABILITY_API_KEY), type: "image" },
    { name: "SerpAPI", active: Boolean(process.env.SERPAPI_API_KEY), type: "search" }
  ];

  res.json({ success: true, data: providers });
});

app.post("/doctor", async (req, res) => {
  const errorText = req.body.error || "";

  const prompt = `
Sneha YS Error Doctor mode.

Error:
${errorText}

Output:
1. Error ka simple reason
2. Impact
3. Exact fix steps
4. Kaunsi file/env/table check karni hai
5. Future prevention
Hindi/Hinglish me batao.
`;

  const result = await askSneha(prompt);

  res.json({
    success: true,
    provider: result.provider,
    reply: result.reply
  });
});

/* =========================
   TELEGRAM BOT
========================= */

if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true
  });

  bot.on("polling_error", (err) => {
    console.log("Telegram polling error:", err.message);
  });

  bot.onText(/\/start/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Namaste Yash ❤️ Main Sneha YS hoon. Website aur Telegram dono par tumhari AI mentor, creator assistant aur study coach.",
      telegramKeyboard()
    );
  });

  bot.on("document", async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, "File mili ✅ PDF text read kar rahi hoon...");

      const filePath = await bot.downloadFile(msg.document.file_id, "/tmp");
      const fs = require("fs");
      const buffer = fs.readFileSync(filePath);

      if (msg.document.mime_type !== "application/pdf") {
        return bot.sendMessage(
          msg.chat.id,
          "Abhi Telegram par real analysis text-based PDF ke liye enabled hai. Dusri file ke liye website upload use karo.",
          telegramKeyboard()
        );
      }

      const text = await extractPdfText(buffer);

      if (!text || text.length < 80) {
        return bot.sendMessage(
          msg.chat.id,
          "PDF me readable text nahi mila. Ye scanned/photo PDF lag rahi hai. OCR later add karenge.",
          telegramKeyboard()
        );
      }

      const { data, error } = await supabase
        .from("resources")
        .insert({
          title: msg.document.file_name || "Telegram PDF",
          subject: "Telegram Upload",
          unit: null,
          resource_type: "pdf",
          content: text.slice(0, 20000),
          file_url: null
        })
        .select();

      if (error) throw new Error(error.message);

      await bot.sendMessage(
        msg.chat.id,
        "PDF saved ✅\nText length: " + text.length + "\nAnalysis bana rahi hoon..."
      );

      const analysis = await analyzeResource(data[0]);

      for (const part of splitTelegram(analysis.reply)) {
        await bot.sendMessage(msg.chat.id, part, telegramKeyboard());
      }
    } catch (err) {
      await bot.sendMessage(
        msg.chat.id,
        "PDF process error: " + err.message,
        telegramKeyboard()
      );
    }
  });

  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/start")) return;

      if (msg.text === "🎬 Create") {
        return bot.sendMessage(
          msg.chat.id,
          "🎬 Creator Studio\n\nVideo banana start karne ke liye likho:\ncreate project: title | category | platform | style | voice | story",
          telegramKeyboard()
        );
      }

      if (msg.text === "📚 Learn") {
        return bot.sendMessage(
          msg.chat.id,
          "📚 Academy\nPDF bhejo ya pucho:\nPython zero se sikhao\nDBMS ka roadmap banao\nWebsite kaise banti hai?",
          telegramKeyboard()
        );
      }

      if (msg.text === "📊 Dashboard") {
        const { data } = await supabase
          .from("jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        const text =
          !data || data.length === 0
            ? "Abhi koi running job nahi."
            : data
                .map(
                  (j, i) =>
                    `${i + 1}. ${j.job_type} — ${j.status} — ${j.progress}%\n${j.details || ""}`
                )
                .join("\n\n");

        return bot.sendMessage(msg.chat.id, text, telegramKeyboard());
      }

      if (msg.text === "🩺 Health") {
        const health =
          "Sneha YS Health:\n" +
          "Gemini: " + (process.env.GEMINI_API_KEY ? "✅" : "❌") + "\n" +
          "Groq: " + (process.env.GROQ_API_KEY ? "✅" : "❌") + "\n" +
          "OpenRouter: " + (process.env.OPENROUTER_API_KEY ? "✅" : "❌") + "\n" +
          "Telegram: ✅\n" +
          "Supabase: " + (supabaseKey ? "✅" : "❌");

        return bot.sendMessage(msg.chat.id, health, telegramKeyboard());
      }

      if (msg.text.toLowerCase().startsWith("create project:")) {
        const raw = msg.text.replace(/create project:/i, "").trim();
        const parts = raw.split("|").map((p) => p.trim());

        const { data, error } = await supabase
          .from("creator_projects")
          .insert({
            title: parts[0] || "Telegram Creator Project",
            category: parts[1] || "AI Character Story",
            platform: parts[2] || "YouTube Shorts",
            style: parts[3] || "Cinematic",
            voice_type: parts[4] || "Young Hindi Female",
            story: parts[5] || raw,
            status: "draft"
          })
          .select();

        if (error) throw new Error(error.message);

        return bot.sendMessage(
          msg.chat.id,
          "Project created ✅\nID: " + data[0].id + "\nWebsite me blueprint generate kar sakte ho.",
          telegramKeyboard()
        );
      }

      await saveMessage("telegram-yash", msg.text, null, "telegram");
      await saveMemoryIfImportant(msg.text);

      const result = await askSneha(msg.text);

      await saveMessage("telegram-sneha", result.reply, result.provider, "telegram");

      for (const part of splitTelegram(result.reply)) {
        await bot.sendMessage(msg.chat.id, part, telegramKeyboard());
      }
    } catch (err) {
      await bot.sendMessage(
        msg.chat.id,
        "Yash ❤️ Telegram error: " + err.message,
        telegramKeyboard()
      );
    }
  });

  console.log("Sneha YS Telegram Bot Running");
}

app.listen(PORT, () => {
  console.log("Sneha YS backend running on port " + PORT);
});
