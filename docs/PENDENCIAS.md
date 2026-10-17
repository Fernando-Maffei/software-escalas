# Pendências — depois do servidor no ar

Regra combinada em 17/10/2026: **nada novo entra até o servidor central estar
instalado e validado.** Depois, um item por vez: fazer, validar, deixar 100%,
só então o próximo.

## Bugs a conferir

1. **Feriado duplicado na mesma data.** Um feriado nacional e um feriado
   cadastrado no mesmo dia viram dois registros: duas tags no calendário, dois
   cards no modal, o dia repetido na agenda do dashboard e somado duas vezes
   no relatório. Ideia da correção antiga: a data vira a chave e o cadastrado
   prevalece sobre o nacional (`unificarFeriados`).
2. **Modal de lançamentos não abre a edição do feriado.** Clicar num feriado
   lançado não abria a edição (o id ia como texto e era comparado com `===`
   contra o número do banco), e os campos de banco de horas apareciam no modo
   feriado.

Antes de corrigir, reproduzir na `main` atual: o frontend mudou muito desde
setembro e pode já ter resolvido parte disso.

## Funcionalidades

3. **Desconto explícito no lançamento.** Trocar o checkbox "Descontar do banco
   de horas" por uma escolha "Descontar do saldo / Não descontar", com o total
   calculado pela jornada ao lado e aviso quando foge do padrão do tipo.
4. **Anexo de atestado/comprovante** em qualquer lançamento pessoal, opcional.
   Arquivo em disco (pasta configurável), banco guarda só metadado e caminho;
   nome do arquivo gerado pelo servidor. Exige migration nova e entrar no
   backup.

## Outros itens já conhecidos

- **Plantonista, Fase 4:** endpoint `/api/folgas-domingo/verificar` e
  legendas dos tipos novos no relatório de escala.
- **Botão "início automático" em Configurações** (`backend/lib/background-service.js`):
  cria a tarefa `CentralDeEscalasServidor` via `schtasks` sem o laço de
  reinício e com o limite padrão de 72 h de execução. Clicar nele num servidor
  instalado pelo `INSTALAR-SERVIDOR.cmd` troca a tarefa boa por essa. Alinhar
  com o instalador ou tirar o botão.
- **Versão na tela:** o menu lateral mostra `v1.6.0`
  (`frontend/index.html`), o `package.json` está em `1.6.3`.

## Código antigo de referência

As duas branches de setembro foram descartadas porque eram do frontend antigo
(`frontend/Js/`, `runtime-fixes.js`) e não mergeavam mais. O código fica nas
etiquetas locais, só para consulta:

- `arquivo/lancamentos-anexos-setembro` (025c80c): itens 1 a 4.
- `arquivo/feriados-api-setembro` (fd59474): feriados nacionais pela API do
  app — já feito na `main` de outro jeito (`buscarFeriadosNacionais`).

Ver com `git show arquivo/lancamentos-anexos-setembro --stat`.
