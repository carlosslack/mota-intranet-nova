import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Inbox,
  KeyRound,
  Laptop,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import type { SessionUser } from "./LoginScreen";

type TicketPriority = "Baixa" | "Media" | "Alta" | "Urgente";
type TicketStatus =
  | "Novo"
  | "Em triagem"
  | "Em atendimento"
  | "Aguardando usuário"
  | "Resolvido"
  | "Reaberto";
type SupportView = "chamados" | "conhecimento";

type TicketHistory = {
  id: string;
  at: string;
  authorName: string;
  message: string;
};

type SupportTicket = {
  id: string;
  protocol: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  category: string;
  details: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  systemAffected?: string;
  impact?: string;
  deadline?: string;
  attempts?: string;
  assignedTo?: { id: string; name: string; email: string };
  resolution?: string;
  history: TicketHistory[];
};

const categories = [
  { icon: ShieldAlert, name: "PJe / e-SAJ", detail: "Tribunais, assinador, protocolo ou acesso processual" },
  { icon: KeyRound, name: "Certificado digital", detail: "A1, token, PJeOffice, senha ou instalação" },
  { icon: FileText, name: "PJe-Calc / sistemas jurídicos", detail: "Cálculos, exportações e aplicações jurídicas" },
  { icon: Mail, name: "Google Workspace", detail: "Gmail, Agenda, Drive, permissões ou grupos" },
  { icon: Laptop, name: "Equipamento", detail: "Computador, monitor, impressora ou periféricos" },
  { icon: Wifi, name: "Rede / VPN", detail: "Internet, VPN, telefone ou conexão remota" },
];

const knowledgeArticles = [
  {
    icon: KeyRound,
    category: "Certificado digital",
    title: "Certificado A1 não aparece no sistema",
    summary: "Confira validade, instalação no usuário correto e reconhecimento pelo navegador antes de abrir o chamado.",
    steps: "validade do certificado, reinício do navegador e teste no PJeOffice.",
  },
  {
    icon: ShieldAlert,
    category: "PJe / e-SAJ",
    title: "PJeOffice não conecta",
    summary: "Valide se o serviço está aberto, se a porta local responde e se o certificado correto está selecionado.",
    steps: "PJeOffice ativo, extensão instalada e certificado selecionado.",
  },
  {
    icon: Mail,
    category: "Google Workspace",
    title: "Acesso a pasta ou arquivo do Drive",
    summary: "Confirme a conta corporativa conectada e informe no chamado o link exato do arquivo ou da pasta.",
    steps: "conta correta, link do item e nível de acesso necessário.",
  },
  {
    icon: Wifi,
    category: "Rede / VPN",
    title: "Sem acesso à VPN",
    summary: "Teste a internet sem VPN e registre a mensagem exibida pelo cliente de conexão.",
    steps: "internet funcionando, horário do erro e captura da mensagem.",
  },
];

const priorityOptions: TicketPriority[] = ["Baixa", "Media", "Alta", "Urgente"];
const statusOptions: Array<TicketStatus | "Todos"> = [
  "Todos", "Novo", "Em triagem", "Em atendimento", "Aguardando usuário", "Reaberto", "Resolvido",
];
const adminStatusOptions = statusOptions.slice(1) as TicketStatus[];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDeadline(value?: string) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function getPriorityLabel(priority: TicketPriority) {
  return priority === "Media" ? "Média" : priority;
}

function getStatusTone(status: TicketStatus) {
  if (status === "Resolvido") return "success";
  if (status === "Aguardando usuário") return "waiting";
  if (status === "Em atendimento" || status === "Em triagem") return "progress";
  if (status === "Reaberto") return "reopened";
  return "open";
}

function isOpenTicket(ticket: SupportTicket) {
  return ticket.status !== "Resolvido";
}

export function SupportCenter({ user }: { user: SessionUser }) {
  const [activeView, setActiveView] = useState<SupportView>("chamados");
  const [formOpen, setFormOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Media");
  const [details, setDetails] = useState("");
  const [systemAffected, setSystemAffected] = useState("");
  const [impact, setImpact] = useState("Individual");
  const [deadline, setDeadline] = useState("");
  const [attempts, setAttempts] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("Todos");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "Todas">("Todas");
  const [onlyMine, setOnlyMine] = useState(false);
  const [query, setQuery] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [updateStatus, setUpdateStatus] = useState<TicketStatus>("Em triagem");
  const [updatePriority, setUpdatePriority] = useState<TicketPriority>("Media");
  const [updateNote, setUpdateNote] = useState("");
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");

  const primeUpdateControls = useCallback((ticket: SupportTicket) => {
    setUpdateStatus(ticket.status);
    setUpdatePriority(ticket.priority);
    setUpdateNote("");
    setReply("");
    setResolution("");
  }, []);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets],
  );

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "Todos" && ticket.status !== statusFilter) return false;
      if (priorityFilter !== "Todas" && ticket.priority !== priorityFilter) return false;
      if (onlyMine && ticket.assignedTo?.email !== user.email) return false;
      if (!normalizedQuery) return true;
      return [ticket.protocol, ticket.subject, ticket.category, ticket.requesterName, ticket.requesterEmail, ticket.systemAffected ?? ""]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [onlyMine, priorityFilter, query, statusFilter, tickets, user.email]);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = knowledgeQuery.trim().toLowerCase();
    if (!normalizedQuery) return knowledgeArticles;
    return knowledgeArticles.filter((article) =>
      [article.title, article.category, article.summary, article.steps]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [knowledgeQuery]);

  const openCount = tickets.filter(isOpenTicket).length;
  const urgentCount = tickets.filter((ticket) => isOpenTicket(ticket) && ticket.priority === "Urgente").length;
  const waitingCount = tickets.filter((ticket) => ticket.status === "Aguardando usuário").length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === "Resolvido").length;

  const loadTickets = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/tickets", { credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível carregar os chamados.");
      const body = (await response.json()) as { tickets: SupportTicket[] };
      setTickets(body.tickets);
      const firstTicket = body.tickets[0];
      setSelectedTicketId((current) =>
        body.tickets.some((ticket) => ticket.id === current) ? current : (firstTicket?.id ?? null),
      );
      if (firstTicket) primeUpdateControls(firstTicket);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os chamados.");
    } finally {
      setLoadingTickets(false);
    }
  }, [primeUpdateControls]);

  useEffect(() => {
    void Promise.resolve().then(loadTickets);
  }, [loadTickets]);

  const openForm = (selectedCategory = "") => {
    setCategory(selectedCategory);
    setCreatedTicket(null);
    setError(null);
    setFormOpen(true);
  };

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.id);
    primeUpdateControls(ticket);
    setError(null);
    setSuccessMessage(null);
  };

  const replaceTicket = (updatedTicket: SupportTicket) => {
    setTickets((current) => current.map((ticket) => ticket.id === updatedTicket.id ? updatedTicket : ticket));
    setSelectedTicketId(updatedTicket.id);
    primeUpdateControls(updatedTicket);
  };

  const assumeTicket = async (ticketId: string) => {
    setError(null);
    setSuccessMessage(null);
    setUpdating(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/assign`, { method: "POST", credentials: "include" });
      const result = (await response.json()) as { ticket?: SupportTicket; error?: string };
      if (!response.ok || !result.ticket) throw new Error(result.error ?? "Não foi possível assumir o chamado.");
      replaceTicket(result.ticket);
      setSuccessMessage("Chamado atribuído a você.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível assumir o chamado.");
    } finally {
      setUpdating(false);
    }
  };

  const patchTicket = async (payload: Record<string, string>) => {
    if (!selectedTicket) return;
    setError(null);
    setSuccessMessage(null);
    setUpdating(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ticket?: SupportTicket; error?: string };
      if (!response.ok || !result.ticket) throw new Error(result.error ?? "Não foi possível atualizar o chamado.");
      replaceTicket(result.ticket);
      setSuccessMessage("Chamado atualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o chamado.");
    } finally {
      setUpdating(false);
    }
  };

  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, priority, details, systemAffected, impact, deadline, attempts }),
      });
      const result = (await response.json()) as { ticket?: SupportTicket; error?: string };
      if (!response.ok || !result.ticket) throw new Error(result.error ?? "Não foi possível registrar o chamado.");
      setTickets((current) => [result.ticket!, ...current]);
      setSelectedTicketId(result.ticket.id);
      setCreatedTicket(result.ticket);
      setSubject(""); setCategory(""); setPriority("Media"); setDetails("");
      setSystemAffected(""); setImpact("Individual"); setDeadline(""); setAttempts("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar o chamado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="support-view">
      <div className="support-hero support-hero--desk">
        <div>
          <p className="eyebrow">Suporte interno</p>
          <h1>Central de TI</h1>
          <p>{user.isAdmin ? "Organize a fila, conduza os atendimentos e preserve o histórico técnico." : "Solicite suporte e acompanhe cada etapa do atendimento."}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => openForm()}><Plus size={17} /> Novo chamado</button>
      </div>

      <div className="support-view-tabs" aria-label="Áreas da Central de TI">
        <button type="button" className={activeView === "chamados" ? "is-active" : ""} onClick={() => setActiveView("chamados")}>
          <Inbox size={16} /> Chamados
        </button>
        <button type="button" className={activeView === "conhecimento" ? "is-active" : ""} onClick={() => setActiveView("conhecimento")}>
          <BookOpen size={16} /> Base de conhecimento
        </button>
      </div>

      {activeView === "chamados" ? (
        <>
          <div className="support-kpis" aria-label="Indicadores de chamados">
            <article><span><Inbox size={17} /></span><strong>{openCount}</strong><small>em aberto</small></article>
            <article><span><AlertTriangle size={17} /></span><strong>{urgentCount}</strong><small>urgentes</small></article>
            <article><span><Clock3 size={17} /></span><strong>{waitingCount}</strong><small>aguardando usuário</small></article>
            <article><span><CheckCircle2 size={17} /></span><strong>{resolvedCount}</strong><small>resolvidos</small></article>
          </div>

          <div className="support-layout support-layout--desk">
            <div className="support-panel support-panel--queue">
              <div className="panel-heading">
                <div><p className="eyebrow">{user.isAdmin ? "Fila de atendimento" : "Meus chamados"}</p><h2>Chamados técnicos</h2></div>
                <button className="ticket-refresh" type="button" onClick={() => void loadTickets()} aria-label="Atualizar chamados" title="Atualizar chamados"><RefreshCw size={15} /></button>
              </div>
              <div className="ticket-toolbar">
                <label className="ticket-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar protocolo, assunto ou solicitante" /></label>
                <div className="ticket-filter-row">
                  <label><SlidersHorizontal size={14} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as (typeof statusOptions)[number])}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label>Prioridade<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TicketPriority | "Todas")}><option>Todas</option>{priorityOptions.map((item) => <option key={item} value={item}>{getPriorityLabel(item)}</option>)}</select></label>
                  {user.isAdmin && <button type="button" className={onlyMine ? "ticket-owner-filter is-active" : "ticket-owner-filter"} onClick={() => setOnlyMine((current) => !current)}><UserRound size={14} /> Atribuídos a mim</button>}
                </div>
              </div>

              {loadingTickets ? (
                <div className="support-empty"><Clock3 size={23} /><p>Carregando chamados...</p></div>
              ) : filteredTickets.length === 0 ? (
                <div className="support-empty support-empty--actionable">
                  <span><Inbox size={24} /></span><h3>Nenhum chamado nesta fila</h3>
                  <p>{tickets.length ? "Ajuste os filtros para localizar outro atendimento." : "Quando um chamado for aberto, ele aparecerá aqui com protocolo e histórico."}</p>
                  {!tickets.length && <button type="button" onClick={() => openForm()}><Plus size={15} /> Abrir primeiro chamado</button>}
                </div>
              ) : (
                <div className="ticket-table" role="list">
                  {filteredTickets.map((ticket) => (
                    <button key={ticket.id} type="button" role="listitem" className={selectedTicket?.id === ticket.id ? "ticket-row ticket-row--active" : "ticket-row"} onClick={() => selectTicket(ticket)}>
                      <span className={`ticket-row__status ticket-row__status--${getStatusTone(ticket.status)}`}>{ticket.status}</span>
                      <span className="ticket-row__main"><strong>{ticket.subject}</strong><small>{ticket.protocol} · {ticket.category} · {formatDate(ticket.updatedAt)}</small></span>
                      <span className={`ticket-row__priority ticket-row__priority--${ticket.priority.toLowerCase()}`}>{getPriorityLabel(ticket.priority)}</span><ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="support-panel support-panel--details">
              {selectedTicket ? (
                <>
                  <div className="ticket-detail__header"><span className={`ticket-row__status ticket-row__status--${getStatusTone(selectedTicket.status)}`}>{selectedTicket.status}</span><strong>{selectedTicket.protocol}</strong></div>
                  <h2>{selectedTicket.subject}</h2><p>{selectedTicket.details}</p>
                  <dl className="ticket-meta">
                    <div><dt>Solicitante</dt><dd>{selectedTicket.requesterName}</dd></div><div><dt>Categoria</dt><dd>{selectedTicket.category}</dd></div>
                    <div><dt>Prioridade</dt><dd>{getPriorityLabel(selectedTicket.priority)}</dd></div><div><dt>Responsável</dt><dd>{selectedTicket.assignedTo?.name ?? "Não atribuído"}</dd></div>
                    <div><dt>Sistema / tribunal</dt><dd>{selectedTicket.systemAffected || "Não informado"}</dd></div><div><dt>Prazo</dt><dd>{formatDeadline(selectedTicket.deadline)}</dd></div>
                    <div><dt>Impacto</dt><dd>{selectedTicket.impact || "Não informado"}</dd></div><div><dt>Aberto em</dt><dd>{formatDate(selectedTicket.createdAt)}</dd></div>
                  </dl>
                  {selectedTicket.attempts && <div className="ticket-context"><strong>Tentativas já realizadas</strong><p>{selectedTicket.attempts}</p></div>}

                  {user.isAdmin && selectedTicket.status !== "Resolvido" && (
                    <div className="ticket-actions">
                      <div className="ticket-actions__heading">
                        <div><strong>Conduzir atendimento</strong><small>Atualize a etapa e deixe um registro claro.</small></div>
                        {!selectedTicket.assignedTo && <button type="button" className="ticket-assume-button" disabled={updating} onClick={() => void assumeTicket(selectedTicket.id)}><ShieldCheck size={15} /> Assumir</button>}
                      </div>
                      <div className="ticket-actions__grid">
                        <label>Etapa<select value={updateStatus} onChange={(event) => setUpdateStatus(event.target.value as TicketStatus)}>{adminStatusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
                        <label>Prioridade<select value={updatePriority} onChange={(event) => setUpdatePriority(event.target.value as TicketPriority)}>{priorityOptions.map((item) => <option value={item} key={item}>{getPriorityLabel(item)}</option>)}</select></label>
                      </div>
                      <label>Registro do atendimento<textarea rows={3} value={updateNote} onChange={(event) => setUpdateNote(event.target.value)} placeholder="Informe o que foi verificado, o que falta ou a próxima ação." /></label>
                      <button type="button" className="ticket-secondary-button" disabled={updating || (!updateNote.trim() && updateStatus === selectedTicket.status && updatePriority === selectedTicket.priority)} onClick={() => void patchTicket({ status: updateStatus, priority: updatePriority, note: updateNote })}><Send size={15} /> Salvar andamento</button>
                      <div className="ticket-resolution-form">
                        <label>Solução aplicada<textarea rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Descreva a solução de forma útil para consultas futuras." /></label>
                        <button type="button" className="ticket-resolve-button" disabled={updating || !resolution.trim()} onClick={() => void patchTicket({ status: "Resolvido", priority: updatePriority, resolution })}><CheckCircle2 size={15} /> Resolver chamado</button>
                      </div>
                    </div>
                  )}

                  {selectedTicket.resolution && <div className="ticket-resolution"><FileText size={16} /><div><strong>Solução registrada</strong><p>{selectedTicket.resolution}</p></div></div>}

                  {!user.isAdmin && selectedTicket.status !== "Resolvido" && (
                    <div className="ticket-reply"><label>Responder à equipe de TI<textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Acrescente informações ou responda ao atendimento." /></label><button type="button" disabled={updating || !reply.trim()} onClick={() => void patchTicket({ note: reply })}><Send size={15} /> Enviar resposta</button></div>
                  )}
                  {!user.isAdmin && selectedTicket.status === "Resolvido" && (
                    <div className="ticket-reply"><label>O problema continua?<textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Explique o que ainda não funcionou." /></label><button type="button" disabled={updating} onClick={() => void patchTicket({ status: "Reaberto", note: reply.trim() || "O chamado ainda precisa de atendimento." })}><RotateCcw size={15} /> Reabrir chamado</button></div>
                  )}

                  {error && <p className="ticket-feedback ticket-feedback--error">{error}</p>}
                  {successMessage && <p className="ticket-feedback ticket-feedback--success"><CheckCircle2 size={14} /> {successMessage}</p>}
                  <div className="ticket-history"><h3>Histórico do chamado</h3>{[...selectedTicket.history].reverse().map((item) => <article key={item.id}><span>{formatDate(item.at)}</span><strong>{item.authorName}</strong><p>{item.message}</p></article>)}</div>
                </>
              ) : (
                <div className="support-empty support-empty--detail"><span><MessageSquare size={25} /></span><h3>{tickets.length ? "Selecione um chamado" : "Área de acompanhamento"}</h3><p>{tickets.length ? "Veja o contexto, as ações da equipe e todo o histórico." : "Os detalhes, conversas e soluções ficam organizados neste painel."}</p></div>
              )}
            </aside>
          </div>
        </>
      ) : (
        <section className="knowledge-workspace">
          <div className="knowledge-heading"><div><p className="eyebrow">Ajuda rápida</p><h2>Base de conhecimento</h2><p>Consulte orientações antes de abrir um chamado.</p></div><label><Search size={16} /><input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Buscar orientação" /></label></div>
          <div className="knowledge-layout">
            <nav aria-label="Categorias de suporte"><strong>Abrir por categoria</strong>{categories.map(({ icon: Icon, name }) => <button key={name} type="button" onClick={() => openForm(name)}><Icon size={16} /> {name} <ChevronRight size={14} /></button>)}</nav>
            <div className="knowledge-list">
              {filteredArticles.map(({ icon: Icon, ...article }) => <article key={article.title}><span><Icon size={18} /></span><div><small>{article.category}</small><h3>{article.title}</h3><p>{article.summary}</p><strong>Antes de abrir: {article.steps}</strong></div><button type="button" onClick={() => openForm(article.category)}>Abrir chamado <ChevronRight size={14} /></button></article>)}
              {!filteredArticles.length && <div className="support-empty"><Search size={22} /><h3>Nenhuma orientação encontrada</h3><p>Você pode abrir um chamado e descrever o que aconteceu.</p></div>}
            </div>
          </div>
        </section>
      )}

      {formOpen && (
        <>
          <button className="drawer-backdrop" type="button" aria-label="Fechar formulário" onClick={() => setFormOpen(false)} />
          <div className="ticket-drawer" role="dialog" aria-modal="true" aria-label="Novo chamado">
            <div className="ticket-drawer__header"><div><p className="eyebrow">Central de TI</p><h2>Novo chamado</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Fechar formulário"><X size={20} /></button></div>
            {createdTicket ? (
              <div className="ticket-drawer__confirmation"><span><ShieldCheck size={24} /></span><h3>Chamado registrado</h3><p>O protocolo <strong>{createdTicket.protocol}</strong> já está na fila da equipe de TI.</p><button className="primary-button" type="button" onClick={() => { setFormOpen(false); setActiveView("chamados"); selectTicket(createdTicket); }}>Acompanhar chamado <ChevronRight size={15} /></button></div>
            ) : (
              <form onSubmit={createTicket}>
                <div className="ticket-form-intro"><CircleDot size={16} /><p>Quanto mais contexto você informar, mais rápido a equipe consegue agir.</p></div>
                <label>Assunto<input required maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: certificado não aparece no PJe" /></label>
                <div className="ticket-form-grid">
                  <label>Categoria<select required value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Selecione</option>{categories.map((item) => <option key={item.name}>{item.name}</option>)}<option>Outro</option></select></label>
                  <label>Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>{priorityOptions.map((item) => <option key={item} value={item}>{getPriorityLabel(item)}</option>)}</select></label>
                </div>
                <label>Sistema, tribunal ou equipamento afetado<input maxLength={160} value={systemAffected} onChange={(event) => setSystemAffected(event.target.value)} placeholder="Ex.: TRT-15, PJeOffice ou notebook da sala 2" /></label>
                <div className="ticket-form-grid">
                  <label>Impacto<select value={impact} onChange={(event) => setImpact(event.target.value)}><option>Individual</option><option>Equipe</option><option>Escritório</option><option>Prazo processual</option></select></label>
                  <label>Prazo relacionado<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
                </div>
                <label>O que aconteceu?<textarea required rows={5} maxLength={4000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Descreva a mensagem de erro, quando começou e o que você precisa concluir." /></label>
                <label>O que você já tentou?<textarea rows={3} maxLength={1500} value={attempts} onChange={(event) => setAttempts(event.target.value)} placeholder="Ex.: reiniciei o navegador e testei novamente." /></label>
                <p className="form-note">Use prioridade Urgente somente quando houver prazo processual imediato, indisponibilidade geral ou bloqueio completo do trabalho.</p>
                {error && <p className="ticket-feedback ticket-feedback--error">{error}</p>}
                <button className="primary-button" type="submit" disabled={submitting}><Send size={16} /> {submitting ? "Registrando..." : "Registrar chamado"}</button>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}
