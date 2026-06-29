"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
}
interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    doc_name: string;
    chunk_index: number;
    similarity: number;
  }>;
  tool_calls?: Array<{
    tool_name: string;
    args: Record<string, unknown>;
    status: string;
  }>;
}
interface Document {
  id: string;
  name: string;
  chunk_count: number;
  created_at: string;
}

export default function HomeClient({
  user,
  initialWorkspaces,
}: {
  user: { email?: string };
  initialWorkspaces: Workspace[];
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [activeWs, setActiveWs] = useState<Workspace | null>(
    initialWorkspaces[0] ?? null,
  );
  const [newWsName, setNewWsName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"chat" | "docs" | "tools">("chat");
  const [toolLog, setToolLog] = useState<
    Array<{
      tool_name: string;
      args: unknown;
      result: unknown;
      status: string;
      created_at: string;
    }>
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load documents and tool log when workspace changes
  useEffect(() => {
    if (!activeWs) return;
    setMessages([]);
    loadDocuments();
    loadToolLog();
    loadChatHistory();
  }, [activeWs?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadDocuments() {
    if (!activeWs) return;
    const res = await fetch(`/api/documents?workspace_id=${activeWs.id}`);
    if (res.ok) {
      const d = await res.json();
      setDocuments(d.documents ?? []);
    }
  }

  async function loadToolLog() {
    if (!activeWs) return;
    const res = await fetch(`/api/tool-log?workspace_id=${activeWs.id}`);
    if (res.ok) {
      const d = await res.json();
      setToolLog(d.logs ?? []);
    }
  }

  async function loadChatHistory() {
    if (!activeWs) return;
    const res = await fetch(`/api/chat-history?workspace_id=${activeWs.id}`);
    if (res.ok) {
      const d = await res.json();
      setMessages(
        (d.messages ?? []).map(
          (m: {
            role: "user" | "assistant";
            content: string;
            citations?: Array<{
              doc_name: string;
              chunk_index: number;
              similarity: number;
            }>;
          }) => ({
            role: m.role,
            content: m.content,
            citations: m.citations,
          }),
        ),
      );
    }
  }

  async function createWorkspace() {
    if (!newWsName.trim()) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWsName.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      setWorkspaces((prev) => [...prev, d.workspace]);
      setActiveWs(d.workspace);
      setNewWsName("");
    }
  }

  async function handleUpload(file: File) {
    if (!activeWs) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("workspace_id", activeWs.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await res.json();
    setUploading(false);
    if (res.ok) {
      alert(d.message);
      loadDocuments();
    } else {
      alert(`Upload failed: ${d.error}`);
    }
  }

  async function sendMessage() {
    if (!question.trim() || !activeWs || chatLoading) return;
    const q = question.trim();
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setChatLoading(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, workspace_id: activeWs.id }),
    });
    // const d = await res.json()

    let d: any = {};
    try {
      d = await res.json();
    } catch {
      setChatLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Server error aaya. Please retry karo.",
        },
      ]);
      return;
    }
    setChatLoading(false);

    if (res.ok) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: d.answer,
          citations: d.citations,
          tool_calls: d.tool_calls,
        },
      ]);
      if (d.tool_calls?.length) loadToolLog();
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${d.error}` },
      ]);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={s.shell}>
      {/* ── Sidebar ── */}
      <aside style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={s.logo}>⬡ DocMind</span>
          <button onClick={handleSignOut} style={s.signOut}>
            Sign out
          </button>
        </div>
        <div style={s.userEmail}>{user.email}</div>

        <div style={s.sectionLabel}>WORKSPACES</div>
        <div style={s.wsList}>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              style={{
                ...s.wsItem,
                ...(activeWs?.id === ws.id ? s.wsItemActive : {}),
              }}
              onClick={() => setActiveWs(ws)}
            >
              <span style={s.wsIcon}>◈</span>
              {ws.name}
            </button>
          ))}
        </div>

        <div style={s.newWs}>
          <input
            style={s.newWsInput}
            placeholder="New workspace…"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
          />
          <button style={s.newWsBtn} onClick={createWorkspace}>
            +
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={s.main}>
        {!activeWs ? (
          <div style={s.empty}>Create a workspace to get started →</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={s.tabBar}>
              <span style={s.wsTitle}>◈ {activeWs.name}</span>
              <div style={s.tabs}>
                {(["chat", "docs", "tools"] as const).map((t) => (
                  <button
                    key={t}
                    style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
                    onClick={() => setTab(t)}
                  >
                    {t === "chat"
                      ? "💬 Chat"
                      : t === "docs"
                        ? "📄 Documents"
                        : "🔧 Tool Log"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Chat Tab ── */}
            {tab === "chat" && (
              <div style={s.chatPane}>
                <div style={s.messages}>
                  {messages.length === 0 && (
                    <div style={s.emptyChat}>
                      Upload documents, then ask anything about them.
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        ...s.msg,
                        ...(m.role === "user" ? s.msgUser : s.msgAssistant),
                      }}
                    >
                      <div style={s.msgRole}>
                        {m.role === "user" ? "You" : "⬡ Assistant"}
                      </div>
                      <div style={s.msgContent}>{m.content}</div>
                      {m.citations && m.citations.length > 0 && (
                        <div style={s.citations}>
                          {m.citations.map((c, ci) => (
                            <span key={ci} style={s.citation}>
                              📎 {c.doc_name}, chunk {c.chunk_index} (
                              {Math.round(c.similarity * 100)}%)
                            </span>
                          ))}
                        </div>
                      )}
                      {m.tool_calls && m.tool_calls.length > 0 && (
                        <div style={s.toolBadges}>
                          {m.tool_calls.map((t, ti) => (
                            <span
                              key={ti}
                              style={{
                                ...s.toolBadge,
                                ...(t.status === "success"
                                  ? s.toolSuccess
                                  : s.toolError),
                              }}
                            >
                              🔧 {t.tool_name} → {t.status}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ ...s.msg, ...s.msgAssistant }}>
                      <div style={s.msgRole}>⬡ Assistant</div>
                      <div style={s.thinking}>Thinking…</div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div style={s.inputRow}>
                  <input
                    style={s.chatInput}
                    placeholder="Ask something about your documents…"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && sendMessage()
                    }
                  />
                  <button
                    style={s.sendBtn}
                    onClick={sendMessage}
                    disabled={chatLoading}
                  >
                    ➤
                  </button>
                </div>
              </div>
            )}

            {/* ── Docs Tab ── */}
            {tab === "docs" && (
              <div style={s.docsPane}>
                <div style={s.uploadArea}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.pdf,.docx"
                    style={{ display: "none" }}
                    onChange={(e) =>
                      e.target.files?.[0] && handleUpload(e.target.files[0])
                    }
                  />
                  <button
                    style={s.uploadBtn}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading
                      ? "⏳ Processing…"
                      : "⬆ Upload Document (.txt, .pdf, .docx)"}
                  </button>
                  <p style={s.uploadHint}>
                    Max 10MB. Same file won't be duplicated.
                  </p>
                </div>

                {documents.length === 0 ? (
                  <div style={s.emptyChat}>
                    No documents in this workspace yet.
                  </div>
                ) : (
                  <div style={s.docList}>
                    {documents.map((doc) => (
                      <div key={doc.id} style={s.docItem}>
                        <div style={s.docIcon}>📄</div>
                        <div>
                          <div style={s.docName}>{doc.name}</div>
                          <div style={s.docMeta}>
                            {doc.chunk_count} chunks ·{" "}
                            {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tool Log Tab ── */}
            {tab === "tools" && (
              <div style={s.docsPane}>
                {toolLog.length === 0 ? (
                  <div style={s.emptyChat}>
                    No tool calls yet in this workspace.
                  </div>
                ) : (
                  <div style={s.docList}>
                    {toolLog.map((log, i) => (
                      <div key={i} style={s.toolLogItem}>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              ...s.toolBadge,
                              ...(log.status === "success"
                                ? s.toolSuccess
                                : s.toolError),
                            }}
                          >
                            {log.status}
                          </span>
                          <strong style={{ color: "var(--accent)" }}>
                            {log.tool_name}
                          </strong>
                          <span
                            style={{ color: "var(--text-muted)", fontSize: 12 }}
                          >
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={s.toolArgs}>
                          Args: <code>{JSON.stringify(log.args)}</code>
                        </div>
                        <div style={s.toolArgs}>
                          Result: <code>{JSON.stringify(log.result)}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
    background: "var(--bg)",
  },
  sidebar: {
    width: 240,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: "20px 16px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { fontSize: 18, fontWeight: 700, color: "var(--accent)" },
  signOut: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 12,
  },
  userEmail: {
    padding: "0 16px 16px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  },
  sectionLabel: {
    padding: "14px 16px 6px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.08em",
  },
  wsList: { flex: 1, overflowY: "auto", padding: "4px 8px" },
  wsItem: {
    width: "100%",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 8,
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
  },
  wsItemActive: { background: "var(--surface-2)", color: "var(--text)" },
  wsIcon: { color: "var(--accent)", fontSize: 12 },
  newWs: { padding: "10px 8px 16px", display: "flex", gap: 6 },
  newWsInput: {
    flex: 1,
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
  },
  newWsBtn: {
    background: "var(--accent)",
    border: "none",
    color: "white",
    borderRadius: 8,
    width: 34,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 18,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
  },
  tabBar: {
    padding: "16px 24px 0",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wsTitle: { fontWeight: 600, fontSize: 16, color: "var(--text)" },
  tabs: { display: "flex", gap: 4 },
  tab: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "8px 14px",
    borderRadius: "8px 8px 0 0",
    fontSize: 13,
  },
  tabActive: { background: "var(--surface-2)", color: "var(--text)" },
  chatPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  emptyChat: {
    textAlign: "center",
    color: "var(--text-muted)",
    marginTop: 60,
    fontSize: 14,
  },
  msg: { maxWidth: 760, borderRadius: 12, padding: "14px 18px" },
  msgUser: {
    background: "var(--surface-2)",
    alignSelf: "flex-end",
    border: "1px solid var(--border)",
  },
  msgAssistant: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    alignSelf: "flex-start",
  },
  msgRole: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  msgContent: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--text)",
    whiteSpace: "pre-wrap",
  },
  citations: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 },
  citation: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 11,
    color: "var(--text-muted)",
  },
  toolBadges: { marginTop: 8, display: "flex", gap: 6 },
  toolBadge: {
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 600,
  },
  toolSuccess: {
    background: "#14391a",
    color: "var(--success)",
    border: "1px solid var(--success)",
  },
  toolError: {
    background: "#3b1515",
    color: "var(--error)",
    border: "1px solid var(--error)",
  },
  thinking: { color: "var(--text-muted)", fontStyle: "italic", fontSize: 13 },
  inputRow: {
    padding: "16px 24px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    gap: 10,
  },
  chatInput: {
    flex: 1,
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
    padding: "13px 16px",
    fontSize: 15,
    outline: "none",
  },
  sendBtn: {
    background: "var(--accent)",
    border: "none",
    color: "white",
    borderRadius: 10,
    width: 48,
    cursor: "pointer",
    fontSize: 18,
  },
  docsPane: { flex: 1, overflowY: "auto", padding: "24px" },
  uploadArea: {
    background: "var(--surface)",
    border: "2px dashed var(--border)",
    borderRadius: 12,
    padding: "32px",
    textAlign: "center",
    marginBottom: 24,
  },
  uploadBtn: {
    background: "var(--accent)",
    border: "none",
    color: "white",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  uploadHint: { marginTop: 10, fontSize: 12, color: "var(--text-muted)" },
  docList: { display: "flex", flexDirection: "column", gap: 10 },
  docItem: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  docIcon: { fontSize: 24 },
  docName: { fontWeight: 500, fontSize: 14 },
  docMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  toolLogItem: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  toolArgs: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "JetBrains Mono, monospace",
  },
};
