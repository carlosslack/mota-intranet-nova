import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";

dotenv.config({ path: ".env.local" });

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
const localPreview = !isProduction && process.env.LOCAL_PREVIEW === "true";
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
    entries: entries
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
