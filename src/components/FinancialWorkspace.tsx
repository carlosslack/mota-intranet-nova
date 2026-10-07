import {
  AlertCircle,
  Bot,
  Check,
  Database,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Files,
  LoaderCircle,
  MessageSquareText,
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
  useEffect,
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

type WorkspaceMode = "extract" | "chat";
type SourceMode = "upload" | "database";

type FinancialDatabase = {
  id: string;
  name: string;
  files: Array<{ name: string; size: number; addedAt: string }>;
  createdAt: string;
  updatedAt: string;
};

const extractionSuggestions = [
  "CNPJ, razão social, número, emissão e valor total",
  "Some os valores e organize por fornecedor",
  "Liste impostos, vencimentos e formas de pagamento",
];

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

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
  const databaseFileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [receivedFileKeys, setReceivedFileKeys] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<WorkspaceMode>("extract");
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [databases, setDatabases] = useState<FinancialDatabase[]>([]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseFiles, setDatabaseFiles] = useState<File[]>([]);
  const [databaseBusy, setDatabaseBusy] = useState(false);
  const [databaseNotice, setDatabaseNotice] = useState("");
  const [request, setRequest] = useState("");
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [streamedText, setStreamedText] = useState("");

  const isBusy = ["uploading", "working", "streaming"].includes(phase);
  const hasSessionDocuments = receivedFileKeys.size > 0;
  const selectedDatabase = databases.find(
    (database) => database.id === selectedDatabaseId,
  );
  const canSubmit =
    request.trim().length > 0 &&
    (files.length > 0 || hasSessionDocuments || Boolean(selectedDatabaseId)) &&
    !isBusy;
  const totalSize = useMemo(
    () => files.reduce((total, current) => total + current.size, 0),
    [files],
  );

  useEffect(() => {
    void fetch("/api/financeiro/databases", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { databases?: FinancialDatabase[] };
        const loaded = payload.databases ?? [];
        setDatabases(loaded);
        const preferredId = localStorage.getItem("mota-financial-database");
        const preferred = loaded.find((database) => database.id === preferredId) ?? loaded[0];
        if (preferred) {
          setSelectedDatabaseId(preferred.id);
          setDatabaseName(preferred.name);
        }
      })
      .catch(() => undefined);
  }, []);

  const chooseDatabase = (database: FinancialDatabase) => {
    setSelectedDatabaseId(database.id);
    setDatabaseName(database.name);
    setDatabaseNotice("");
    localStorage.setItem("mota-financial-database", database.id);
  };

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const accepted = Array.from(selected);
    setFiles((current) => {
      const known = new Set(
        current.map(fileKey),
      );
      return [
        ...current,
        ...accepted.filter(
          (item) => !known.has(fileKey(item)),
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
    setFiles((current) => {
      const selected = current[index];
      if (!selected || receivedFileKeys.has(fileKey(selected))) return current;
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const addDatabaseFiles = (selected: FileList | null) => {
    if (!selected) return;
    setDatabaseFiles((current) => {
      const known = new Set(current.map(fileKey));
      return [...current, ...Array.from(selected).filter((file) => !known.has(fileKey(file)))];
    });
    setDatabaseNotice("");
    setError("");
  };

  const saveDatabase = async () => {
    const name = databaseName.trim();
    if (!name || !databaseFiles.length || databaseBusy) return;
    const body = new FormData();
    body.append("name", name);
    if (selectedDatabaseId) body.append("databaseId", selectedDatabaseId);
    databaseFiles.forEach((file) => body.append("files", file));
    setDatabaseBusy(true);
    setDatabaseNotice("");
    setError("");
    try {
      const response = await fetch("/api/financeiro/databases", {
        method: "POST",
        credentials: "include",
        body,
      });
      const payload = (await response.json().catch(() => null)) as
        | { database?: FinancialDatabase; error?: string }
        | null;
      if (!response.ok || !payload?.database)
        throw new Error(payload?.error ?? "Não foi possível salvar a base.");
      const saved = payload.database;
      setDatabases((current) => [
        saved,
        ...current.filter((database) => database.id !== saved.id),
      ]);
      setSelectedDatabaseId(saved.id);
      setDatabaseName(saved.name);
      localStorage.setItem("mota-financial-database", saved.id);
      setDatabaseFiles([]);
      setDatabaseNotice("Arquivos gravados. Esta base já pode ser usada pelo agente.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível salvar a base.",
      );
    } finally {
      setDatabaseBusy(false);
    }
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
    if (selectedDatabaseId) body.append("databaseId", selectedDatabaseId);
    const pendingFiles = files.filter((file) => !receivedFileKeys.has(fileKey(file)));
    pendingFiles.forEach((selectedFile) => body.append("files", selectedFile));

    setMessages((current) => [...current, userMessage]);
    setRequest("");
    setError("");
    setStreamedText("");
    setPhase(pendingFiles.length ? "uploading" : "working");

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

      if (pendingFiles.length) {
        setReceivedFileKeys((current) => {
          const next = new Set(current);
          pendingFiles.forEach((file) => next.add(fileKey(file)));
          return next;
        });
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
    setReceivedFileKeys(new Set());
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
          <p className="eyebrow">Financeiro · Documentos com IA</p>
          <h1>Transforme documentos em respostas e arquivos</h1>
          <p>
            Envie seus documentos, diga o que precisa e acompanhe o trabalho do
            agente até o resultado ficar pronto para baixar.
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
              <strong>Fontes da análise</strong>
              <small>
                {sourceMode === "upload"
                  ? `${files.length} ${files.length === 1 ? "documento" : "documentos"}`
                  : `${databases.length} ${databases.length === 1 ? "base disponível" : "bases disponíveis"}`}
              </small>
            </div>
          </div>

          <div className="financial-source-tabs" role="tablist" aria-label="Fonte dos documentos">
            <button
              type="button"
              role="tab"
              className={sourceMode === "upload" ? "is-active" : ""}
              aria-selected={sourceMode === "upload"}
              onClick={() => setSourceMode("upload")}
            >
              <UploadCloud size={15} /> Envio rápido
            </button>
            <button
              type="button"
              role="tab"
              className={sourceMode === "database" ? "is-active" : ""}
              aria-selected={sourceMode === "database"}
              onClick={() => setSourceMode("database")}
            >
              <Database size={15} /> Banco de dados
            </button>
          </div>

          <input
            ref={fileInputRef}
            className="financial-file-input"
            type="file"
            multiple
            onChange={handleFileChange}
          />
          {sourceMode === "upload" ? (
            <>
              {files.length === 0 ? (
                <button
                  className="financial-upload-empty"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span><UploadCloud size={25} /></span>
                  <strong>Arraste ou selecione</strong>
                  <small>Envie um ou vários arquivos, em qualquer formato</small>
                </button>
              ) : (
                <>
                  <div className="financial-file-summary">
                    <span>{files.length} {files.length === 1 ? "arquivo" : "arquivos"}</span>
                    <small>{formatFileSize(totalSize)}</small>
                  </div>
                  <div className="financial-file-list">
                    {files.map((selectedFile, index) => (
                      <article className="financial-file-card" key={fileKey(selectedFile)}>
                        <span className="financial-file-card__icon"><DocumentIcon name={selectedFile.name} /></span>
                        <span className="financial-file-card__copy">
                          <strong title={selectedFile.name}>{selectedFile.name}</strong>
                          <small>
                            {receivedFileKeys.has(fileKey(selectedFile))
                              ? "Recebido pelo agente"
                              : `${formatFileSize(selectedFile.size)} · pronto para enviar`}
                          </small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remover ${selectedFile.name}`}
                          onClick={() => removeFile(index)}
                          disabled={isBusy || receivedFileKeys.has(fileKey(selectedFile))}
                        ><Trash2 size={16} /></button>
                      </article>
                    ))}
                  </div>
                  <button
                    className="financial-add-file"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                  ><Plus size={16} /> Adicionar mais arquivos</button>
                </>
              )}
              <div className="financial-files-note">
                <Paperclip size={15} />
                <span>O envio rápido mantém os arquivos somente nesta conversa.</span>
              </div>
            </>
          ) : (
            <div className="financial-database-panel">
              <div className="financial-database-list">
                {databases.map((database) => (
                  <button
                    type="button"
                    key={database.id}
                    className={database.id === selectedDatabaseId ? "is-active" : ""}
                    onClick={() => chooseDatabase(database)}
                  >
                    <Database size={17} />
                    <span>
                      <strong>{database.name}</strong>
                      <small>{database.files.length} {database.files.length === 1 ? "arquivo" : "arquivos"}</small>
                    </span>
                    {database.id === selectedDatabaseId && <Check size={15} />}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="financial-new-database"
                onClick={() => {
                  setSelectedDatabaseId("");
                  setDatabaseName("");
                  setDatabaseFiles([]);
                  setDatabaseNotice("");
                }}
              ><Plus size={15} /> Criar nova base</button>

              <label className="financial-database-name">
                <span>Nome do banco de dados</span>
                <input
                  value={databaseName}
                  onChange={(event) => setDatabaseName(event.target.value)}
                  placeholder="Ex.: Notas fiscais 2026"
                  disabled={databaseBusy}
                />
              </label>

              <input
                ref={databaseFileInputRef}
                className="financial-file-input"
                type="file"
                multiple
                onChange={(event) => {
                  addDatabaseFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="financial-database-upload"
                onClick={() => databaseFileInputRef.current?.click()}
                disabled={databaseBusy}
              >
                <UploadCloud size={19} />
                <span>
                  <strong>Selecionar arquivos</strong>
                  <small>{databaseFiles.length ? `${databaseFiles.length} prontos para gravar` : "Adicione tudo que quiser à base"}</small>
                </span>
              </button>
              {databaseFiles.length > 0 && (
                <div className="financial-database-pending">
                  {databaseFiles.map((file, index) => (
                    <span key={fileKey(file)}>
                      {file.name}
                      <button
                        type="button"
                        aria-label={`Remover ${file.name}`}
                        onClick={() => setDatabaseFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      ><Trash2 size={13} /></button>
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="financial-save-database"
                onClick={() => void saveDatabase()}
                disabled={!databaseName.trim() || !databaseFiles.length || databaseBusy}
              >
                {databaseBusy ? <LoaderCircle className="financial-spinner" size={16} /> : <Database size={16} />}
                {selectedDatabase ? "Adicionar à base" : "Criar banco de dados"}
              </button>
              {databaseNotice && <p className="financial-database-notice"><Check size={14} /> {databaseNotice}</p>}
            </div>
          )}
        </aside>

        <div className="financial-chat-panel">
          <div className="financial-mode-switch" role="tablist" aria-label="Modo de trabalho">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "extract"}
              className={mode === "extract" ? "is-active" : ""}
              onClick={() => setMode("extract")}
            >
              <FileSpreadsheet size={17} />
              Gerar arquivo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              className={mode === "chat" ? "is-active" : ""}
              onClick={() => setMode("chat")}
            >
              <MessageSquareText size={17} />
              Conversar com documentos
            </button>
          </div>

          <div className="financial-chat-heading">
            <span className="financial-agent-avatar"><Bot size={19} /></span>
            <div>
              <strong>Agente financeiro</strong>
              <small><span /> Pronto para trabalhar com seus documentos</small>
            </div>
          </div>

          <div className="financial-conversation" aria-live="polite">
            {messages.length === 0 && phase === "idle" ? (
              <div className="financial-chat-empty">
                <span>
                  {mode === "extract" ? <FileSpreadsheet size={28} /> : <Files size={28} />}
                </span>
                <h2>
                  {mode === "extract"
                    ? "Qual resultado você quer receber?"
                    : "O que deseja saber sobre os documentos?"}
                </h2>
                <p>
                  {mode === "extract"
                    ? "Selecione os arquivos e descreva as colunas, cálculos ou organização que precisa."
                    : "Selecione os arquivos e converse livremente com o agente sobre o conteúdo."}
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
            {mode === "extract" && (
              <div className="financial-suggestions" aria-label="Sugestões de extração">
                {extractionSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => setRequest(suggestion)}
                    disabled={isBusy}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder={
                mode === "extract"
                  ? "Ex.: Gere uma planilha com CNPJ, razão social, valor, impostos e data de emissão…"
                  : "Faça uma pergunta sobre os documentos…"
              }
              rows={3}
              disabled={isBusy}
            />
            <footer>
              <span>
                {selectedDatabase
                  ? `Banco de dados: ${selectedDatabase.name}`
                  : files.length > 0
                  ? `${files.length} ${files.length === 1 ? "arquivo selecionado" : "arquivos selecionados"}`
                  : hasSessionDocuments
                    ? "Documentos disponíveis nesta conversa"
                    : "Selecione arquivos ou um banco de dados"}
              </span>
              <button type="submit" disabled={!canSubmit}>
                {isBusy ? (
                  <LoaderCircle className="financial-spinner" size={17} />
                ) : (
                  <Send size={17} />
                )}
                {mode === "extract" ? "Gerar resultado" : "Enviar mensagem"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </section>
  );
}
