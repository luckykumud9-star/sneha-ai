const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const FormData = require("form-data");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "35mb" }));

const PORT = process.env.PORT || 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const supabaseUrl = (process.env.SUPABASE_URL || "")
  .replace("/rest/v1/", "")
  .replace("/rest/v1", "")
  .replace(/\/$/, "");

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

const SNEHA_SYSTEM_PROMPT = `
Tum Sneha YS ho.

Role:
- Hindi/Hinglish AI mentor
- Study coach
- Programming teacher
- Creator assistant
- Career guide
- Life growth partner

Rules:

1. Greeting par sirf greeting do.
2. Purane DBMS ya syllabus context force mat karo.
3. User jis mode me ho ussi mode ka jawab do.
4. Study mode me:
   Explain → Example → Practice → Quiz

5. Creator mode me:
   Category
   Platform
   Style
   Voice
   Story
   Blueprint
   Generation

6. Illegal hacking nahi.
7. Password stealing nahi.
8. Malware nahi.
9. Sirf legal cybersecurity.

Language:
Friendly Hindi/Hinglish.
`;

const VIDEO_CATEGORIES = [
  "AI Character Story",
  "Object Talking",
  "Educational",
  "Podcast",
  "Funny Story",
  "Motivation",
  "Horror",
  "Custom"
];

const IMAGE_CATEGORIES = [
  "Realistic",
  "Anime",
  "Poster",
  "Thumbnail",
  "Logo",
  "Character",
  "Product",
  "Custom"
];

const VIDEO_PLATFORMS = [
  "YouTube Shorts",
  "Instagram Reel",
  "YouTube Long",
  "Multi Platform"
];

const VIDEO_STYLES = [
  "Cinematic",
  "Realistic",
  "Anime",
  "Indian Cartoon",
  "Educational"
];

const VOICE_TYPES = [
  "Young Hindi Female",
  "Young Hindi Male",
  "Narrator Hindi Female",
  "Narrator Hindi Male",
  "Multiple Characters"
];

const telegramSessions = new Map();

function setSession(chatId, data) {
  telegramSessions.set(String(chatId), data);
}

function getSession(chatId) {
  return telegramSessions.get(String(chatId));
}

function clearSession(chatId) {
  telegramSessions.delete(String(chatId));
}

function isGreeting(text = "") {
  const t = text.toLowerCase().trim();

  return [
    "hi",
    "hello",
    "hey",
    "hii",
    "namaste",
    "namaskar",
    "ok",
    "hlo"
  ].includes(t);
}

async function saveMessage(
  role,
  content,
  provider = null,
  source = "website"
) {
  try {
    await supabase.from("messages").insert({
      role,
      content,
      provider,
      source
    });
  } catch (err) {
    console.log(err.message);
  }
}

async function saveMemoryIfImportant(message) {
  try {
    const text = message.toLowerCase();

    const important =
      text.includes("remember") ||
      text.includes("yaad") ||
      text.includes("goal") ||
      text.includes("semester") ||
      text.includes("syllabus") ||
      text.includes("career") ||
      text.includes("creator") ||
      text.includes("health");

    if (!important) return;

    await supabase.from("memories").insert({
      category: "auto",
      title: "Auto Memory",
      content: message,
      importance: 2
    });

  } catch (err) {
    console.log(err.message);
  }
}

async function logMission(
  module,
  event,
  details = ""
) {
  try {
    await supabase.from("mission_logs").insert({
      module,
      event,
      details
    });
  } catch (err) {
    console.log(err.message);
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
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function updateJob(
  id,
  status,
  progress,
  details,
  eta = null,
  result_url = null
) {
  try {
    await supabase
      .from("jobs")
      .update({
        status,
        progress,
        details,
        eta,
        result_url
      })
      .eq("id", id);
  } catch (err) {
    console.log(err.message);
  }
}

async function getRelevantMemories(message = "") {
  if (isGreeting(message)) return "";

  const text = message.toLowerCase();

  const keywords = [
    "goal",
    "semester",
    "syllabus",
    "dbms",
    "python",
    "coding",
    "creator",
    "video",
    "career",
    "health",
    "exam",
    "notes",
    "project"
  ];

  const useMemory = keywords.some((k) => text.includes(k));

  if (!useMemory) return "";

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

async function getRecentChat(message = "") {
  if (isGreeting(message)) return "";

  const { data } = await supabase
    .from("messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) return "";

  return data
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
}

async function buildPrompt(message) {
  const memories = await getRelevantMemories(message);
  const recent = await getRecentChat(message);

  return `
${SNEHA_SYSTEM_PROMPT}

Relevant Memory:
${memories || "No relevant memory."}

Recent Chat:
${recent || "No relevant recent chat."}

Important:
Agar message sirf greeting hai to sirf greeting do.
Agar user creator mode ki baat kar raha hai to creator workflow follow karo.
Agar user study/coding puch raha hai to teacher mode follow karo.

User Message:
${message}
`;
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    },
    {
      timeout: 30000
    }
  );

  const reply =
    response.data &&
    response.data.candidates &&
    response.data.candidates[0] &&
    response.data.candidates[0].content &&
    response.data.candidates[0].content.parts &&
    response.data.candidates[0].content.parts[0] &&
    response.data.candidates[0].content.parts[0].text;

  if (!reply) {
    throw new Error("Gemini empty response");
  }

  return reply;
  }
async function askGroq(message) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY missing");
  }

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: SNEHA_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
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

  const reply =
    response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

  if (!reply) {
    throw new Error("Groq empty response");
  }

  return reply;
}

async function askOpenRouter(message) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3.1-8b-instruct:free",
      messages: [
        {
          role: "system",
          content: SNEHA_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
      ]
    },
    {
      headers: {
        Authorization:
          "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.FRONTEND_URL ||
          "http://localhost:3000",
        "X-Title": "Sneha YS"
      },
      timeout: 30000
    }
  );

  const reply =
    response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

  if (!reply) {
    throw new Error("OpenRouter empty response");
  }

  return reply;
}

async function askOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const prompt = await buildPrompt(message);

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SNEHA_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization:
          "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const reply =
    response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

  if (!reply) {
    throw new Error("OpenAI empty response");
  }

  return reply;
}

async function askSneha(message) {
  const errors = {};

  try {
    return {
      provider: "gemini",
      reply: await askGemini(message)
    };
  } catch (err) {
    errors.gemini =
      err.response?.data || err.message;
  }

  try {
    return {
      provider: "groq",
      reply: await askGroq(message)
    };
  } catch (err) {
    errors.groq =
      err.response?.data || err.message;
  }

  try {
    return {
      provider: "openrouter",
      reply: await askOpenRouter(message)
    };
  } catch (err) {
    errors.openrouter =
      err.response?.data || err.message;
  }

  try {
    return {
      provider: "openai",
      reply: await askOpenAI(message)
    };
  } catch (err) {
    errors.openai =
      err.response?.data || err.message;
  }

  return {
    provider: "fallback",
    reply:
      "Yash ❤️ AI providers abhi unavailable lag rahe hain. Thodi der baad try karo ya API keys check karo.",
    debug: errors
  };
}

async function extractPdfText(buffer) {
  const parsed = await pdfParse(buffer);
  return (parsed.text || "").trim();
}

async function uploadToStorage(
  buffer,
  filename,
  mimetype,
  folder = "uploads"
) {
  const safeName = filename.replace(
    /[^a-zA-Z0-9.\-_]/g,
    "-"
  );

  const path =
    folder +
    "/" +
    Date.now() +
    "-" +
    safeName;

  const { error } = await supabase.storage
    .from("study-files")
    .upload(path, buffer, {
      contentType: mimetype,
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }

  return path;
    }
async function saveAsset({
  project_id = null,
  asset_type,
  file_url,
  public_url = null,
  provider = null,
  prompt = null
}) {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id,
      asset_type,
      file_url,
      public_url,
      provider,
      prompt
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
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
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    provider: result.provider,
    reply: result.reply,
    analysis: data
  };
}

function makeKeyboard(rows) {
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true
    }
  };
}

function mainKeyboard() {
  return makeKeyboard([
    ["🎬 Create", "🖼 Image"],
    ["📚 Learn", "🧠 Sneha"],
    ["📊 Dashboard", "📂 Vault"],
    ["🌍 Opportunities", "🩺 Health"],
    ["⚙ Settings"]
  ]);
}

function creatorCategoryKeyboard() {
  return makeKeyboard([
    ["AI Character Story", "Object Talking"],
    ["Educational", "Podcast"],
    ["Funny Story", "Motivation"],
    ["Horror", "Custom"],
    ["🔙 Main Menu"]
  ]);
}

function imageCategoryKeyboard() {
  return makeKeyboard([
    ["Realistic", "Anime"],
    ["Poster", "Thumbnail"],
    ["Character", "Logo"],
    ["Custom", "🔙 Main Menu"]
  ]);
}

function platformKeyboard() {
  return makeKeyboard([
    ["YouTube Shorts", "Instagram Reel"],
    ["YouTube Long", "Multi Platform"],
    ["🔙 Main Menu"]
  ]);
}

function styleKeyboard() {
  return makeKeyboard([
    ["Cinematic", "Realistic"],
    ["Anime", "Indian Cartoon"],
    ["Educational", "🔙 Main Menu"]
  ]);
}

function voiceKeyboard() {
  return makeKeyboard([
    ["Young Hindi Female", "Young Hindi Male"],
    ["Narrator Hindi Female", "Narrator Hindi Male"],
    ["Multiple Characters", "🔙 Main Menu"]
  ]);
}

function learnKeyboard() {
  return makeKeyboard([
    ["📄 Upload PDF", "💻 Programming"],
    ["🧠 Quiz", "📚 My Resources"],
    ["🎓 Certificates", "🔙 Main Menu"]
  ]);
}

function splitTelegram(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3800) {
    chunks.push(text.slice(i, i + 3800));
  }
  /* =========================
   BASIC ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Sneha YS Backend",
    message: "Backend running"
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

    await saveMessage(
      "sneha",
      result.reply,
      result.provider,
      "website"
    );

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
    reply: result.reply
  });
});

/* =========================
   MEMORY / JOBS / MISSION
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

  return chunks;
           }
/* =========================
   RESOURCES / STUDY ENGINE
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
  try {
    const {
      title,
      subject,
      unit,
      resource_type,
      content,
      file_url
    } = req.body;

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

    if (error) {
      throw new Error(error.message);
    }

    await logMission(
      "study",
      "resource_created",
      title
    );

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

app.post(
  "/upload",
  upload.single("file"),
  async (req, res) => {
    let job = null;

    try {
      const {
        title,
        subject,
        unit
      } = req.body;

      if (!req.file) {
        return res.json({
          success: false,
          message: "File required hai"
        });
      }

      job = await createJob(
        "study_upload",
        "File upload started"
      );

      await updateJob(
        job.id,
        "running",
        20,
        "Reading file",
        "1 min"
      );

      let content = "";
      let resourceType = "file";

      if (
        req.file.mimetype ===
        "application/pdf"
      ) {
        resourceType = "pdf";

        content =
          await extractPdfText(
            req.file.buffer
          );

      } else if (
        req.file.mimetype.startsWith(
          "image/"
        )
      ) {
        resourceType = "image";

        content =
          "Image uploaded. OCR module phase-2 me add hoga.";

      } else if (
        req.file.mimetype.startsWith(
          "video/"
        )
      ) {
        resourceType = "video";

        content =
          "Video uploaded. Study video workflow future phase me.";
      }

      await updateJob(
        job.id,
        "running",
        45,
        "Uploading storage",
        "1 min"
      );

      const path =
        await uploadToStorage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          "resources"
        );

      const { data, error } =
        await supabase
          .from("resources")
          .insert({
            title:
              title ||
              req.file.originalname,
            subject,
            unit,
            resource_type:
              resourceType,
            content:
              content.slice(
                0,
                20000
              ),
            file_url: path
          })
          .select();

      if (error) {
        throw new Error(
          error.message
        );
      }

      await updateJob(
        job.id,
        "running",
        70,
        "Analyzing study material",
        "1 min"
      );

      let analysis = null;

      if (
        resourceType === "pdf" &&
        content &&
        content.length > 100
      ) {
        analysis =
          await analyzeResource(
            data[0]
          );
      }

      await updateJob(
        job.id,
        "completed",
        100,
        "Upload completed",
        "0"
      );

      res.json({
        success: true,
        resource: data[0],
        analysis
      });

    } catch (err) {

      if (job) {
        await updateJob(
          job.id,
          "failed",
          100,
          err.message,
          "0"
        );
      }

      res.json({
        success: false,
        error: err.message
      });
    }
  }
);

app.post(
  "/resources/:id/analyze",
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from("resources")
          .select("*")
          .eq(
            "id",
            req.params.id
          )
          .single();

      if (error) {
        throw new Error(
          error.message
        );
      }

      const analysis =
        await analyzeResource(
          data
        );

      res.json({
        success: true,
        ...analysis
      });

    } catch (err) {
      res.json({
        success: false,
        error: err.message
      });
    }
  }
);

app.post(
  "/study/generate-notes",
  async (req, res) => {
    try {
      const {
        topic,
        level
      } = req.body;

      const result =
        await askSneha(`
Topic: ${topic}

Level:
${level || "Beginner"}

Generate:
1. Notes
2. Examples
3. Practice Questions
4. Revision Sheet
`);

      res.json({
        success: true,
        provider:
          result.provider,
        notes:
          result.reply
      });

    } catch (err) {
      res.json({
        success: false,
        error: err.message
      });
    }
  }
);
/* =========================
   CREATOR STUDIO
========================= */

app.get("/projects", async (req, res) => {
  const { data, error } = await supabase
    .from("creator_projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null
  });
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

    if (error) {
      throw new Error(error.message);
    }

    await logMission(
      "creator",
      "project_created",
      title
    );

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

app.post(
  "/projects/:id/blueprint",
  async (req, res) => {
    let job = null;

    try {
      job = await createJob(
        "creator_blueprint",
        "Blueprint generation started"
      );

      const {
        data: project,
        error
      } = await supabase
        .from("creator_projects")
        .select("*")
        .eq("id", req.params.id)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      await updateJob(
        job.id,
        "running",
        35,
        "AI Director planning",
        "1 min"
      );

      const prompt = `
Create complete production blueprint.

Title:
${project.title}

Category:
${project.category}

Platform:
${project.platform}

Style:
${project.style}

Voice:
${project.voice_type}

Story:
${project.story}

Output:

1. Requirement Lock
2. Audience
3. Character Plan
4. Storyboard
5. Scene Breakdown
6. Camera Angles
7. Image Prompts
8. Video Prompts
9. Music Plan
10. Editing Plan
11. Shorts Strategy
12. Thumbnail Ideas
13. Export Checklist
`;

      const result =
        await askSneha(prompt);

      await updateJob(
        job.id,
        "completed",
        100,
        "Blueprint generated",
        "0"
      );

      res.json({
        success: true,
        provider:
          result.provider,
        blueprint:
          result.reply
      });

    } catch (err) {

      if (job) {
        await updateJob(
          job.id,
          "failed",
          100,
          err.message,
          "0"
        );
      }

      res.json({
        success: false,
        error: err.message
      });
    }
  }
);

/* =========================
   VIDEO WORKFLOW LOCK
========================= */

app.post(
  "/video/workflow",
  async (req, res) => {
    try {

      const {
        category,
        platform,
        style,
        voice_type,
        story
      } = req.body;

      if (
        !category ||
        !platform ||
        !style ||
        !voice_type ||
        !story
      ) {
        return res.json({
          success: false,
          message:
            "Category, Platform, Style, Voice aur Story required hai"
        });
      }

      const prompt = `
Video Project Locked

Category:
${category}

Platform:
${platform}

Style:
${style}

Voice:
${voice_type}

Story:
${story}

Generate:

1. Project Summary
2. Character Design
3. Scene Plan
4. Image Prompt
5. Video Prompt
6. Voice Prompt
7. Music Prompt
8. Thumbnail Prompt
9. Export Settings
`;

      const result =
        await askSneha(prompt);

      res.json({
        success: true,
        provider:
          result.provider,
        workflow:
          result.reply
      });

    } catch (err) {
      res.json({
        success: false,
        error: err.message
      });
    }
  }
);

app.post(
  "/video/script",
  async (req, res) => {
    try {

      const {
        story,
        duration,
        language
      } = req.body;

      const result =
        await askSneha(`
Create complete video script.

Story:
${story}

Duration:
${duration || "60 seconds"}

Language:
${language || "Hindi"}

Generate:

1. Hook
2. Narration
3. Scene Directions
4. Captions
5. CTA
`);

      res.json({
        success: true,
        script:
          result.reply,
        provider:
          result.provider
      });

    } catch (err) {

      res.json({
        success: false,
        error: err.message
      });
    }
  }
);
/* =========================
   IMAGE / VOICE / ASSET ENGINE
========================= */

app.post("/media/image", async (req, res) => {
  let job = null;

  try {
    const {
      prompt,
      project_id,
      style,
      category
    } = req.body;

    if (!prompt) {
      return res.json({
        success: false,
        message: "prompt required hai"
      });
    }

    if (!process.env.STABILITY_API_KEY) {
      return res.json({
        success: false,
        message: "STABILITY_API_KEY missing hai"
      });
    }

    job = await createJob(
      "image_generation",
      "Image generation started"
    );

    await updateJob(
      job.id,
      "running",
      20,
      "Calling Stability AI",
      "1-2 min"
    );

    const form = new FormData();

    form.append(
      "prompt",
      `
${prompt}

Category:
${category || "general"}

Style:
${style || "cinematic, high quality, detailed"}

Quality:
professional, sharp, clean, beautiful composition
`
    );

    form.append("output_format", "png");

    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization:
            "Bearer " +
            process.env.STABILITY_API_KEY,
          Accept: "image/*"
        },
        responseType: "arraybuffer",
        timeout: 90000
      }
    );

    const buffer = Buffer.from(response.data);

    const filePath =
      await uploadToStorage(
        buffer,
        "sneha-ys-image.png",
        "image/png",
        "media-images"
      );

    const asset =
      await saveAsset({
        project_id:
          project_id || null,
        asset_type: "image",
        file_url: filePath,
        provider: "stability",
        prompt
      });

    await updateJob(
      job.id,
      "completed",
      100,
      "Image generated",
      "0",
      filePath
    );

    res.json({
      success: true,
      provider: "stability",
      asset,
      file_url: filePath
    });

  } catch (err) {

    if (job) {
      await updateJob(
        job.id,
        "failed",
        100,
        err.message,
        "0"
      );
    }

    res.json({
      success: false,
      error: err.message
    });
  }
});

app.post("/media/voice", async (req, res) => {
  let job = null;

  try {
    const {
      text,
      project_id,
      voice_id
    } = req.body;

    if (!text) {
      return res.json({
        success: false,
        message: "text required hai"
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.json({
        success: false,
        message: "ELEVENLABS_API_KEY missing hai"
      });
    }

    job = await createJob(
      "voice_generation",
      "Voice generation started"
    );

    const selectedVoice =
      voice_id ||
      process.env.ELEVENLABS_VOICE_ID ||
      "21m00Tcm4TlvDq8ikWAM";

    const response =
      await axios.post(
        "https://api.elevenlabs.io/v1/text-to-speech/" +
          selectedVoice,
        {
          text,
          model_id:
            "eleven_multilingual_v2"
        },
        {
          headers: {
            "xi-api-key":
              process.env.ELEVENLABS_API_KEY,
            "Content-Type":
              "application/json",
            Accept: "audio/mpeg"
          },
          responseType: "arraybuffer"
        }
      );

    const buffer =
      Buffer.from(response.data);

    const filePath =
      await uploadToStorage(
        buffer,
        "sneha-ys-voice.mp3",
        "audio/mpeg",
        "media-voices"
      );

    const asset =
      await saveAsset({
        project_id:
          project_id || null,
        asset_type: "voice",
        file_url: filePath,
        provider: "elevenlabs"
      });

    await updateJob(
      job.id,
      "completed",
      100,
      "Voice generated",
      "0",
      filePath
    );

    res.json({
      success: true,
      provider: "elevenlabs",
      asset,
      file_url: filePath
    });

  } catch (err) {

    if (job) {
      await updateJob(
        job.id,
        "failed",
        100,
        err.message,
        "0"
      );
    }

    res.json({
      success: false,
      error: err.message
    });
  }
});

app.get("/assets", async (req, res) => {
  const { data, error } =
    await supabase
      .from("assets")
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(100);

  res.json({
    success: !error,
    data: data || [],
    error:
      error?.message || null
  });
});
/* =========================
   OPPORTUNITIES / PROVIDERS / DOCTOR
========================= */

app.get("/opportunities", async (req, res) => {
  const { data, error } =
    await supabase
      .from("opportunities")
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(100);

  res.json({
    success: !error,
    data: data || [],
    error:
      error?.message || null
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
        message:
          "SERPAPI_API_KEY missing hai"
      });
    }

    const response =
      await axios.get(
        "https://serpapi.com/search.json",
        {
          params: {
            q: query,
            api_key:
              process.env.SERPAPI_API_KEY,
            engine: "google"
          },
          timeout: 30000
        }
      );

    const results =
      response.data?.organic_results || [];

    const saved = [];

    for (
      const item of results.slice(0, 8)
    ) {
      const { data } =
        await supabase
          .from("opportunities")
          .insert({
            title: item.title,
            type: "search",
            description: item.snippet,
            link: item.link,
            deadline: null
          })
          .select();

      if (data && data[0]) {
        saved.push(data[0]);
      }
    }

    res.json({
      success: true,
      data: saved
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

app.get("/providers", async (req, res) => {
  const providers = [
    {
      name: "Gemini",
      active:
        Boolean(process.env.GEMINI_API_KEY),
      type: "chat"
    },
    {
      name: "Groq",
      active:
        Boolean(process.env.GROQ_API_KEY),
      type: "chat"
    },
    {
      name: "OpenRouter",
      active:
        Boolean(process.env.OPENROUTER_API_KEY),
      type: "chat"
    },
    {
      name: "OpenAI",
      active:
        Boolean(process.env.OPENAI_API_KEY),
      type: "chat"
    },
    {
      name: "ElevenLabs",
      active:
        Boolean(process.env.ELEVENLABS_API_KEY),
      type: "voice"
    },
    {
      name: "Stability",
      active:
        Boolean(process.env.STABILITY_API_KEY),
      type: "image"
    },
    {
      name: "Fal",
      active:
        Boolean(process.env.FAL_KEY),
      type: "media"
    },
    {
      name: "Replicate",
      active:
        Boolean(process.env.REPLICATE_API_TOKEN),
      type: "media"
    },
    {
      name: "Runway",
      active:
        Boolean(process.env.RUNWAY_API_KEY),
      type: "video"
    },
    {
      name: "SerpAPI",
      active:
        Boolean(process.env.SERPAPI_API_KEY),
      type: "search"
    }
  ];

  res.json({
    success: true,
    data: providers
  });
});

app.post("/doctor", async (req, res) => {
  try {
    const errorText =
      req.body.error || "";

    const result =
      await askSneha(`
Sneha YS Error Doctor mode.

Error:
${errorText}

Output:
1. Simple reason
2. Impact
3. Exact fix steps
4. File/env/table check
5. Future prevention
`);

    res.json({
      success: true,
      provider:
        result.provider,
      reply:
        result.reply
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   TELEGRAM WORKFLOW ENGINE
========================= */

function startCreatorSession(chatId) {
  setSession(chatId, {
    mode: "creator",
    step: "category"
  });
}

function startImageSession(chatId) {
  setSession(chatId, {
    mode: "image",
    step: "category"
  });
}

function startLearnSession(chatId) {
  setSession(chatId, {
    mode: "learn",
    step: "choice"
  });
}

async function handleCreatorSession(bot, msg, session) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🔙 Main Menu") {
    clearSession(chatId);
    return bot.sendMessage(
      chatId,
      "Main menu ✅",
      mainKeyboard()
    );
  }

  if (session.step === "category") {
    session.category = text;
    session.step = "platform";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Category locked ✅\n\nCategory: ${session.category}\n\nAb platform choose karo:`,
      platformKeyboard()
    );
  }

  if (session.step === "platform") {
    session.platform = text;
    session.step = "style";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Platform locked ✅\n\nPlatform: ${session.platform}\n\nAb style choose karo:`,
      styleKeyboard()
    );
  }

  if (session.step === "style") {
    session.style = text;
    session.step = "voice";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Style locked ✅\n\nStyle: ${session.style}\n\nAb voice choose karo:`,
      voiceKeyboard()
    );
  }

  if (session.step === "voice") {
    session.voice_type = text;
    session.step = "story";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Voice locked ✅\n\nVoice: ${session.voice_type}\n\nAb story/idea likho:`
    );
  }

  if (session.step === "story") {
    session.story = text;

    const title =
      "Telegram Video Project " +
      new Date().toLocaleString("en-IN");

    const { data, error } =
      await supabase
        .from("creator_projects")
        .insert({
          title,
          category: session.category,
          platform: session.platform,
          style: session.style,
          voice_type:
            session.voice_type,
          story: session.story,
          status: "draft"
        })
        .select();

    if (error) {
      throw new Error(error.message);
    }

    clearSession(chatId);

    return bot.sendMessage(
      chatId,
      `🎬 Project locked ✅

Title:
${title}

Category:
${session.category}

Platform:
${session.platform}

Style:
${session.style}

Voice:
${session.voice_type}

Story saved ✅

Website me project blueprint aur media generation continue karo.`,
      mainKeyboard()
    );
  }
    }
async function handleImageSession(bot, msg, session) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🔙 Main Menu") {
    clearSession(chatId);
    return bot.sendMessage(chatId, "Main menu ✅", mainKeyboard());
  }

  if (session.step === "category") {
    session.category = text;
    session.step = "style";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Image category locked ✅\n\nCategory: ${session.category}\n\nAb style choose karo:`,
      styleKeyboard()
    );
  }

  if (session.step === "style") {
    session.style = text;
    session.step = "prompt";
    setSession(chatId, session);

    return bot.sendMessage(
      chatId,
      `Style locked ✅\n\nStyle: ${session.style}\n\nAb image prompt likho:`
    );
  }

  if (session.step === "prompt") {
    session.prompt = text;
    clearSession(chatId);

    const title = "Telegram Image Project " + new Date().toLocaleString("en-IN");

    await supabase.from("mission_logs").insert({
      module: "image",
      event: "telegram_image_locked",
      details: JSON.stringify({
        title,
        category: session.category,
        style: session.style,
        prompt: session.prompt
      })
    });

    return bot.sendMessage(
      chatId,
      `🖼 Image workflow locked ✅

Title:
${title}

Category:
${session.category}

Style:
${session.style}

Prompt:
${session.prompt}

Website me Image Studio se generate/download continue karo.`,
      mainKeyboard()
    );
  }
}

async function handleLearnSession(bot, msg, session) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🔙 Main Menu") {
    clearSession(chatId);
    return bot.sendMessage(chatId, "Main menu ✅", mainKeyboard());
  }

  if (text === "📄 Upload PDF") {
    return bot.sendMessage(
      chatId,
      "PDF file bhejo. Text-based PDF ko Sneha read karke notes, MCQs aur revision plan banayegi.",
      learnKeyboard()
    );
  }

  if (text === "💻 Programming") {
    clearSession(chatId);
    return bot.sendMessage(
      chatId,
      `💻 Programming mode active.

Example:
Python zero se hero sikhao
Java loop dry run karo
Website kaise kaam karti hai?
Mera code debug karo`,
      learnKeyboard()
    );
  }

  if (text === "🧠 Quiz") {
    clearSession(chatId);
    return bot.sendMessage(
      chatId,
      `Quiz ke liye likho:

DBMS Unit 1 quiz banao
Python loops quiz banao
Operating System MCQ test banao`,
      learnKeyboard()
    );
  }

  if (text === "🎓 Certificates") {
    clearSession(chatId);
    return bot.sendMessage(
      chatId,
      `Certificates ke liye pucho:

Free programming certificates batao
Government free certificates batao
AI certificates batao`,
      learnKeyboard()
    );
  }

  if (text === "📚 My Resources") {
    const { data } = await supabase
      .from("resources")
      .select("title,subject,unit,resource_type")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      return bot.sendMessage(chatId, "Abhi resources empty hain.", learnKeyboard());
    }

    const list = data
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}
Subject: ${r.subject || "N/A"}
Unit: ${r.unit || "N/A"}
Type: ${r.resource_type || "N/A"}`
      )
      .join("\n\n");

    return bot.sendMessage(chatId, list, learnKeyboard());
  }

  clearSession(chatId);
  return bot.sendMessage(
    chatId,
    "Learn mode me command samajh nahi aayi. Main menu par wapas aa gaya.",
    mainKeyboard()
  );
}

async function sendLongTelegram(bot, chatId, text, keyboard) {
  const parts = splitTelegram(text || "");
  for (const part of parts) {
    await bot.sendMessage(chatId, part, keyboard || mainKeyboard());
  }
}

async function telegramDashboard(bot, chatId) {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) {
    return bot.sendMessage(chatId, "Abhi koi running job nahi.", mainKeyboard());
  }

  const text = data
    .map(
      (j, i) =>
        `${i + 1}. ${j.job_type}
Status: ${j.status}
Progress: ${j.progress}%
Details: ${j.details || ""}`
    )
    .join("\n\n");

  return bot.sendMessage(chatId, text, mainKeyboard());
}

async function telegramVault(bot, chatId) {
  const { data } = await supabase
    .from("resources")
    .select("title,subject,unit,resource_type")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return bot.sendMessage(chatId, "Vault empty hai.", mainKeyboard());
  }

  const text = data
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}
Subject: ${r.subject || "N/A"}
Unit: ${r.unit || "N/A"}
Type: ${r.resource_type || "N/A"}`
    )
    .join("\n\n");

  return bot.sendMessage(chatId, text, mainKeyboard());
}

async function telegramProjects(bot, chatId) {
  const { data } = await supabase
    .from("creator_projects")
    .select("title,category,platform,style,voice_type")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return bot.sendMessage(chatId, "Abhi creator projects empty hain.", mainKeyboard());
  }

  const text = data
    .map(
      (p, i) =>
        `${i + 1}. ${p.title}
Category: ${p.category || "N/A"}
Platform: ${p.platform || "N/A"}
Style: ${p.style || "N/A"}
Voice: ${p.voice_type || "N/A"}`
    )
    .join("\n\n");

  return bot.sendMessage(chatId, text, mainKeyboard());
}

async function telegramOpportunities(bot, chatId) {
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return bot.sendMessage(chatId, "Abhi opportunities database empty hai.", mainKeyboard());
  }

  const text = data
    .map(
      (o, i) =>
        `${i + 1}. ${o.title}
${o.description || ""}
${o.link || ""}`
    )
    .join("\n\n");

  return bot.sendMessage(chatId, text, mainKeyboard());
}

async function telegramHealth(bot, chatId) {
  const text =
    "Sneha YS Health:\n\n" +
    "Gemini: " + (process.env.GEMINI_API_KEY ? "✅" : "❌") + "\n" +
    "Groq: " + (process.env.GROQ_API_KEY ? "✅" : "❌") + "\n" +
    "OpenRouter: " + (process.env.OPENROUTER_API_KEY ? "✅" : "❌") + "\n" +
    "OpenAI: " + (process.env.OPENAI_API_KEY ? "✅" : "❌") + "\n" +
    "ElevenLabs: " + (process.env.ELEVENLABS_API_KEY ? "✅" : "❌") + "\n" +
    "Stability: " + (process.env.STABILITY_API_KEY ? "✅" : "❌") + "\n" +
    "Fal: " + (process.env.FAL_KEY ? "✅" : "❌") + "\n" +
    "Replicate: " + (process.env.REPLICATE_API_TOKEN ? "✅" : "❌") + "\n" +
    "Runway: " + (process.env.RUNWAY_API_KEY ? "✅" : "❌") + "\n" +
    "SerpAPI: " + (process.env.SERPAPI_API_KEY ? "✅" : "❌") + "\n" +
    "Supabase: " + (supabaseKey ? "✅" : "❌");

  return bot.sendMessage(chatId, text, mainKeyboard());
      }
/* =========================
   TELEGRAM BOT MAIN HANDLER
========================= */

if (process.env.TELEGRAM_BOT_TOKEN) {
  const fs = require("fs");

  const bot = new TelegramBot(
    process.env.TELEGRAM_BOT_TOKEN,
    {
      polling: true
    }
  );

  bot.on("polling_error", (err) => {
    console.log("Telegram polling error:", err.message);
  });

  bot.onText(/\/start/, async (msg) => {
    clearSession(msg.chat.id);

    return bot.sendMessage(
      msg.chat.id,
      `Namaste Yash ❤️

Main Sneha YS hoon.

Main tumhari:
🎬 Creator assistant
🖼 Image planner
📚 Study coach
💻 Programming teacher
🧠 AI mentor
🌍 Opportunity tracker

Menu se option choose karo:`,
      mainKeyboard()
    );
  });

  bot.on("document", async (msg) => {
    try {
      const chatId = msg.chat.id;

      await bot.sendMessage(
        chatId,
        "File mili ✅ Agar ye text-based PDF hai to main notes, MCQs aur revision plan banaungi."
      );

      const filePath = await bot.downloadFile(
        msg.document.file_id,
        "/tmp"
      );

      const buffer = fs.readFileSync(filePath);

      if (msg.document.mime_type !== "application/pdf") {
        return bot.sendMessage(
          chatId,
          "Abhi Telegram PDF analysis sirf text-based PDF ke liye enabled hai.",
          mainKeyboard()
        );
      }

      const text = await extractPdfText(buffer);

      if (!text || text.length < 80) {
        return bot.sendMessage(
          chatId,
          "PDF me readable text nahi mila. Ye scanned/photo PDF lag rahi hai. OCR next phase me add karenge.",
          mainKeyboard()
        );
      }

      const { data, error } = await supabase
        .from("resources")
        .insert({
          title:
            msg.document.file_name ||
            "Telegram PDF",
          subject: "Telegram Upload",
          unit: null,
          resource_type: "pdf",
          content: text.slice(0, 20000),
          file_url: null
        })
        .select();

      if (error) {
        throw new Error(error.message);
      }

      await bot.sendMessage(
        chatId,
        `PDF saved ✅

Text length:
${text.length}

Ab analysis bana rahi hoon...`
      );

      const analysis =
        await analyzeResource(data[0]);

      await sendLongTelegram(
        bot,
        chatId,
        analysis.reply,
        mainKeyboard()
      );

    } catch (err) {
      return bot.sendMessage(
        msg.chat.id,
        "PDF process error: " + err.message,
        mainKeyboard()
      );
    }
  });

  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;

      const chatId = msg.chat.id;
      const text = msg.text;

      if (text.startsWith("/start")) {
        return;
      }

      if (text === "🔙 Main Menu") {
        clearSession(chatId);

        return bot.sendMessage(
          chatId,
          "Main menu ✅",
          mainKeyboard()
        );
      }

      const session = getSession(chatId);

      if (session) {
        if (session.mode === "creator") {
          return handleCreatorSession(
            bot,
            msg,
            session
          );
        }

        if (session.mode === "image") {
          return handleImageSession(
            bot,
            msg,
            session
          );
        }

        if (session.mode === "learn") {
          return handleLearnSession(
            bot,
            msg,
            session
          );
        }
      }

      if (text === "🎬 Create") {
        startCreatorSession(chatId);

        return bot.sendMessage(
          chatId,
          `🎬 Creator Studio

Step 1:
Video category choose karo:`,
          creatorCategoryKeyboard()
        );
      }

      if (text === "🖼 Image") {
        startImageSession(chatId);

        return bot.sendMessage(
          chatId,
          `🖼 Image Studio

Step 1:
Image category choose karo:`,
          imageCategoryKeyboard()
        );
      }

      if (text === "📚 Learn") {
        startLearnSession(chatId);

        return bot.sendMessage(
          chatId,
          `📚 Learn / Study Mode

Option choose karo:`,
          learnKeyboard()
        );
      }

      if (text === "📊 Dashboard") {
        return telegramDashboard(
          bot,
          chatId
        );
      }

      if (text === "📂 Vault") {
        return telegramVault(
          bot,
          chatId
        );
      }

      if (text === "🌍 Opportunities") {
        return telegramOpportunities(
          bot,
          chatId
        );
}
if (text === "🩺 Health") {
        return telegramHealth(
          bot,
          chatId
        );
      }

      if (text === "⚙ Settings") {
        return bot.sendMessage(
          chatId,
          `⚙ Settings

Current:
- AI fallback enabled
- Memory relevance enabled
- Creator workflow lock enabled
- Image workflow lock enabled
- Study workflow enabled

Advanced settings website/admin panel me manage honge.`,
          mainKeyboard()
        );
      }

      if (text === "🧠 Sneha") {
        clearSession(chatId);

        return bot.sendMessage(
          chatId,
          `🧠 Sneha chat mode active.

Ab tum normal baat kar sakte ho.`,
          mainKeyboard()
        );
      }

      await saveMessage(
        "telegram-yash",
        text,
        null,
        "telegram"
      );

      await saveMemoryIfImportant(text);

      const result =
        await askSneha(text);

      await saveMessage(
        "telegram-sneha",
        result.reply,
        result.provider,
        "telegram"
      );

      await sendLongTelegram(
        bot,
        chatId,
        result.reply,
        mainKeyboard()
      );

    } catch (err) {
      return bot.sendMessage(
        msg.chat.id,
        "Yash ❤️ Telegram error: " + err.message,
        mainKeyboard()
      );
    }
  });

  console.log("Sneha YS Telegram Bot Running");
}

app.listen(PORT, () => {
  console.log(
    "Sneha YS backend running on port " + PORT
  );
});
