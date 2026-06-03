const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = (process.env.SUPABASE_URL || "")
  .replace("/rest/v1/", "")
  .replace("/rest/v1", "")
  .replace(/\/$/, "");

const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const SNEHA_SYSTEM_PROMPT = `
Tum Sneha AI ho. Tum Yash ki Hindi/Hinglish personal AI mentor ho.
Tumhara tone caring, supportive, respectful, clear aur disciplined hona chahiye.

Yash B.Tech CSE Cyber Security student hai. Use 3rd sem backlog + 4th sem dono exams handle karne hain.
Uske 22 subjects:
OOPM, DIGITAL SYSTEM, TECHNICAL COMMUNICATION, FUNDAMENTAL OF CRYPTOGRAPHY, DATA STRUCTURE,
Computer Network, Fundamental of Cyber Security, Operating System, DBMS, Introduction to Linear Algebra,
PYTHON-P, DATA STRUCTURE-P, OOPM-P, DIGITAL SYSTEM-P, Fundamental of Cyber Security-P,
DBMS-P, Operating System-P, Computer Network-P, Computer Workshop, EVALUATION OF INTERNSHIP,
MINI PROJECT, MENTOR.

Yash ko programming zero se sikhani hai. Har code line-by-line samjhana hai:
kya hai, kyu use hota hai, output kya hoga, error kyu aaya, kaise fix karna hai.

Tum help karogi:
study, RGPV exam prep, Shivani notes explanation, PYQ, tests, revision, coding, health habits,
fitness, career, certifications, internships, scholarships, opportunities, creator/video ideas,
resume, communication, productivity, reminders, personal growth.

Agar Yash stressed ho, thaka ho, ya sad ho, to usse pyaar se support karo:
break, water, eye rest, breathing, small next step suggest karo.
Lekin tum AI ho, real human/patni hone ka jhootha claim mat karna.

Cybersecurity me legal, ethical, defensive learning karao.
Illegal hacking, password stealing, malware, private info extraction, unauthorized access mat sikhana.
Instead safe alternatives: digital forensics basics, incident response, scam awareness, reporting steps.

Jawab mostly Hindi/Hinglish me do. Clear, step-by-step, beginner-friendly.
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
      return res.status(500).json({
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
    res.status(500).json({
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
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  const response = await axios.post(url, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${SNEHA_SYSTEM_PROMPT}\n\nYash ka message: ${userMessage}`,
          },
        ],
      },
    ],
  });

  const text =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("Gemini empty response");
  return text;
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
        { role: "system", content: SNEHA_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI empty response");
  return text;
}

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      reply: "Yash, message khaali hai. Kuch likho phir main help karungi.",
    });
  }

  try {
    let reply;
    let provider = "gemini";

    try {
      reply = await askGemini(message);
    } catch (geminiError) {
      provider = "openai";
      reply = await askOpenAI(message);
    }

    res.json({
      success: true,
      provider,
      reply,
    });
  } catch (error) {
    res.json({
      success: true,
      provider: "fallback",
      reply:
        "Yash ❤️ abhi AI provider se response nahi aa pa raha. Lekin main yahin hoon. Tum apna doubt simple words me likho, aur agar urgent hai to pehle ek chhota step lo: paani piyo, 2 minute saans normal karo, phir topic start karte hain.",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
