"use client";

import { useEffect, useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://sneha-ai.onrender.com";

const tabs = [
  "Mission",
  "Creator",
  "Academy",
  "Sneha",
  "Vault",
  "Radar",
  "Control"
];

const categories = [
  "AI Character Story",
  "Object Talking",
  "Podcast",
  "Educational",
  "Coding Tutorial",
  "Funny Story",
  "Emotional Story",
  "Horror",
  "Motivation",
  "Anime / Cartoon",
  "Custom"
];

export default function Home() {
  const [active, setActive] = useState("Mission");
  const [health, setHealth] = useState("Checking...");
  const [chat, setChat] = useState([
    {
      role: "sneha",
      text: "Namaste Yash ❤️ Main Sneha YS hoon. Study, coding, creator aur life goals me tumhari AI mentor."
    }
  ]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [resources, setResources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [projects, setProjects] = useState([]);

  const [resource, setResource] = useState({
    title: "",
    subject: "",
    unit: "",
    resource_type: "text",
    content: "",
    file_url: ""
  });

  const [uploadData, setUploadData] = useState({
    title: "",
    subject: "",
    unit: "",
    file: null
  });

  const [creator, setCreator] = useState({
    title: "",
    category: "AI Character Story",
    platform: "YouTube Shorts",
    style: "Cinematic",
    voice_type: "Young Hindi Female",
    story: ""
  });

  useEffect(() => {
    checkHealth();
    loadAll();
  }, []);

  async function api(path, options = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, options);
    return res.json();
  }

  async function checkHealth() {
    try {
      const data = await api("/health");
      setHealth(data.status === "ok" ? "Online ✅" : "Issue ⚠️");
    } catch {
      setHealth("Offline ❌");
    }
  }

  async function loadAll() {
    try {
      const [r, j, p] = await Promise.all([
        api("/resources"),
        api("/jobs"),
        api("/projects")
      ]);
      setResources(r.data || []);
      setJobs(j.data || []);
      setProjects(p.data || []);
    } catch {}
  }

  async function sendChat(customText) {
    const text = customText || msg;
    if (!text.trim() || loading) return;

    setMsg("");
    setLoading(true);
    setActive("Sneha");

    setChat((old) => [
      ...old,
      { role: "yash", text },
      { role: "sneha", text: "Sneha soch rahi hai..." }
    ]);

    try {
      const data = await api("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      setChat((old) => {
        const copy = [...old];
        copy[copy.length - 1] = {
          role: "sneha",
          text: data.reply || data.error || "Response nahi mila."
        };
        return copy;
      });
    } catch {
      setChat((old) => {
        const copy = [...old];
        copy[copy.length - 1] = {
          role: "sneha",
          text: "Backend connection issue aa raha hai."
        };
        return copy;
      });
    }

    setLoading(false);
    loadAll();
  }

  async function saveResource() {
    if (!resource.title) return alert("Title required hai");

    const data = await api("/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource)
    });

    if (data.success) {
      alert("Resource saved ✅");
      setResource({
        title: "",
        subject: "",
        unit: "",
        resource_type: "text",
        content: "",
        file_url: ""
      });
      loadAll();
    } else {
      alert(data.error || data.message || "Save failed");
    }
  }

  async function uploadFile() {
    if (!uploadData.title || !uploadData.file) {
      return alert("Title aur file required hai");
    }

    const form = new FormData();
    form.append("title", uploadData.title);
    form.append("subject", uploadData.subject);
    form.append("unit", uploadData.unit);
    form.append("file", uploadData.file);

    const data = await api("/upload", {
      method: "POST",
      body: form
    });

    if (data.success) {
      alert("Upload complete ✅");
      if (data.analysis?.reply) {
        setChat((old) => [
          ...old,
          { role: "sneha", text: data.analysis.reply }
        ]);
        setActive("Sneha");
      }
      loadAll();
    } else {
      alert(data.message || data.error || "Upload failed");
    }
  }

  async function analyzeResource(id) {
    const data = await api(`/resources/${id}/analyze`, {
      method: "POST"
    });

    if (data.success) {
      setChat((old) => [...old, { role: "sneha", text: data.reply }]);
      setActive("Sneha");
      loadAll();
    } else {
      alert(data.error || "Analyze failed");
    }
  }

  async function createProject() {
    if (!creator.title) return alert("Project title required hai");

    const data = await api("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creator)
    });

    if (data.success) {
      alert("Project created ✅");
      setCreator({
        title: "",
        category: "AI Character Story",
        platform: "YouTube Shorts",
        style: "Cinematic",
        voice_type: "Young Hindi Female",
        story: ""
      });
      loadAll();
    } else {
      alert(data.error || data.message || "Project failed");
    }
  }

  async function generateBlueprint(projectId) {
    const data = await api(`/projects/${projectId}/blueprint`, {
      method: "POST"
    });

    if (data.success) {
      setChat((old) => [...old, { role: "sneha", text: data.reply }]);
      setActive("Sneha");
      loadAll();
    } else {
      alert(data.error || "Blueprint failed");
    }
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">YS</div>
          <div>
            <h1>Sneha YS</h1>
            <p>AI Mentor • Creator • Academy</p>
          </div>
        </div>

        <div className="nav">
          {tabs.map((t) => (
            <button
              key={t}
              className={active === t ? "active" : ""}
              onClick={() => setActive(t)}
            >
              {icon(t)} {t}
            </button>
          ))}
        </div>
      </aside>

      <section className="content">
        <header className="top">
          <div>
            <p className="small">Mission Control</p>
            <h2>Welcome Yash ❤️</h2>
            <p className="muted">
              Study, coding, creator, opportunities aur personal growth ek jagah.
            </p>
          </div>
          <button onClick={checkHealth}>{health}</button>
        </header>

        {active === "Mission" && (
          <>
            <section className="hero">
              <div>
                <p className="small">Today’s Mode</p>
                <h3>Zero → Hero + Creator Pro</h3>
                <p>
                  Sneha YS tumhe padhai, programming, PDF analysis, video
                  planning, character stories aur opportunities me guide karegi.
                </p>
              </div>
              <button onClick={() => setActive("Creator")}>Create Video</button>
            </section>

            <div className="grid4">
              <Card title="Study" value="72%" desc="PDF, notes, coding" />
              <Card title="Creator" value="48%" desc="Videos, images, shorts" />
              <Card title="Jobs" value={jobs.length} desc="Live workflow jobs" />
              <Card title="Vault" value={resources.length} desc="Saved items" />
            </div>

            <section className="panel">
              <h3>Live Jobs</h3>
              {jobs.length === 0 ? (
                <p className="muted">Abhi koi live job nahi hai.</p>
              ) : (
                jobs.slice(0, 6).map((j) => (
                  <div className="job" key={j.id}>
                    <b>{j.job_type}</b>
                    <span>{j.status} • {j.progress}%</span>
                    <div className="bar">
                      <div style={{ width: `${j.progress || 0}%` }} />
                    </div>
                    <small>{j.details}</small>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {active === "Creator" && (
          <>
            <section className="panel">
              <h3>🎬 Creator Studio</h3>
              <p className="muted">
                Category lock → platform lock → voice lock → story → blueprint.
              </p>

              <div className="formGrid">
                <input
                  placeholder="Project title"
                  value={creator.title}
                  onChange={(e) =>
                    setCreator({ ...creator, title: e.target.value })
                  }
                />
                <select
                  value={creator.category}
                  onChange={(e) =>
                    setCreator({ ...creator, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={creator.platform}
                  onChange={(e) =>
                    setCreator({ ...creator, platform: e.target.value })
                  }
                >
                  <option>YouTube Shorts</option>
                  <option>Instagram Reel</option>
                  <option>YouTube Long</option>
                  <option>Podcast</option>
                  <option>Multi Platform</option>
                </select>
                <select
                  value={creator.style}
                  onChange={(e) =>
                    setCreator({ ...creator, style: e.target.value })
                  }
                >
                  <option>Cinematic</option>
                  <option>Realistic</option>
                  <option>Anime</option>
                  <option>Indian Cartoon</option>
                  <option>Educational</option>
                </select>
                <select
                  value={creator.voice_type}
                  onChange={(e) =>
                    setCreator({ ...creator, voice_type: e.target.value })
                  }
                >
                  <option>Young Hindi Female</option>
                  <option>Young Hindi Male</option>
                  <option>Narrator Hindi Female</option>
                  <option>Narrator Hindi Male</option>
                  <option>Multiple Characters</option>
                </select>
              </div>

              <textarea
                placeholder="Story / idea likho..."
                value={creator.story}
                onChange={(e) =>
                  setCreator({ ...creator, story: e.target.value })
                }
              />

              <button className="primary" onClick={createProject}>
                Save Project
              </button>
            </section>

            <section className="panel">
              <h3>Saved Projects</h3>
              <div className="cards">
                {projects.length === 0 ? (
                  <p className="muted">Abhi koi project nahi hai.</p>
                ) : (
                  projects.map((p) => (
                    <div className="miniCard" key={p.id}>
                      <b>{p.title}</b>
                      <p>{p.category} • {p.platform}</p>
                      <small>{p.style} • {p.voice_type}</small>
                      <button onClick={() => generateBlueprint(p.id)}>
                        Generate Blueprint
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {active === "Academy" && (
          <>
            <section className="panel">
              <h3>📚 PDF / Notes Upload</h3>
              <div className="formGrid">
                <input
                  placeholder="Title"
                  value={uploadData.title}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, title: e.target.value })
                  }
                />
                <input
                  placeholder="Subject"
                  value={uploadData.subject}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, subject: e.target.value })
                  }
                />
                <input
                  placeholder="Unit"
                  value={uploadData.unit}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, unit: e.target.value })
                  }
                />
                <input
                  type="file"
                  accept=".pdf,image/*,video/*"
                  onChange={(e) =>
                    setUploadData({ ...uploadData, file: e.target.files[0] })
                  }
                />
              </div>
              <button className="primary" onClick={uploadFile}>
                Upload + Analyze
              </button>
            </section>

            <section className="panel">
              <h3>➕ Add Text / Syllabus / Topic</h3>
              <div className="formGrid">
                <input
                  placeholder="Title"
                  value={resource.title}
                  onChange={(e) =>
                    setResource({ ...resource, title: e.target.value })
                  }
                />
                <input
                  placeholder="Subject"
                  value={resource.subject}
                  onChange={(e) =>
                    setResource({ ...resource, subject: e.target.value })
                  }
                />
                <input
                  placeholder="Unit"
                  value={resource.unit}
                  onChange={(e) =>
                    setResource({ ...resource, unit: e.target.value })
                  }
                />
                <select
                  value={resource.resource_type}
                  onChange={(e) =>
                    setResource({ ...resource, resource_type: e.target.value })
                  }
                >
                  <option value="text">Text</option>
                  <option value="syllabus">Syllabus</option>
                  <option value="topic">Topic</option>
                  <option value="link">Link</option>
                </select>
              </div>
              <textarea
                placeholder="Content / syllabus / topic"
                value={resource.content}
                onChange={(e) =>
                  setResource({ ...resource, content: e.target.value })
                }
              />
              <input
                placeholder="File / Drive URL"
                value={resource.file_url}
                onChange={(e) =>
                  setResource({ ...resource, file_url: e.target.value })
                }
              />
              <button className="primary" onClick={saveResource}>
                Save Resource
              </button>
            </section>
          </>
        )}

        {active === "Sneha" && (
          <section className="chatPanel">
            <div className="messages">
              {chat.map((m, i) => (
                <div key={i} className={m.role === "yash" ? "msg user" : "msg ai"}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="chatInput">
              <input
                placeholder="Sneha se kuch bhi pucho..."
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <button onClick={() => sendChat()} disabled={loading}>
                {loading ? "..." : "Send"}
              </button>
            </div>
          </section>
        )}

        {active === "Vault" && (
          <section className="panel">
            <h3>📂 Knowledge Vault</h3>
            <div className="cards">
              {resources.length === 0 ? (
                <p className="muted">Abhi koi resource saved nahi hai.</p>
              ) : (
                resources.map((r) => (
                  <div className="miniCard" key={r.id}>
                    <b>{r.title}</b>
                    <p>{r.subject || "No subject"} {r.unit ? `• ${r.unit}` : ""}</p>
                    <small>{r.resource_type}</small>
                    <button onClick={() => analyzeResource(r.id)}>
                      Analyze
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {active === "Radar" && (
          <section className="panel">
            <h3>🌍 Opportunity Radar</h3>
            <p className="muted">
              Scholarships, internships, govt exams, free certificates aur
              competitions yahan track honge.
            </p>
            <button
              className="primary"
              onClick={() =>
                sendChat(
                  "Mere liye free certificates, scholarships, internships aur govt exams ki priority list banao."
                )
              }
            >
              Ask Sneha for Opportunities
            </button>
          </section>
        )}

        {active === "Control" && (
          <section className="panel">
            <h3>⚙️ Control Center</h3>
            <p className="muted">
              Health, providers, self-healing aur system status.
            </p>
            <button className="primary" onClick={checkHealth}>
              Recheck Health
            </button>
            <button
              onClick={() =>
                sendChat("Sneha YS system ka health check aur improvement plan banao.")
              }
            >
              Ask Error Doctor
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

function icon(name) {
  const map = {
    Mission: "🏠",
    Creator: "🎬",
    Academy: "📚",
    Sneha: "🧠",
    Vault: "📂",
    Radar: "🌍",
    Control: "⚙️"
  };
  return map[name] || "✨";
}

function Card({ title, value, desc }) {
  return (
    <div className="stat">
      <span>{title}</span>
      <b>{value}</b>
      <p>{desc}</p>
    </div>
  );
          }
