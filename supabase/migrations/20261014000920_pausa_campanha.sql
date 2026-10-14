-- Pausa da campanha da pré-venda (Lucas, 14/10 16h30). Idempotente.
-- O que esta migração faz: registra na config as chaves da pausa (a LP lê campanha_pausada pela public-config) e cria
-- em leads as colunas do "Avisado" da aba Turmas (quem escolheu horário recebe o aviso de adiamento à mão, pelo
-- WhatsApp; o time marca no painel quem já recebeu). Nada é apagado: leads, base antiga, fila, turmas e histórico ficam.
-- O desligamento em si (envios_ativos = false, secretaria_ativa = false, base_antiga_pausada = true, cron.alter_job
-- active = false, encontros.ativo = false) foi feito direto no banco em 14/10 e está descrito em docs/20-pausa-da-campanha.md.

insert into public.config (chave, valor, publico, descricao) values
  ('campanha_pausada', 'true'::jsonb, true, 'Pausa da campanha (Lucas, 14/10). true = LP e obrigado sem datas nem "Escolher meu horário", com texto de lista de espera. false = volta ao formato de encontros.'),
  ('campanha_pausada_em', to_jsonb('2026-10-14T16:30:00-03:00'::text), false, 'Quando a pausa começou (Lucas, 14/10).'),
  ('encontros_fechados_pausa', '[1,3,7,9]'::jsonb, false, 'Turmas que estavam abertas (ativo = true) quando a campanha foi pausada em 14/10. Na retomada: reabrir estas ou criar agenda nova.'),
  ('crons_pausados_campanha', '["fila-processar","circular-lembrete","perguntas-selecionar","secretaria-marcela","email-time-retentar","fila-429-devolver"]'::jsonb, false, 'Crons desligados na pausa de 14/10 (cron.alter_job active = false). Na retomada: religar estes, nesta ordem inversa à do desligamento.')
on conflict (chave) do update set valor = excluded.valor, publico = excluded.publico, descricao = excluded.descricao, atualizado_em = now();

-- "Avisado" da aba Turmas: quem do time avisou a pessoa do adiamento, e quando. Só a painel-api (chave de serviço) grava.
alter table public.leads
  add column if not exists adiamento_avisado_em timestamptz,
  add column if not exists adiamento_avisado_por text;
comment on column public.leads.adiamento_avisado_em is 'Pausa de 14/10: quando o time avisou esta pessoa, pelo WhatsApp, que o encontro escolhido mudou de data (botão "Avisado" do painel).';
comment on column public.leads.adiamento_avisado_por is 'Quem marcou "Avisado" no painel (assinatura do aprovador).';
