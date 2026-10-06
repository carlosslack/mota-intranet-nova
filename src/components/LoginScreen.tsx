import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import logo from "../assets/branding/mota-assinatura.png";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  isAdmin: boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: Record<string, unknown>,
          ) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string }) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

export function LoginScreen({
  onLogin,
}: {
  onLogin: (user: SessionUser) => void;
}) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !target.current) return;
    const load = () => {
      if (!window.google || !target.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setLoading(true);
          setError(null);
          try {
            const response = await fetch("/api/auth/google", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const body = (await response.json()) as {
              user?: SessionUser;
              error?: string;
            };
            if (!response.ok || !body.user)
              throw new Error(
                body.error ?? "Não foi possível iniciar a sessão.",
              );
            onLogin(body.user);
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Não foi possível iniciar a sessão.",
            );
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(target.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width: 320,
        text: "continue_with",
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", load);
      load();
      return () => existing.removeEventListener("load", load);
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", load);
    document.head.appendChild(script);
    return () => script.removeEventListener("load", load);
  }, [clientId, onLogin]);

  return (
    <main className="login-screen">
      <section className="login-card">
        <img
          className="login-logo"
          src={logo}
          alt="Mota & Advogados Associados"
        />
        <p className="eyebrow">Acesso corporativo</p>
        <h1>Bem-vindo à intranet.</h1>
        <p className="login-copy">
          Entre com a sua conta Google Workspace para acessar as ferramentas do
          escritório.
        </p>
        <div className="login-provider">
          {clientId ? (
            <div
              ref={target}
              className={
                loading
                  ? "login-provider__button login-provider__button--loading"
                  : "login-provider__button"
              }
            />
          ) : (
            <div className="login-missing">
              <AlertCircle size={17} /> A autenticação local ainda não foi
              configurada.
            </div>
          )}
        </div>
        {error && (
          <p className="login-error">
            <AlertCircle size={15} />
            {error}
          </p>
        )}
        <div className="login-security">
          <ShieldCheck size={16} /> Acesso restrito a contas corporativas
          autorizadas.
        </div>
      </section>
      <aside className="login-aside">
        <p className="eyebrow">Mota & Advogados Associados</p>
        <h2>Trabalho jurídico, organizado em um só lugar.</h2>
        <span>
          <ArrowRight size={17} /> Ambiente seguro para equipes internas
        </span>
      </aside>
    </main>
  );
}
