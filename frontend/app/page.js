"use client";

import { useEffect, useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://sneha-ai.onrender.com";

export default function Home() {
  const [status, setStatus] = useState("Checking...");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [chat, setChat] = useState([
    {
      role: "sneha",
      text: "Namaste Yash ❤️ Main Sneha AI hoon. Tumhari padhai, coding, health, career aur goals me help karungi.",
    },
  ]);

  const [resources, setResources] = useState([]);
  const [resourceForm, setResourceForm] = useState({
    title: "",
    subject: "",
    unit: "",
    resource_type: "text",
    content: "",
    file_url: "",
  });

  useEffect(() => {
    checkBackend();
    loadResources();
  }, []);

  async function checkBackend() {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      const data = await res.json();
      if (data.status === "ok") setStatus("Backend + AI Connected ✅");
      else setStatus("Connection issue ⚠️");
    } catch {
      setStatus("Backend offline ❌");
    }
  }

  async function loadResources() {
    try {
      const res = await fetch(`${BACKEND_URL}/resources`);
      const data = await res.json();
      setResources(data.data || []);
    } catch {
      setResources([]);
    }
  }

  async function sendMessage() {
    if (!message.trim() || loading) return;

    const userText = message;
    setMessage("");
    setLoading(true);

    setChat((prev) => [
      ...prev,
      { role: "yash", text: userText },
      { role: "sneha", text: "Sneha soch rahi hai..." },
    ]);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userText }),
      });

      const data = await res.json();

      setChat((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "sneha",
          text: data.reply || "Yash, abhi response nahi aa paya.",
        };
        return updated;
      });
    } catch {
      setChat((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "sneha",
          text: "Yash, connection issue aa raha hai. Backend check karo.",
        };
        return updated;
      });
    }

    setLoading(false);
  }

  async function addResource() {
    if (!resourceForm.title || !resourceForm.subject) {
      alert("Title aur Subject required hai");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resourceForm),
      });

      const data = await res.json();

      if (data.success) {
        setResourceForm({
          title: "",
          subject: "",
          unit: "",
          resource_type: "text",
          content: "",
          file_url: "",
        });
        loadResources();
        alert("Resource save ho gaya ✅");
      } else {
        alert(data.message || data.error || "Save failed");
      }
    } catch {
      alert("Backend error");
    }
  }

  async function analyzeResource(id) {
    alert("Sneha analyze kar rahi hai. Thoda wait karo...");

    try {
      const res = await fetch(`${BACKEND_URL}/resources/${id}/analyze`, {
        method: "POST",
      });

      const data = await res.json();

      if (data.success) {
        setChat((prev) => [
          ...prev,
          {
            role: "sneha",
            text: data.reply,
          },
        ]);
        alert("Analysis complete ✅");
      } else {
        alert(data.error || "Analysis failed");
      }
    } catch {
      alert("Analyze error");
    }
  }

  async function deleteResource(id) {
    try {
      await fetch(`${BACKEND_URL}/resources/${id}`, {
        method: "DELETE",
      });
      loadResources();
    } catch {
      alert("Delete failed");
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="small">Sneha AI</p>
        <h1>Good Morning, Yash ❤️</h1>
        <p className="sub">
          Study, coding, health, career, opportunities aur creator tools ke liye
          tumhari personal AI mentor.
        </p>
      </section>

      <section className="statusBox">
        <span>{status}</span>
      </section>

      <section className="grid">
        <Card title="🎓 Study Hub" text="Notes, topics, revision, tests" />
        <Card title="💻 Coding Lab" text="Python, DSA, DBMS, debugging" />
        <Card title="❤️ Health" text="Water, sleep, workout, eye breaks" />
        <Card title="🏆 Opportunities" text="Scholarships, exams, internships" />
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
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Sneha se baat karo..."
          />
          <button onClick={sendMessage} disabled={loading}>
            {loading ? "..." : "Send"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>📚 Resource Library</h2>
        <p className="muted">
          Notes, syllabus, Drive link, topic ya text yahan add karo. Sneha usko
          analyze karke summary, MCQ aur important questions banayegi.
        </p>

        <input
          placeholder="Title e.g. DBMS Unit 1 Notes"
          value={resourceForm.title}
          onChange={(e) =>
            setResourceForm({ ...resourceForm, title: e.target.value })
          }
        />

        <input
          placeholder="Subject e.g. DBMS"
          value={resourceForm.subject}
          onChange={(e) =>
            setResourceForm({ ...resourceForm, subject: e.target.value })
          }
        />

        <input
          placeholder="Unit e.g. Unit 1"
          value={resourceForm.unit}
          onChange={(e) =>
            setResourceForm({ ...resourceForm, unit: e.target.value })
          }
        />

        <select
          value={resourceForm.resource_type}
          onChange={(e) =>
            setResourceForm({
              ...resourceForm,
              resource_type: e.target.value,
            })
          }
        >
          <option value="text">Text</option>
          <option value="link">Drive/PDF Link</option>
          <option value="syllabus">Syllabus</option>
          <option value="topic">Topic</option>
        </select>

        <textarea
          placeholder="Content / syllabus / topic details"
          value={resourceForm.content}
          onChange={(e) =>
            setResourceForm({ ...resourceForm, content: e.target.value })
          }
        />

        <input
          placeholder="File or Google Drive URL"
          value={resourceForm.file_url}
          onChange={(e) =>
            setResourceForm({ ...resourceForm, file_url: e.target.value })
          }
        />

        <button className="fullBtn" onClick={addResource}>
          Save Resource
        </button>
      </section>

      <section className="panel">
        <h2>Saved Resources</h2>

        {resources.length === 0 ? (
          <p className="muted">Abhi koi resource save nahi hai.</p>
        ) : (
          resources.map((r) => (
            <div className="resource" key={r.id}>
              <h3>{r.title}</h3>
              <p>
                {r.subject} {r.unit ? `• ${r.unit}` : ""}
              </p>
              <p className="muted">{r.resource_type}</p>

              {r.file_url ? (
                <a href={r.file_url} target="_blank">
                  Open Link
                </a>
              ) : null}

              <div className="row">
                <button onClick={() => analyzeResource(r.id)}>
                  Analyze
                </button>
                <button onClick={() => deleteResource(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
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
