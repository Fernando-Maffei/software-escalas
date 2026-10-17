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

## Ideias para avaliar depois

- **Programa próprio nas máquinas do time (webviewer).** Um `.exe` pequeno
  (WebView2 ou Tauri) com a tela de conexão com o servidor, abrindo o sistema
  numa janela própria. Avaliado em 17/10/2026: viável (2 a 4 dias), mas exige
  certificado de assinatura (sem ele o Windows bloqueia o `.exe`), tratar
  download/impressão dos PDFs e manter um instalador e atualizações em cada PC.
  O `CRIAR-ATALHO.cmd` (Edge em modo aplicativo) entrega quase a mesma
  experiência sem nada disso. Reavaliar se surgir necessidade de modo quiosque,
  avisos nativos do Windows ou muitos PCs com usuários com dificuldade.

## Código antigo de referência

As duas branches de setembro foram descartadas porque eram do frontend antigo
(`frontend/Js/`, `runtime-fixes.js`) e não mergeavam mais. O código fica nas
etiquetas locais, só para consulta:

- `arquivo/lancamentos-anexos-setembro` (025c80c): itens 1 a 4.
- `arquivo/feriados-api-setembro` (fd59474): feriados nacionais pela API do
  app — já feito na `main` de outro jeito (`buscarFeriadosNacionais`).

Ver com `git show arquivo/lancamentos-anexos-setembro --stat`.
