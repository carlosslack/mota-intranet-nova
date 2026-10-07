import {
  AlertCircle,
  Bot,
  Check,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

type AgentPhase = "idle" | "uploading" | "working" | "streaming" | "error";

type Artifact = {
  name: string;
  url?: string;
};

type ConversationMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  artifacts?: Artifact[];
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function DocumentIcon({ name }: { name: string }) {
  const extension = fileExtension(name);
  if (["xls", "xlsx", "csv"].includes(extension))
    return <FileSpreadsheet size={19} />;
  if (["doc", "docx", "pdf"].includes(extension)) return <FileText size={19} />;
  return <File size={19} />;
}

function readStreamEvent(value: unknown) {
  if (typeof value === "string") return { token: value, artifacts: [] as Artifact[] };
  if (!value || typeof value !== "object")
    return { token: "", artifacts: [] as Artifact[] };

  const event = value as Record<string, unknown>;
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : undefined;
  const isTokenEvent = !event.event || event.event === "token";
  const tokenCandidates = isTokenEvent
    ? [event.token, event.text, event.chunk, data?.token, data?.text, data?.chunk]
    : [];
  const token = tokenCandidates.find((candidate) => typeof candidate === "string");
  const artifactValue = event.artifacts ?? event.files ?? data?.artifacts ?? data?.files;
  const artifacts = Array.isArray(artifactValue)
    ? artifactValue.flatMap((artifact) => {
        if (!artifact || typeof artifact !== "object") return [];
        const item = artifact as Record<string, unknown>;
        const name = item.name ?? item.filename;
        const url = item.url ?? item.download_url;
        return typeof name === "string"
          ? [{ name, url: typeof url === "string" ? url : undefined }]
          : [];
      })
    : [];

  return { token: typeof token === "string" ? token : "", artifacts };
}

function artifactsFromText(text: string): Artifact[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+\.(?:xlsx|xls|csv)(?:\?[^\s<>"']*)?/gi) ?? [];
  return [...new Set(matches)].map((source) => {
    const sourceUrl = new URL(source);
    const name = decodeURIComponent(sourceUrl.pathname.split("/").pop() ?? "planilha.xlsx");
    return {
      name,
      url: `/api/financeiro/download?source=${encodeURIComponent(source)}&name=${encodeURIComponent(name)}`,
    };
  });
}

export function FinancialWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [request, setRequest] = useState("");
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [streamedText, setStreamedText] = useState("");

  const isBusy = ["uploading", "working", "streaming"].includes(phase);
  const canSubmit = files.length > 0 && request.trim().length > 0 && !isBusy;
  const totalSize = useMemo(
    () => files.reduce((total, current) => total + current.size, 0),
    [files],
  );

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const accepted = Array.from(selected);
    setFiles((current) => {
      const known = new Set(
        current.map((item) => `${item.name}-${item.size}-${item.lastModified}`),
      );
      return [
        ...current,
        ...accepted.filter(
          (item) => !known.has(`${item.name}-${item.size}-${item.lastModified}`),
        ),
      ];
    });
    setError("");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const messageText = request.trim();
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: messageText,
    };
    const sessionId = sessionIdRef.current;
    const body = new FormData();
    body.append("message", messageText);
    body.append("sessionId", sessionId);
    files.forEach((selectedFile) => body.append("files", selectedFile));

    setMessages((current) => [...current, userMessage]);
    setRequest("");
    setError("");
    setStreamedText("");
    setPhase("uploading");

    try {
      const response = await fetch("/api/financeiro/analyze", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Não foi possível iniciar a análise.");
      }

      setPhase("working");
      if (!response.body) throw new Error("O agente não iniciou o streaming.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let artifacts: Artifact[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith("event:")) continue;
          const content = line.startsWith("data:") ? line.slice(5).trim() : line;
          if (!content || content === "[DONE]") continue;
          let parsed: unknown = content;
          try {
            parsed = JSON.parse(content);
          } catch {
            // Plain text streams are also supported.
          }
          const streamEvent = readStreamEvent(parsed);
          if (streamEvent.token) {
            finalText += streamEvent.token;
            setStreamedText(finalText);
            setPhase("streaming");
          }
          if (streamEvent.artifacts.length)
            artifacts = [...artifacts, ...streamEvent.artifacts];
        }
      }

      if (buffer.trim()) {
        let parsed: unknown = buffer.trim();
        try {
          parsed = JSON.parse(buffer.trim());
        } catch {
          // Keep the final plain-text chunk as returned.
        }
        const streamEvent = readStreamEvent(parsed);
        finalText += streamEvent.token;
        artifacts = [...artifacts, ...streamEvent.artifacts];
      }

      if (!artifacts.length && finalText) artifacts = artifactsFromText(finalText);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: finalText || "A análise foi concluída.",
          artifacts,
        },
      ]);
      setStreamedText("");
      setPhase("idle");
    } catch (caughtError) {
      setPhase("error");
      setStreamedText("");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "O agente não conseguiu concluir a solicitação.",
      );
    }
  };

  const startNewAnalysis = () => {
    if (isBusy) return;
    setFiles([]);
    setMessages([]);
    setRequest("");
    setError("");
    setPhase("idle");
    sessionIdRef.current = crypto.randomUUID();
  };

  return (
    <section className="financial-page">
      <header className="financial-page__header">
        <div>
          <p className="eyebrow">Assistente financeiro</p>
          <h1>Organize documentos em uma planilha</h1>
          <p>
            Anexe os arquivos, descreva os dados que precisa e acompanhe a análise
            até a planilha ficar pronta.
          </p>
        </div>
        {(files.length > 0 || messages.length > 0) && (
          <button
            type="button"
            className="financial-secondary-button"
            onClick={startNewAnalysis}
            disabled={isBusy}
          >
            Nova análise
          </button>
        )}
      </header>

      <div className="financial-workspace">
        <aside className="financial-files-panel">
          <div className="financial-panel-heading">
            <span className="financial-panel-icon">
              <ReceiptText size={19} />
            </span>
            <div>
              <strong>Documentos</strong>
              <small>Todos os formatos de arquivo</small>
            </div>
          </div>

          <input
            ref={fileInputRef}
            className="financial-file-input"
            type="file"
            multiple
            onChange={handleFileChange}
          />

          {files.length === 0 ? (
            <button
              className="financial-upload-empty"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <span>
                <UploadCloud size={25} />
              </span>
              <strong>Selecionar arquivos</strong>
              <small>Escolha uma ou várias notas e documentos</small>
            </button>
          ) : (
            <>
              <div className="financial-file-summary">
                <span>
                  {files.length} {files.length === 1 ? "arquivo" : "arquivos"}
                </span>
                <small>{formatFileSize(totalSize)}</small>
              </div>
              <div className="financial-file-list">
                {files.map((selectedFile, index) => (
                  <article
                    className="financial-file-card"
                    key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`}
                  >
                    <span className="financial-file-card__icon">
                      <DocumentIcon name={selectedFile.name} />
                    </span>
                    <span className="financial-file-card__copy">
                      <strong title={selectedFile.name}>{selectedFile.name}</strong>
                      <small>{formatFileSize(selectedFile.size)}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${selectedFile.name}`}
                      onClick={() => removeFile(index)}
                      disabled={isBusy}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </div>
              <button
                className="financial-add-file"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                <Plus size={16} /> Adicionar mais arquivos
              </button>
            </>
          )}

          <div className="financial-files-note">
            <Paperclip size={15} />
            <span>Os documentos selecionados serão enviados juntos para a análise.</span>
          </div>
        </aside>

        <div className="financial-chat-panel">
          <div className="financial-chat-heading">
            <span className="financial-agent-avatar">
              <Bot size={19} />
            </span>
            <div>
              <strong>Agente financeiro</strong>
              <small>
                <span /> Disponível para uma nova análise
              </small>
            </div>
          </div>

          <div className="financial-conversation" aria-live="polite">
            {messages.length === 0 && phase === "idle" ? (
              <div className="financial-chat-empty">
                <span>
                  <FileSpreadsheet size={28} />
                </span>
                <h2>O que você quer receber na planilha?</h2>
                <p>
                  Primeiro selecione os documentos. Depois escreva quais informações
                  o agente deve organizar para você.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`financial-message financial-message--${message.role}`}
                  key={message.id}
                >
                  <span>{message.role === "agent" ? "Agente financeiro" : "Você"}</span>
                  <p>{message.text}</p>
                  {message.artifacts?.map((artifact) =>
                    artifact.url ? (
                      <a
                        className="financial-artifact"
                        href={artifact.url}
                        key={`${message.id}-${artifact.name}`}
                      >
                        <FileSpreadsheet size={18} />
                        <span>
                          <strong>{artifact.name}</strong>
                          <small>Planilha concluída</small>
                        </span>
                        <Download size={17} />
                      </a>
                    ) : (
                      <div
                        className="financial-artifact"
                        key={`${message.id}-${artifact.name}`}
                      >
                        <FileSpreadsheet size={18} />
                        <span>
                          <strong>{artifact.name}</strong>
                          <small>Arquivo gerado</small>
                        </span>
                      </div>
                    ),
                  )}
                </article>
              ))
            )}

            {isBusy && (
              <article className="financial-progress-card">
                <header>
                  <span className="financial-agent-avatar financial-agent-avatar--small">
                    <Bot size={16} />
                  </span>
                  <div>
                    <strong>
                      {phase === "streaming"
                        ? "Preparando sua resposta"
                        : "Trabalhando na solicitação"}
                    </strong>
                    <small>Você pode acompanhar por aqui</small>
                  </div>
                  <LoaderCircle className="financial-spinner" size={18} />
                </header>
                <div className="financial-progress-steps">
                  <span className={phase === "uploading" ? "is-active" : "is-done"}>
                    {phase === "uploading" ? (
                      <LoaderCircle size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    Enviando documentos
                  </span>
                  <span
                    className={
                      phase === "working"
                        ? "is-active"
                        : phase === "streaming"
                          ? "is-done"
                          : ""
                    }
                  >
                    {phase === "streaming" ? (
                      <Check size={15} />
                    ) : (
                      <LoaderCircle size={15} />
                    )}
                    Agente analisando
                  </span>
                  <span className={phase === "streaming" ? "is-active" : ""}>
                    <LoaderCircle size={15} />
                    Gerando resposta
                  </span>
                </div>
                {streamedText && (
                  <p className="financial-stream-text">
                    {streamedText}
                    <span aria-hidden="true" />
                  </p>
                )}
              </article>
            )}
          </div>

          {error && (
            <div className="financial-error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          <form className="financial-composer" onSubmit={submitRequest}>
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Descreva quais informações deseja organizar na planilha…"
              rows={3}
              disabled={isBusy}
            />
            <footer>
              <span>
                {files.length > 0
                  ? `${files.length} ${files.length === 1 ? "arquivo selecionado" : "arquivos selecionados"}`
                  : "Selecione ao menos um arquivo"}
              </span>
              <button type="submit" disabled={!canSubmit}>
                {isBusy ? (
                  <LoaderCircle className="financial-spinner" size={17} />
                ) : (
                  <Send size={17} />
                )}
                Enviar para análise
              </button>
            </footer>
          </form>
        </div>
      </div>
    </section>
  );
}
