import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarCheck2,
  ExternalLink,
  LoaderCircle,
  Video,
} from "lucide-react";

type CreatedMeeting = { meetLink: string; calendarLink: string; title: string };

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () =>
          reject(new Error("Não foi possível carregar a autenticação Google.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Não foi possível carregar a autenticação Google."));
    document.head.appendChild(script);
  });
}

export function MeetingScheduler() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"authorizing" | "creating">("authorizing");
  const [googleReady, setGoogleReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedMeeting | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorizationPending = useRef(false);

  useEffect(() => {
    let active = true;
    loadGoogleIdentity()
      .then(() => {
        if (active) setGoogleReady(true);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Autenticação Google indisponível.");
      });
    return () => {
      active = false;
      authorizationPending.current = false;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  const finishRequest = () => {
    authorizationPending.current = false;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    setLoading(false);
  };
  const createMeeting = async (accessToken: string) => {
    const attendeeEmails = participants
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          description: notes || undefined,
          start: {
            dateTime: `${date}T${startTime}:00`,
            timeZone: "America/Sao_Paulo",
          },
          end: {
            dateTime: `${date}T${endTime}:00`,
            timeZone: "America/Sao_Paulo",
          },
          attendees: attendeeEmails,
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
    const body = (await response.json()) as {
      hangoutLink?: string;
      htmlLink?: string;
      error?: { message?: string };
    };
    if (!response.ok || !body.hangoutLink || !body.htmlLink)
      throw new Error(
        body.error?.message ??
          "O Google Calendar não retornou o link da reunião.",
      );
    setCreated({
      title,
      meetLink: body.hangoutLink,
      calendarLink: body.htmlLink,
    });
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreated(null);
    if (!clientId) {
      setError(
        "O cliente OAuth Google ainda não foi configurado neste ambiente.",
      );
      return;
    }
    if (endTime <= startTime) {
      setError(
        "O horário de término precisa ser posterior ao horário de início.",
      );
      return;
    }
    if (!googleReady || !window.google?.accounts?.oauth2) {
      setError("A autenticação Google ainda não está disponível. Recarregue a página e tente novamente.");
      return;
    }
    if (authorizationPending.current) return;
    authorizationPending.current = true;
    setPhase("authorizing");
    setLoading(true);
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.events",
        callback: async ({ access_token, error: oauthError }) => {
          if (!authorizationPending.current) return;
          authorizationPending.current = false;
          if (pendingTimer.current) clearTimeout(pendingTimer.current);
          pendingTimer.current = null;
          try {
            if (oauthError || !access_token)
              throw new Error(
                "A permissão para criar eventos na Agenda não foi concedida.",
              );
            setPhase("creating");
            await createMeeting(access_token);
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Não foi possível criar a reunião.",
            );
          } finally {
            finishRequest();
          }
        },
        error_callback: ({ type }) => {
          if (!authorizationPending.current) return;
          setError(
            type === "popup_failed_to_open"
              ? "O navegador bloqueou a janela de autorização do Google. Permita pop-ups para esta intranet e tente novamente."
              : type === "popup_closed"
                ? "A autorização do Google foi fechada antes de terminar. Tente novamente e conclua a permissão da Agenda."
                : `Não foi possível abrir a autorização Google (${type}).`,
          );
          finishRequest();
        },
      });
      pendingTimer.current = setTimeout(() => {
        setError("O Google não respondeu à autorização. Verifique se uma janela de login foi bloqueada e tente novamente.");
        finishRequest();
      }, 90000);
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível iniciar a autorização Google.",
      );
      finishRequest();
    }
  };
  if (created)
    return (
      <section className="meeting-view">
        <p className="eyebrow">Google Meet e Agenda</p>
        <div className="meeting-success">
          <span>
            <CalendarCheck2 size={30} />
          </span>
          <h1>Reunião criada.</h1>
          <p>
            O evento <strong>{created.title}</strong> foi criado no Google
            Calendar da conta que autorizou a operação. Os convidados receberam
            o convite por e-mail.
          </p>
          <div>
            <a href={created.meetLink} target="_blank" rel="noreferrer">
              Entrar no Meet <Video size={16} />
            </a>
            <a
              className="meeting-success__secondary"
              href={created.calendarLink}
              target="_blank"
              rel="noreferrer"
            >
              Ver no Calendar <ExternalLink size={15} />
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setTitle("");
              setDate("");
              setStartTime("");
              setEndTime("");
              setParticipants("");
              setNotes("");
            }}
          >
            Agendar outra reunião
          </button>
        </div>
      </section>
    );
  return (
    <section className="meeting-view">
      <div className="support-hero">
        <div>
          <p className="eyebrow">Google Meet e Agenda</p>
          <h1>Novo agendamento</h1>
          <p>
            O compromisso será criado no seu Google Calendar, com link do Meet e
            convites reais aos participantes.
          </p>
        </div>
        <div className="security-chip">
          <CalendarCheck2 size={17} />
          <span>Calendário do usuário</span>
        </div>
      </div>
      <form className="meeting-form" onSubmit={handleSubmit}>
        <label>
          Assunto da reunião
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Audiência de conciliação"
          />
        </label>
        <div className="meeting-form__grid">
          <label>
            Data
            <input
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Início
            <input
              required
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label>
            Término
            <input
              required
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <label>
          <span>
            Participantes <small className="meeting-form__hint">(Separe os e-mails por vírgula)</small>
          </span>
          <input
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
            placeholder="Separe os e-mails por vírgula"
          />
        </label>
        <label>
          Pauta e observações
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Informações que acompanharão o convite."
          />
        </label>
        <p className="meeting-warning">
          <AlertCircle size={16} /> Ao confirmar, o Google criará um evento
          real, gerará o Google Meet e enviará convites aos e-mails informados.
        </p>
        {error && (
          <p className="meeting-error">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={loading || !googleReady}>
          {loading ? (
            <>
              <LoaderCircle className="spin" size={16} />
              {phase === "authorizing" ? "Aguardando autorização Google…" : "Criando reunião…"}
            </>
          ) : !googleReady ? (
            <>
              <LoaderCircle className="spin" size={16} /> Carregando autorização Google…
            </>
          ) : (
            <>
              <Video size={16} /> Criar reunião e Google Meet
            </>
          )}
        </button>
      </form>
    </section>
  );
}
