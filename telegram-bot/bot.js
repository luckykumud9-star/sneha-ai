const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, {
  polling: true,
});

const BACKEND_URL = "https://sneha-ai.onrender.com";

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    "Namaste ❤️ Main Sneha AI hoon. Tumhari padhai, coding, health, career aur life goals me help karungi."
  );
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    "Bas mujhe normal message bhejo. Main answer dungi ❤️"
  );
});

bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    if (
      msg.text.startsWith("/start") ||
      msg.text.startsWith("/help")
    ) {
      return;
    }

    await bot.sendChatAction(msg.chat.id, "typing");

    const response = await axios.post(
      `${BACKEND_URL}/chat`,
      {
        message: msg.text,
      }
    );

    const reply =
      response.data?.reply ||
      "Sorry Yash ❤️ abhi response nahi mila.";

    await bot.sendMessage(msg.chat.id, reply);
  } catch (err) {
    console.error(err);

    await bot.sendMessage(
      msg.chat.id,
      "Yash ❤️ abhi thodi technical problem hai. 1 minute baad try karo."
    );
  }
});

console.log("Sneha Telegram Bot Running ❤️");
