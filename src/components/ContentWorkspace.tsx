import { useEffect, useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Megaphone,
  Plus,
  Save,
} from "lucide-react";
import type { SessionUser } from "./LoginScreen";

type ModuleKey = "wiki" | "comunicacao" | "crm";
type Entry = {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  createdAt: string;
};

const copy: Record<
  ModuleKey,
  {
    eyebrow: string;
    title: string;
    description: string;
    singular: string;
    titleLabel: string;
    subtitleLabel: string;
    subtitlePlaceholder: string;
    bodyLabel: string;
    bodyPlaceholder: string;
    icon: typeof BookOpen;
  }
> = {
  wiki: {
    eyebrow: "Conhecimento interno",
    title: "POPs e wiki",
    description:
      "Registre procedimentos, orientações e referências que ajudem o time a trabalhar de forma consistente.",
    singular: "artigo",
    titleLabel: "Título do procedimento ou artigo",
    subtitleLabel: "Categoria",
    subtitlePlaceholder: "Ex.: Atendimento, jurídico, administrativo",
    bodyLabel: "Conteúdo",
    bodyPlaceholder:
      "Escreva o procedimento, as etapas e observações importantes.",
    icon: BookOpen,
  },
  comunicacao: {
    eyebrow: "Mota & Advogados",
    title: "Comunicação interna",
    description:
      "Centralize avisos, informações e comunicados que precisam chegar ao time.",
    singular: "comunicado",
    titleLabel: "Assunto do comunicado",
    subtitleLabel: "Público ou área",
    subtitlePlaceholder: "Ex.: Todo o escritório, financeiro, jurídico",
    bodyLabel: "Mensagem",
    bodyPlaceholder: "Escreva a informação que deve ser comunicada ao time.",
    icon: Megaphone,
  },
  crm: {
    eyebrow: "Relacionamento",
    title: "CRM",
    description:
      "Organize contatos e anotações de relacionamento em um só lugar, sem dados de demonstração.",
    singular: "registro",
    titleLabel: "Nome do contato ou organização",
    subtitleLabel: "Empresa, e-mail ou telefone",
    subtitlePlaceholder: "Ex.: Empresa Ltda. · contato@empresa.com",
    bodyLabel: "Contexto e observações",
    bodyPlaceholder:
      "Registre o contexto, os interesses e próximos passos do relacionamento.",
    icon: BriefcaseBusiness,
  },
};

export function ContentWorkspace({
  module,
  user,
}: {
  module: ModuleKey;
  user: SessionUser;
}) {
  const details = copy[module];
  const Icon = details.icon;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/content/${module}`, {
          credentials: "include",
        });
        if (!response.ok)
          throw new Error("Não foi possível carregar o conteúdo deste módulo.");
        const result = (await response.json()) as { entries: Entry[] };
        setEntries(result.entries);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar o conteúdo deste módulo.",
        );
      } finally {
        setLoading(false);
      }
    });
  }, [module]);

  const resetForm = () => {
    setTitle("");
    setSubtitle("");
    setBody("");
    setError(null);
    setFormOpen(false);
  };

  return (
    <section className="content-workspace">
      <div className="support-hero">
        <div>
          <p className="eyebrow">{details.eyebrow}</p>
          <h1>{details.title}</h1>
          <p>{details.description}</p>
        </div>
        {user.isAdmin && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setFormOpen(true)}
          >
            <Plus size={17} /> Adicionar {details.singular}
          </button>
        )}
      </div>

      {formOpen && (
        <form
          className="content-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            try {
              const response = await fetch(`/api/content/${module}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, subtitle, body }),
              });
              const result = (await response.json()) as {
                entry?: Entry;
                error?: string;
              };
              if (!response.ok || !result.entry)
                throw new Error(
                  result.error ?? "Não foi possível salvar o conteúdo.",
                );
              setEntries((current) => [result.entry!, ...current]);
              resetForm();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Não foi possível salvar o conteúdo.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="content-editor__heading">
            <Icon size={19} />
            <strong>Novo {details.singular}</strong>
          </div>
          <label>
            {details.titleLabel}
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {details.subtitleLabel}
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder={details.subtitlePlaceholder}
            />
          </label>
          <label>
            {details.bodyLabel}
            <textarea
              required
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={details.bodyPlaceholder}
            />
          </label>
          {error && <p className="meeting-error">{error}</p>}
          <div className="content-editor__actions">
            <button
              type="button"
              className="secondary-button"
              onClick={resetForm}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
              <Save size={16} />
            </button>
          </div>
        </form>
      )}

      {!user.isAdmin && module === "crm" ? (
        <div className="content-workspace__empty">
          <Icon size={27} />
          <h2>CRM restrito</h2>
          <p>Este módulo é acessível somente pela administração.</p>
        </div>
      ) : (
        <div className="content-workspace__list">
          {loading ? (
            <p>Carregando conteúdo…</p>
          ) : entries.length === 0 ? (
            <div className="content-workspace__empty">
              <Icon size={27} />
              <h2>Nenhum {details.singular} adicionado</h2>
              <p>
                Use “Adicionar {details.singular}” para começar a preencher este
                espaço.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <article className="content-card" key={entry.id}>
                <div>
                  <p className="eyebrow">{entry.subtitle || details.eyebrow}</p>
                  <h2>{entry.title}</h2>
                </div>
                <p>{entry.body}</p>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
