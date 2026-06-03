const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sneha AI backend running on port ${PORT}`);
});
