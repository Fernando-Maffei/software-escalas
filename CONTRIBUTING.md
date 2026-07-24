# Como contribuir

## Fluxo de branches

- `main` e a branch estavel e a **fonte de verdade**. Todo codigo publicado passa por ela.
- Trabalhe em branches de tema criadas a partir da `main`:

  ```bash
  git switch main
  git pull
  git switch -c feat/nome-da-mudanca
  ```

- Ao concluir, abra um Pull Request para a `main`.

## Padrao de commits

O projeto usa [Conventional Commits](https://www.conventionalcommits.org/) em portugues:

```
<tipo>(<escopo opcional>): <descricao no imperativo>
```

Tipos comuns: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.

Exemplos:

```
feat(backup): backup automatico antes de restaurar
fix(visual): corrige formulario de novo usuario em Configuracoes
```

## Rodando o projeto

```bash
npm install
npm start        # sobe em http://localhost:4450
```

## Testes

```bash
npm test         # suite de testes
npm run smoke    # checagem rapida de sintaxe de todos os modulos
```

Rode ambos antes de abrir um Pull Request.

## Estilo de codigo

- Indentacao de **4 espacos**, charset **UTF-8**, fim de linha **LF** (ver `.editorconfig`).
- Scripts do Windows (`.bat`, `.vbs`) usam **CRLF**.
