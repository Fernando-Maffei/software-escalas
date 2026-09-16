-- Template de dados de exemplo ("dados-exemplo").
-- Serve para um banco recem-criado nao comecar vazio: cria alguns setores e
-- colaboradores de demonstracao.
--
-- Regras de seguranca deste script:
--   * E idempotente: cada INSERT so acontece se o registro ainda nao existir
--     (guardas IF NOT EXISTS pela chave natural). Rodar duas vezes nao duplica.
--   * NUNCA faz UPDATE nem DELETE em dados existentes. Se o usuario ja tem
--     colaboradores/feriados proprios, este seed nao os toca.
--   * Depende do schema ja aplicado (ver database/migrations); e executado
--     sempre DEPOIS de ensureApplicationSchema.

-- ----------------------------------------------------------------------------
-- Setores de exemplo (Implantacao e N1 ja vem do schema base)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'Atendimento')
BEGIN
    INSERT INTO dbo.Setores (Nome, Ordem) VALUES (N'Atendimento', 3);
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'Suporte')
BEGIN
    INSERT INTO dbo.Setores (Nome, Ordem) VALUES (N'Suporte', 4);
END;
GO

-- ----------------------------------------------------------------------------
-- Colaboradores de demonstracao (com jornada e horario de almoco)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Colaboradores WHERE Nome = N'Ana Souza (exemplo)')
BEGIN
    INSERT INTO dbo.Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim, SetorId)
    VALUES (N'Ana Souza (exemplo)', '08:00:00', '17:00:00', '12:00:00', '13:00:00',
        (SELECT TOP 1 Id FROM dbo.Setores WHERE Nome = N'Implantação'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Colaboradores WHERE Nome = N'Bruno Lima (exemplo)')
BEGIN
    INSERT INTO dbo.Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim, SetorId)
    VALUES (N'Bruno Lima (exemplo)', '09:00:00', '18:00:00', '12:00:00', '13:00:00',
        (SELECT TOP 1 Id FROM dbo.Setores WHERE Nome = N'N1'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Colaboradores WHERE Nome = N'Carla Dias (exemplo)')
BEGIN
    INSERT INTO dbo.Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim, SetorId)
    VALUES (N'Carla Dias (exemplo)', '08:00:00', '17:00:00', '13:00:00', '14:00:00',
        (SELECT TOP 1 Id FROM dbo.Setores WHERE Nome = N'Atendimento'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Colaboradores WHERE Nome = N'Diego Alves (exemplo)')
BEGIN
    INSERT INTO dbo.Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim, SetorId)
    VALUES (N'Diego Alves (exemplo)', '10:00:00', '19:00:00', '13:00:00', '14:00:00',
        (SELECT TOP 1 Id FROM dbo.Setores WHERE Nome = N'Suporte'));
END;
GO

-- ----------------------------------------------------------------------------
-- Feriados
-- ----------------------------------------------------------------------------
-- Nada a inserir aqui. Os feriados NACIONAIS sao calculados pelo sistema
-- (backend/utils/feriados-nacionais.js) e nao ficam na tabela: quando eram
-- gravados por este seed, o mesmo dia aparecia duas vezes na tela — uma vinda
-- do banco e outra da lista de nacionais. A tabela dbo.Feriados guarda somente
-- feriado municipal/estadual, que e o que o sistema nao tem como calcular.
