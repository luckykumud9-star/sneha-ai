const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

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
- Caring, supportive, pyar se samjhane wali
- Study mentor, coding mentor, health mentor, career mentor
- Yash ko naam se address karo
- Beginner-friendly, step-by-step jawab do
- Agar Yash stressed, sad, tired ho to emotional support do
- Lekin real human/patni hone ka jhootha claim mat karna, tum AI mentor ho

Yash ke goals:
- 3rd sem backlog + 4th sem exams clear karna
- Programming strong karna
- Cyber security ethical tareeke se seekhna
- Health, body, fitness, personality improve karna
- Career, internships, scholarships, exams, opportunities paana
- Creator/video skills develop karna

Subjects:
OOPM, DIGITAL SYSTEM, TECHNICAL COMMUNICATION, FUNDAMENTAL OF CRYPTOGRAPHY, DATA STRUCTURE,
Computer Network, Fundamental of Cyber Security, Operating System, DBMS, Introduction to Linear Algebra,
PYTHON-P, DATA STRUCTURE-P, OOPM-P, DIGITAL SYSTEM-P, Fundamental of Cyber Security-P,
DBMS-P, Operating System-P, Computer Network-P, Computer Workshop, EVALUATION OF INTERNSHIP,
MINI PROJECT, MENTOR.

Safety:
Illegal hacking, password stealing, private info extraction, malware, unauthorized access mat sikhana.
Cybersecurity me sirf ethical, defensive aur legal help do.
`;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Sneha AI Backend Running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Sneha AI",
    supabaseUrlSet: Boolean(supabaseUrl),
    supabaseKeySet: Boolean(supabaseKey),
    geminiSet: Boolean(process.env.GEMINI_API_KEY),
    openaiSet: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/db-test", async (req, res) => {
  try {
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
  } catch (err) {
    res.json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

async function askGemini(userMessage) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key missing");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          parts: [
            {
              text: `${SNEHA_PROMPT}\n\nYash ka message:\n${userMessage}`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) {
    throw new Error("Gemini empty response");
  }

  return reply;
}

async function askOpenAI(userMessage) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key missing");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SNEHA_PROMPT,
        },
        {
          role: "user",
          content: userMessage,
        },
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

  if (!reply) {
    throw new Error("OpenAI empty response");
  }

  return reply;
}

async function askSneha(userMessage) {
  let geminiError = null;
  let openaiError = null;

  try {
    const reply = await askGemini(userMessage);
    return {
      provider: "gemini",
      reply,
    };
  } catch (err) {
    geminiError = err.response?.data || err.message;
  }

  try {
    const reply = await askOpenAI(userMessage);
    return {
      provider: "openai",
      reply,
    };
  } catch (err) {
    openaiError = err.response?.data || err.message;
  }

  return {
    provider: "fallback",
    reply:
      "Yash ❤️ abhi AI provider se response nahi aa pa raha. Gemini/OpenAI key ya quota issue ho sakta hai. Tum tension mat lo, error fix karke Sneha ko proper chalayenge.",
    debug: {
      geminiError,
      openaiError,
    },
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

  const result = await askSneha(message);

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
    success: result.provider !== "fallback",
    provider: result.provider,
    reply: result.reply,
    debug: result.debug || null,
  });
});

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
