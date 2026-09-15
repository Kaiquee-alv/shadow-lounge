# SHADOW LOUNGE — execução local com PostgreSQL

Este modo executa a aplicação e um PostgreSQL em contêineres Docker. A estrutura é compatível com o Neon: localmente usa o hostname `db`; na Vercel, `DATABASE_URL` aponta para o Neon.

## Requisitos

Instale o **Docker Desktop** no Windows/macOS ou Docker Engine + Compose no Linux:

- Windows/macOS: https://www.docker.com/products/docker-desktop/
- Linux: Docker Engine e Docker Compose Plugin

No Windows, ative **Settings > General > Start Docker Desktop when you sign in**.

## 1. Variáveis locais

Crie `.env` na raiz do projeto, se quiser trocar os valores padrão:

```env
POSTGRES_DB=shadow_lounge
POSTGRES_USER=shadow
POSTGRES_PASSWORD=uma_senha_forte_para_o_banco
JWT_SECRET=uma_chave_forte_para_as_sessoes
APP_PORT=3000
```

Essas variáveis são usadas somente pelo Docker Compose. A aplicação recebe automaticamente a URL interna:

```text
postgresql://shadow:senha@db:5432/shadow_lounge
```

Não use o arquivo `.env` local na Vercel. Na Vercel, cadastre a `DATABASE_URL` diretamente com a URL do Neon.

## 2. Iniciar

Na pasta do projeto:

```bash
docker compose up -d --build
```

Abra:

```text
http://localhost:3000
```

A aplicação aguarda o PostgreSQL ficar saudável antes de iniciar. A primeira construção pode levar alguns minutos. O comando `pnpm db:push` executado pelo contêiner sincroniza o schema PostgreSQL quando o banco ainda está vazio.

Credencial inicial da operação local:

```text
Usuário: admin
Senha: shadow2026
```

Altere a senha depois do primeiro acesso se a instalação for usada em rede real.

## 3. Operação Docker

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
docker compose restart
docker compose down
```

Não use `docker compose down -v` em uma operação real: essa opção remove o volume e apaga o banco persistente.

## 4. Inicializar com o Windows

O `docker-compose.yml` usa `restart: unless-stopped`. Depois que o Docker Desktop iniciar, os contêineres retornam automaticamente.

Para criar a tarefa de inicialização do Windows:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\install-autostart-windows.ps1
```

Para remover:

```powershell
Unregister-ScheduledTask -TaskName "SHADOW LOUNGE - Servidor" -Confirm:$false
```

## 5. Inicialização no Linux

```bash
sudo systemctl enable --now docker
docker compose up -d --build
```

A política `restart: unless-stopped` fará os contêineres voltarem quando o Docker iniciar.

## 6. Acesso na rede local

Descubra o IP do PC servidor e acesse de outro dispositivo:

```text
http://IP_DO_PC:3000
```

Exemplo:

```text
http://192.168.0.25:3000
```

Libere a porta escolhida no firewall do PC servidor.

## 7. Backup e restauração

O volume PostgreSQL chama-se `shadow-lounge-postgres-data`. Para fazer backup:

```bash
docker compose exec -T db pg_dump -U shadow -d shadow_lounge > shadow_lounge_backup.sql
```

Para restaurar em um banco vazio:

```bash
cat shadow_lounge_backup.sql | docker compose exec -T db psql -U shadow -d shadow_lounge
```

Guarde os arquivos de backup fora do volume Docker.

## 8. Solução de problemas

Verifique o estado:

```bash
docker compose ps
docker compose logs app
docker compose logs db
```

Se a porta estiver ocupada, altere `APP_PORT` no `.env`, por exemplo:

```env
APP_PORT=3001
```

Depois acesse `http://localhost:3001`.

Se o volume foi criado com uma configuração anterior e a instalação ainda não possui dados importantes, recrie-o uma única vez:

```bash
docker compose down -v
docker compose up -d --build
```

Esse comando apaga definitivamente o banco local. Não execute em produção.
