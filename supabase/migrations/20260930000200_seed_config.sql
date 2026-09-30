-- Seed da configuração com os dados fixos do briefing.
-- Colchetes marcam o que um humano ainda precisa preencher.
-- Reaplicar é seguro: on conflict atualiza só descrição/publico, preserva valor editado.

insert into public.config (chave, valor, publico, descricao) values
  -- Preços (R$)
  ('preco_atual',           '25900', true,  'Preço da geração atual'),
  ('preco_prevenda',        '9900',  true,  'Preço da nova geração na pré-venda'),
  ('reserva_valor',         '1000',  true,  'Sinal da reserva, abatido na assinatura do contrato'),
  ('entrada_valor',         '5000',  true,  'Opção (a): valor pago na assinatura; o restante é parcelado'),
  ('parcelas_qtd',          '0',     true,  'Opção (a): número de parcelas do restante. 0 = mostrar só o valor'),
  ('preco_lancamento',      '"[A DEFINIR]"', false, 'Preço após 30/10. A LP só diz "preço de lançamento"'),

  -- Lote
  ('lote1_tamanho',         '250',   true,  'Lote 1: primeiras reservas, produzidas e entregues primeiro'),
  ('contador_visivel',      'false', true,  'Mostrar o contador de reservas na LP (ligar em 15/10)'),

  -- Datas (ISO com fuso de São Paulo)
  ('captacao_inicio',       '"2026-10-05T00:00:00-03:00"', true, 'Início da captação e aquecimento da base'),
  ('live_data',             '"2026-10-15T19:00:00-03:00"', true, 'Live de pré-lançamento'),
  ('live_duracao_min',      '60',    true,  'Duração prevista da live, para o convite de agenda'),
  ('live_plataforma',       '"Google Meet"', true, '[Google Meet ou YouTube não listado]'),
  ('live_link',             '"[LINK DA LIVE]"', false, 'Link da live. Só vai para o grupo e para o lembrete de 1h antes'),
  ('prevenda_inicio',       '"2026-10-15T19:00:00-03:00"', true, 'Abertura da pré-venda (fim da live)'),
  ('prevenda_fim',          '"2026-10-30T23:59:59-03:00"', true, 'Encerramento, sem prorrogação'),
  ('entrega_prazo_dias',    '120',   true,  'Entrega em até N dias após a assinatura do contrato'),
  ('turma_atual',           '"Turma de quinta · 15/10"', false, 'Turma registrada em cada lead novo'),

  -- Circular de Oferta de Franquia (Lei 13.966/2019)
  ('circular_prazo_dias',   '10',    true,  'Dias entre o recebimento da Circular e a liberação de qualquer pagamento'),
  ('circular_marco_recebimento', '"entrega"', false, 'Marco que conta como recebimento: entrega (webhook do provedor) ou confirmacao (clique do lead)'),
  ('circular_storage_path', '"circular/[Circular_Oferta_Franquia_Konioca.pdf]"', false, 'Caminho do PDF no bucket circular'),
  ('circular_assunto',      '"Sua Circular de Oferta de Franquia Konioca"', false, 'Assunto do e-mail'),

  -- Links
  ('lp_url',                '"https://[DOMINIO-DA-LP]"', true, 'URL pública da LP'),
  ('whatsapp_grupo_link',   '"https://chat.whatsapp.com/[LINK]"', true, 'Grupo/Comunidade da pré-venda'),
  ('politica_privacidade_url', '"#privacidade"', true, '[LINK] da política de privacidade'),
  ('termos_prevenda_url',   '"#privacidade"', true, '[LINK] dos termos da pré-venda'),

  -- Pixels
  ('meta_pixel_id',         '""',    true,  '[ID DO META PIXEL]'),
  ('tiktok_pixel_id',       '""',    true,  '[ID DO TIKTOK PIXEL]'),
  ('ga4_id',                '""',    true,  '[ID DO GA4, ex.: G-XXXX]'),

  -- Empresa (texto aprovado do rodapé)
  ('empresa_razao',         '"Konioca Franquias e Equipamentos Ltda"', true, 'Razão social'),
  ('empresa_cnpj',          '"51.071.802/0001-23"', true, 'CNPJ'),
  ('financiamento_parceiro','"Bradesco"', true, 'Nome aprovado para uso'),
  ('assinatura_time',       '"Time da Marcela"', true, 'Assinatura das mensagens'),

  -- E-mail
  ('email_from',            '"Time da Marcela <time@[DOMINIO]>"', false, 'Remetente verificado no Resend'),
  ('email_reply_to',        '"[EMAIL DE ATENDIMENTO]"', false, 'Responder para'),

  -- Sults
  ('sults_modo',            '"csv"', false, 'api | csv. Em csv, exportação diária para o bucket exports'),
  ('sults_endpoint',        '""',    false, '[URL do endpoint de leads da API de Expansão do Sults]'),
  ('sults_export_hora',     '"06:00"', false, 'Hora (São Paulo) da exportação diária em modo csv'),

  -- Grupo de controle e limites
  ('grupo_controle_pct',    '0.10',  false, 'Fração de leads fora das automações'),
  ('cadastro_limite_ip',    '{"janela_min": 10, "max": 8}', false, 'Limite de cadastros por IP por janela'),
  ('cors_origens',          '["https://[DOMINIO-DA-LP]", "http://localhost:8080"]', false, 'Origens aceitas pelas functions públicas'),

  -- Etapa 4 (já em configuração editável; os agentes chegam na etapa 4)
  ('score_pesos',           '{"checkout_parado":30,"abriu_pedido":25,"ficou_ate_oferta":20,"tem_ponto":10,"viu_gravacao":10,"entrou_comunidade":5,"clicou":5}', false, 'Pesos da nota'),
  ('score_meia_vida_dias',  '3',     false, 'S = soma(peso x sinal) x 2^(-dias_sem_acao/meia_vida)'),
  ('score_faixas',          '{"quente":70,"morno":40,"frio":15}', false, 'Limites inferiores das faixas'),
  ('msgs_max_semana',       '2',     false, 'Máximo de mensagens iniciadas pela empresa por semana por lead'),
  ('reativar_toques',       '3',     false, 'Toques antes de sair da régua'),
  ('reativar_dias_parado',  '7',     false, 'Dias parado para cair em reativar')
on conflict (chave) do update
  set publico = excluded.publico,
      descricao = excluded.descricao;

insert into public.lotes (id, nome, tamanho, aberto_em) values
  (1, 'Lote 1', 250, '2026-10-15T19:00:00-03:00'),
  (2, 'Lote extra', null, null)
on conflict (id) do nothing;
