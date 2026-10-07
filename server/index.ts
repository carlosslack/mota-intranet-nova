import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";

dotenv.config({ path: [".env.langflow.local", ".env.local"] });

const port = Number(process.env.PORT ?? 3002);
const isProduction = process.env.NODE_ENV === "production";
const clientId = process.env.GOOGLE_CLIENT_ID;
const sessionSecret = process.env.SESSION_SECRET;
const allowedDomain = (
  process.env.ALLOWED_EMAIL_DOMAIN ?? "mota.adv.br"
).toLowerCase();
const dataDirectory = path.resolve(process.env.DATA_DIR ?? "data");
const ticketFile = path.join(dataDirectory, "tickets.json");
const contentFile = path.join(dataDirectory, "content.json");
const financialDatabasesFile = path.join(dataDirectory, "financial-databases.json");
const localPreview = !isProduction && process.env.LOCAL_PREVIEW === "true";
const langflowServerUrl = (
  process.env.LANGFLOW_SERVER_URL ??
  "https://langflow-t3ln.srv1763356.hstgr.cloud"
).replace(/\/$/, "");
const langflowApiKey = process.env.LANGFLOW_API_KEY;
const langflowFinancialFlowId =
  process.env.LANGFLOW_FINANCIAL_FLOW_ID ??
  "0db42ffc-7edc-4db3-b4f5-efa856ff3176";
const langflowFinancialChatInputId =
  process.env.LANGFLOW_FINANCIAL_CHAT_INPUT_ID ?? "ChatInput-2PdpE";
const langflowFinancialKnowledgeId =
  process.env.LANGFLOW_FINANCIAL_KNOWLEDGE_ID ?? "Knowledge-9xJWz";
const langflowFinancialKnowledgeBase =
  process.env.LANGFLOW_FINANCIAL_KNOWLEDGE_BASE ?? "chatcarlosw";
const langflowFinancialIngestionFlowId =
  process.env.LANGFLOW_FINANCIAL_INGESTION_FLOW_ID ??
  "1f356e6e-f2b8-483a-94ed-7493d71f3d82";
const langflowFinancialIngestionFileId =
  process.env.LANGFLOW_FINANCIAL_INGESTION_FILE_ID ?? "File-fn1cq";
const langflowFinancialIngestionKnowledgeId =
  process.env.LANGFLOW_FINANCIAL_INGESTION_KNOWLEDGE_ID ?? "Knowledge-rEkav";
const financialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 80 * 1024 * 1024 },
});
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "ti@mota.adv.br")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

if (!clientId || !sessionSecret) {
  throw new Error(
    "Configure GOOGLE_CLIENT_ID e SESSION_SECRET no arquivo .env.local antes de iniciar a API.",
  );
}

const googleClient = new OAuth2Client(clientId);
const sessionKey = new TextEncoder().encode(sessionSecret);
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

type SessionUser = { id: string; name: string; email: string; avatar?: string };
type ClientUser = SessionUser & { isAdmin: boolean };
type Ticket = {
  id: string;
  protocol: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  category: string;
  details: string;
  systemAffected?: string;
  impact?: string;
  deadline?: string;
  attempts?: string;
  priority: "Baixa" | "Media" | "Alta" | "Urgente";
  status:
    | "Novo"
    | "Em triagem"
    | "Em atendimento"
    | "Aguardando usuário"
    | "Resolvido"
    | "Reaberto";
  createdAt: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string; email: string };
  resolution?: string;
  history: Array<{
    id: string;
    at: string;
    authorName: string;
    message: string;
  }>;
};
type ContentModule = "wiki" | "comunicacao" | "crm";
type ContentEntry = {
  id: string;
  module: ContentModule;
  authorId: string;
  authorName: string;
  title: string;
  subtitle?: string;
  body: string;
  createdAt: string;
};
type FinancialDatabase = {
  id: string;
  userId: string;
  name: string;
  files: Array<{ name: string; size: number; addedAt: string }>;
  createdAt: string;
  updatedAt: string;
};

const builtInWikiEntries: ContentEntry[] = [
  {
    id: "guia-videochamada-intranet",
    module: "wiki",
    authorId: "intranet",
    authorName: "Intranet Mota",
    title: "Como agendar uma videochamada pela intranet",
    subtitle: "Google Meet e Agenda",
    body: [
      "1. Entre na intranet com sua conta corporativa Google.",
      "2. Na Visão geral, clique em Videochamada, em Ferramentas especializadas. Você também pode abrir Workspace > Agendar Google Meet.",
      "3. Informe o assunto, a data e os horários de início e término. O término deve ser posterior ao início.",
      "4. Em Participantes, digite os e-mails separados por vírgula. Deixe o campo vazio se não quiser enviar convites. A pauta e as observações são opcionais.",
      "5. Clique em Criar reunião e Google Meet. Se o Google pedir autorização para usar sua Agenda, escolha a conta corporativa e conclua a permissão.",
      "6. Na confirmação, use Entrar no Meet para abrir a chamada ou Ver no Calendar para consultar o evento. Os participantes informados recebem o convite por e-mail.",
      "Se a janela de autorização não abrir, permita pop-ups para a intranet e tente novamente. Se aparecer uma mensagem de erro, informe o texto à Central de TI.",
    ].join("\n\n"),
    createdAt: "2026-10-06T12:00:00.000Z",
  },
  {
    id: "guia-chamados-ti-intranet",
    module: "wiki",
    authorId: "intranet",
    authorName: "Intranet Mota",
    title: "Como abrir e acompanhar um chamado de TI",
    subtitle: "Central de TI",
    body: [
      "1. Abra Central de TI pelo menu lateral ou pelo atalho Acessar chamados na Visão geral. Clique em Novo chamado.",
      "2. Preencha o assunto, escolha a categoria e a prioridade. Informe o sistema, tribunal ou equipamento afetado, o impacto e um prazo relacionado, quando houver.",
      "3. Em O que aconteceu?, descreva o problema, a mensagem de erro e o que você precisa concluir. Use O que você já tentou? para registrar testes feitos antes de pedir ajuda.",
      "4. Clique em Registrar chamado. Anote o número do protocolo exibido e use Acompanhar chamado para abrir o atendimento.",
      "5. Em Chamados, selecione o protocolo para ver o status, o responsável e o histórico. Use a busca e os filtros para localizar um atendimento.",
      "6. Quando a equipe de TI pedir informações, escreva em Responder à equipe de TI e clique em Enviar resposta. Se o chamado estiver Resolvido, mas o problema continuar, use Reabrir chamado e explique o que ainda não funciona.",
      "Use a prioridade Urgente apenas para prazo processual imediato, indisponibilidade geral ou bloqueio completo do trabalho. Não coloque senhas, códigos de verificação ou chaves de acesso no chamado.",
      "Equipe de TI: os administradores podem assumir o chamado, ajustar etapa e prioridade, registrar o andamento e descrever a solução antes de resolver.",
    ].join("\n\n"),
    createdAt: "2026-10-06T12:00:01.000Z",
  },
  {
    id: "guia-financeiro-documentos-ia",
    module: "wiki",
    authorId: "intranet",
    authorName: "Intranet Mota",
    title: "Como usar o Financeiro com documentos e IA",
    subtitle: "Banco de dados, análise e geração de planilhas",
    body: [
      "O módulo Financeiro permite guardar documentos para consultas futuras, analisar arquivos enviados no momento e solicitar planilhas ou outros resultados ao agente.",
      "CRIAR UM BANCO DE DADOS",
      "1. Abra Financeiro no menu lateral e, em Fontes da análise, escolha Banco de dados.",
      "2. Clique em Criar nova base e informe um nome fácil de reconhecer, como Notas fiscais 2026, Faturas de fornecedores ou Prestação de contas de outubro.",
      "3. Clique em Selecionar arquivos e escolha um ou vários documentos. Depois clique em Criar banco de dados.",
      "4. Aguarde a confirmação de que os arquivos foram gravados. A base ficará vinculada à sua conta e continuará disponível quando você sair e voltar à intranet.",
      "USAR UMA BASE EXISTENTE",
      "5. Volte à opção Banco de dados e selecione a base desejada. A base ativa fica marcada na lista e aparece abaixo da caixa de mensagem do agente.",
      "6. Escreva o que precisa. Você pode pedir uma análise, conferência, resumo, soma de valores, organização por fornecedor ou a criação de uma planilha com as colunas que escolher.",
      "7. Para acrescentar documentos, selecione a base, escolha os novos arquivos e clique em Adicionar à base. Os documentos anteriores permanecem disponíveis.",
      "USAR O ENVIO RÁPIDO",
      "8. Escolha Envio rápido quando quiser trabalhar com arquivos somente na conversa atual. Selecione os documentos, escreva o pedido e envie ao agente.",
      "9. O Envio rápido não substitui o Banco de dados: ao sair da conversa, envie novamente os arquivos ou use uma base persistente.",
      "RECEBER E BAIXAR O RESULTADO",
      "10. Use Gerar arquivo para solicitar Excel, CSV, JSON, relatório ou outro formato disponível. Em Conversar com documentos, faça perguntas livres sobre o conteúdo.",
      "11. Enquanto trabalha, o agente mostra o andamento na tela. Quando um arquivo for produzido, clique em Baixar resultado.",
      "Exemplo de pedido: Gere uma planilha com CNPJ, razão social, número da nota, data de emissão, valor bruto, impostos e valor líquido de todos os documentos desta base.",
    ].join("\n\n"),
    createdAt: "2026-10-07T05:25:00.000Z",
  },
];

async function createSession(user: SessionUser) {
  return new SignJWT({
    name: user.name,
    email: user.email,
    avatar: user.avatar,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(sessionKey);
}

async function readSession(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey);
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string"
    )
      return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      avatar: typeof payload.avatar === "string" ? payload.avatar : undefined,
    };
  } catch {
    return null;
  }
}

async function getRequestUser(request: express.Request) {
  const sessionUser = await readSession(request.cookies.mota_session);
  if (sessionUser) return sessionUser;
  if (localPreview) {
    return {
      id: "local-preview",
      name: "TI Mota",
      email: process.env.LOCAL_PREVIEW_EMAIL ?? "ti@mota.adv.br",
    };
  }
  return null;
}

function isAdmin(user: SessionUser) {
  return adminEmails.has(user.email.toLowerCase());
}

function asClientUser(user: SessionUser): ClientUser {
  return { ...user, isAdmin: isAdmin(user) };
}

async function readTickets(): Promise<Ticket[]> {
  try {
    const stored = JSON.parse(await readFile(ticketFile, "utf8")) as Ticket[];
    return stored.map(normalizeTicket);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveTickets(tickets: Ticket[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(ticketFile, JSON.stringify(tickets, null, 2), "utf8");
}

function normalizeTicket(ticket: Ticket): Ticket {
  const legacyStatus = ticket.status as Ticket["status"] | "Aberto";
  return {
    ...ticket,
    priority: ticket.priority ?? "Media",
    status: legacyStatus === "Aberto" ? "Novo" : (legacyStatus ?? "Novo"),
    updatedAt: ticket.updatedAt ?? ticket.createdAt,
    history: ticket.history ?? [
      {
        id: crypto.randomUUID(),
        at: ticket.createdAt,
        authorName: ticket.requesterName,
        message: "Chamado aberto.",
      },
    ],
  };
}

function isContentModule(value: string): value is ContentModule {
  return ["wiki", "comunicacao", "crm"].includes(value);
}

async function readContent(): Promise<ContentEntry[]> {
  try {
    return JSON.parse(await readFile(contentFile, "utf8")) as ContentEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveContent(entries: ContentEntry[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(contentFile, JSON.stringify(entries, null, 2), "utf8");
}

async function readFinancialDatabases(): Promise<FinancialDatabase[]> {
  try {
    return JSON.parse(await readFile(financialDatabasesFile, "utf8")) as FinancialDatabase[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveFinancialDatabases(databases: FinancialDatabase[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(financialDatabasesFile, JSON.stringify(databases, null, 2), "utf8");
}

app.get("/api/auth/session", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  return response.json({ user: asClientUser(user) });
});

app.get("/api/tickets", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });

  const tickets = await readTickets();
  return response.json({
    tickets: tickets
      .filter((ticket) => isAdmin(user) || ticket.requesterId === user.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  });
});

app.post("/api/tickets/:id/assign", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  if (!isAdmin(user))
    return response
      .status(403)
      .json({ error: "Apenas a administração pode assumir chamados." });

  const tickets = await readTickets();
  const ticket = tickets.find((item) => item.id === request.params.id);
  if (!ticket)
    return response.status(404).json({ error: "Chamado não encontrado." });
  if (!ticket.assignedTo) {
    ticket.assignedTo = { id: user.id, name: user.name, email: user.email };
    ticket.status = "Em triagem";
    ticket.updatedAt = new Date().toISOString();
    ticket.history.push({
      id: crypto.randomUUID(),
      at: ticket.updatedAt,
      authorName: user.name,
      message: "Chamado assumido pela equipe de TI.",
    });
    await saveTickets(tickets);
  }
  return response.json({ ticket });
});

app.patch("/api/tickets/:id", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });

  const tickets = await readTickets();
  const ticket = tickets.find((item) => item.id === request.params.id);
  if (!ticket)
    return response.status(404).json({ error: "Chamado não encontrado." });
  const admin = isAdmin(user);
  if (!admin && ticket.requesterId !== user.id) {
    return response
      .status(403)
      .json({ error: "Você só pode acompanhar seus próprios chamados." });
  }

  const status =
    typeof request.body?.status === "string" ? request.body.status.trim() : "";
  const priority =
    typeof request.body?.priority === "string"
      ? request.body.priority.trim()
      : "";
  const note =
    typeof request.body?.note === "string" ? request.body.note.trim() : "";
  const resolution =
    typeof request.body?.resolution === "string"
      ? request.body.resolution.trim()
      : "";

  const allowedStatuses: Ticket["status"][] = [
    "Novo",
    "Em triagem",
    "Em atendimento",
    "Aguardando usuário",
    "Resolvido",
    "Reaberto",
  ];
  const allowedPriorities = ["Baixa", "Media", "Alta", "Urgente"];

  const requesterCanReopen =
    !admin && status === "Reaberto" && ticket.status === "Resolvido";
  if ((status || priority || resolution) && !admin && !requesterCanReopen) {
    return response
      .status(403)
      .json({ error: "Apenas a equipe de TI pode alterar o atendimento." });
  }
  if (status && !allowedStatuses.includes(status)) {
    return response.status(400).json({ error: "Status inválido." });
  }
  if (priority && !allowedPriorities.includes(priority)) {
    return response.status(400).json({ error: "Prioridade inválida." });
  }
  if (note.length > 2000 || resolution.length > 3000) {
    return response
      .status(400)
      .json({ error: "Um dos campos excede o tamanho permitido." });
  }

  const changes: string[] = [];
  if (status && status !== ticket.status) {
    ticket.status = status as Ticket["status"];
    changes.push(`Status alterado para ${status}.`);
  }
  if (priority && priority !== ticket.priority) {
    ticket.priority = priority as Ticket["priority"];
    changes.push(`Prioridade alterada para ${priority}.`);
  }
  if (resolution) {
    ticket.resolution = resolution;
    ticket.status = "Resolvido";
    changes.push("Chamado resolvido.");
  }
  if (requesterCanReopen) {
    ticket.resolution = undefined;
  }
  if (note) changes.push(note);
  if (changes.length === 0) {
    return response.status(400).json({ error: "Informe uma atualização." });
  }

  ticket.updatedAt = new Date().toISOString();
  for (const message of changes) {
    ticket.history.push({
      id: crypto.randomUUID(),
      at: ticket.updatedAt,
      authorName: user.name,
      message,
    });
  }
  await saveTickets(tickets);
  return response.json({ ticket });
});

app.post("/api/tickets", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });

  const subject =
    typeof request.body?.subject === "string"
      ? request.body.subject.trim()
      : "";
  const category =
    typeof request.body?.category === "string"
      ? request.body.category.trim()
      : "";
  const details =
    typeof request.body?.details === "string"
      ? request.body.details.trim()
      : "";
  const systemAffected =
    typeof request.body?.systemAffected === "string"
      ? request.body.systemAffected.trim()
      : "";
  const impact =
    typeof request.body?.impact === "string"
      ? request.body.impact.trim()
      : "Individual";
  const deadline =
    typeof request.body?.deadline === "string"
      ? request.body.deadline.trim()
      : "";
  const attempts =
    typeof request.body?.attempts === "string"
      ? request.body.attempts.trim()
      : "";
  const priority =
    typeof request.body?.priority === "string"
      ? request.body.priority.trim()
      : "Media";
  if (!subject || !category || !details) {
    return response
      .status(400)
      .json({ error: "Preencha assunto, categoria e detalhes." });
  }
  if (!["Baixa", "Media", "Alta", "Urgente"].includes(priority)) {
    return response.status(400).json({ error: "Prioridade inválida." });
  }
  const allowedImpacts = [
    "Individual",
    "Equipe",
    "Escritório",
    "Prazo processual",
  ];
  if (!allowedImpacts.includes(impact)) {
    return response.status(400).json({ error: "Impacto inválido." });
  }
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return response.status(400).json({ error: "Prazo inválido." });
  }
  if (
    subject.length > 160 ||
    category.length > 80 ||
    details.length > 4000 ||
    systemAffected.length > 160 ||
    attempts.length > 1500
  ) {
    return response
      .status(400)
      .json({ error: "Um dos campos excede o tamanho permitido." });
  }

  const createdAt = new Date().toISOString();
  const ticket: Ticket = {
    id: crypto.randomUUID(),
    protocol: `MOTA-TI-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    requesterId: user.id,
    requesterName: user.name,
    requesterEmail: user.email,
    subject,
    category,
    details,
    systemAffected: systemAffected || undefined,
    impact,
    deadline: deadline || undefined,
    attempts: attempts || undefined,
    priority: priority as Ticket["priority"],
    status: "Novo",
    createdAt,
    updatedAt: createdAt,
    history: [
      {
        id: crypto.randomUUID(),
        at: createdAt,
        authorName: user.name,
        message: "Chamado aberto.",
      },
    ],
  };
  const tickets = await readTickets();
  tickets.push(ticket);
  await saveTickets(tickets);
  return response.status(201).json({ ticket });
});

app.get("/api/content/:module", async (request, response) => {
  const user = await getRequestUser(request);
  const module = request.params.module;
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  if (!isContentModule(module))
    return response.status(404).json({ error: "Módulo não encontrado." });

  if (module === "crm" && !isAdmin(user)) {
    return response
      .status(403)
      .json({ error: "O CRM é restrito à administração." });
  }
  const entries = await readContent();
  return response.json({
    entries: (module === "wiki" ? [...builtInWikiEntries, ...entries] : entries)
      .filter((entry) => entry.module === module)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  });
});

app.post("/api/content/:module", async (request, response) => {
  const user = await getRequestUser(request);
  const module = request.params.module;
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  if (!isContentModule(module))
    return response.status(404).json({ error: "Módulo não encontrado." });
  if (!isAdmin(user))
    return response
      .status(403)
      .json({ error: "Apenas a administração pode adicionar conteúdo." });

  const title =
    typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const subtitle =
    typeof request.body?.subtitle === "string"
      ? request.body.subtitle.trim()
      : "";
  const body =
    typeof request.body?.body === "string" ? request.body.body.trim() : "";
  if (!title || !body)
    return response.status(400).json({ error: "Preencha título e conteúdo." });
  if (title.length > 180 || subtitle.length > 180 || body.length > 8000) {
    return response
      .status(400)
      .json({ error: "Um dos campos excede o tamanho permitido." });
  }

  const entry: ContentEntry = {
    id: crypto.randomUUID(),
    module,
    authorId: user.id,
    authorName: user.name,
    title,
    subtitle: subtitle || undefined,
    body,
    createdAt: new Date().toISOString(),
  };
  const entries = await readContent();
  entries.push(entry);
  await saveContent(entries);
  return response.status(201).json({ entry });
});

// ===== CRM - modulo de relacionamento (restrito a administracao) =====

type CrmCompanyType = "pf" | "pj";
type CrmCompanyStatus = "ativo" | "prospect" | "inativo";
type CrmContactChannel = "email" | "telefone" | "whatsapp";
type CrmInteractionType = "ligacao" | "reuniao" | "email" | "andamento" | "outro";

type CrmContact = { id: string; name: string; role?: string; email?: string; phone?: string; channel?: CrmContactChannel; createdAt: string };

type CrmCompany = { id: string; name: string; type: CrmCompanyType; document?: string; area?: string; tags: string[]; status: CrmCompanyStatus; owner?: string; notes?: string; contacts: CrmContact[]; createdAt: string; updatedAt: string };

type CrmInteraction = { id: string; companyId: string; contactId?: string; type: CrmInteractionType; summary: string; detail?: string; nextStep?: string; nextStepDate?: string; nextStepCompletedAt?: string; authorId: string; authorName: string; createdAt: string };

const crmCompaniesFile = path.join(dataDirectory, "crm-companies.json");
const crmInteractionsFile = path.join(dataDirectory, "crm-interactions.json");
const crmCompanyStatuses: CrmCompanyStatus[] = ["ativo", "prospect", "inativo"];
const crmInteractionTypes: CrmInteractionType[] = ["ligacao", "reuniao", "email", "andamento", "outro"];
const crmChannels: CrmContactChannel[] = ["email", "telefone", "whatsapp"];

async function readCrmCompanies(): Promise<CrmCompany[]> {
  try {
    return JSON.parse(await readFile(crmCompaniesFile, "utf8")) as CrmCompany[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveCrmCompanies(companies: CrmCompany[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(crmCompaniesFile, JSON.stringify(companies, null, 2), "utf8");
}

async function readCrmInteractions(): Promise<CrmInteraction[]> {
  try {
    return JSON.parse(await readFile(crmInteractionsFile, "utf8")) as CrmInteraction[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveCrmInteractions(interactions: CrmInteraction[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(crmInteractionsFile, JSON.stringify(interactions, null, 2), "utf8");
}

async function requireCrmAdmin(request: express.Request, response: express.Response): Promise<SessionUser | null> {
  const user = await getRequestUser(request);
  if (!user) {
    response.status(401).json({ error: "Sessao ausente ou expirada." });
    return null;
  }
  if (!isAdmin(user)) {
    response.status(403).json({ error: "O CRM e restrito a administracao." });
    return null;
  }
  return user;
}

function crmOptionalText(source: Record<string, unknown>, key: string, maxLength: number): { value?: string; tooLong: boolean } {
  const raw = source[key];
  if (typeof raw !== "string" || raw.trim() === "") return {};
  const trimmed = raw.trim();
  return trimmed.length > maxLength ? { tooLong: true } : { value: trimmed };
}

function crmTags(source: Record<string, unknown>): { value?: string[]; invalid?: boolean } {
  const raw = source.tags;
  if (raw === undefined || raw === null) return {};
  if (!Array.isArray(raw)) return { invalid: true };
  const tags = Array.from(new Set(raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10)));
  if (tags.some((item) => item.length > 40)) return { invalid: true };
  return { value: tags };
}

type CrmCompanyInput = { name: string; type: CrmCompanyType; status: CrmCompanyStatus; document?: string; area?: string; tags: string[]; owner?: string; notes?: string };

function parseCrmCompanyInput(body: unknown): { ok: true; value: CrmCompanyInput } | { ok: false; error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) return { ok: false, error: "Informe o nome do cliente." };
  if (name.length > 160) return { ok: false, error: "O nome excede o tamanho permitido." };
  if (source.type !== "pf" && source.type !== "pj") return { ok: false, error: "Informe o tipo de cliente (pf ou pj)." };
  if (typeof source.status !== "string" || !crmCompanyStatuses.includes(source.status as CrmCompanyStatus)) return { ok: false, error: "Situacao invalida." };
  const document = crmOptionalText(source, "document", 24);
  if (document.tooLong) return { ok: false, error: "O documento excede o tamanho permitido." };
  const area = crmOptionalText(source, "area", 120);
  if (area.tooLong) return { ok: false, error: "A area de atuacao excede o tamanho permitido." };
  const owner = crmOptionalText(source, "owner", 120);
  if (owner.tooLong) return { ok: false, error: "O responsavel excede o tamanho permitido." };
  const notes = crmOptionalText(source, "notes", 2000);
  if (notes.tooLong) return { ok: false, error: "As observacoes excedem o tamanho permitido." };
  const tags = crmTags(source);
  if (tags.invalid) return { ok: false, error: "Etiquetas invalidas." };
  return { ok: true, value: { name, type: source.type, status: source.status as CrmCompanyStatus, document: document.value, area: area.value, tags: tags.value ?? [], owner: owner.value, notes: notes.value } };
}

function crmInteractionLabel(type: CrmInteractionType): string {
  const labels: Record<CrmInteractionType, string> = { ligacao: "Ligacao", reuniao: "Reuniao", email: "E-mail", andamento: "Andamento", outro: "Outro" };
  return labels[type];
}

function crmTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidCrmDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}


function parseCrmInteractionInput(body: unknown): { ok: true; value: { contactId?: string; type: CrmInteractionType; summary: string; detail?: string; nextStep?: string; nextStepDate?: string } } | { ok: false; error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  if (typeof source.type !== "string" || !crmInteractionTypes.includes(source.type as CrmInteractionType)) return { ok: false, error: "Tipo de interacao invalido." };
  const summary = typeof source.summary === "string" ? source.summary.trim() : "";
  if (!summary) return { ok: false, error: "Informe o resumo da interacao." };
  if (summary.length > 400) return { ok: false, error: "O resumo excede o tamanho permitido." };
  const detail = crmOptionalText(source, "detail", 4000);
  if (detail.tooLong) return { ok: false, error: "O detalhamento excede o tamanho permitido." };
  const nextStep = crmOptionalText(source, "nextStep", 300);
  if (nextStep.tooLong) return { ok: false, error: "O proximo passo excede o tamanho permitido." };
  const nextStepDate = crmOptionalText(source, "nextStepDate", 10);
  if (nextStepDate.tooLong || (nextStepDate.value && !isValidCrmDateKey(nextStepDate.value))) return { ok: false, error: "Data do proximo passo invalida." };
  const contactId = crmOptionalText(source, "contactId", 80);
  return { ok: true, value: { contactId: contactId.value, type: source.type as CrmInteractionType, summary, detail: detail.value, nextStep: nextStep.value, nextStepDate: nextStepDate.value } };
}
// ===== CRM - endpoints =====

app.get("/api/crm/summary", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const interactions = await readCrmInteractions();
  const today = crmTodayKey();
  const horizon = new Date(`${today}T12:00:00-03:00`);
  horizon.setDate(horizon.getDate() + 7);
  const horizonKey = horizon.toISOString().slice(0, 10);
  const companyNameOf = (companyId: string) => companies.find((company) => company.id === companyId)?.name ?? "Cliente removido";
  const withFollowUp = interactions
    .filter((item) => typeof item.nextStepDate === "string" && item.nextStepDate !== "" && !item.nextStepCompletedAt)
    .sort((left, right) => (left.nextStepDate ?? "").localeCompare(right.nextStepDate ?? ""))
    .map((item) => ({ id: item.id, companyId: item.companyId, companyName: companyNameOf(item.companyId), type: item.type, typeLabel: crmInteractionLabel(item.type), summary: item.summary, nextStep: item.nextStep, nextStepDate: item.nextStepDate }));
  return response.json({
    totals: {
      clients: companies.length,
      active: companies.filter((company) => company.status === "ativo").length,
      prospects: companies.filter((company) => company.status === "prospect").length,
      interactions: interactions.length,
    },
    followUps: {
      overdue: withFollowUp.filter((item) => (item.nextStepDate ?? "") < today),
      today: withFollowUp.filter((item) => item.nextStepDate === today),
      upcoming: withFollowUp.filter((item) => (item.nextStepDate ?? "") > today && (item.nextStepDate ?? "") <= horizonKey),
    },
  });
});

app.get("/api/crm/companies", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const interactions = await readCrmInteractions();
  const query = ((request.query.q as string | undefined) ?? "").trim().toLowerCase();
  const status = ((request.query.status as string | undefined) ?? "").trim();
  const tag = ((request.query.tag as string | undefined) ?? "").trim().toLowerCase();
  const lastInteraction = new Map<string, string>();
  for (const item of interactions) {
    const current = lastInteraction.get(item.companyId);
    if (!current || item.createdAt > current) lastInteraction.set(item.companyId, item.createdAt);
  }
  const filtered = companies
    .filter((company) => {
      if (status && crmCompanyStatuses.includes(status as CrmCompanyStatus) && company.status !== status) return false;
      if (tag && !company.tags.some((item) => item.toLowerCase() === tag)) return false;
      if (query) {
        const haystack = [company.name, company.area ?? "", company.document ?? "", company.owner ?? "", ...company.tags].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((company) => ({ ...company, contactCount: company.contacts.length, lastInteractionAt: lastInteraction.get(company.id) }));
  return response.json({ companies: filtered });
});

app.post("/api/crm/companies", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const parsed = parseCrmCompanyInput(request.body);
  if (!parsed.ok) return response.status(400).json({ error: parsed.error });
  const now = new Date().toISOString();
  const company: CrmCompany = { id: crypto.randomUUID(), ...parsed.value, contacts: [], createdAt: now, updatedAt: now };
  const companies = await readCrmCompanies();
  companies.push(company);
  await saveCrmCompanies(companies);
  return response.status(201).json({ company });
});

app.get("/api/crm/companies/:id", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === request.params.id);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  const interactions = (await readCrmInteractions()).filter((item) => item.companyId === company.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return response.json({ company, interactions });
});

app.patch("/api/crm/companies/:id", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === request.params.id);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  const parsed = parseCrmCompanyInput(request.body);
  if (!parsed.ok) return response.status(400).json({ error: parsed.error });
  company.name = parsed.value.name;
  company.type = parsed.value.type;
  company.status = parsed.value.status;
  company.document = parsed.value.document;
  company.area = parsed.value.area;
  company.tags = parsed.value.tags;
  company.owner = parsed.value.owner;
  company.notes = parsed.value.notes;
  company.updatedAt = new Date().toISOString();
  await saveCrmCompanies(companies);
  return response.json({ company });
});

app.delete("/api/crm/companies/:id", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const index = companies.findIndex((item) => item.id === request.params.id);
  if (index === -1) return response.status(404).json({ error: "Cliente nao encontrado." });
  companies.splice(index, 1);
  await saveCrmCompanies(companies);
  await saveCrmInteractions((await readCrmInteractions()).filter((item) => item.companyId !== request.params.id));
  return response.status(204).end();
});

app.post("/api/crm/companies/:id/contacts", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === request.params.id);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  const source = (request.body ?? {}) as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) return response.status(400).json({ error: "Informe o nome do contato." });
  if (name.length > 160) return response.status(400).json({ error: "O nome do contato excede o tamanho permitido." });
  const role = crmOptionalText(source, "role", 120);
  if (role.tooLong) return response.status(400).json({ error: "O cargo excede o tamanho permitido." });
  const email = crmOptionalText(source, "email", 160);
  if (email.tooLong) return response.status(400).json({ error: "O e-mail excede o tamanho permitido." });
  const phone = crmOptionalText(source, "phone", 40);
  if (phone.tooLong) return response.status(400).json({ error: "O telefone excede o tamanho permitido." });
  const channel = typeof source.channel === "string" && crmChannels.includes(source.channel as CrmContactChannel) ? (source.channel as CrmContactChannel) : undefined;
  const contact: CrmContact = { id: crypto.randomUUID(), name, role: role.value, email: email.value, phone: phone.value, channel, createdAt: new Date().toISOString() };
  company.contacts.push(contact);
  company.updatedAt = new Date().toISOString();
  await saveCrmCompanies(companies);
  return response.status(201).json({ company, contact });
});

app.patch("/api/crm/companies/:id/contacts/:contactId", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === request.params.id);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  const contact = company.contacts.find((item) => item.id === request.params.contactId);
  if (!contact) return response.status(404).json({ error: "Contato nao encontrado." });
  const source = (request.body ?? {}) as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) return response.status(400).json({ error: "Informe o nome do contato." });
  if (name.length > 160) return response.status(400).json({ error: "O nome do contato excede o tamanho permitido." });
  const role = crmOptionalText(source, "role", 120);
  if (role.tooLong) return response.status(400).json({ error: "O cargo excede o tamanho permitido." });
  const email = crmOptionalText(source, "email", 160);
  if (email.tooLong) return response.status(400).json({ error: "O e-mail excede o tamanho permitido." });
  const phone = crmOptionalText(source, "phone", 40);
  if (phone.tooLong) return response.status(400).json({ error: "O telefone excede o tamanho permitido." });
  const channel = typeof source.channel === "string" && crmChannels.includes(source.channel as CrmContactChannel) ? (source.channel as CrmContactChannel) : undefined;
  contact.name = name;
  contact.role = role.value;
  contact.email = email.value;
  contact.phone = phone.value;
  contact.channel = channel;
  company.updatedAt = new Date().toISOString();
  await saveCrmCompanies(companies);
  return response.json({ company, contact });
});

app.delete("/api/crm/companies/:id/contacts/:contactId", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === request.params.id);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  const index = company.contacts.findIndex((item) => item.id === request.params.contactId);
  if (index === -1) return response.status(404).json({ error: "Contato nao encontrado." });
  const removedId = company.contacts[index].id;
  company.contacts.splice(index, 1);
  company.updatedAt = new Date().toISOString();
  await saveCrmCompanies(companies);
  const interactions = await readCrmInteractions();
  let changed = false;
  for (const item of interactions) {
    if (item.contactId === removedId) {
      item.contactId = undefined;
      changed = true;
    }
  }
  if (changed) await saveCrmInteractions(interactions);
  return response.status(204).end();
});

app.get("/api/crm/interactions", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const companyId = ((request.query.companyId as string | undefined) ?? "").trim();
  const interactions = (await readCrmInteractions()).filter((item) => !companyId || item.companyId === companyId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return response.json({ interactions });
});

app.delete("/api/crm/interactions/:id", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const interactions = await readCrmInteractions();
  const index = interactions.findIndex((item) => item.id === request.params.id);
  if (index === -1) return response.status(404).json({ error: "Interacao nao encontrada." });
  interactions.splice(index, 1);
  await saveCrmInteractions(interactions);
  return response.status(204).end();
});

app.patch("/api/crm/interactions/:id/follow-up", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  if (typeof request.body?.completed !== "boolean")
    return response.status(400).json({ error: "Informe se o follow-up foi concluido." });
  const interactions = await readCrmInteractions();
  const interaction = interactions.find((item) => item.id === request.params.id);
  if (!interaction) return response.status(404).json({ error: "Interacao nao encontrada." });
  if (!interaction.nextStepDate)
    return response.status(400).json({ error: "Esta interacao nao possui follow-up." });
  interaction.nextStepCompletedAt = request.body.completed ? new Date().toISOString() : undefined;
  await saveCrmInteractions(interactions);
  return response.json({ interaction });
});

// ===== fim CRM =====
app.post("/api/crm/interactions", async (request, response) => {
  const user = await requireCrmAdmin(request, response);
  if (!user) return;
  const parsed = parseCrmInteractionInput(request.body);
  if (!parsed.ok) return response.status(400).json({ error: parsed.error });
  const source = (request.body ?? {}) as Record<string, unknown>;
  const companyId = typeof source.companyId === "string" ? source.companyId.trim() : "";
  if (!companyId) return response.status(400).json({ error: "Informe o cliente da interacao." });
  const companies = await readCrmCompanies();
  const company = companies.find((item) => item.id === companyId);
  if (!company) return response.status(404).json({ error: "Cliente nao encontrado." });
  if (parsed.value.contactId && !company.contacts.some((item) => item.id === parsed.value.contactId))
    return response.status(400).json({ error: "O contato informado nao pertence a este cliente." });
  const now = new Date().toISOString();
  const interaction: CrmInteraction = { id: crypto.randomUUID(), companyId, contactId: parsed.value.contactId, type: parsed.value.type, summary: parsed.value.summary, detail: parsed.value.detail, nextStep: parsed.value.nextStep, nextStepDate: parsed.value.nextStepDate, authorId: user.id, authorName: user.name, createdAt: now };
  const interactions = await readCrmInteractions();
  interactions.push(interaction);
  await saveCrmInteractions(interactions);
  return response.status(201).json({ interaction });
});
app.post("/api/auth/google", async (request, response) => {
  const credential =
    typeof request.body?.credential === "string" ? request.body.credential : "";
  if (!credential)
    return response
      .status(400)
      .json({ error: "Credencial Google não informada." });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const emailDomain = email?.split("@")[1];
    if (
      !payload?.sub ||
      !email ||
      !payload.email_verified ||
      emailDomain !== allowedDomain
    ) {
      return response
        .status(403)
        .json({ error: "Use uma conta corporativa autorizada." });
    }
    const user: SessionUser = {
      id: payload.sub,
      name: payload.name ?? email.split("@")[0],
      email,
      avatar: payload.picture,
    };
    const token = await createSession(user);
    response.cookie("mota_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    return response.json({ user: asClientUser(user) });
  } catch {
    return response
      .status(401)
      .json({ error: "Não foi possível validar a autenticação Google." });
  }
});

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie("mota_session", { path: "/" });
  return response.status(204).end();
});

function findLangflowFilePath(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLangflowFilePath(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["file_path", "path", "file", "url"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  for (const nested of Object.values(record)) {
    const found = findLangflowFilePath(nested);
    if (found) return found;
  }
  return undefined;
}

async function uploadFinancialFiles(
  files: Express.Multer.File[],
  flowId: string,
) {
  const uploadedPaths: string[] = [];
  for (const file of files) {
    const uploadBody = new FormData();
    uploadBody.append(
      "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    const uploadResponse = await fetch(
      `${langflowServerUrl}/api/v1/files/upload/${flowId}`,
      {
        method: "POST",
        headers: { "x-api-key": langflowApiKey ?? "" },
        body: uploadBody,
      },
    );
    if (!uploadResponse.ok)
      throw new Error(`Falha ao enviar o arquivo ${file.originalname}.`);
    const uploadedPath = findLangflowFilePath(await uploadResponse.json());
    if (!uploadedPath)
      throw new Error(`O Langflow não confirmou o arquivo ${file.originalname}.`);
    uploadedPaths.push(uploadedPath);
  }
  return uploadedPaths;
}

function findGeneratedArtifacts(value: unknown) {
  const serialized = JSON.stringify(value);
  const matches =
    serialized.match(/https?:\\?\/\\?\/[^\s<>"']+\.(?:xlsx|xls|csv)(?:\?[^\s<>"']*)?/gi) ?? [];
  return [...new Set(matches.map((match) => match.replaceAll("\\/", "/")))].map(
    (source) => {
      const sourceUrl = new URL(source);
      const name = decodeURIComponent(
        sourceUrl.pathname.split("/").pop() ?? "planilha.xlsx",
      );
      return {
        name,
        url: `/api/financeiro/download?source=${encodeURIComponent(source)}&name=${encodeURIComponent(name)}`,
      };
    },
  );
}

type LangflowStoredFile = {
  id: string;
  name?: string;
  path?: string;
  size?: number;
};

async function listLangflowStoredFiles(): Promise<LangflowStoredFile[]> {
  if (!langflowApiKey) return [];
  try {
    const result = await fetch(`${langflowServerUrl}/api/v2/files`, {
      headers: { "x-api-key": langflowApiKey },
    });
    if (!result.ok) return [];
    const files = (await result.json()) as unknown;
    if (!Array.isArray(files)) return [];
    return files.filter(
      (file): file is LangflowStoredFile =>
        Boolean(file && typeof file === "object" && typeof file.id === "string"),
    );
  } catch {
    return [];
  }
}

function storedFilesAsArtifacts(files: LangflowStoredFile[]) {
  return files.map((file) => {
    const storedPath = file.path ?? "";
    const extension = path.extname(storedPath);
    const baseName = path.basename(file.name || storedPath || "resultado");
    const name = path.extname(baseName) || !extension ? baseName : `${baseName}${extension}`;
    const source = `${langflowServerUrl}/api/v2/files/${file.id}`;
    return {
      name,
      size: file.size,
      url: `/api/financeiro/download?source=${encodeURIComponent(source)}&name=${encodeURIComponent(name)}`,
    };
  });
}

app.get("/api/financeiro/databases", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  const databases = (await readFinancialDatabases())
    .filter((database) => database.userId === user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return response.json({ databases });
});

app.post(
  "/api/financeiro/databases",
  financialUpload.array("files", 20),
  async (request, response) => {
    const user = await getRequestUser(request);
    if (!user)
      return response.status(401).json({ error: "Sessão ausente ou expirada." });
    if (!langflowApiKey)
      return response.status(503).json({
        error: "A conexão com a base de conhecimento ainda não foi configurada.",
      });

    const name =
      typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const requestedId =
      typeof request.body?.databaseId === "string"
        ? request.body.databaseId.trim()
        : "";
    const files = (request.files ?? []) as Express.Multer.File[];
    if (!name || name.length > 80)
      return response.status(400).json({ error: "Informe um nome válido para a base." });
    if (!files.length)
      return response.status(400).json({ error: "Selecione ao menos um arquivo." });

    const databases = await readFinancialDatabases();
    const existing = requestedId
      ? databases.find(
          (database) => database.id === requestedId && database.userId === user.id,
        )
      : databases.find(
          (database) =>
            database.userId === user.id &&
            database.name.toLocaleLowerCase("pt-BR") ===
              name.toLocaleLowerCase("pt-BR"),
        );
    const now = new Date().toISOString();
    const database: FinancialDatabase = existing ?? {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      files: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      const uploadedPaths = await uploadFinancialFiles(
        files,
        langflowFinancialIngestionFlowId,
      );
      const ingestionResponse = await fetch(
        `${langflowServerUrl}/api/v1/run/${langflowFinancialIngestionFlowId}?stream=false`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": langflowApiKey,
          },
          body: JSON.stringify({
            input_value: `Adicionar ${files.length} arquivo(s) à base ${database.name}`,
            input_type: "chat",
            output_type: "chat",
            session_id: crypto.randomUUID(),
            tweaks: {
              [langflowFinancialIngestionFileId]: { path: uploadedPaths },
              [langflowFinancialIngestionKnowledgeId]: {
                knowledge_base: langflowFinancialKnowledgeBase,
                mode: "Ingest",
                allow_duplicates: true,
                metadata_json: JSON.stringify({
                  owner: user.id,
                  database: database.id,
                  database_name: database.name,
                }),
              },
            },
          }),
        },
      );
      if (!ingestionResponse.ok) {
        const details = await ingestionResponse.text();
        console.error("Langflow recusou a ingestão financeira:", details.slice(0, 600));
        return response
          .status(502)
          .json({ error: "O Langflow não conseguiu gravar os documentos na base." });
      }

      database.name = name;
      database.updatedAt = now;
      database.files.push(
        ...files.map((file) => ({
          name: file.originalname,
          size: file.size,
          addedAt: now,
        })),
      );
      if (!existing) databases.push(database);
      await saveFinancialDatabases(databases);
      return response.status(existing ? 200 : 201).json({ database });
    } catch (error) {
      console.error(
        "Falha ao alimentar a base financeira:",
        error instanceof Error ? error.message : "erro desconhecido",
      );
      return response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível alimentar a base de conhecimento.",
      });
    }
  },
);

app.post(
  "/api/financeiro/analyze",
  financialUpload.array("files", 20),
  async (request, response) => {
    const user = await getRequestUser(request);
    if (!user)
      return response.status(401).json({ error: "Sessão ausente ou expirada." });
    if (!langflowApiKey)
      return response.status(503).json({
        error: "A conexão com o agente financeiro ainda não foi configurada.",
      });

    const message =
      typeof request.body?.message === "string" ? request.body.message.trim() : "";
    const sessionId =
      typeof request.body?.sessionId === "string" && request.body.sessionId.trim()
        ? request.body.sessionId.trim()
        : crypto.randomUUID();
    const files = (request.files ?? []) as Express.Multer.File[];
    const databaseId =
      typeof request.body?.databaseId === "string"
        ? request.body.databaseId.trim()
        : "";
    if (!message)
      return response.status(400).json({ error: "Descreva o que deseja analisar." });
    try {
      const selectedDatabase = databaseId
        ? (await readFinancialDatabases()).find(
            (database) => database.id === databaseId && database.userId === user.id,
          )
        : undefined;
      if (databaseId && !selectedDatabase)
        return response.status(404).json({ error: "Base de dados não encontrada." });

      const uploadedPaths = await uploadFinancialFiles(files, langflowFinancialFlowId);

      const storedFilesBeforeRun = new Set(
        (await listLangflowStoredFiles()).map((file) => file.id),
      );

      const runResponse = await fetch(
        `${langflowServerUrl}/api/v1/run/${langflowFinancialFlowId}?stream=true`,
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
            "x-api-key": langflowApiKey,
          },
          body: JSON.stringify({
            input_value: message,
            input_type: "chat",
            output_type: "chat",
            session_id: sessionId,
            tweaks: {
              ...(uploadedPaths.length
                ? { [langflowFinancialChatInputId]: { files: uploadedPaths } }
                : {}),
              [langflowFinancialKnowledgeId]: {
                knowledge_base: langflowFinancialKnowledgeBase,
                mode: "Retrieve",
                metadata_filter: JSON.stringify({
                  owner: user.id,
                  database: selectedDatabase?.id ?? "__sem_base__",
                }),
              },
            },
          }),
        },
      );
      if (!runResponse.ok) {
        const details = await runResponse.text();
        console.error("Langflow recusou a análise financeira:", details.slice(0, 600));
        return response
          .status(502)
          .json({ error: "O agente financeiro não conseguiu iniciar a análise." });
      }
      if (!runResponse.body)
        return response
          .status(502)
          .json({ error: "O agente não iniciou a resposta em tempo real." });

      response.status(200);
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();

      const decoder = new TextDecoder();
      let streamBuffer = "";
      let completed = false;
      for await (const chunk of runResponse.body) {
        streamBuffer += decoder.decode(chunk, { stream: true });
        const lines = streamBuffer.split("\n");
        streamBuffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event.event === "token") {
            const data = event.data as Record<string, unknown> | undefined;
            if (typeof data?.chunk === "string")
              response.write(`data: ${JSON.stringify({ token: data.chunk })}\n\n`);
          }
          if (event.event === "end") {
            const newStoredFiles = (await listLangflowStoredFiles()).filter(
              (file) => !storedFilesBeforeRun.has(file.id),
            );
            const artifacts = newStoredFiles.length
              ? storedFilesAsArtifacts(newStoredFiles)
              : findGeneratedArtifacts(event);
            if (artifacts.length)
              response.write(`data: ${JSON.stringify({ artifacts })}\n\n`);
            response.write("data: [DONE]\n\n");
            completed = true;
          }
        }
      }
      if (!completed) response.write("data: [DONE]\n\n");
      return response.end();
    } catch (error) {
      console.error(
        "Falha na integração financeira:",
        error instanceof Error ? error.message : "erro desconhecido",
      );
      if (response.headersSent) {
        response.write(
          `\ndata: ${JSON.stringify({ error: "A análise foi interrompida." })}\n\n`,
        );
        return response.end();
      }
      return response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a análise.",
      });
    }
  },
);

app.get("/api/financeiro/download", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user)
    return response.status(401).json({ error: "Sessão ausente ou expirada." });
  if (!langflowApiKey)
    return response.status(503).json({ error: "Integração não configurada." });
  const source = typeof request.query.source === "string" ? request.query.source : "";
  const name =
    typeof request.query.name === "string" && request.query.name.trim()
      ? path.basename(request.query.name.trim())
      : "planilha.xlsx";
  if (!source)
    return response.status(400).json({ error: "Arquivo não informado." });
  try {
    const target = new URL(source, `${langflowServerUrl}/`);
    if (target.origin !== new URL(langflowServerUrl).origin)
      return response.status(400).json({ error: "Endereço de arquivo inválido." });
    const upstream = await fetch(target, {
      headers: { "x-api-key": langflowApiKey },
    });
    if (!upstream.ok || !upstream.body)
      return response.status(404).json({ error: "Arquivo não encontrado." });
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/octet-stream",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    for await (const chunk of upstream.body) response.write(Buffer.from(chunk));
    return response.end();
  } catch {
    return response.status(400).json({ error: "Não foi possível baixar o arquivo." });
  }
});

app.get("/api/health", (_request, response) => {
  return response.json({ status: "ok" });
});

const clientDist = path.resolve("dist");
if (isProduction) {
  if (!existsSync(clientDist)) {
    throw new Error(
      "A pasta dist não foi encontrada. Execute npm run build antes de iniciar em produção.",
    );
  }
  app.use(express.static(clientDist));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) {
      return next();
    }
    return response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, isProduction ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(
    `Intranet Mota disponível em http://${isProduction ? "0.0.0.0" : "127.0.0.1"}:${port}`,
  ),
);
