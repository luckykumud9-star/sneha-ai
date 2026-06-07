const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
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
- Greeting par sirf warm greeting do, purana DBMS/syllabus context force mat karo.
- Yash ko step-by-step guide karo.
- Study me zero se hero approach follow karo.
- Programming me concept, example, dry run, mistake, practice aur project do.
- Creator me plan -> lock -> generate -> review -> improve -> download workflow follow karo.
- Cybersecurity me sirf legal, ethical, defensive help do.
- Illegal hacking, password stealing, malware, private info stealing, unauthorized access kabhi mat sikhana.
`;

function isGreetingOnly(message = "") {
  const t = message.toLowerCase().trim();
  return ["hi", "hello", "hey", "hii", "helo", "namaste", "namaskar", "ok", "hmm"].includes(t);
}

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
async function getMemories(userMessage = "") {
  if (isGreetingOnly(userMessage)) return "";

  const text = userMessage.toLowerCase();

  const memoryKeywords = [
    "yaad",
    "remember",
    "goal",
    "semester",
    "subject",
    "dbms",
    "python",
    "coding",
    "creator",
    "video",
    "health",
    "career",
    "syllabus",
    "exam",
    "notes",
    "pdf",
    "project",
    "sneha",
    "yash"
  ];

  const shouldUseMemory = memoryKeywords.some((k) => text.includes(k));
  if (!shouldUseMemory) return "";

  const { data } = await supabase
    .from("memories")
    .select("category,title,content")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) return "";

  return data
    .map(
      (m, i) =>
        `${i + 1}. [${m.category || "general"}] ${m.title || ""}: ${
          m.content || ""
        }`
    )
    .join("\n");
}

async function getRecentMessages(userMessage = "") {
  if (isGreetingOnly(userMessage)) return "";

  const { data } = await supabase
    .from("messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) return "";
  return data.reverse().map((m) => `${m.role}: ${m.content}`).join("\n");
}

async function buildPrompt(userMessage) {
  const memories = await getMemories(userMessage);
  const history = await getRecentMessages(userMessage);

  return `
${SNEHA_SYSTEM_PROMPT}

Relevant Memories:
${memories || "No relevant memory for this message."}

Recent Relevant Chat:
${history || "No relevant recent chat."}

Important:
Agar current message sirf greeting hai jaise Hi, Hello, Namaste, to normal greeting do. Purane syllabus, DBMS ya PDF context ko force mat karo.

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
      t.includes("programming") ||
      t.includes("mera syllabus") ||
      t.includes("meri story");

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

  const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
  const safeFolder = (folder || "uploads").replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const path = `${safeFolder}/${Date.now()}-${safeName}`;

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
    throw new Error(
      "Readable content nahi mila. Scanned PDF/photo ke liye OCR required hai."
    );
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
7. Common mistakes
8. Last-minute revision plan
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

async function saveAsset({ project_id, asset_type, file_url }) {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: project_id || null,
      asset_type,
      file_url
    })
    .select();

  if (error) throw new Error(error.message);
  return data[0];
}

function splitTelegram(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3800) {
    chunks.push(text.slice(i, i + 3800));
  }
  return chunks;
}

function mainTelegramKeyboard() {
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

function creatorTelegramKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["🎥 Video Project", "🖼 Image Studio"],
        ["🎭 Characters", "🎙 Voice"],
        ["📋 My Projects", "🔙 Main Menu"]
      ],
      resize_keyboard: true
    }
  };
}

function learnTelegramKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["📄 Upload PDF", "💻 Programming"],
        ["🧠 Quiz", "📚 My Resources"],
        ["🎓 Certificates", "🔙 Main Menu"]
      ],
      resize_keyboard: true
    }
  };
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
  const health = {
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

  res.json(health);
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.json({
        success: false,
        reply: "Yash, message khaali hai."
      });
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
    res.json({
      success: false,
      error: err.message
    });
  }
});

app.get("/chat-test", async (req, res) => {
  const result = await askSneha("Hi");
  res.json({
    success: true,
    provider: result.provider,
    reply: result.reply,
    debug: result.debug || null
  });
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

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.post("/memories", async (req, res) => {
  const { category, title, content, importance } = req.body;

  if (!content) {
    return res.json({
      success: false,
      message: "content required hai"
    });
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({
      category: category || "manual",
      title: title || "Memory",
      content,
      importance: importance || 1
    })
    .select();

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.get("/mission", async (req, res) => {
  const { data, error } = await supabase
    .from("mission_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.get("/jobs", async (req, res) => {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.post("/jobs", async (req, res) => {
  try {
    const job = await createJob(
      req.body.job_type || "manual",
      req.body.details || ""
    );

    res.json({
      success: true,
      data: [job]
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
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

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.post("/resources", async (req, res) => {
  const { title, subject, unit, resource_type, content, file_url } = req.body;

  if (!title) {
    return res.json({
      success: false,
      message: "title required hai"
    });
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

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});
app.post("/upload", upload.single("file"), async (req, res) => {
  let job = null;

  try {
    const { title, subject, unit } = req.body;

    if (!req.file) {
      return res.json({
        success: false,
        message: "File required hai"
      });
    }

    if (!title) {
      return res.json({
        success: false,
        message: "Title required hai"
      });
    }

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
            "PDF upload hui, lekin readable text nahi mila. Ye scanned/photo PDF lag rahi hai. OCR next phase me add karna hoga."
        });
      }
    } else if (req.file.mimetype.startsWith("image/")) {
      content = "Image uploaded. OCR/vision analysis next phase me add hoga.";
      resourceType = "image";
    } else if (req.file.mimetype.startsWith("video/")) {
      content =
        "Video uploaded. Video analysis/shorts workflow creator route me handle hoga.";
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

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

app.post("/projects", async (req, res) => {
  try {
    const { title, category, platform, style, voice_type, story } = req.body;

    if (!title) {
      return res.json({
        success: false,
        message: "title required hai"
      });
    }

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
   MEDIA ENGINE: IMAGE + VOICE
========================= */

app.post("/media/image", async (req, res) => {
  let job = null;

  try {
    const { prompt, project_id, style } = req.body;

    if (!prompt) {
      return res.json({ success: false, message: "prompt required hai" });
    }

    if (!process.env.STABILITY_API_KEY) {
      throw new Error("STABILITY_API_KEY missing hai");
    }

    job = await createJob("image_generation", "Generating image");
    await updateJob(job.id, "running", 20, "Trying Stability AI", "1-2 min");

    const formData = new FormData();
    formData.append(
      "prompt",
      prompt + "\nStyle: " + (style || "cinematic, high quality, detailed")
    );
    formData.append("output_format", "png");

    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      formData,
      {
        headers: {
          Authorization: "Bearer " + process.env.STABILITY_API_KEY,
          Accept: "image/*"
        },
        responseType: "arraybuffer",
        timeout: 60000
      }
    );

    await updateJob(job.id, "running", 70, "Saving image", "30 sec");

    const buffer = Buffer.from(response.data);
    const storagePath = await uploadToStorage(
      buffer,
      "sneha-ys-image.png",
      "image/png",
      "media-images"
    );

    const asset = await saveAsset({
      project_id,
      asset_type: "image",
      file_url: storagePath
    });

    await updateJob(job.id, "completed", 100, "Image generated", "0");

    res.json({
      success: true,
      provider: "stability",
      asset,
      file_url: storagePath
    });
  } catch (err) {
    if (job) await updateJob(job.id, "failed", 100, err.message, "0");
    res.json({ success: false, error: err.message });
  }
});

app.post("/media/voice", async (req, res) => {
  let job = null;

  try {
    const { text, project_id, voice_id } = req.body;

    if (!text) {
      return res.json({ success: false, message: "text required hai" });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY missing hai");
    }

    job = await createJob("voice_generation", "Generating Hindi voice");
    await updateJob(job.id, "running", 25, "Calling ElevenLabs", "1-2 min");

    const selectedVoice =
      voice_id || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/" + selectedVoice,
      {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        responseType: "arraybuffer",
        timeout: 60000
      }
    );

    await updateJob(job.id, "running", 70, "Saving voice audio", "30 sec");

    const buffer = Buffer.from(response.data);
    const storagePath = await uploadToStorage(
      buffer,
      "sneha-ys-voice.mp3",
      "audio/mpeg",
      "media-voices"
    );

    const asset = await saveAsset({
      project_id,
      asset_type: "voice",
      file_url: storagePath
    });

    await updateJob(job.id, "completed", 100, "Voice generated", "0");

    res.json({
      success: true,
      provider: "elevenlabs",
      asset,
      file_url: storagePath
    });
  } catch (err) {
    if (job) await updateJob(job.id, "failed", 100, err.message, "0");
    res.json({ success: false, error: err.message });
  }
});
app.get("/assets", async (req, res) => {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
});

/* =========================
   OPPORTUNITIES / PROVIDERS / DOCTOR
========================= */

app.get("/opportunities", async (req, res) => {
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
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
      mainTelegramKeyboard()
    );
  });

  bot.on("document", async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, "File mili ✅ PDF text read kar rahi hoon...");

      const filePath = await bot.downloadFile(msg.document.file_id, "/tmp");
      const buffer = fs.readFileSync(filePath);

      if (msg.document.mime_type !== "application/pdf") {
        return bot.sendMessage(
          msg.chat.id,
          "Abhi Telegram par real analysis text-based PDF ke liye enabled hai. Dusri file ke liye website upload use karo.",
          mainTelegramKeyboard()
        );
      }

      const text = await extractPdfText(buffer);

      if (!text || text.length < 80) {
        return bot.sendMessage(
          msg.chat.id,
          "PDF me readable text nahi mila. Ye scanned/photo PDF lag rahi hai. OCR next phase me add karenge.",
          mainTelegramKeyboard()
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
        await bot.sendMessage(msg.chat.id, part, mainTelegramKeyboard());
      }
    } catch (err) {
      await bot.sendMessage(
        msg.chat.id,
        "PDF process error: " + err.message,
        mainTelegramKeyboard()
      );
    }
  });

  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/start")) return;

      if (msg.text === "🔙 Main Menu") {
        return bot.sendMessage(msg.chat.id, "Main menu ✅", mainTelegramKeyboard());
      }

      if (msg.text === "🎬 Create") {
        return bot.sendMessage(
          msg.chat.id,
          "🎬 Creator Studio\nCategory choose karo ya project command bhejo.",
          creatorTelegramKeyboard()
        );
      }

      if (msg.text === "📚 Learn") {
        return bot.sendMessage(
          msg.chat.id,
          "📚 Academy\nPDF bhejo ya programming/study option choose karo.",
          learnTelegramKeyboard()
        );
      }

      if (msg.text === "🎥 Video Project") {
        return bot.sendMessage(
          msg.chat.id,
          "Video project banane ke liye format:\n\ncreate project: Title | Category | Platform | Style | Voice | Story\n\nExample:\ncreate project: Sneha Episode 1 | AI Character Story | YouTube Shorts | Cinematic | Young Hindi Female | Yash aur Sneha ek AI lab mystery solve karte hain.",
          creatorTelegramKeyboard()
        );
      }

      if (msg.text === "🖼 Image Studio") {
        return bot.sendMessage(
          msg.chat.id,
          "Image generate ke liye website me Creator/Media Studio use karo. Telegram direct image generation next phase me add hoga.",
          creatorTelegramKeyboard()
        );
      }

      if (msg.text === "🎭 Characters") {
        return bot.sendMessage(
          msg.chat.id,
          "Character Universe next phase me fully add hoga: Yash, Sneha, Friends, Objects, Worlds.",
          creatorTelegramKeyboard()
        );
      }

      if (msg.text === "🎙 Voice") {
        return bot.sendMessage(
          msg.chat.id,
          "Voice Studio: Hindi male/female voice generation website route se connect ho raha hai. Telegram direct voice generate next phase me.",
          creatorTelegramKeyboard()
        );
      }

      if (msg.text === "💻 Programming") {
        return bot.sendMessage(
          msg.chat.id,
          "Programming mode 💻\nPucho: Python zero se sikhao, loop dry run karo, website kaise banti hai?",
          learnTelegramKeyboard()
        );
      }

      if (msg.text === "📚 My Resources") {
        const { data } = await supabase
          .from("resources")
          .select("title,subject,unit,resource_type")
          .order("created_at", { ascending: false })
          .limit(10);

        if (!data || data.length === 0) {
          return bot.sendMessage(
            msg.chat.id,
            "Abhi resources empty hain.",
            learnTelegramKeyboard()
          );
