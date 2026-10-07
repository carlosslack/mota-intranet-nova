import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  FileSearch,
  FolderOpen,
  LayoutDashboard,
  Landmark,
  Menu,
  MessageSquareMore,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  UserRoundCog,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import logo from "./assets/branding/mota-assinatura.png";
import { LoginScreen, type SessionUser } from "./components/LoginScreen";
import { MeetingScheduler } from "./components/MeetingScheduler";
import { SupportCenter as ConnectedSupportCenter } from "./components/SupportCenter";
import { ContentWorkspace } from "./components/ContentWorkspace";
import { CrmWorkspace } from "./components/CrmWorkspace";
import { FinancialWorkspace } from "./components/FinancialWorkspace";
import "./App.css";

type Section =
  | "inicio"
  | "workspace"
  | "juridico"
  | "financeiro"
  | "ti"
  | "documentos"
  | "procedimentos"
  | "comunicados"
  | "crm"
  | "assistente"
  | "administracao"
  | "busca"
  | "reunioes";
const isLocalPreview =
  import.meta.env.VITE_LOCAL_PREVIEW === "true" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const previewUser: SessionUser = {
  id: "local-preview",
  name: "TI Mota",
  email: "ti@mota.adv.br",
  isAdmin: true,
};
const navigation: Array<{
  id: Section;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "inicio", label: "Visão geral", icon: LayoutDashboard },
  { id: "workspace", label: "Workspace", icon: CalendarDays },
  { id: "juridico", label: "Análise jurídica", icon: FileSearch },
  { id: "financeiro", label: "Financeiro", icon: ReceiptText },
  { id: "documentos", label: "Documentos", icon: FolderOpen },
  { id: "procedimentos", label: "POPs e wiki", icon: BookOpen },
  { id: "ti", label: "Central de TI", icon: Ticket },
  { id: "comunicados", label: "Comunicação", icon: MessageSquareMore },
  { id: "crm", label: "CRM", icon: UsersRound },
  { id: "assistente", label: "Assistente", icon: Bot },
  { id: "administracao", label: "Administração", icon: UserRoundCog },
];
function FeatureCard({
  icon,
  title,
  description,
  action,
  onClick,
  accent = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      className={`feature-card ${accent ? "feature-card--accent" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="feature-card__icon">{icon}</span>
      <span className="feature-card__content">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="feature-card__action">
        {action}
        <ArrowUpRight size={15} />
      </span>
    </button>
  );
}
function EmptyState({ section }: { section: Exclude<Section, "inicio"> }) {
  const copy: Record<
    Exclude<Section, "inicio">,
    { eyebrow: string; title: string; description: string; icon: ReactNode }
  > = {
    workspace: {
      eyebrow: "Google Workspace",
      title: "Seu espaço de trabalho",
      description:
        "As conexões com Agenda, Meet, Drive e demais serviços serão exibidas aqui quando a integração for ativada.",
      icon: <CalendarDays />,
    },
    juridico: {
      eyebrow: "Assistente jurídico",
      title: "Análise jurídica",
      description:
        "Este módulo receberá o fluxo de análise e a base de conhecimento configurados no Langflow.",
      icon: <FileSearch />,
    },
    financeiro: {
      eyebrow: "Assistente financeiro",
      title: "Consultas financeiras",
      description:
        "O módulo ficará pronto para consultar fontes autorizadas e organizar os resultados solicitados.",
      icon: <ReceiptText />,
    },
    ti: {
      eyebrow: "Suporte interno",
      title: "Central de TI",
      description:
        "Aqui o colaborador abrirá, acompanhará e atualizará chamados. A persistência segura será conectada antes da publicação.",
      icon: <Ticket />,
    },
    comunicados: {
      eyebrow: "Mota & Advogados",
      title: "Comunicação interna",
      description:
        "Os comunicados institucionais aparecerão neste espaço quando a fonte oficial for conectada.",
      icon: <MessageSquareMore />,
    },
    documentos: {
      eyebrow: "Acervo jurídico",
      title: "Documentos e minutas",
      description:
        "A biblioteca do Google Drive será exibida aqui com as permissões da conta corporativa conectada.",
      icon: <FolderOpen />,
    },
    procedimentos: {
      eyebrow: "Conhecimento interno",
      title: "POPs e wiki",
      description:
        "Os procedimentos institucionais e materiais de apoio serão organizados neste espaço.",
      icon: <BookOpen />,
    },
    crm: {
      eyebrow: "Relacionamento",
      title: "CRM institucional",
      description:
        "Entidades, contatos e históricos serão carregados a partir da fonte oficial definida para o escritório.",
      icon: <UsersRound />,
    },
    assistente: {
      eyebrow: "Inteligência assistida",
      title: "Assistente Mota",
      description:
        "A conversa será conectada ao fluxo Langflow aprovado, com ferramentas e fontes delimitadas por permissão.",
      icon: <Bot />,
    },
    administracao: {
      eyebrow: "Gestão interna",
      title: "Administração",
      description:
        "A gestão de acessos, integrações e parâmetros da intranet ficará concentrada neste módulo administrativo.",
      icon: <UserRoundCog />,
    },
    busca: {
      eyebrow: "Pesquisa interna",
      title: "Busca inteligente",
      description:
        "A pesquisa será conectada aos documentos, POPs e fontes autorizadas quando o índice corporativo for definido.",
      icon: <Search />,
    },
    reunioes: {
      eyebrow: "Google Meet e Agenda",
      title: "Novo agendamento",
      description:
        "Crie eventos no seu calendário com Google Meet e convites aos participantes.",
      icon: <Video />,
    },
  };
  const item = copy[section];
  return (
    <section className="module-view">
      <p className="eyebrow">{item.eyebrow}</p>
      <div className="module-view__card">
        <span className="module-view__icon">{item.icon}</span>
        <h1>{item.title}</h1>
        <p>{item.description}</p>
        <span className="module-view__status">
          <span /> Estrutura visual pronta para integração
        </span>
      </div>
    </section>
  );
}
function WorkspaceHub({ navigate }: { navigate: (section: Section) => void }) {
  const links = [
    {
      name: "Gmail",
      description: "E-mail corporativo",
      href: "https://mail.google.com/",
      icon: <MessageSquareMore size={20} />,
    },
    {
      name: "Agenda",
      description: "Compromissos e audiências",
      href: "https://calendar.google.com/",
      icon: <CalendarDays size={20} />,
    },
    {
      name: "Google Meet",
      description: "Reuniões e chamadas",
      href: "https://meet.google.com/",
      icon: <UsersRound size={20} />,
    },
    {
      name: "Google Drive",
      description: "Arquivos institucionais",
      href: "https://drive.google.com/",
      icon: <FolderOpen size={20} />,
    },
  ];
  return (
    <section className="workspace-hub">
      <div className="support-hero">
        <div>
          <p className="eyebrow">Google Workspace</p>
          <h1>Ferramentas de trabalho</h1>
          <p>
            Acesse os serviços corporativos com a mesma conta usada para entrar
            na intranet.
          </p>
        </div>
        <div className="security-chip">
          <ShieldCheck size={17} />
          <span>Conta corporativa</span>
        </div>
      </div>
      <button
        className="workspace-meeting-action"
        type="button"
        onClick={() => navigate("reunioes")}
      >
        <Video size={19} />
        <span>
          <strong>Agendar Google Meet</strong>
          <small>Crie um evento no seu calendário e envie os convites.</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <div className="workspace-links">
        {links.map((item) => (
          <a href={item.href} target="_blank" rel="noreferrer" key={item.name}>
            <span>{item.icon}</span>
            <div>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </div>
            <ArrowUpRight size={16} />
          </a>
        ))}
      </div>
      <div className="integration-note">
        <Landmark size={18} />
        <div>
          <strong>Integrações da intranet</strong>
          <p>
            A sincronização de Agenda, Drive e demais fontes será ligada aqui
            quando as permissões de cada serviço forem definidas.
          </p>
        </div>
      </div>
    </section>
  );
}
function Dashboard({ navigate }: { navigate: (section: Section) => void }) {
  return (
    <>
      <section className="intro">
        <div>
          <p className="eyebrow">Mota & Advogados Associados</p>
          <h1>Central de trabalho</h1>
          <p className="intro__copy">
            Um ponto de partida discreto para o time acessar recursos,
            atendimentos e ferramentas de análise.
          </p>
        </div>
        <div className="security-chip">
          <ShieldCheck size={17} />
          <span>Ambiente interno</span>
        </div>
      </section>
      <section className="workspace-grid" aria-label="Acessos principais">
        <article className="meet-card">
          <div className="card-heading">
            <span className="icon-orb">
              <CalendarDays size={21} />
            </span>
            <span>
              <p className="eyebrow">Workspace</p>
              <h2>Agenda e reuniões</h2>
            </span>
          </div>
          <p>
            Conecte sua conta de trabalho para ver compromissos e abrir o Google
            Meet a partir daqui.
          </p>
          <button
            className="text-button"
            onClick={() => navigate("workspace")}
            type="button"
          >
            Ver Workspace <ChevronRight size={16} />
          </button>
        </article>
        <article className="support-card">
          <div className="card-heading">
            <span className="icon-orb icon-orb--muted">
              <Ticket size={20} />
            </span>
            <span>
              <p className="eyebrow">Suporte</p>
              <h2>Central de TI</h2>
            </span>
          </div>
          <p>
            Solicite apoio técnico e acompanhe seus atendimentos em um só lugar.
          </p>
          <button
            className="text-button"
            onClick={() => navigate("ti")}
            type="button"
          >
            Acessar chamados <ChevronRight size={16} />
          </button>
        </article>
        <article className="agent-card">
          <div>
            <span className="agent-card__mark">
              <Bot size={24} />
            </span>
            <p className="eyebrow">Inteligência assistida</p>
            <h2>Ferramentas que ajudam o trabalho a avançar.</h2>
          </div>
          <p>
            Os agentes jurídicos e financeiros serão conectados aos fluxos
            aprovados, com fontes e permissões definidas por você.
          </p>
        </article>
        <article className="communication-card">
          <div className="card-heading">
            <span className="icon-orb icon-orb--muted">
              <UsersRound size={20} />
            </span>
            <span>
              <p className="eyebrow">Institucional</p>
              <h2>Comunicação</h2>
            </span>
          </div>
          <p>
            Comunicados e materiais internos, sem informações de demonstração.
          </p>
          <button
            className="text-button"
            onClick={() => navigate("comunicados")}
            type="button"
          >
            Abrir mural <ChevronRight size={16} />
          </button>
        </article>
      </section>
      <section className="section-heading">
        <div>
          <p className="eyebrow">Áreas de trabalho</p>
          <h2>Ferramentas especializadas</h2>
        </div>
        <span>Disponíveis conforme permissão</span>
      </section>
      <section className="features-row">
        <FeatureCard
          icon={<FileSearch size={21} />}
          title="Análise jurídica"
          description="Consultas, sínteses e análises apoiadas por fontes autorizadas."
          action="Abrir módulo"
          onClick={() => navigate("juridico")}
          accent
        />
        <FeatureCard
          icon={<ReceiptText size={21} />}
          title="Financeiro"
          description="Consultas e organização de informações financeiras."
          action="Abrir módulo"
          onClick={() => navigate("financeiro")}
        />
        <FeatureCard
          icon={<Video size={21} />}
          title="Videochamada"
          description="Agende uma reunião com Google Meet e convide os participantes."
          action="Agendar reunião"
          onClick={() => navigate("reunioes")}
        />
        <FeatureCard
          icon={<CircleHelp size={21} />}
          title="Precisa de ajuda?"
          description="Acesse a Central de TI para registrar uma solicitação."
          action="Ir para TI"
          onClick={() => navigate("ti")}
        />
      </section>
    </>
  );
}
function App() {
  const [section, setSection] = useState<Section>("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(
    isLocalPreview ? previewUser : null,
  );
  const [authLoading, setAuthLoading] = useState(!isLocalPreview);
  const activeLabel =
    navigation.find((item) => item.id === section)?.label ?? "Visão geral";
  const navigate = (target: Section) => {
    setSection(target);
    setMenuOpen(false);
  };
  const initials =
    user?.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "MA";
  const logout = async () => {
    if (isLocalPreview) return;
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };
  useEffect(() => {
    if (isLocalPreview) return;
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ user: SessionUser }>)
          : null,
      )
      .then((body) => setUser(body?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);
  if (authLoading)
    return (
      <main className="auth-loading">Verificando acesso corporativo…</main>
    );
  if (!user) return <LoginScreen onLogin={setUser} />;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <img src={logo} alt="Mota & Advogados Associados" />
          <button
            className="mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Navegação principal">
          <p className="sidebar__label">Navegação</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              onClick={() => navigate(id)}
              className={
                section === id ? "nav-item nav-item--active" : "nav-item"
              }
              key={id}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <button
            className="nav-item"
            type="button"
            onClick={() => navigate("administracao")}
          >
            <Settings size={18} />
            Configurações
          </button>
          <div className="local-badge">
            <span /> Prévia local
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>Intranet</span>
            <ChevronRight size={14} />
            <strong>{activeLabel}</strong>
          </div>
          <div className="topbar__actions">
            <button
              className="search-button"
              type="button"
              onClick={() => navigate("busca")}
              aria-label="Pesquisar"
            >
              <Search size={18} />
              <span>Pesquisar</span>
            </button>
            <button
              className="profile"
              type="button"
              onClick={logout}
              title="Sair da intranet"
              aria-label="Sair da intranet"
            >
              <span>{initials}</span>
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {section === "inicio" ? (
            <Dashboard navigate={navigate} />
          ) : section === "ti" ? (
            <ConnectedSupportCenter user={user} />
          ) : section === "workspace" ? (
            <WorkspaceHub navigate={navigate} />
          ) : section === "reunioes" ? (
            <MeetingScheduler />
          ) : section === "financeiro" ? (
            <FinancialWorkspace />
          ) : section === "procedimentos" ? (
            <ContentWorkspace module="wiki" user={user} />
          ) : section === "comunicados" ? (
            <ContentWorkspace module="comunicacao" user={user} />
          ) : section === "crm" && user.isAdmin ? (
            <CrmWorkspace user={user} />
          ) : section === "crm" ? (
            <EmptyState section={"crm"} />
          ) : (
            <EmptyState section={section} />
          )}
        </div>
      </main>
    </div>
  );
}
export default App;
