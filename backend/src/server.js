const express = require("express");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

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

const SNEHA_PROMPT =
  "Tum Sneha AI ho, Yash ki Hindi/Hinglish personal AI mentor. " +
  "Tum padhai, coding, health, career, opportunities, creator tools, reminders aur personal growth me help karti ho. " +
  "Hindi/Hinglish me jawab do. Yash ko naam se address karo. " +
  "Beginner-friendly, step-by-step, caring aur supportive jawab do. " +
  "Stress me emotional support do. Illegal hacking, password stealing, malware ya unauthorized access mat sikhana. " +
  "Cybersecurity me sirf ethical aur defensive guidance do.";

async function getMemoryText() {
  const { data } = await supabase
    .from("memories")
    .select("memory_text")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";
  return data.map((m, i) => i + 1 + ". " + m.memory_text).join("\n");
}

async function getRecentHistoryText() {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";
  return data.reverse().map((m) => m.role + ": " + m.content).join("\n");
}

async function buildPrompt(message) {
  const memories = await getMemoryText();
  const history = await getRecentHistoryText();

  return (
    SNEHA_PROMPT +
    "\n\nSaved memories:\n" +
    (memories || "Abhi koi memory nahi.") +
    "\n\nRecent chat:\n" +
    (history || "Abhi koi recent chat nahi.") +
    "\n\nYash ka message:\n" +
    message
  );
}

async function saveMessage(role, content, provider) {
  try {
    await supabase.from("messages").insert({
      role: role,
      content: content,
      provider: provider || null
    });
  } catch (err) {
    console.log("Message save failed:", err.message);
  }
}

async function saveImportantMemory(message) {
  try {
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
      memory_text: message.slice(0, 500)
    });
  } catch (err) {
    console.log("Memory save failed:", err.message);
  }
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini key missing");

  const prompt = await buildPrompt(message);
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  const response = await axios.post(
    url,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30000 }
  );

  const reply = response.data &&
    response.data.candidates &&
    response.data.candidates[0] &&
    response.data.candidates[0].content &&
    response.data.candidates[0].content.parts &&
    response.data.candidates[0].content.parts[0] &&
    response.data.candidates[0].content.parts[0].text;

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
        { role: "system", content: SNEHA_PROMPT },
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

  const reply = response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

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
        { role: "system", content: SNEHA_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sneha-ai.vercel.app",
        "X-Title": "Sneha AI"
      },
      timeout: 30000
    }
  );

  const reply = response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

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
        { role: "system", content: SNEHA_PROMPT },
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

  const reply = response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;

  if (!reply) throw new Error("OpenAI empty response");
  return reply;
}

async function askSneha(message) {
  const errors = {};

  try {
    return { provider: "gemini", reply: await askGemini(message) };
  } catch (err) {
    errors.gemini = err.response ? err.response.data : err.message;
  }

  try {
    return { provider: "groq", reply: await askGroq(message) };
  } catch (err) {
    errors.groq = err.response ? err.response.data : err.message;
  }

  try {
    return { provider: "openrouter", reply: await askOpenRouter(message) };
  } catch (err) {
    errors.openrouter = err.response ? err.response.data : err.message;
  }

  try {
    return { provider: "openai", reply: await askOpenAI(message) };
  } catch (err) {
    errors.openai = err.response ? err.response.data : err.message;
  }

  return {
    provider: "local",
    reply: "Yash ❤️ AI providers busy hain, lekin main basic help kar sakti hoon. Topic simple words me likho.",
    debug: errors
  };
}

async function saveResource(item) {
  const { data, error } = await supabase
    .from("resources")
    .insert({
      title: item.title,
      subject: item.subject,
      unit: item.unit || null,
      resource_type: item.resource_type || "text",
      content: item.content || null,
      file_url: item.file_url || null,
      source: item.source || "manual"
    })
    .select();

  if (error) throw new Error(error.message);
  return data[0];
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

  const prompt =
    "Is study resource ko exam ke hisaab se analyze karo.\n\n" +
    "Subject: " + r.subject + "\n" +
    "Unit: " + (r.unit || "Unknown") + "\n" +
    "Title: " + r.title + "\n" +
    "Type: " + r.resource_type + "\n\n" +
    "Content:\n" + (r.content || r.file_url || "No content") + "\n\n" +
    "Hindi/Hinglish output:\n" +
    "1. Short summary\n" +
    "2. Important points\n" +
    "3. Important exam questions\n" +
    "4. 10 MCQs with answers\n" +
    "5. Last-minute revision notes";

  const result = await askSneha(prompt);

  const { data, error: insertError } = await supabase
    .from("resource_summaries")
    .insert({
      resource_id: id,
      summary: result.reply,
      important_points: result.reply,
      important_questions: result.reply,
      mcqs: result.reply,
      revision_notes: result.reply
    })
    .select();

  if (insertError) throw new Error(insertError.message);

  return {
    provider: result.provider,
    reply: result.reply,
    data: data
  };
}

app.get("/", function (req, res) {
  res.json({ success: true, message: "Sneha AI Backend Running" });
});

app.get("/health", function (req, res) {
  res.json({
    status: "ok",
    service: "Sneha AI",
    supabaseUrlSet: Boolean(supabaseUrl),
    supabaseKeySet: Boolean(supabaseKey),
    geminiSet: Boolean(process.env.GEMINI_API_KEY),
    groqSet: Boolean(process.env.GROQ_API_KEY),
    openrouterSet: Boolean(process.env.OPENROUTER_API_KEY),
    openaiSet: Boolean(process.env.OPENAI_API_KEY),
    telegramSet: Boolean(process.env.TELEGRAM_BOT_TOKEN)
  });
});

app.post("/chat", async function (req, res) {
  const message = req.body.message;

  if (!message || !message.trim()) {
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
    debug: result.debug || null
  });
});

app.get("/chat-test", async function (req, res) {
  const result = await askSneha("Sneha mujhe DBMS zero se samjhao");
  res.json({
    success: true,
    provider: result.provider,
    reply: result.reply,
    debug: result.debug || null
  });
});

app.get("/history", async function (req, res) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({ success: !error, data: data || [], error: error ? error.message : null });
});

app.get("/memories", async function (req, res) {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({ success: !error, data: data || [], error: error ? error.message : null });
});

app.post("/resources", async function (req, res) {
  try {
    const title = req.body.title;
    const subject = req.body.subject;

    if (!title || !subject) {
      return res.json({ success: false, message: "title aur subject required hai" });
    }

    const resource = await saveResource({
      title: title,
      subject: subject,
      unit: req.body.unit,
      resource_type: req.body.resource_type,
      content: req.body.content,
      file_url: req.body.file_url,
      source: req.body.source
    });

    res.json({ success: true, data: [resource] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/resources", async function (req, res) {
  const subject = req.query.subject;

  let query = supabase
    .from("resources")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (subject) query = query.eq("subject", subject);

  const { data, error } = await query;
  res.json({ success: !error, data: data || [], error: error ? error.message : null });
});

app.delete("/resources/:id", async function (req, res) {
  const { data, error } = await supabase
    .from("resources")
    .update({ status: "deleted" })
    .eq("id", req.params.id)
    .select();

  res.json({ success: !error, data: data || [], error: error ? error.message : null });
});

app.post("/resources/:id/analyze", async function (req, res) {
  try {
    const result = await analyzeResourceById(req.params.id);
    res.json({
      success: true,
      provider: result.provider,
      reply: result.reply,
      data: result.data
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/resource-summaries", async function (req, res) {
  const resourceId = req.query.resource_id;

  let query = supabase
    .from("resource_summaries")
    .select("*")
    .order("created_at", { ascending: false });

  if (resourceId) query = query.eq("resource_id", resourceId);

  const { data, error } = await query;
  res.json({ success: !error, data: data || [], error: error ? error.message : null });
});

app.get("/creator-status", function (req, res) {
  res.json({
    success: true,
    creatorStudio: {
      scriptAI: Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY),
      voiceAI: Boolean(process.env.ELEVENLABS_API_KEY),
      imageAI: Boolean(process.env.STABILITY_API_KEY || process.env.HUGGINGFACE_API_KEY || process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY),
      videoAI: Boolean(process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY || process.env.RUNWAY_API_KEY),
      alerts: Boolean(process.env.SERPAPI_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY),
      weather: Boolean(process.env.OPENWEATHER_API_KEY)
    }
  });
});

function telegramKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["📚 Study Hub", "🧠 Memory"],
        ["📎 Add Resource", "📋 My Resources"],
        ["🎯 Goals", "🎬 Creator Studio"],
        ["❤️ Health", "🤖 Ask Sneha"]
      ],
      resize_keyboard: true
    }
  };
}

function splitTelegramMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3900) {
    chunks.push(text.slice(i, i + 3900));
  }
  return chunks;
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true
  });

  bot.on("polling_error", function (error) {
    console.log("Telegram polling error:", error.message);
  });

  bot.onText(/\/start/, async function (msg) {
    await bot.sendMessage(
      msg.chat.id,
      "Namaste Yash ❤️ Main Sneha AI hoon. Website aur Telegram dono par tumhari same AI mentor.",
      telegramKeyboard()
    );
  });

  bot.on("document", async function (msg) {
    await bot.sendMessage(
      msg.chat.id,
      "File mil gayi Yash ✅ Abhi PDF ka text ya Google Drive link bhejo, main usko resource me save karke analyze kar dungi.",
      telegramKeyboard()
    );
  });

  bot.on("photo", async function (msg) {
    await bot.sendMessage(
      msg.chat.id,
      "Photo mil gayi Yash ✅ Image OCR next step me add karenge. Abhi photo ka text likh do.",
      telegramKeyboard()
    );
  });

  bot.on("video", async function (msg) {
    await bot.sendMessage(
      msg.chat.id,
      "Video mil gaya Yash ✅ Video lecture analysis next step me add karenge.",
      telegramKeyboard()
    );
  });

  bot.on("message", async function (msg) {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/start")) return;

      if (msg.text === "📚 Study Hub") {
        return bot.sendMessage(
          msg.chat.id,
          "Study Hub 📚\nTopic, notes, syllabus ya PDF text bhejo.\nExample: DBMS Unit 1 Normalization samjhao",
          telegramKeyboard()
        );
      }

      if (msg.text === "🧠 Memory") {
        const memories = await getMemoryText();
        return bot.sendMessage(
          msg.chat.id,
          memories || "Abhi koi memory save nahi hai.",
          telegramKeyboard()
        );
      }

      if (msg.text === "📎 Add Resource") {
        return bot.sendMessage(
          msg.chat.id,
          "Resource add karne ke liye likho:\nadd resource: DBMS Unit 1 - Database basics",
          telegramKeyboard()
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
          return bot.sendMessage(
            msg.chat.id,
            "Abhi koi resource save nahi hai.",
            telegramKeyboard()
          );
        }

        const list = data
          .map(function (r, i) {
            return (i + 1) + ". " + r.title + " — " + r.subject + " " + (r.unit || "") + " (" + r.resource_type + ")";
          })
          .join("\n");

        return bot.sendMessage(msg.chat.id, list, telegramKeyboard());
      }

      if (msg.text === "🎯 Goals") {
        return bot.sendMessage(
          msg.chat.id,
          "Tumhara main goal: backlog + 4th sem clear karna, coding strong karna, career banana ❤️",
          telegramKeyboard()
        );
      }

      if (msg.text === "🎬 Creator Studio") {
        return bot.sendMessage(
          msg.chat.id,
          "Creator Studio 🎬\nBolo: Sneha, DBMS topic ka YouTube script banao.",
          telegramKeyboard()
        );
      }

      if (msg.text === "❤️ Health") {
        return bot.sendMessage(
          msg.chat.id,
          "Health mode ❤️\nPaani piyo, aankhon ko rest do, aur 25 min study + 5 min break follow karo.",
          telegramKeyboard()
        );
      }

      if (msg.text.toLowerCase().startsWith("add resource:")) {
        const content = msg.text.replace(/add resource:/i, "").trim();

        const resource = await saveResource({
          title: content.slice(0, 60),
          subject: "Telegram Text",
          unit: null,
          resource_type: "text",
          content: content,
          file_url: null,
          source: "telegram"
        });

        return bot.sendMessage(
          msg.chat.id,
          "Resource saved ✅\nID: " + resource.id,
          telegramKeyboard()
        );
      }

      await bot.sendChatAction(msg.chat.id, "typing");

      await saveMessage("telegram-yash", msg.text);
      await saveImportantMemory(msg.text);

      const result = await askSneha(msg.text);

      await saveMessage("telegram-sneha", result.reply, result.provider);

      const parts = splitTelegramMessage(result.reply);
      for (const part of parts) {
        await bot.sendMessage(msg.chat.id, part, telegramKeyboard());
      }
    } catch (error) {
      console.log("Telegram bot error:", error.message);
      await bot.sendMessage(
        msg.chat.id,
        "Yash ❤️ Telegram me issue aa gaya. Thodi der baad try karo.",
        telegramKeyboard()
      );
    }
  });

  console.log("Sneha Telegram Bot Running");
}

app.listen(PORT, function () {
  console.log("Sneha AI backend running on port " + PORT);
});
