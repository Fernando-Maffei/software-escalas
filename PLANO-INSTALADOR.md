# Plano do Instalador — App de Escalas

> Documento de planejamento. Descreve como empacotar o app num instalador
> `.exe` para a **máquina que será o servidor**, sem embutir o SQL Server e sem
> arquivo de banco. Nada aqui altera a lógica do sistema em produção.
> Branch de trabalho: `teste-instalador` (não mexer na `main`).

## 1. Contexto e objetivo

O App de Escalas é uma aplicação **web cliente-servidor**: Node/Express +
banco **SQL Server** (`mssql`), com o frontend estático servido pelo próprio
Express. O banco é **compartilhado** — o time inteiro enxerga a mesma escala.

O objetivo do instalador é substituir os ~15 passos manuais do
[docs/SERVIDOR-COMO-INSTALAR.md](docs/SERVIDOR-COMO-INSTALAR.md) por um
`next-next-finish` numa única máquina, que no fim serve o app para a rede e
sobe sozinha quando a máquina liga.

## 2. Princípio central (o que decide todo o desenho)

**Um arquivo de banco não roda sozinho.** No SQL Server, os dados vivem em
`.mdf`/`.ldf` (ou num `.bak`), mas qualquer um deles precisa de uma **instância
do SQL Server rodando** para ser anexado/restaurado. Portanto:

- O peso (~300 MB) é o **motor do SQL Express**, não os dados.
- Empacotar "o arquivo do banco" **não** elimina a necessidade de instalar o SQL
  na máquina servidor.

**Consequência:** não empacotamos o SQL nem arquivo de banco. Em vez disso:

1. O SQL Express vira **pré-requisito** (detectado / baixado à parte).
2. O **esquema do banco o próprio app já gera** a partir das migrations que ele
   carrega (`ensureApplicationSchema` em
   [backend/utils/database-schema.js](backend/utils/database-schema.js)), lidas de
   [database/migrations/](database/migrations/). São ~36 KB de texto versionado,
   sempre coerentes com a versão do sistema — muito melhor que um `.mdf` binário.
3. Os **dados iniciais** (para o banco não começar vazio) vêm do template de
   exemplo já implementado nesta branch: `applyExampleSeed` +
   [database/seeds/dados-exemplo.sql](database/seeds/dados-exemplo.sql), acionável
   pelo botão **"Carregar Dados de Exemplo"** na tela de configuração, ou pelo
   endpoint `POST /configuracao-banco/carregar-exemplos`.

## 3. Arquitetura da distribuição

| Papel | O que instala | Observação |
|---|---|---|
| **Servidor** (1 máquina) | O instalador `.exe` (Node embutido + app + serviço) | Precisa de SQL Express |
| **Clientes** (time) | **Nada** | Abrem `http://<IP-do-servidor>:4450` no navegador e instalam o ícone via PWA |

> Não existe "pacote cliente". O frontend é servido pelo servidor; o cliente é o
> navegador/PWA. Instalar o sistema em cada PC reintroduziria o problema que fez
> descartar o instalador-por-máquina (cada PC com config de banco) e espalharia
> credenciais do banco pela rede. Se quiser aparência de "programa" no cliente,
> use o PWA (já pronto: `frontend/manifest.json`) ou, no futuro, uma casca fina
> (Tauri) que só guarda o endereço do servidor — sem sistema, sem banco.

## 4. O que o instalador faz (passo a passo)

1. Copia o app + `node.exe` embutido para `C:\Program Files\App de Escalas`.
2. Cria a pasta de dados `C:\ProgramData\App de Escalas` e define a variável
   `APP_DE_ESCALAS_DATA_DIR` apontando para ela (o código já suporta — ver
   [backend/utils/app-paths.js:4](backend/utils/app-paths.js)).
3. Pergunta a **senha do admin** e injeta como `ADMIN_PASSWORD` (o código já
   aceita — ver [backend/utils/auth.js:190](backend/utils/auth.js)). Sem isso,
   como serviço SYSTEM não há console para ler a senha gerada → ninguém logaria.
4. **Pré-requisito SQL Express** (ver seção 5).
5. Cria o banco vazio (1 comando `CREATE DATABASE`, via `sqlcmd`) e grava
   `database.local.json` na pasta de dados, para a tela de configuração de banco
   nunca aparecer.
6. Registra o serviço que sobe no boot (ver seção 6) e abre a porta 4450 no
   firewall da rede local.
7. Na primeira execução o app roda as migrations e cria todas as tabelas
   sozinho. *(Opcional)* o operador clica "Carregar Dados de Exemplo".

## 5. Pré-requisito SQL Express (o maior risco)

O SQL Express é o que faz o instalador inchar e o que mais falha em máquina
"suja" (instância já existente, versão diferente). Duas estratégias, da mais
segura para a mais automática:

- **A — Detectar e orientar (recomendada p/ começar):** o instalador verifica se
  há uma instância; se não houver, mostra o link oficial e instruções, e segue
  depois que o operador instalar. Instalador leve (~50 MB), risco baixo.
- **B — Baixar sob demanda:** o instalador baixa o SQL Express e roda a
  instalação silenciosa (`/QS /ACTION=Install /FEATURES=SQLEngine
  /INSTANCENAME=SQLEXPRESS /SECURITYMODE=SQL`). Mais automático, porém frágil em
  máquinas com instância pré-existente.
- **C — Embutir o SQL:** empacota o instalador do SQL Express. Sai de ~50 MB para
  ~350 MB e herda todos os problemas de instalação silenciosa. **Evitar.**

Comece pela **A**; evolua para **B** só se for repetir a instalação muitas vezes.

## 6. Ajuste de código necessário (pequeno, obrigatório)

Hoje [backend/utils/background-service.js](backend/utils/background-service.js)
registra a tarefa com `/SC ONLOGON /RL LIMITED` — o servidor só sobe quando
**alguém loga no Windows**. Para "ligou a máquina, já está no ar" é preciso um
serviço que suba no boot, sem login. Duas opções:

- **NSSM (recomendada):** registrar o Node como serviço do Windows via NSSM, que
  é mais robusto para 24/7 e já é o método do
  [docs/SERVIDOR-COMO-INSTALAR.md](docs/SERVIDOR-COMO-INSTALAR.md). O instalador
  chama o NSSM; o botão "Instalar início automático" da UI continua como
  alternativa manual.
- **schtasks `/SC ONSTART /RU SYSTEM`:** mudança mínima no código atual, mas
  menos resiliente que um serviço real (sem restart automático em falha).

> Este é o único ajuste de **lógica** que o instalador exige. O seed da seção 2
> já está implementado nesta branch.

## 7. Estrutura do pacote de download

```
AppDeEscalas-Servidor.zip
├─ AppDeEscalas-Setup.exe        (Inno Setup: app + node.exe + serviço)
├─ LEIA-ME-SERVIDOR.txt          (pré-requisito SQL + porta + IP fixo)
└─ ferramentas/
   ├─ nssm.exe                   (registro do serviço)
   └─ instalar-sql-express.txt   (link + passos, estratégia A)
```

Os clientes não baixam nada — recebem só o endereço `http://<IP>:4450` e o
[docs/README-TIME.md](docs/README-TIME.md) para instalar o ícone.

## 8. Esforço e riscos

| Item | Esforço | Risco |
|---|---|---|
| Script Inno Setup + bundle node | 1–2 dias | Baixo |
| Ajuste do serviço (NSSM/ONSTART) | 0,5 dia | Médio |
| Pré-requisito SQL (estratégia A) | 0,5 dia | Baixo |
| `CREATE DATABASE` + pré-gravar config | 0,5 dia | Baixo |
| Teste em VM limpa | 1–2 dias | — |
| **Total** | **~4–5 dias** | Concentrado no SQL |

Seed de dados de exemplo: **já feito** (não conta no esforço acima).

## 9. Vale a pena?

O instalador **não adiciona funcionalidade** — troca "seguir um guia uma vez"
por "clicar next". Compensa se você for **repetir a instalação** (vários
servidores, ou entregar para alguém não-técnico instalar). Para **uma máquina,
uma vez**, seguir o [docs/SERVIDOR-COMO-INSTALAR.md](docs/SERVIDOR-COMO-INSTALAR.md)
na mão é mais barato e sem risco.

## 10. Checklist de teste em VM limpa

- [ ] Windows limpo, sem Node e sem SQL.
- [ ] Instalar SQL Express (estratégia A) e rodar o `.exe`.
- [ ] Informar senha do admin no instalador.
- [ ] Reiniciar a VM **sem logar** e confirmar que `http://localhost:4450`
      responde (serviço subiu no boot).
- [ ] Login com o admin e a senha informada.
- [ ] Clicar "Criar / Verificar Tabelas" → todas presentes.
- [ ] Clicar "Carregar Dados de Exemplo" → setores/colaboradores/feriados
      aparecem; clicar de novo **não duplica** (idempotência).
- [ ] Acessar de outra máquina da rede pelo IP + instalar ícone (PWA).
