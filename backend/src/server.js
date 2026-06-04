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

Tumhara style:
- Caring, supportive, pyar se samjhane wali
- Hindi/Hinglish first
- Beginner-friendly
- Step-by-step
- Motivation + discipline dono
- Short aur clear answer, lekin zarurat ho to detail me samjhao

Yash ke goals:
- 3rd sem backlog + 4th sem exams clear karna
- Programming strong karna
- Cyber security ethical tareeke se seekhna
- Body, health, fitness, personality improve karna
- Career, internships, scholarships, exams, opportunities paana
- Creator/video skills develop karna

Yash ke subjects:
OOPM, DIGITAL SYSTEM, TECHNICAL COMMUNICATION, FUNDAMENTAL OF CRYPTOGRAPHY, DATA STRUCTURE,
Computer Network, Fundamental of Cyber Security, Operating System, DBMS, Introduction to Linear Algebra,
PYTHON-P, DATA STRUCTURE-P, OOPM-P, DIGITAL SYSTEM-P, Fundamental of Cyber Security-P,
DBMS-P, Operating System-P, Computer Network-P, Computer Workshop, EVALUATION OF INTERNSHIP,
MINI PROJECT, MENTOR.

Rules:
- Yash ko naam se address karo.
- Agar wo stressed/sad/thaka ho to emotional support do, break/water/breathing/eye rest suggest karo.
- Real human/patni hone ka jhootha claim mat karna. Tum AI mentor ho.
- Illegal hacking, password stealing, private info nikalna, malware, unauthorized access mat sikhana.
- Cybersecurity me sirf ethical, defensive, legal guidance do.
- Coding me code line-by-line samjhao.
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
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .limit(1);

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

  const response = await axios.post(
    url,
    {
      contents: [
        {
          parts: [
            {
              text: `${SNEHA_SYSTEM_PROMPT}\n\nYash ka message: ${userMessage}`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini empty response");
  }

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
        {
          role: "system",
          content: SNEHA_SYSTEM_PROMPT,
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
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenAI empty response");
  }

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
    let reply = "";
    let provider = "";

    try {
      reply = await askGemini(message);
      provider = "gemini";
    } catch (geminiError) {
      console.log("Gemini failed:", geminiError.message);

      try {
        reply = await askOpenAI(message);
        provider = "openai";
      } catch (openaiError) {
        console.log("OpenAI failed:", openaiError.message);

        return res.json({
          success: true,
          provider: "fallback",
          reply:
            "Yash ❤️ abhi AI provider se response nahi aa pa raha. Lekin main yahin hoon. Tum apna doubt simple words me likho, aur agar urgent hai to pehle ek chhota step lo: paani piyo, 2 minute saans normal karo, phir topic start karte hain.",
          debug: {
            geminiError: geminiError.message,
            openaiError: openaiError.message,
          },
        });
      }
    }

    return res.json({
      success: true,
      provider,
      reply,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      reply: "Yash, server me issue aa gaya. Thoda sa rukkar dobara try karo.",
      error: error.message,
    });
  }
});

app.get("/chat-test", async (req, res) => {
  try {
    const reply = await askGemini("Sneha, mujhe DBMS kya hota hai batao");
    res.json({
      success: true,
      provider: "gemini",
      reply,
    });
  } catch (geminiError) {
    try {
      const reply = await askOpenAI("Sneha, mujhe DBMS kya hota hai batao");
      res.json({
        success: true,
        provider: "openai",
        reply,
      });
    } catch (openaiError) {
      res.json({
        success: false,
        geminiError: geminiError.message,
        openaiError: openaiError.message,
      });
    }
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
