# Rodando o App de Escalas com Docker

Guia passo a passo (e didático) para subir o sistema em containers, sem
instalar Node nem SQL Server direto na máquina. Bom para **testar** e para
**aprender Docker**.

## O que é cada peça (o mapa mental)

| Arquivo | Para que serve |
|---|---|
| `Dockerfile` | A "receita" da imagem do **app** (Node/Express). |
| `docker-compose.yml` | O "maestro": sobe 3 containers juntos (banco, criador do banco, app). |
| `docker/init-db.sh` | Cria o banco `SoftwareEscalas` e o login próprio do app (`escalas_app`). |
| `.dockerignore` | O que **não** entra na imagem (segredos, config local, etc.). |
| `.env.docker.example` | Modelo das senhas. Você copia para `.env` e ajusta. |

Pensa no `docker-compose.yml` como três caixinhas isoladas conversando entre si:

```
[ db ]  →  [ db-init cria banco e login ]  →  [ app ]  →  você acessa em :4450
 SQL Server        (roda e sai)               Node/Express
```

## Pré-requisito

- **Docker Desktop** instalado (modalidade *Per-user* + *WSL 2* está ótima).
  Confirme que está rodando: o ícone da baleia na bandeja fica estável.

## Passo a passo

**1. Preparar as senhas** (na pasta do projeto):

```bash
cp .env.docker.example .env
```

Abra o `.env` e troque `DB_PASSWORD`, `APP_DB_PASSWORD` e `ADMIN_PASSWORD`.

- `DB_PASSWORD` é a do `sa`, o administrador do SQL Server. Só o `db-init` usa.
- `APP_DB_PASSWORD` é a do login `escalas_app`, com que o **app** conecta. Ele é
  dono só do banco do app — não enxerga nem administra o resto do servidor.

As duas senhas do banco precisam ser fortes (maiúscula, minúscula, número e
símbolo), senão o SQL Server recusa. Sem `APP_DB_PASSWORD` o compose nem sobe e
diz o que falta.

**2. Subir tudo:**

```bash
docker compose up -d --build
```

- `--build` monta a imagem do app a partir do `Dockerfile`.
- `-d` roda em segundo plano.
- Na **primeira vez** demora alguns minutos (baixa a imagem do SQL Server,
  ~1,5 GB). Nas próximas é rápido.

**3. Acompanhar a subida** (opcional, mas educativo):

```bash
docker compose logs -f app
```

Espere aparecer `Banco de dados conectado com sucesso.` Saia com `Ctrl+C`
(isso só para de ver o log; os containers continuam rodando).

**4. Abrir o app:**

- Nesta máquina: <http://localhost:4450>
- De outro dispositivo na rede: `http://<IP-desta-maquina>:4450`

Faça login com `admin` e a senha que você pôs em `ADMIN_PASSWORD`.

**5. Carregar dados de exemplo** (opcional): na tela de configuração do banco,
botão **"Carregar Dados de Exemplo"**.

## Comandos do dia a dia

| Ação | Comando |
|---|---|
| Ver o que está rodando | `docker compose ps` |
| Ver logs do app | `docker compose logs -f app` |
| Parar tudo (mantém os dados) | `docker compose stop` |
| Subir de novo | `docker compose start` |
| Parar e remover containers (mantém os dados nos volumes) | `docker compose down` |
| **Apagar TUDO, inclusive os dados** | `docker compose down -v` |
| Reconstruir após mudar o código | `docker compose up -d --build` |

> Os dados do banco ficam no volume `db-data` e sobrevivem a `stop`/`down`.
> Só somem com `down -v`.

## Atualizando uma instalação que já usava o `sa`

Versões antigas do compose conectavam o app com o `sa`. Para passar ao login
próprio:

1. **Gere um backup** pela tela do app (Configurações → Backup) antes de tudo.
2. Acrescente `APP_DB_PASSWORD` ao seu `.env` (veja `.env.docker.example`).
3. Confira se a conexão do banco foi salva **pela tela do app** em algum momento.
   Se sim, o arquivo `/data/database.local.json` vence o `docker-compose.yml`
   e o app continuaria com o `sa`:

   ```bash
   docker compose exec app cat /data/database.local.json
   ```

   Se o arquivo existir, troque usuário e senha na tela de configuração do banco
   para `escalas_app` e a senha nova **depois** do passo 4 — ou apague o arquivo
   para valer o compose.
4. Suba de novo: `docker compose up -d --build`. O `db-init` cria o login
   `escalas_app` e o torna dono do banco; o app passa a usá-lo. O container
   `db` é recriado (a porta mudou): o banco reinicia, os dados ficam no volume.

   Se você atualiza **só o app** (`docker compose up -d --no-deps app`), o
   `--no-deps` pula o `db-init` e o login não seria criado — o app subiria sem
   conseguir conectar. Nesse caso rode antes:

   ```bash
   docker compose run --rm db-init
   ```

   e, para fechar a porta 1433 para a rede, recrie o banco quando puder:
   `docker compose up -d --no-deps db`.
5. Confira em `docker compose logs db-init` a linha `Banco e login prontos`
   e entre no app normalmente.

A porta 1433 agora só aceita conexão **desta máquina** (`127.0.0.1`). Para
abrir o SSMS de outro computador, use um túnel ou mude o mapeamento por sua conta
e risco.

## Onde ficam os dados

Nada fica "solto" na sua pasta — o Docker guarda em **volumes**:
- `db-data` → arquivos do SQL Server.
- `app-data` → backups e config do app (`/data` dentro do container).

## Reiniciar sozinho

Os serviços têm `restart: always`: sempre que o Docker Desktop estiver rodando,
os containers voltam sozinhos. **Atenção:** o Docker Desktop (modo per-user) só
sobe quando **você loga** no Windows — então o "subir no boot sem ninguém logar"
de um servidor de verdade precisa de Docker Engine em Windows Server ou de um
host Linux. Para testes e uso com sessão aberta, `restart: always` já cobre.

## Problemas comuns

- **`docker` não é reconhecido** → o Docker Desktop não terminou de iniciar, ou
  o terminal foi aberto antes. Feche e reabra o terminal.
- **Banco não sobe / senha rejeitada** → `DB_PASSWORD` fraca. Use algo como
  `Escalas!Forte2026`.
- **App sobe mas não conecta no banco** → veja `docker compose logs db-init`;
  ele mostra as tentativas de conexão, a criação do banco e do login do app.
  `Login failed for user 'escalas_app'` costuma ser `/data/database.local.json`
  antigo ou senha trocada no `.env` sem subir de novo (veja *Atualizando*).
- **`required variable APP_DB_PASSWORD is missing`** → falta a senha do login
  do app no `.env`.
- **Porta 4450 ocupada** → algo já usa a porta nesta máquina (talvez o próprio
  servidor rodando fora do Docker). Pare o outro, ou troque a porta no
  `docker-compose.yml` (ex.: `"4451:4450"`).
