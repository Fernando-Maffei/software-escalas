-- Template de dados de exemplo ("dados-exemplo").
-- Serve para um banco recem-criado nao comecar vazio: cria alguns setores,
-- colaboradores de demonstracao e os feriados nacionais de 2026/2027.
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
-- Feriados nacionais (fixos + moveis) de 2026 e 2027.
-- Guarda por Data para nao duplicar em reexecucoes.
-- ----------------------------------------------------------------------------

-- 2026 --------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-01-01')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Confraternização Universal', '2026-01-01', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-02-17')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Carnaval', '2026-02-17', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-04-03')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Sexta-feira Santa', '2026-04-03', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-04-21')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Tiradentes', '2026-04-21', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-05-01')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Dia do Trabalho', '2026-05-01', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-06-04')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Corpus Christi', '2026-06-04', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-09-07')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Independência do Brasil', '2026-09-07', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-10-12')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Nossa Senhora Aparecida', '2026-10-12', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-11-02')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Finados', '2026-11-02', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-11-15')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Proclamação da República', '2026-11-15', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-11-20')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Dia da Consciência Negra', '2026-11-20', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2026-12-25')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Natal', '2026-12-25', 'nacional');
GO

-- 2027 --------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-01-01')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Confraternização Universal', '2027-01-01', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-02-09')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Carnaval', '2027-02-09', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-03-26')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Sexta-feira Santa', '2027-03-26', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-04-21')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Tiradentes', '2027-04-21', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-05-01')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Dia do Trabalho', '2027-05-01', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-05-27')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Corpus Christi', '2027-05-27', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-09-07')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Independência do Brasil', '2027-09-07', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-10-12')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Nossa Senhora Aparecida', '2027-10-12', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-11-02')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Finados', '2027-11-02', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-11-15')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Proclamação da República', '2027-11-15', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-11-20')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Dia da Consciência Negra', '2027-11-20', 'nacional');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Feriados WHERE Data = '2027-12-25')
    INSERT INTO dbo.Feriados (Nome, Data, Tipo) VALUES (N'Natal', '2027-12-25', 'nacional');
GO
