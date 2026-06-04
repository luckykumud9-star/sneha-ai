const express = require("express");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

Tum caring, supportive, respectful aur pyar se samjhane wali AI mentor ho.
Yash ko padhai, coding, health, fitness, career, opportunities, creator tools, reminders aur personal growth me help karo.

Rules:
- Hindi/Hinglish me jawab do.
- Yash ko naam se address karo.
- Beginner-friendly step-by-step samjhao.
- Stress/thakan me emotional support do.
- Illegal hacking, password stealing, malware, private info extraction ya unauthorized access mat sikhana.
- Cybersecurity me sirf ethical, defensive aur legal guidance do.
- Tum AI mentor ho; real human/patni/girlfriend hone ka jhootha claim mat karna.
`;

async function getMemoryText() {
  const { data } = await supabase
    .from("memories")
    .select("memory_text")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";
  return data.map((m, i) => `${i + 1}. ${m.memory_text}`).join("\n");
}

async function getRecentHistoryText() {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";
  return data.reverse().map((m) => `${m.role}: ${m.content}`).join("\n");
}

async function buildPrompt(message) {
  const memories = await getMemoryText();
  const history = await getRecentHistoryText();

  return `
${SNEHA_PROMPT}

Saved memories:
${memories || "Abhi koi memory nahi."}

Recent chat:
${history || "Abhi koi chat history nahi."}

Yash ka message:
${message}
`;
}

async function saveMessage(role, content, provider = null) {
  try {
    await supabase.from("messages").insert({ role, content, provider });
  } catch (err) {
    console.log("Message save failed:", err.message);
  }
}

async function saveImportantMemory(message) {
  const t = message.toLowerCase();

  const shouldSave =
    t.includes("yaad rakh") ||
    t.includes("remember") ||
    t.includes("mera goal") ||
    t.includes("main chahta") ||
    t.includes("semester") ||
    t.includes("subject") ||
    t.includes("padhai") ||
    t.includes("stress") ||
    t.includes("health") ||
    t.includes("career");

  if (!shouldSave) return;

  try {
    await supabase.from("memories").insert({
      memory_text: message.slice(0, 500),
    });
  } catch (err) {
    console.log("Memory save failed:", err.message);
  }
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini key missing");

  const prompt = await buildPrompt(message);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await axios.post(
    url,
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

function localFallback(message) {
  const t = message.toLowerCase();

  if (t.includes("dbms")) {
    return "Yash, DBMS ka matlab Database Management System hota hai. Ye data ko store, manage aur retrieve karne ka system hai.";
  }

  if (t.includes("python")) {
    return "Yash, Python beginner-friendly programming language hai. print('Hello') screen par Hello dikhata hai.";
  }

  if (t.includes("stress") || t.includes("thak") || t.includes("sad")) {
    return "Yash ❤️ pehle 2 minute normal breathing karo, paani piyo aur aankhon ko rest do. Tum pressure me ho, weak nahi.";
  }

  return "Yash ❤️ abhi online AI busy ho sakta hai, par main basic help kar sakti hoon. Topic simple words me likho.";
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

  return { provider: "local-fallback", reply: localFallback(message), debug: errors };
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
    elevenlabsSet: Boolean(process.env.ELEVENLABS_API_KEY),
    replicateSet: Boolean(process.env.REPLICATE_API_TOKEN),
    falSet: Boolean(process.env.FAL_KEY),
    runwaySet: Boolean(process.env.RUNWAY_API_KEY),
    stabilitySet: Boolean(process.env.STABILITY_API_KEY),
    serpapiSet: Boolean(process.env.SERPAPI_API_KEY),
    resendSet: Boolean(process.env.RESEND_API_KEY),
    openweatherSet: Boolean(process.env.OPENWEATHER_API_KEY),
  });
});

app.get("/db-test", async (req, res) => {
  const { data, error } = await supabase.from("profiles").select("*").limit(1);
  res.json({
    success: !error,
    message: error ? "Supabase connection failed" : "Supabase connected successfully",
    data: data || [],
    error: error?.message || null,
  });
});

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.json({
      success: false,
      reply: "Yash, message khaali hai. Kuch likho phir main help karungi.",
    });
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
  res.json({
    success: true,
    provider: result.provider,
    reply: result.reply,
    debug: result.debug || null,
  });
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

app.post("/memory", async (req, res) => {
  const { memory } = req.body;

  if (!memory || !memory.trim()) {
    return res.json({ success: false, message: "Memory empty hai." });
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({ memory_text: memory })
    .select();

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

/* RESOURCE LIBRARY */

app.post("/resources", async (req, res) => {
  try {
    const { title, subject, unit, resource_type, content, file_url, source } = req.body;

    if (!title || !subject) {
      return res.json({ success: false, message: "title aur subject required hai" });
    }

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

    res.json({ success: !error, data: data || [], error: error?.message || null });
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
  const { id } = req.params;

  const { data, error } = await supabase
    .from("resources")
    .update({ status: "deleted" })
    .eq("id", id)
    .select();

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.post("/resources/:id/analyze", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: resources, error } = await supabase
      .from("resources")
      .select("*")
      .eq("id", id)
      .limit(1);

    if (error || !resources || resources.length === 0) {
      return res.json({
        success: false,
        message: "Resource nahi mila",
        error: error?.message || null,
      });
    }

    const resource = resources[0];

    const prompt = `
Sneha AI, is study resource ko RGPV exam ke hisaab se analyze karo.

Subject: ${resource.subject}
Unit: ${resource.unit || "unknown"}
Title: ${resource.title}
Type: ${resource.resource_type}

Content / Link:
${resource.content || resource.file_url || "No content"}

Output Hindi/Hinglish me do:
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

    res.json({
      success: !insertError,
      provider: result.provider,
      data: data || [],
      reply: result.reply,
      error: insertError?.message || null,
    });
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

app.post("/topics", async (req, res) => {
  const { subject, unit, topic, priority } = req.body;

  if (!subject || !topic) {
    return res.json({ success: false, message: "subject aur topic required hai" });
  }

  const { data, error } = await supabase
    .from("subject_topics")
    .insert({
      subject,
      unit: unit || null,
      topic,
      priority: priority || "normal",
    })
    .select();

  res.json({ success: !error, data: data || [], error: error?.message || null });
});

app.get("/topics", async (req, res) => {
  const { subject } = req.query;

  let query = supabase
    .from("subject_topics")
    .select("*")
    .order("created_at", { ascending: false });

  if (subject) query = query.eq("subject", subject);

  const { data, error } = await query;

  res.json({ success: !error, data: data || [], error: error?.message || null });
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

function splitTelegramMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3900) {
    chunks.push(text.slice(i, i + 3900));
  }
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
      "Namaste Yash ❤️ Main Sneha AI hoon. Website aur Telegram dono par tumhari same AI mentor."
    );
  });

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Bas normal message bhejo. Main padhai, coding, health, career aur goals me help karungi ❤️"
    );
  });

  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/start") || msg.text.startsWith("/help")) return;

      await bot.sendChatAction(msg.chat.id, "typing");

      await saveMessage("telegram-yash", msg.text);
      await saveImportantMemory(msg.text);

      const result = await askSneha(msg.text);

      await saveMessage("telegram-sneha", result.reply, result.provider);

      const parts = splitTelegramMessage(result.reply);
      for (const part of parts) {
        await bot.sendMessage(msg.chat.id, part);
      }
    } catch (error) {
      console.log("Telegram bot error:", error.message);
      await bot.sendMessage(
        msg.chat.id,
        "Yash ❤️ abhi Telegram connection me issue hai. Thodi der baad try karo."
      );
    }
  });

  console.log("Sneha Telegram Bot Running ❤️");
}

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
