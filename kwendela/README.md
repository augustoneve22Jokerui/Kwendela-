# KWENDELA

Plataforma tecnológica de turismo de nível internacional, concebida inicialmente para Angola e preparada para expansão internacional. Conecta turistas, empresas de turismo, guias turísticos e prestadores de serviços numa arquitetura centralizada com API REST versionada, WebSockets em tempo real e aplicação web SSR em EJS.

## Stack Tecnológica

### Backend
- **Runtime:** Node.js (`>= 20.0.0`)
- **Framework:** Express
- **Base de Dados:** PostgreSQL + PostGIS (Neon PostgreSQL inicialmente, compatível com servidor próprio)
- **Acesso a Dados:** `pg` com SQL explícito e parametrizado
- **Tempo Real:** Socket.IO
- **Autenticação & Segurança:** JWT (Access + Refresh Tokens), bcrypt, Helmet, CORS restritivo, Rate Limiting, validação com Joi, sanitização XSS e proteção CSRF
- **Documentação API:** OpenAPI 3 (`docs/openapi.yaml` via Swagger UI em `/api/docs`)

### Frontend Web
- **Templates:** EJS (`express-ejs-layouts`)
- **UI & Estilos:** HTML5, CSS3, Bootstrap 5, JavaScript puro e Fetch API

---

## Pré-requisitos

- Node.js `>= 20.0.0` e npm `>= 10.0.0`
- Instância PostgreSQL com suporte à extensão **PostGIS** (ex.: Neon PostgreSQL)

---

## Configuração Local

1. **Instalar dependências:**
   ```bash
   npm install

   Configurar variáveis de ambiente:
Copie o ficheiro .env.example para .env e preencha os valores do seu ambiente privado (nunca versionar o ficheiro .env):
Bash
cp .env.example .env
Executar migrations da base de dados:
Bash
npm run migrate
Executar seed inicial (planos configuráveis, definições globais e Superadmin):
Bash
npm run seed
Iniciar em modo de desenvolvimento:
Bash
npm run dev
Iniciar em produção:
Bash
npm start
Testes Automatizados
Configure TEST_DATABASE_URL no .env apontando para uma base de dados PostgreSQL de testes dedicada e execute:
Bash
npm test
Endpoints Principais
Website Público & Portais Web: /
Health Check: GET /api/v1/health
API REST v1: /api/v1/*
Documentação OpenAPI (Swagger UI): /api/docs
Deploy no Render e Migração Futura
O projeto inclui render.yaml configurado para o serviço web em https://kwendela.onrender.com. As variáveis sensíveis (DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET, SUPERADMIN_PASSWORD, etc.) devem ser configuradas exclusivamente no painel privado de variáveis de ambiente do provedor.
Para migração futura para um servidor PostgreSQL próprio, basta atualizar DATABASE_URL e DATABASE_SSL nas variáveis de ambiente e executar npm run migrate.