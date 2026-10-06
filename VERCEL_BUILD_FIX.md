# Correção do build da Vercel

O commit remoto `38341b31fb4d99ce4f1816b6622ff1bebec302f3` importa `@shared/sao-paulo-time` no frontend, mas o arquivo `shared/sao-paulo-time.ts` não estava na branch. Ao reproduzir a compilação, o TypeScript revelou ainda outra dependência ausente: `server/daily-revenue-utils.ts`, importada por `server/db.ts`.

A correção acrescenta somente esses dois módulos de código ao commit remoto. Não altera migrations, dados, configurações ou permissões.

## Verificação

Na cópia limpa do commit remoto, com os dois arquivos adicionados:

- `pnpm check` passou.
- `pnpm test` passou: 27 testes.
- `pnpm build:vercel` passou e compilou a API e o frontend.

O build ainda imprime avisos preexistentes de analytics sem configuração e de tamanho do bundle, mas estes não impedem a compilação.

## Aplicar

O patch incluído foi gerado como commit sobre o SHA acima. Com um clone atualizado de `main`, aplique-o e envie a correção:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git am vercel-build-fix.patch
git push origin main
```

A tentativa de enviar uma branch corretiva diretamente recebeu HTTP 403 (`Permission to Kaiquee-alv/shadow-lounge.git denied`). Por isso, nenhuma alteração foi enviada, nenhum PR foi aberto e não houve publicação em produção. A pessoa com permissão de escrita pode aplicar o patch ou conceder o escopo adequado.
