const express = require("express");
const cors = require("cors");
const axios = require("axios");
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
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const SNEHA_PROMPT = `
Tum Sneha AI ho, Yash ki Hindi/Hinglish personal AI mentor.

Tumhara behavior:
- Caring, supportive, respectful, pyar se samjhane wali
- Study mentor, coding mentor, health mentor, fitness mentor, career mentor
- Yash ko naam se address karo
- Beginner-friendly, step-by-step jawab do
- Jab Yash stressed/sad/thaka ho to emotional support do, break/water/breathing/eye-rest suggest karo
- Tum AI mentor ho; real human/patni hone ka jhootha claim mat karna

Yash ke goals:
- 3rd sem backlog + 4th sem exams clear karna
- Programming zero se strong karna
- Cyber security ethical tareeke se seekhna
- Body, health, fitness, personality improve karna
- Career, internships, scholarships, exams, opportunities paana
- Creator/video skills develop karna

Yash ke 22 subjects:
OOPM, DIGITAL SYSTEM, TECHNICAL COMMUNICATION, FUNDAMENTAL OF CRYPTOGRAPHY, DATA STRUCTURE,
Computer Network, Fundamental of Cyber Security, Operating System, DBMS, Introduction to Linear Algebra,
PYTHON-P, DATA STRUCTURE-P, OOPM-P, DIGITAL SYSTEM-P, Fundamental of Cyber Security-P,
DBMS-P, Operating System-P, Computer Network-P, Computer Workshop, EVALUATION OF INTERNSHIP,
MINI PROJECT, MENTOR.

Safety:
Illegal hacking, password stealing, private info extraction, malware, unauthorized access mat sikhana.
Cybersecurity me sirf ethical, defensive aur legal help do.
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

  return data
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
}

async function buildPrompt(message) {
  const memories = await getMemoryText();
  const history = await getRecentHistoryText();

  return `
${SNEHA_PROMPT}

Yash ke saved memories:
${memories || "Abhi koi saved memory nahi."}

Recent chat history:
${history || "Abhi koi recent history nahi."}

Yash ka current message:
${message}
`;
}

async function saveMessage(role, content, provider = null) {
  try {
    await supabase.from("messages").insert({
      role,
      content,
      provider,
    });
  } catch (err) {
    console.log("Message save failed:", err.message);
  }
}

async function saveImportantMemory(message) {
  const lower = message.toLowerCase();

  const shouldSave =
    lower.includes("remember") ||
    lower.includes("yaad rakh") ||
    lower.includes("mera goal") ||
    lower.includes("main chahta") ||
    lower.includes("mujhe") ||
    lower.includes("semester") ||
    lower.includes("subject") ||
    lower.includes("health") ||
    lower.includes("stress") ||
    lower.includes("padhai");

  if (!shouldSave) return;

  try {
    await supabase.from("memories").insert({
      memory_text: message.slice(0, 500),
    });
  } catch (err) {
    console.log("Memory save failed:", err.message);
  }
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
    huggingfaceSet: Boolean(process.env.HUGGINGFACE_API_KEY),
    elevenlabsSet: Boolean(process.env.ELEVENLABS_API_KEY),
    replicateSet: Boolean(process.env.REPLICATE_API_TOKEN),
    falSet: Boolean(process.env.FAL_KEY),
    runwaySet: Boolean(process.env.RUNWAY_API_KEY),
    stabilitySet: Boolean(process.env.STABILITY_API_KEY),
    serpapiSet: Boolean(process.env.SERPAPI_API_KEY),
    resendSet: Boolean(process.env.RESEND_API_KEY),
    openweatherSet: Boolean(process.env.OPENWEATHER_API_KEY),
    telegramSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
});

app.get("/db-test", async (req, res) => {
  const { data, error } = await supabase.from("profiles").select("*").limit(1);

  if (error) {
    return res.json({
      success: false,
      message: "Supabase connection failed",
      error: error.message,
    });
  }

  res.json({
    success: true,
    message: "Supabase connected successfully",
    data,
  });
});

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API key missing");

  const prompt = await buildPrompt(message);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
    },
    { timeout: 30000 }
  );

  const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Gemini empty response");
  return reply;
}

async function askGroq(message) {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq API key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
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

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq empty response");
  return reply;
}

async function askOpenRouter(message) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key missing");
  }

  const prompt = await buildPrompt(message);

  const response = await axios.post(
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

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenRouter empty response");
  return reply;
}

async function askOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");

  const prompt = await buildPrompt(message);

  const response = await axios.post(
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

  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenAI empty response");
  return reply;
}

function localSnehaFallback(message) {
  const text = message.toLowerCase();

  if (text.includes("dbms")) {
    return "Yash, DBMS ka matlab Database Management System hota hai. Ye data ko store, manage aur retrieve karne ka system hai. Example: students table me name, roll number, marks store hote hain.";
  }

  if (text.includes("python")) {
    return "Yash, Python ek beginner-friendly programming language hai. Example: print('Hello') screen par Hello dikhata hai.";
  }

  if (text.includes("stress") || text.includes("sad") || text.includes("thak")) {
    return "Yash ❤️ pehle 2 minute normal breathing karo, paani piyo, aankhon ko rest do. Tum loser nahi ho. Abhi sirf 15 minute ka chhota target lete hain.";
  }

  return "Yash ❤️ online AI providers busy/quota issue me ho sakte hain, lekin main basic help kar sakti hoon. Tum topic simple words me likho.";
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
    provider: "local-fallback",
    reply: localSnehaFallback(message),
    debug: errors,
  };
}

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
  const result = await askSneha("Sneha mujhe DBMS zero se simple words me samjhao");

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

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null,
  });
});

app.get("/memories", async (req, res) => {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({
    success: !error,
    data: data || [],
    error: error?.message || null,
  });
});

app.post("/memory", async (req, res) => {
  const { memory } = req.body;

  if (!memory || !memory.trim()) {
    return res.json({
      success: false,
      message: "Memory empty hai.",
    });
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({ memory_text: memory })
    .select();

  res.json({
    success: !error,
    data,
    error: error?.message || null,
  });
});

app.get("/creator-status", (req, res) => {
  res.json({
    success: true,
    creatorStudio: {
      scriptAI: Boolean(
        process.env.GEMINI_API_KEY ||
          process.env.GROQ_API_KEY ||
          process.env.OPENROUTER_API_KEY
      ),
      voiceAI: Boolean(process.env.ELEVENLABS_API_KEY),
      imageAI: Boolean(
        process.env.STABILITY_API_KEY ||
          process.env.HUGGINGFACE_API_KEY ||
          process.env.REPLICATE_API_TOKEN ||
          process.env.FAL_KEY
      ),
      videoAI: Boolean(
        process.env.REPLICATE_API_TOKEN ||
          process.env.FAL_KEY ||
          process.env.RUNWAY_API_KEY
      ),
      alerts: Boolean(process.env.SERPAPI_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY),
      weather: Boolean(process.env.OPENWEATHER_API_KEY),
    },
  });
});

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
