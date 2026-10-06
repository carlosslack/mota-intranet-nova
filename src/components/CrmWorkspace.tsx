import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleOff,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Phone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { SessionUser } from "./LoginScreen";

type CrmCompanyType = "pf" | "pj";
type CrmCompanyStatus = "ativo" | "prospect" | "inativo";
type CrmInteractionType = "ligacao" | "reuniao" | "email" | "andamento" | "outro";

type CrmContact = { id: string; name: string; role?: string; email?: string; phone?: string; channel?: string; createdAt: string };
type CrmCompany = { id: string; name: string; type: CrmCompanyType; document?: string; area?: string; tags: string[]; status: CrmCompanyStatus; owner?: string; notes?: string; contacts: CrmContact[]; createdAt: string; updatedAt: string; contactCount?: number; lastInteractionAt?: string };
type CrmInteraction = { id: string; companyId: string; contactId?: string; type: CrmInteractionType; summary: string; detail?: string; nextStep?: string; nextStepDate?: string; nextStepCompletedAt?: string; authorId: string; authorName: string; createdAt: string };
type CrmSummary = { totals: { clients: number; active: number; prospects: number; interactions: number }; followUps: { overdue: FollowUpItem[]; today: FollowUpItem[]; upcoming: FollowUpItem[] } };
type FollowUpItem = { id: string; companyId: string; companyName: string; typeLabel: string; summary: string; nextStep?: string; nextStepDate: string };

const crmTypeLabel: Record<CrmCompanyType, string> = { pf: "Pessoa física", pj: "Pessoa jurídica" };
const crmStatusLabel: Record<CrmCompanyStatus, string> = { ativo: "Ativo", prospect: "Prospect", inativo: "Inativo" };
const crmInteractionLabels: Record<CrmInteractionType, string> = { ligacao: "Ligação", reuniao: "Reunião", email: "E-mail", andamento: "Andamento", outro: "Outro" };

function maskDocument(value?: string): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.***.***/****-**`;
  return undefined;
}

function formatDate(iso: string): string {
  try { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return iso; }
}

function formatDateKey(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${key}T12:00:00Z`));
}

function StatusBadge({ status }: { status: CrmCompanyStatus }) {
  return <span className={`crm-badge crm-badge--${status}`}>{crmStatusLabel[status]}</span>;
}

function CrmLoading({ label }: { label: string }) {
  return <div className="crm-state" role="status"><Loader2 className="crm-state__spin" size={22} /><p>{label}</p></div>;
}

function CrmError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="crm-state crm-state--error" role="alert">
      <AlertCircle size={22} />
      <p>{message}</p>
      {onRetry ? <button type="button" className="text-button" onClick={onRetry}><RefreshCw size={15} /> Tentar novamente</button> : null}
    </div>
  );
}

function CrmEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="crm-state">
      <CircleOff size={20} />
      <p><strong>{title}</strong></p>
      <p>{description}</p>
    </div>
  );
}

export function CrmWorkspace({ user }: { user: SessionUser }) {
  const [view, setView] = useState<{ kind: "list" } | { kind: "detail"; id: string }>({ kind: "list" });
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CrmCompanyStatus>("");
  const [tagFilter, setTagFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const allTags = useMemo(() => Array.from(new Set(companies.flatMap((company) => company.tags))).sort((left, right) => left.localeCompare(right)), [companies]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (tagFilter) params.set("tag", tagFilter);
      const [companiesRes, summaryRes] = await Promise.all([
        fetch(`/api/crm/companies?${params.toString()}`, { credentials: "include" }),
        fetch("/api/crm/summary", { credentials: "include" }),
      ]);
      if (!companiesRes.ok || !summaryRes.ok) throw new Error("Não foi possível carregar os dados do CRM.");
      const companiesData = (await companiesRes.json()) as { companies: CrmCompany[] };
      const summaryData = (await summaryRes.json()) as CrmSummary;
      setCompanies(companiesData.companies);
      setSummary(summaryData);
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados do CRM.");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, tagFilter]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!user.isAdmin) {
    return (
      <section className="module-view">
        <p className="eyebrow">Relacionamento</p>
        <div className="module-view__card">
          <span className="module-view__icon"><UsersRound /></span>
          <h1>CRM institucional</h1>
          <p>O CRM é restrito à administração do escritório.</p>
        </div>
      </section>
    );
  }

  if (view.kind === "detail") {
    return (
      <>
        {toast ? <div className="crm-toast" role="status">{toast}</div> : null}
        <CrmCompanyDetail companyId={view.id} onBack={() => setView({ kind: "list" })} onChanged={refresh} onToast={setToast} />
      </>
    );
  }

  return (
    <section className="crm-page" aria-label="CRM institucional">
      <header className="crm-page__header">
        <div>
          <p className="eyebrow">Relacionamento</p>
          <h1>CRM</h1>
          <p>Base de clientes, contatos e histórico de relacionamento do escritório.</p>
        </div>
        <button className="crm-primary-action" type="button" onClick={() => setShowForm(true)}>
          <Plus size={17} /> Novo cliente
        </button>
      </header>

      {toast ? <div className="crm-toast" role="status">{toast}</div> : null}

      {summary ? (
        <div className="crm-kpis" aria-label="Indicadores do CRM">
          <article className="crm-kpi"><span className="crm-kpi__value">{summary.totals.clients}</span><span className="crm-kpi__label">Clientes</span></article>
          <article className="crm-kpi"><span className="crm-kpi__value">{summary.totals.active}</span><span className="crm-kpi__label">Ativos</span></article>
          <article className="crm-kpi"><span className="crm-kpi__value">{summary.totals.prospects}</span><span className="crm-kpi__label">Prospects</span></article>
          <article className="crm-kpi"><span className="crm-kpi__value">{summary.totals.interactions}</span><span className="crm-kpi__label">Interações</span></article>
          <article className="crm-kpi crm-kpi--alert"><span className="crm-kpi__value">{summary.followUps.overdue.length}</span><span className="crm-kpi__label">Follow-ups atrasados</span></article>
        </div>
      ) : null}

      {summary && (summary.followUps.overdue.length > 0 || summary.followUps.today.length > 0 || summary.followUps.upcoming.length > 0) ? (
        <div className="crm-followups">
          {["overdue", "today", "upcoming"].map((bucketKey) => {
            const bucketLabels: Record<string, { title: string; icon: React.ReactNode }> = {
              overdue: { title: "Atrasados", icon: <Clock3 size={15} /> },
              today: { title: "Hoje", icon: <CalendarClock size={15} /> },
              upcoming: { title: "Próximos 7 dias", icon: <CalendarClock size={15} /> },
            };
            const items = summary.followUps[bucketKey as keyof CrmSummary["followUps"]];
            if (items.length === 0) return null;
            const bucket = bucketLabels[bucketKey];
            return (
              <div key={bucketKey} className="crm-followups__group">
                <h2 className={bucketKey === "overdue" ? "crm-followups__title crm-followups__title--alert" : "crm-followups__title"}>{bucket.icon} {bucket.title} ({items.length})</h2>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="crm-followup" onClick={() => setView({ kind: "detail", id: item.companyId })}>
                        <span className="crm-followup__date">{formatDateKey(item.nextStepDate)}</span>
                        <span className="crm-followup__body"><strong>{item.companyName}</strong><small>{item.typeLabel} · {item.summary}</small>{item.nextStep ? <small>Próximo passo: {item.nextStep}</small> : null}</span>
                        <ChevronRight size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="crm-toolbar" role="search">
        <div className="crm-search">
          <Search size={16} />
          <input type="search" placeholder="Buscar por nome, área, documento, responsável ou etiqueta..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar clientes" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          <option value="ativo">Ativos</option>
          <option value="prospect">Prospects</option>
          <option value="inativo">Inativos</option>
        </select>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filtrar por etiqueta">
          <option value="">Todas as etiquetas</option>
          {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </div>

      {loading ? <CrmLoading label="Carregando CRM..." /> : listError ? <CrmError message={listError} onRetry={refresh} /> : companies.length === 0 ? (
        <CrmEmpty title={query || statusFilter || tagFilter ? "Nenhum cliente encontrado" : "A base de clientes está vazia"} description={query || statusFilter || tagFilter ? "Ajuste a busca ou limpe os filtros para ver mais resultados." : "Adicione o primeiro cliente com o botão Novo cliente acima."} />
      ) : (
        <div className="crm-grid">
          {companies.map((company) => (
            <button key={company.id} type="button" className="crm-card" onClick={() => setView({ kind: "detail", id: company.id })}>
              <div className="crm-card__head">
                <span className="crm-card__icon"><Building2 size={18} /></span>
                <span className="crm-card__name">{company.name}</span>
                <StatusBadge status={company.status} />
              </div>
              <div className="crm-card__meta">
                <small>{crmTypeLabel[company.type]}</small>
                {company.area ? <small>{company.area}</small> : null}
                {company.owner ? <small>Responsável: {company.owner}</small> : null}
              </div>
              {company.tags.length > 0 ? (
                <div className="crm-card__tags">{company.tags.map((tag) => <span key={tag} className="crm-tag">{tag}</span>)}</div>
              ) : null}
              <div className="crm-card__foot">
                <small><UsersRound size={13} /> {company.contactCount ?? company.contacts.length} contato(s)</small>
                <small>{company.lastInteractionAt ? `Última interação: ${formatDate(company.lastInteractionAt)}` : "Sem interações"}</small>
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm ? (
        <CrmCompanyForm
          onClose={() => setShowForm(false)}
          onSaved={(company) => { setShowForm(false); setToast(`Cliente ${company.name} criado.`); void refresh(); }}
        />
      ) : null}
    </section>
  );
}

function CrmCompanyForm({ onClose, onSaved }: { onClose: () => void; onSaved: (company: CrmCompany) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CrmCompanyType>("pj");
  const [status, setStatus] = useState<CrmCompanyStatus>("ativo");
  const [document, setDocument] = useState("");
  const [area, setArea] = useState("");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, status, document, area, owner, notes, tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean) }),
      });
      const result = (await response.json()) as { company?: CrmCompany; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o cliente.");
      if (result.company) onSaved(result.company);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Novo cliente">
        <header><h2>Novo cliente</h2><button type="button" className="crm-icon-button" onClick={onClose} aria-label="Fechar formulário"><X size={18} /></button></header>
        {error ? <div className="crm-form-error" role="alert"><AlertCircle size={16} /> {error}</div> : null}
        <div className="crm-form-grid">
          <label>Nome do cliente ou empresa<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
          <div className="crm-form-row">
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as CrmCompanyType)}><option value="pj">Pessoa jurídica</option><option value="pf">Pessoa física</option></select></label>
            <label>Situação<select value={status} onChange={(event) => setStatus(event.target.value as CrmCompanyStatus)}><option value="ativo">Ativo</option><option value="prospect">Prospect</option><option value="inativo">Inativo</option></select></label>
          </div>
          <div className="crm-form-row">
            <label>CPF / CNPJ<input value={document} onChange={(event) => setDocument(event.target.value)} maxLength={24} placeholder="Opcional" /></label>
            <label>Área de atuação<input value={area} onChange={(event) => setArea(event.target.value)} maxLength={120} placeholder="Ex.: Cível, trabalhista... (opcional)" /></label>
          </div>
          <label>Responsável no escritório<input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={120} placeholder="Opcional" /></label>
          <label>Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Contexto do relacionamento (opcional)" /></label>
          <label>Etiquetas (separadas por vírgula)<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="Ex.: importante, contrato 2026" /></label>
        </div>
        <footer className="crm-modal__actions">
          <button type="button" className="crm-secondary-action" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="crm-primary-action" onClick={() => void submit()} disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Salvar cliente"}</button>
        </footer>
      </div>
    </div>
  );
}

function CrmCompanyDetail({ companyId, onBack, onChanged, onToast }: { companyId: string; onBack: () => void; onChanged: () => void; onToast: (message: string) => void }) {
  const [company, setCompany] = useState<CrmCompany | null>(null);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/companies/${companyId}`, { credentials: "include" });
      if (response.status === 404) throw new Error("Cliente não encontrado. Ele pode ter sido removido.");
      if (!response.ok) throw new Error("Não foi possível carregar a ficha do cliente.");
      const result = (await response.json()) as { company: CrmCompany; interactions: CrmInteraction[] };
      setCompany(result.company);
      setInteractions(result.interactions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a ficha do cliente.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (loading) return <CrmLoading label="Carregando ficha do cliente..." />;
  if (error) return <div className="crm-page"><CrmError message={error} onRetry={load} /><button type="button" className="text-button" onClick={onBack}>Voltar para a lista</button></div>;
  if (!company) return null;
  const doc = company.document ?? "";

  return (
    <section className="crm-page" aria-label={`Ficha do cliente ${company.name}`}>
      <button type="button" className="text-button" onClick={onBack}>← Voltar para a lista</button>
      <header className="crm-detail__header">
        <div className="crm-detail__title">
          <span className="crm-card__icon"><Building2 size={20} /></span>
          <div><h1>{company.name}</h1><p>{crmTypeLabel[company.type]}{company.area ? ` · ${company.area}` : ""}</p></div>
          <StatusBadge status={company.status} />
        </div>
        <div className="crm-detail__actions">
          <button type="button" className="crm-secondary-action" onClick={() => setEditing(true)}>Editar</button>
          <button type="button" className="crm-secondary-action crm-secondary-action--danger" onClick={() => setDeleting(true)}>Remover</button>
        </div>
      </header>

      <div className="crm-detail__grid">
        <div className="crm-detail__panel">
          <h2>Dados do cliente</h2>
          <dl>
            {doc ? <div className="crm-detail__row"><dt>Documento</dt><dd>{showDoc ? doc : `${maskDocument(doc) ?? "******"}`} <button type="button" className="crm-icon-button" onClick={() => setShowDoc((current) => !current)} aria-label={showDoc ? "Ocultar documento" : "Revelar documento"}>{showDoc ? <EyeOff size={15} /> : <Eye size={15} />}</button></dd></div> : null}
            {company.owner ? <div className="crm-detail__row"><dt>Responsável</dt><dd>{company.owner}</dd></div> : null}
            {company.tags.length > 0 ? <div className="crm-detail__row"><dt>Etiquetas</dt><dd className="crm-card__tags">{company.tags.map((tag) => <span key={tag} className="crm-tag">{tag}</span>)}</dd></div> : null}
            <div className="crm-detail__row"><dt>Cadastrado em</dt><dd>{formatDate(company.createdAt)}</dd></div>
          </dl>
          {company.notes ? <p className="crm-detail__notes">{company.notes}</p> : null}
          <h2>Contatos ({company.contacts.length})</h2>
          {company.contacts.length === 0 ? <CrmEmpty title="Nenhum contato" description="Adicione a pessoa de referência deste cliente." /> : (
            <ul className="crm-contacts">
              {company.contacts.map((contact) => (
                <li key={contact.id} className="crm-contact">
                  <span className="crm-contact__icon"><UserRound size={15} /></span>
                  <span className="crm-contact__body"><strong>{contact.name}</strong>{contact.role ? <small>{contact.role}</small> : null}{contact.email ? <small><Mail size={12} /> {contact.email}</small> : null}{contact.phone ? <small><Phone size={12} /> {contact.phone}</small> : null}</span>
                  <CrmContactActions company={company} contact={contact} onChanged={() => { void load(); onChanged(); }} onToast={onToast} />
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="text-button" onClick={() => setShowContactForm(true)}><Plus size={15} /> Adicionar contato</button>
        </div>

        <div className="crm-detail__timeline">
          <div className="crm-detail__timeline-head">
            <h2>Histórico de interações ({interactions.length})</h2>
            <button type="button" className="crm-primary-action" onClick={() => setShowInteractionForm(true)}><Plus size={16} /> Registrar interação</button>
          </div>
          {interactions.length === 0 ? <CrmEmpty title="Sem interações" description="Registre a primeira interação para começar o histórico." /> : (
            <ol className="crm-timeline">
              {interactions.map((item) => (
                <li key={item.id} className="crm-timeline__item">
                  <div className="crm-timeline__marker" aria-hidden="true" />
                  <div className="crm-timeline__content">
                    <header><span className="crm-timeline__type">{crmInteractionLabels[item.type]}</span><time>{formatDate(item.createdAt)}</time><button type="button" className="crm-icon-button" aria-label="Remover interação" onClick={() => {
                      void (async () => {
                        const response = await fetch(`/api/crm/interactions/${item.id}`, { method: "DELETE", credentials: "include" });
                        if (response.ok) { onToast("Interação removida."); void load(); } else { onToast("Não foi possível remover a interação."); }
                      })();
                    }}><Trash2 size={14} /></button></header>
                    <p>{item.summary}</p>
                    {item.detail ? <small className="crm-timeline__detail">{item.detail}</small> : null}
                    {item.nextStep ? (
                      <div className={`crm-timeline__next${item.nextStepCompletedAt ? " crm-timeline__next--done" : ""}`}>
                        <CalendarClock size={13} />
                        <span>{item.nextStep}{item.nextStepDate ? ` · até ${formatDateKey(item.nextStepDate)}` : ""}</span>
                        {item.nextStepDate ? (
                          <button type="button" className="crm-followup-toggle" onClick={() => {
                            void (async () => {
                              const response = await fetch(`/api/crm/interactions/${item.id}/follow-up`, {
                                method: "PATCH",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ completed: !item.nextStepCompletedAt }),
                              });
                              if (response.ok) {
                                onToast(item.nextStepCompletedAt ? "Follow-up reaberto." : "Follow-up concluído.");
                                void load();
                                onChanged();
                              } else {
                                onToast("Não foi possível atualizar o follow-up.");
                              }
                            })();
                          }}>{item.nextStepCompletedAt ? "Reabrir" : "Concluir"}</button>
                        ) : null}
                      </div>
                    ) : null}
                    <small className="crm-timeline__author">Registrado por {item.authorName}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {editing ? <CrmCompanyEditForm company={company} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); onChanged(); onToast("Cliente atualizado."); }} /> : null}
      {deleting ? <CrmCompanyDeleteConfirm company={company} onClose={() => setDeleting(false)} onDeleted={() => { onChanged(); onBack(); }} /> : null}
      {showContactForm ? <CrmContactForm companyId={company.id} onClose={() => setShowContactForm(false)} onSaved={() => { setShowContactForm(false); void load(); onChanged(); onToast("Contato adicionado."); }} /> : null}
      {showInteractionForm ? <CrmInteractionForm company={company} onClose={() => setShowInteractionForm(false)} onSaved={() => { setShowInteractionForm(false); void load(); onChanged(); onToast("Interação registrada."); }} /> : null}
    </section>
  );
}

function CrmContactForm({ companyId, contact, onClose, onSaved }: { companyId: string; contact?: CrmContact; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [channel, setChannel] = useState(contact?.channel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(contact ? `/api/crm/companies/${companyId}/contacts/${contact.id}` : `/api/crm/companies/${companyId}/contacts`, {
        method: contact ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, email, phone, channel: channel || undefined }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o contato.");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="dialog" aria-modal="true" aria-label={contact ? "Editar contato" : "Novo contato"}>
        <header><h2>{contact ? "Editar contato" : "Novo contato"}</h2><button type="button" className="crm-icon-button" onClick={onClose} aria-label="Fechar formulário"><X size={18} /></button></header>
        {error ? <div className="crm-form-error" role="alert"><AlertCircle size={16} /> {error}</div> : null}
        <div className="crm-form-grid">
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
          <label>Cargo<input value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} placeholder="Opcional" /></label>
          <div className="crm-form-row">
            <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={160} placeholder="Opcional" /></label>
            <label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} placeholder="Opcional" /></label>
          </div>
          <label>Canal preferido (opcional)<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Não informado</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option></select></label>
        </div>
        <footer className="crm-modal__actions">
          <button type="button" className="crm-secondary-action" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="crm-primary-action" onClick={() => void submit()} disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Salvar contato"}</button>
        </footer>
      </div>
    </div>
  );
}

function CrmContactActions({ company, contact, onChanged, onToast }: { company: CrmCompany; contact: CrmContact; onChanged: () => void; onToast: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <span className="crm-contact__actions">
      <button type="button" className="crm-icon-button" aria-label={`Editar contato ${contact.name}`} onClick={() => setEditing(true)}><Pencil size={14} /></button>
      <button type="button" className="crm-icon-button" aria-label={`Remover contato ${contact.name}`} onClick={() => setConfirming(true)}><Trash2 size={14} /></button>
      {editing ? <CrmContactForm companyId={company.id} contact={contact} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); onToast("Contato atualizado."); }} /> : null}
      {confirming ? (
        <div className="crm-modal-backdrop">
          <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Remover contato">
            <header><h2>Remover contato</h2><button type="button" className="crm-icon-button" onClick={() => setConfirming(false)} aria-label="Fechar"><X size={18} /></button></header>
            <p>Remover o contato <strong>{contact.name}</strong> de {company.name}?</p>
            <footer className="crm-modal__actions">
              <button type="button" className="crm-secondary-action" onClick={() => setConfirming(false)}>Cancelar</button>
              <button type="button" className="crm-danger-action" onClick={() => {
                void (async () => {
                  const response = await fetch(`/api/crm/companies/${company.id}/contacts/${contact.id}`, { method: "DELETE", credentials: "include" });
                  if (response.ok) { setConfirming(false); onChanged(); onToast("Contato removido."); } else { onToast("Não foi possível remover o contato."); }
                })();
              }}>Remover</button>
            </footer>
          </div>
        </div>
      ) : null}
    </span>
 );
}

function CrmCompanyEditForm({ company, onClose, onSaved }: { company: CrmCompany; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(company.name);
  const [type, setType] = useState<CrmCompanyType>(company.type);
  const [status, setStatus] = useState<CrmCompanyStatus>(company.status);
  const [document, setDocument] = useState(company.document ?? "");
  const [area, setArea] = useState(company.area ?? "");
  const [owner, setOwner] = useState(company.owner ?? "");
  const [notes, setNotes] = useState(company.notes ?? "");
  const [tagsText, setTagsText] = useState(company.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, status, document, area, owner, notes, tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean) }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar as alterações.");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="dialog" aria-modal="true" aria-label={`Editar ${company.name}`}>
        <header><h2>Editar cliente</h2><button type="button" className="crm-icon-button" onClick={onClose} aria-label="Fechar formulário"><X size={18} /></button></header>
        {error ? <div role="alert" className="crm-form-error"><AlertCircle size={16} /> {error}</div> : null}
        <div className="crm-form-grid">
          <label>Nome do cliente ou empresa<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label>
          <div className="crm-form-row">
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as CrmCompanyType)}><option value="pj">Pessoa jurídica</option><option value="pf">Pessoa física</option></select></label>
            <label>Situação<select value={status} onChange={(event) => setStatus(event.target.value as CrmCompanyStatus)}><option value="ativo">Ativo</option><option value="prospect">Prospect</option><option value="inativo">Inativo</option></select></label>
          </div>
          <div className="crm-form-row">
            <label>CPF / CNPJ<input value={document} onChange={(event) => setDocument(event.target.value)} maxLength={24} /></label>
            <label>Área de atuação<input value={area} onChange={(event) => setArea(event.target.value)} maxLength={120} /></label>
          </div>
          <label>Responsável no escritório<input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={120} /></label>
          <label>Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} /></label>
          <label>Etiquetas (separadas por vírgula)<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} /></label>
        </div>
        <footer className="crm-modal__actions">
          <button type="button" className="crm-secondary-action" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="crm-primary-action" onClick={() => void submit()} disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Salvar alterações"}</button>
        </footer>
      </div>
    </div>
  );
}

function CrmCompanyDeleteConfirm({ company, onClose, onDeleted }: { company: CrmCompany; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText.trim().toUpperCase() === company.name.trim().toUpperCase();
  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Remover cliente">
        <header><h2>Remover cliente</h2><button type="button" className="crm-icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
        <p>Isso remove <strong>{company.name}</strong>, todos os contatos e o histórico de interações. A ação não pode ser desfeita.</p>
        <label>Para confirmar, digite o nome do cliente:<input value={confirmText} onChange={(value) => setConfirmText(value.target.value)} /></label>
        {error ? <div className="crm-form-error" role="alert"><AlertCircle size={16} /> {error}</div> : null}
        <footer className="crm-modal__actions">
          <button type="button" className="crm-secondary-action" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="crm-danger-action" disabled={!canDelete || saving} onClick={() => {
            void (async () => {
              setSaving(true); setError(null);
              try {
                const response = await fetch(`/api/crm/companies/${company.id}`, { method: "DELETE", credentials: "include" });
                if (response.ok) { onDeleted(); } else { const result = (await response.json()) as { error?: string }; throw new Error(result.error ?? "Não foi possível remover o cliente."); }
              } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível remover."); } finally { setSaving(false); }
            })();
          }}>{saving ? "Removendo..." : "Remover definitivamente"}</button>
        </footer>
      </div>
    </div>
  );
}

function CrmInteractionForm({ company, onClose, onSaved }: { company: CrmCompany; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<CrmInteractionType>("ligacao");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, contactId: contactId || undefined, type, summary, detail, nextStep, nextStepDate: nextStepDate || undefined }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível registrar a interação.");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar a interação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Registrar interação">
        <header><h2>Registrar interação — {company.name}</h2><button type="button" className="crm-icon-button" onClick={onClose} aria-label="Fechar formulário"><X size={18} /></button></header>
        {error ? <div className="crm-form-error" role="alert"><AlertCircle size={16} /> {error}</div> : null}
        <div className="crm-form-grid">
          <div className="crm-form-row">
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as CrmInteractionType)}><option value="ligacao">Ligação</option><option value="reuniao">Reunião</option><option value="email">E-mail</option><option value="andamento">Andamento</option><option value="outro">Outro</option></select></label>
            <label>Contato (opcional)<select value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Não informado</option>{company.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
          </div>
          <label>Resumo<input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={400} required placeholder="O que aconteceu, em uma linha" /></label>
          <label>Detalhamento (opcional)<textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={4000} rows={3} /></label>
          <div className="crm-form-row">
            <label>Próximo passo (opcional)<input value={nextStep} onChange={(event) => setNextStep(event.target.value)} maxLength={300} /></label>
            <label>Data limite do próximo passo<input type="date" value={nextStepDate} onChange={(event) => setNextStepDate(event.target.value)} /></label>
          </div>
        </div>
        <footer className="crm-modal__actions">
          <button type="button" className="crm-secondary-action" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="crm-primary-action" onClick={() => void submit()} disabled={saving || !summary.trim()}>{saving ? "Registrando..." : "Registrar interação"}</button>
        </footer>
      </div>
    </div>
  );
}
