# SHADOW LOUNGE

Sistema web de gestão para lounge/tabacaria, com mesas, comandas, produtos, estoque, pagamentos, descontos, gorjeta, regras de preço por horário, permissões de acesso e relatórios.

Este projeto está preparado para:

- **Frontend React + Vite**;
- **API Express + tRPC em Vercel Functions**;
- **PostgreSQL hospedado no Neon**;
- **Drizzle ORM**;
- **Deploy contínuo via GitHub e Vercel**.

## 1. Requisitos

Instale os seguintes programas:

- Node.js 22 ou superior;
- pnpm 10 ou superior;
- Git;
- Uma conta no [Neon](https://neon.tech/);
- Uma conta no [Vercel](https://vercel.com/);
- Uma conta no GitHub, recomendada para controle de versão e deploy automático.

Para conferir as versões:

```bash
node --version
pnpm --version
git --version
```

## 2. Instalação local

Clone o repositório e entre na pasta do projeto:

```bash
git clone https://github.com/SEU_USUARIO/shadow-lounge.git
cd shadow-lounge
pnpm install
```

Crie um arquivo `.env` na raiz do projeto. Ele **não deve ser commitado**:

```env
DATABASE_URL="postgresql://usuario:senha@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="substitua-por-uma-chave-aleatoria-grande"
PORT=3000
NODE_ENV=development

VITE_APP_ID="seu_app_id_manus"
VITE_OAUTH_PORTAL_URL="https://seu-portal-oauth"
OAUTH_SERVER_URL="https://api.manus.im"
OWNER_OPEN_ID="seu_owner_open_id"
OWNER_NAME="Seu nome"

BUILT_IN_FORGE_API_URL="https://seu-forge-api"
BUILT_IN_FORGE_API_KEY="sua_chave_forge"
VITE_FRONTEND_FORGE_API_URL="https://seu-forge-api"
VITE_FRONTEND_FORGE_API_KEY="sua_chave_frontend"

VITE_ANALYTICS_ENDPOINT=""
VITE_ANALYTICS_WEBSITE_ID=""
VITE_APP_TITLE="SHADOW LOUNGE"
VITE_APP_LOGO=""
```

### Variáveis obrigatórias

| Variável | Uso | Onde obter |
|---|---|---|
| `DATABASE_URL` | Conexão com o PostgreSQL | Neon, botão **Connect** |
| `JWT_SECRET` | Assinatura das sessões | Gere uma chave aleatória longa |
| `NODE_ENV` | Ambiente de execução | `development` local e `production` na Vercel |

### Variáveis do OAuth

| Variável | Uso |
|---|---|
| `VITE_APP_ID` | Identificador da aplicação OAuth |
| `VITE_OAUTH_PORTAL_URL` | Portal de login utilizado pelo frontend |
| `OAUTH_SERVER_URL` | Servidor OAuth usado pela API |
| `OWNER_OPEN_ID` | Identificador do proprietário/admin |
| `OWNER_NAME` | Nome do proprietário |

As variáveis `BUILT_IN_FORGE_*` e `VITE_FRONTEND_FORGE_*` só são necessárias se os recursos Manus correspondentes forem utilizados no ambiente publicado. Não substitua valores por exemplos: use os valores reais fornecidos pela integração.

## 3. Criar o banco no Neon

1. Acesse [console.neon.tech](https://console.neon.tech/).
2. Clique em **New project**.
3. Escolha um nome, por exemplo `shadow-lounge`.
4. Escolha a região mais próxima dos usuários.
5. Abra o projeto e clique em **Connect**.
6. Selecione o driver **Node.js** ou copie a conexão PostgreSQL.
7. Copie a URL completa para `DATABASE_URL`.

A URL normalmente possui este formato:

```text
postgresql://usuario:senha@ep-nome-regiao.aws.neon.tech/neondb?sslmode=require
```

Não remova `sslmode=require`. A aplicação também configura TLS no pool PostgreSQL para funcionar corretamente com o Neon.

## 4. Criar as tabelas no Neon

Com o `.env` configurado, execute:

```bash
pnpm drizzle-kit migrate
```

Esse comando aplica a migração PostgreSQL localizada em `drizzle/0000_sharp_mentor.sql`.

Como alternativa, para sincronizar o schema diretamente:

```bash
pnpm db:push
```

Use apenas um desses fluxos em uma instalação nova. Para o ambiente de produção, prefira criar e revisar uma migração antes de aplicá-la.

Verifique no Neon se as tabelas foram criadas. Entre as principais estão:

- `users`;
- `user_profiles`;
- `local_credentials`;
- `local_sessions`;
- `lounge_tables`;
- `tabs`;
- `tab_items`;
- `products`;
- `product_categories`;
- `product_price_rules`;
- `payments`;
- `stock_movements`;
- `expenses`;
- `audit_logs`.

## 5. Executar localmente

Inicie o ambiente de desenvolvimento:

```bash
pnpm dev
```

Acesse:

```text
http://localhost:3000
```

O banco utilizado localmente será o banco indicado em `DATABASE_URL`. Portanto, não use o banco de produção para testes destrutivos. Crie um branch separado no Neon para desenvolvimento ou use um projeto Neon distinto.

Comandos úteis:

```bash
pnpm check      # verifica TypeScript
pnpm test       # executa os testes
pnpm build      # gera o build local completo
pnpm build:vercel # gera o build do frontend para a Vercel
```

## 6. Publicar no GitHub

Na primeira publicação:

```bash
git init
git add .
git commit -m "chore: preparar deploy Neon e Vercel"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/shadow-lounge.git
git push -u origin main
```

Antes de executar `git add .`, confira se o `.env` está ignorado:

```bash
git status --short
```

Se o `.env` aparecer na lista, pare e corrija o `.gitignore`. **Nunca publique `DATABASE_URL`, `JWT_SECRET`, tokens OAuth ou chaves de API no GitHub.**

## 7. Criar o projeto na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new).
2. Escolha **Import Git Repository**.
3. Selecione o repositório `shadow-lounge`.
4. Em **Framework Preset**, deixe a detecção automática ou selecione **Other**.
5. Configure:

```text
Build Command: pnpm build:vercel
Output Directory: dist/public
Install Command: pnpm install --frozen-lockfile
```

6. Não defina um comando de start para o deploy da Vercel.
7. Clique em **Deploy** somente depois de configurar as variáveis de ambiente.

O arquivo `vercel.json` já configura o build, o roteamento do frontend e a Function `api/index.ts`.

## 8. Configurar variáveis na Vercel

No projeto Vercel, abra:

```text
Settings → Environment Variables
```

Adicione as variáveis usadas no `.env` local. Para cada variável, selecione os ambientes necessários:

- **Production** para o domínio público;
- **Preview** para branches e pull requests;
- **Development** se quiser sincronizar com o uso da CLI da Vercel.

Configure, no mínimo:

```text
DATABASE_URL
JWT_SECRET
NODE_ENV=production
VITE_APP_ID
VITE_OAUTH_PORTAL_URL
OAUTH_SERVER_URL
OWNER_OPEN_ID
OWNER_NAME
```

Adicione também as variáveis `BUILT_IN_FORGE_*`, `VITE_FRONTEND_FORGE_*` e analytics caso sejam utilizadas.

Para `DATABASE_URL`, use a URL do Neon com `sslmode=require`. Não use o endereço `localhost`, o hostname do Docker ou a URL de conexão interna do computador.

Depois de alterar uma variável, faça um novo deploy. Variáveis de ambiente são aplicadas durante a criação da Function e não alteram uma implantação já concluída automaticamente.

## 9. Configurar OAuth para o domínio publicado

Depois que a Vercel gerar o domínio, copie o endereço, por exemplo:

```text
https://shadow-lounge.vercel.app
```

No painel do provedor OAuth, registre o callback:

```text
https://shadow-lounge.vercel.app/api/oauth/callback
```

Se usar domínio próprio, registre também:

```text
https://www.seudominio.com/api/oauth/callback
```

Atualize `VITE_OAUTH_PORTAL_URL`, `OAUTH_SERVER_URL` ou as configurações equivalentes do provedor se o fluxo OAuth exigir uma URL de retorno específica.

Teste sempre:

1. Abrir o domínio publicado;
2. Entrar pelo OAuth;
3. Confirmar que o cookie de sessão foi criado;
4. Abrir uma mesa;
5. Criar uma comanda;
6. Adicionar um produto;
7. Registrar um pagamento;
8. Encerrar a comanda.

## 10. Migrações de banco em produção

A Vercel executa o build, mas não deve aplicar migrações automaticamente a cada deploy sem uma estratégia explícita. O fluxo recomendado é:

```bash
# apontando para o banco Neon correto
DATABASE_URL="postgresql://..." pnpm drizzle-kit generate
DATABASE_URL="postgresql://..." pnpm drizzle-kit migrate
```

Depois:

```bash
git add drizzle package.json pnpm-lock.yaml
git commit -m "feat(db): adicionar migração de exemplo"
git push origin main
```

Faça backup ou use um branch do Neon antes de alterações estruturais importantes. Nunca apague tabelas de produção para corrigir uma migração sem confirmar o impacto.

## 11. Controle de versionamento com Git

### Branches recomendadas

Use `main` para o código pronto para produção e branches curtas para trabalho em andamento:

```text
main                 produção
feature/precos       nova funcionalidade
fix/login            correção de bug
chore/deploy         ajustes de infraestrutura
```

Criar uma branch:

```bash
git switch main
git pull origin main
git switch -c feature/minha-alteracao
```

### Ciclo normal de trabalho

```bash
git status
git diff
pnpm check
pnpm test
pnpm build:vercel
git add arquivo1 arquivo2
git commit -m "feat: descrever a alteração"
git push -u origin feature/minha-alteracao
```

Abra um Pull Request no GitHub. A Vercel criará um Preview Deployment para essa branch. Teste o preview antes de fazer merge em `main`.

### Padrão de mensagens de commit

Use mensagens curtas e claras:

```text
feat: adicionar regra de preço por horário
fix: corrigir cálculo do saldo da comanda
chore: atualizar configuração da Vercel
refactor: separar API Express da execução local
test: cobrir encerramento de comanda
```

Evite mensagens vagas como `alterações`, `ajustes` ou `versão final`.

### Atualizar o código sem perder alterações

Antes de começar um novo trabalho:

```bash
git switch main
git pull --rebase origin main
git switch -c feature/nova-funcionalidade
```

Se houver alterações locais ainda não commitadas, salve-as temporariamente:

```bash
git stash push -m "trabalho temporário"
git pull --rebase origin main
git stash pop
```

### Desfazer alterações

Para descartar uma alteração ainda não commitada em um arquivo:

```bash
git restore caminho/do/arquivo
```

Para desfazer um commit já publicado sem reescrever o histórico:

```bash
git revert ID_DO_COMMIT

git push origin main
```

Prefira `git revert` em produção. Evite `git reset --hard` em branches compartilhadas, pois ele pode apagar trabalho de outras pessoas.

### Rollback na Vercel

Cada commit enviado ao GitHub gera um deployment. Para voltar a uma versão anterior:

1. Abra o projeto na Vercel;
2. Acesse **Deployments**;
3. Selecione a implantação estável anterior;
4. Use **Redeploy** ou **Promote to Production**, conforme a interface disponível.

O rollback do código não desfaz automaticamente uma migração do banco. Alterações de schema precisam de uma migração reversa planejada.

## 12. Checklist de publicação

- [ ] O `.env` não está no Git;
- [ ] `DATABASE_URL` aponta para o Neon correto;
- [ ] O banco possui as migrações aplicadas;
- [ ] `JWT_SECRET` é diferente entre desenvolvimento e produção;
- [ ] As variáveis OAuth estão configuradas na Vercel;
- [ ] O callback OAuth usa o domínio correto;
- [ ] `pnpm check` passa;
- [ ] `pnpm test` passa;
- [ ] `pnpm build:vercel` passa;
- [ ] O Preview Deployment foi testado;
- [ ] O domínio de produção foi testado com login, comanda, pagamento e encerramento;
- [ ] Existe um commit ou tag identificando a versão publicada.

## 13. Criar uma tag de versão

Depois de uma publicação estável:

```bash
git switch main
git pull origin main
git tag -a v1.0.0 -m "primeira versão publicada"
git push origin v1.0.0
```

Para listar versões:

```bash
git tag --list
```

Use tags como `v1.0.0`, `v1.1.0` e `v1.1.1` para identificar versões importantes, novas funcionalidades e correções.
