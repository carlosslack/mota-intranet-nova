# Intranet Mota

Nova base local da intranet da Mota & Advogados Associados. Este projeto substitui a camada visual e de autenticação sem reutilizar Firebase ou dados de demonstração.

## Primeira fase

- identidade visual institucional azul-marinho e dourado;
- login Google Workspace direto, validado pelo backend local;
- sessão segura por cookie HTTP-only;
- bloqueio de contas fora do domínio corporativo configurado;
- painel principal, Workspace, Central de TI, documentos, POPs/wiki, jurídico, financeiro, CRM, comunicação, assistente, administração e busca;
- atalhos diretos para Gmail, Agenda, Meet e Drive;
- formulário de reunião que cria evento no Google Calendar da conta autorizada, com Meet e convites reais;
- Central de TI com abertura e consulta de chamados da própria conta, persistidos em volume local do serviço;
- permissões por perfil Google: `ti@mota.adv.br` administra conteúdos, CRM e a fila de TI; demais contas corporativas abrem e acompanham apenas os próprios chamados;
- nenhum dado de cliente, documento ou integração externa é preenchido, copiado ou alterado automaticamente nesta fase; as únicas ações externas acontecem por decisão explícita do usuário no formulário de reunião.

## Rodar localmente

1. Copie `.env.example` para `.env.local` e informe o cliente OAuth Google e o segredo de sessão.
2. Inicie a API: `npm run dev:api`.
3. Em outro terminal, inicie a interface: `npm run dev -- --host 127.0.0.1 --port 3001`.
4. Acesse `http://127.0.0.1:3001`.

## Antes do primeiro login real

No cliente OAuth já existente, autorize a origem `http://127.0.0.1:3001`. Para produção, registre `https://intranet.motaadv.net` em **Origens JavaScript autorizadas** antes da publicação. O mesmo cliente precisa ter a Google Calendar API habilitada para que o formulário de reunião crie o evento e o Meet.

O login usa a conta Google corporativa. O e-mail `ti@mota.adv.br` já é o administrador padrão; se houver outro administrador no futuro, inclua-o em `ADMIN_EMAILS` no ambiente de publicação.

## Preparação para publicação

O projeto já inclui `Dockerfile` e `docker-compose.production.yml`, mas nenhuma publicação é feita automaticamente. Antes de subir na VPS, revise o nome da rede externa e o cert resolver do Traefik existente.

1. Copie `.env.example` para `.env.production` e defina `NODE_ENV=production`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` e um `SESSION_SECRET` exclusivo.
2. Configure `INTRANET_HOST=intranet.motaadv.net`, `TRAEFIK_NETWORK` e `TRAEFIK_CERTRESOLVER` com os valores efetivos da VPS.
3. Faça o build com `docker compose --env-file .env.production -f docker-compose.production.yml build`.
4. Somente após validação e autorização, suba com `docker compose --env-file .env.production -f docker-compose.production.yml up -d`.

O contêiner expõe apenas a porta interna `3002`; o acesso público será entregue pelo Traefik. A rota `GET /api/health` serve apenas para verificações de saúde. Os chamados da Central de TI ficam no volume Docker `intranet-data`, separado do ciclo de recriação do contêiner.

## Próxima fase

Conectar, uma por vez e mediante aprovação, as fontes oficiais: chamados de TI, Google Workspace, Langflow, bases jurídicas e consultas financeiras.
