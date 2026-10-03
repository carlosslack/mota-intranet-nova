import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Inbox,
  KeyRound,
  Laptop,
  Plus,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import type { SessionUser } from "./LoginScreen";

type SupportTicket = {
  id: string;
  protocol: string;
  subject: string;
  category: string;
  status: "Aberto" | "Em atendimento";
  createdAt: string;
  assignedTo?: { id: string; name: string; email: string };
};

const categories = [
  {
    icon: <Laptop size={19} />,
    name: "Equipamento",
    detail: "Computador, monitor ou periféricos",
  },
  {
    icon: <KeyRound size={19} />,
    name: "Acesso",
    detail: "Conta, senha ou permissão",
  },
  {
    icon: <Wifi size={19} />,
    name: "Conectividade",
    detail: "Internet, VPN ou telefone",
  },
];

export function SupportCenter({ user }: { user: SessionUser }) {
  const [formOpen, setFormOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(
    null,
  );
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");

  const loadTickets = async () => {
    try {
      const response = await fetch("/api/tickets", { credentials: "include" });
      if (!response.ok)
        throw new Error("Não foi possível carregar seus chamados.");
      const body = (await response.json()) as { tickets: SupportTicket[] };
      setTickets(body.tickets);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar seus chamados.",
      );
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadTickets);
  }, []);

  const openForm = (selectedCategory = "") => {
    setCategory(selectedCategory);
    setCreatedTicket(null);
    setError(null);
    setFormOpen(true);
  };

  const assumeTicket = async (ticketId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: "POST",
        credentials: "include",
      });
      const result = (await response.json()) as {
        ticket?: SupportTicket;
        error?: string;
      };
      if (!response.ok || !result.ticket)
        throw new Error(result.error ?? "Não foi possível assumir o chamado.");
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === ticketId ? result.ticket! : ticket,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível assumir o chamado.",
      );
    }
  };

  return (
    <section className="support-view">
      <div className="support-hero">
        <div>
          <p className="eyebrow">Suporte interno</p>
          <h1>Central de TI</h1>
          <p>
            Abra uma solicitação ou acompanhe os chamados associados à sua
            conta.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => openForm()}
        >
          <Plus size={17} /> Novo chamado
        </button>
      </div>
      <div className="support-layout">
        <div className="support-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Novo atendimento</p>
              <h2>Como podemos ajudar?</h2>
            </div>
            <span>Escolha uma categoria</span>
          </div>
          <div className="support-categories">
            {categories.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => openForm(item.name)}
              >
                <span>{item.icon}</span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="support-panel support-panel--empty">
          <span className="inbox-icon">
            <Inbox size={25} />
          </span>
          <p className="eyebrow">
            {user.isAdmin ? "Fila de chamados" : "Seus chamados"}
          </p>
          {loadingTickets ? (
            <p>Carregando seus chamados…</p>
          ) : tickets.length === 0 ? (
            <>
              <h2>Nenhum chamado aberto</h2>
              <p>Quando você registrar uma solicitação, ela aparecerá aqui.</p>
            </>
          ) : (
            <div className="ticket-list">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="ticket-list__item">
                  <span className="ticket-list__status">{ticket.status}</span>
                  <strong>{ticket.subject}</strong>
                  <small>
                    {ticket.protocol} · {ticket.category}
                  </small>
                  {ticket.assignedTo ? (
                    <small>Em atendimento por {ticket.assignedTo.name}</small>
                  ) : user.isAdmin ? (
                    <button
                      type="button"
                      className="ticket-list__assign"
                      onClick={() => void assumeTicket(ticket.id)}
                    >
                      Assumir chamado
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && !formOpen && <p className="meeting-error">{error}</p>}
      {formOpen && (
        <div
          className="ticket-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Novo chamado"
        >
          <div className="ticket-drawer__header">
            <div>
              <p className="eyebrow">Central de TI</p>
              <h2>Novo chamado</h2>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Fechar formulário"
            >
              <X size={20} />
            </button>
          </div>
          {createdTicket ? (
            <div className="ticket-drawer__confirmation">
              <span>
                <ShieldCheck size={24} />
              </span>
              <h3>Chamado registrado</h3>
              <p>
                Seu protocolo é <strong>{createdTicket.protocol}</strong>. A
                solicitação já está disponível na lista dos seus chamados.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={() => setFormOpen(false)}
              >
                Fechar
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setSubmitting(true);
                setError(null);
                try {
                  const response = await fetch("/api/tickets", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject, category, details }),
                  });
                  const body = (await response.json()) as {
                    ticket?: SupportTicket;
                    error?: string;
                  };
                  if (!response.ok || !body.ticket)
                    throw new Error(
                      body.error ?? "Não foi possível registrar o chamado.",
                    );
                  setCreatedTicket(body.ticket);
                  setTickets((current) => [body.ticket!, ...current]);
                  setSubject("");
                  setCategory("");
                  setDetails("");
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Não foi possível registrar o chamado.",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label>
                Assunto
                <input
                  required
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Descreva brevemente a solicitação"
                />
              </label>
              <label>
                Categoria
                <select
                  required
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="" disabled>
                    Selecione uma categoria
                  </option>
                  <option>Equipamento</option>
                  <option>Acesso</option>
                  <option>Conectividade</option>
                  <option>Outro</option>
                </select>
              </label>
              <label>
                Detalhes
                <textarea
                  required
                  rows={5}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Inclua as informações que ajudam o time a entender a situação."
                />
              </label>
              {error && <p className="meeting-error">{error}</p>}
              <button
                type="submit"
                className="primary-button"
                disabled={submitting}
              >
                {submitting ? "Registrando chamado…" : "Registrar chamado"}
                {!submitting && <ArrowUpRight size={16} />}
              </button>
            </form>
          )}
        </div>
      )}
      {formOpen && (
        <button
          className="drawer-backdrop"
          onClick={() => setFormOpen(false)}
          aria-label="Fechar formulário"
        />
      )}
    </section>
  );
}
