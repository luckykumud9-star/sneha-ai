"use client";

import { useEffect, useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://sneha-ai.onrender.com";

export default function Home() {
  const [status, setStatus] = useState("Checking...");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([
    {
      role: "sneha",
      text: "Namaste Yash ❤️ Main Sneha AI hoon. Aaj hum padhai, health aur goals ko saath me improve karenge.",
    },
  ]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/db-test`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStatus("Backend + Supabase Connected ✅");
        else setStatus("Connection issue ⚠️");
      })
      .catch(() => setStatus("Backend offline ❌"));
  }, []);

  function sendMessage() {
    if (!message.trim()) return;

    const userMsg = { role: "yash", text: message };

    const reply = {
      role: "sneha",
      text:
        "Yash, maine tumhari baat samajh li. Abhi AI brain ka full connection next step me add karenge. Filhal dashboard, study, health aur memory system ready kar rahe hain.",
    };

    setChat([...chat, userMsg, reply]);
    setMessage("");
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="small">Sneha AI</p>
          <h1>Good Morning, Yash ❤️</h1>
          <p className="sub">
            Tumhara personal AI mentor — study, health, coding, career aur life
            growth ke liye.
          </p>
        </div>
      </section>

      <section className="statusBox">
        <span>{status}</span>
      </section>

      <section className="grid">
        <Card title="🎓 Study Hub" text="3rd + 4th sem, notes, PYQ, tests" />
        <Card title="💻 Coding Lab" text="Python, DSA, DBMS, debugging" />
        <Card title="❤️ Health" text="Water, sleep, workout, eye breaks" />
        <Card title="🏆 Opportunities" text="Exams, scholarships, internships" />
        <Card title="🎬 Creator Studio" text="Scripts, thumbnails, videos" />
        <Card title="🧠 Memory" text="Sneha tumhari progress yaad rakhegi" />
      </section>

      <section className="chatBox">
        <h2>Talk with Sneha</h2>

        <div className="messages">
          {chat.map((msg, index) => (
            <div
              key={index}
              className={msg.role === "yash" ? "msg user" : "msg ai"}
            >
              {msg.text}
            </div>
          ))}
        </div>

        <div className="inputRow">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Sneha se baat karo..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </section>
    </main>
  );
}

function Card({ title, text }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
              }
