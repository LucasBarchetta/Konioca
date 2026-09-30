-- FAQ oficial v3 (30/09) e decisões que valem a partir dela:
--   termo padrão "pré-reserva"; não existe lote extra; vaga garantida só com a pré-reserva paga;
--   restante quitado no PIX ou financiado antes da entrega; frete por conta do cliente; gravação para quem se cadastrou.
-- Todo número e data da FAQ é placeholder lido da config, para nunca divergir da LP e para o Guardião conferir.
-- Item com humano=true: o agente não responde o mérito, passa para o time (a "resposta" é o que ele diz ao passar).
-- Item com humano_apos=true: responde com o fato e passa para o time se a pessoa pedir detalhe.

insert into public.config (chave, valor, publico, descricao) values
  ('garantia_meses',     '6',     true,  'Garantia da nova geração, em meses (FAQ 15)'),
  ('energia_requisito',  '"220 V, tomada de 20 A, de preferência em circuito próprio"', true, 'Requisito elétrico (FAQ 11)'),
  ('fundadora_nome',     '"Marcela Martins"', true, 'Nome da fundadora, usado na FAQ 21'),
  ('frete_regra',        '"O frete não está incluso: depende da região e é pago direto à transportadora."', true, 'Regra do frete (FAQ 16)'),
  ('gravacao_para',      '"todos"', false, 'todos | nao_assistiu. FAQ v3: a gravação vai para quem se cadastrou'),
  ('lote_extra',         'false', false, 'FAQ v3: não existe lote extra. Nenhuma mensagem ou regra pode citar um'),
  -- faq:inicio
  ('faq_oficial', '[
    {"id": 1,  "pergunta": "O que é a nova geração?", "resposta": "A evolução da máquina Konioca: mais eficiente, com mais tecnologia e com um valor muito mais acessível.", "humano": false, "humano_apos": false, "gatilhos": ["nova geração", "o que mudou", "diferença"]},
    {"id": 2,  "pergunta": "Quanto custa?", "resposta": "R$ {{preco_prevenda}} na pré-venda. A geração atual custa R$ {{preco_atual}}. O diferencial da pré-venda é ter acesso antes de todo mundo.", "humano": false, "humano_apos": true, "gatilhos": ["quanto custa", "preço", "valor", "custa"]},
    {"id": 3,  "pergunta": "Como é o pagamento?", "resposta": "Pré-reserva de R$ {{reserva_valor}} no PIX, que já conta no valor da máquina. Na assinatura do contrato, mais R$ {{entrada_valor}} (R$ {{pago_ate_assinatura}} pagos até ali). O restante, R$ {{restante_valor}}, precisa estar quitado no PIX, ou financiado, para a entrega da máquina, conforme o contrato. O financiamento é com o {{financiamento_parceiro}}, nosso parceiro: taxas e condições são tratadas direto com o banco, e o time faz a ponte.", "humano": false, "humano_apos": true, "gatilhos": ["pagamento", "parcela", "financ", "entrada", "pix", "bradesco", "juros", "taxa"]},
    {"id": 4,  "pergunta": "Como faço a pré-reserva?", "resposta": "Assista à live ({{live_dia_semana}}, {{live_ddmm}}, às {{live_hora}}) ou peça acesso imediato à vaga. Se for selecionado, o time te passa os próximos passos.", "humano": false, "humano_apos": true, "gatilhos": ["como faço", "reservar", "pré-reserva", "pre-reserva", "quero", "vaga"]},
    {"id": 5,  "pergunta": "Quando minha vaga fica garantida?", "resposta": "Quando você paga a pré-reserva. O link de pagamento chega {{circular_prazo_dias}} dias depois de você confirmar o recebimento da Circular de Oferta de Franquia, como pede a Lei de Franquias.", "humano": false, "humano_apos": false, "gatilhos": ["garantida", "quando pago", "link de pagamento", "circular"]},
    {"id": 6,  "pergunta": "É franquia?", "resposta": "Sim, a Franquia Inteligente Konioca: você compra a máquina e opera com a marca e o método Konioca.", "humano": false, "humano_apos": true, "gatilhos": ["franquia", "royalt", "taxa de franquia", "obrigaç"]},
    {"id": 7,  "pergunta": "Quando recebo?", "resposta": "Em até {{entrega_prazo_dias}} dias após a assinatura do contrato.", "humano": false, "humano_apos": false, "gatilhos": ["quando recebo", "prazo de entrega", "quando chega", "demora"]},
    {"id": 8,  "pergunta": "Até quando vai a pré-venda?", "resposta": "Até {{prevenda_fim_ddmm}}, às {{prevenda_fim_hora}}, ou antes, se as {{lote1_tamanho}} unidades esgotarem.", "humano": false, "humano_apos": false, "gatilhos": ["até quando", "prazo", "acaba", "encerra", "esgot"]},
    {"id": 9,  "pergunta": "Preciso ter um negócio?", "resposta": "Não. Dá para começar num ponto pequeno ou dentro do negócio de um parceiro.", "humano": false, "humano_apos": false, "gatilhos": ["ter um negócio", "ter negócio", "começar do zero", "não tenho ponto"]},
    {"id": 10, "pergunta": "Onde posso colocar?", "resposta": "Academia, cafeteria, lanchonete, cantina, conveniência, eventos e feiras.", "humano": false, "humano_apos": false, "gatilhos": ["onde", "colocar", "academia", "cafeteria", "lanchonete", "feira", "evento"]},
    {"id": 11, "pergunta": "Qual a energia?", "resposta": "{{energia_requisito}}.", "humano": false, "humano_apos": false, "gatilhos": ["energia", "voltagem", "220", "110", "tomada", "elétric"]},
    {"id": 12, "pergunta": "Quanto vou faturar?", "resposta": "Depende muito do ponto, do fluxo e da estratégia de cada um. Na live a Marcela mostra casos reais.", "humano": true, "humano_apos": false, "gatilhos": ["faturar", "faturamento", "lucro", "ganho", "retorno", "rende", "vende quanto", "margem"]},
    {"id": 13, "pergunta": "E os recheios e insumos?", "resposta": "No começo, indicamos parceiros. Depois de um período, os insumos passam a ser comprados direto da Konioca. É o que garante qualidade, padrão e logística.", "humano": false, "humano_apos": false, "gatilhos": ["recheio", "insumo", "tapioca", "matéria", "fornecedor"]},
    {"id": 14, "pergunta": "Tem treinamento e suporte?", "resposta": "Sim: manual, canal de atendimento e pessoas do time para ajudar quando precisar.", "humano": false, "humano_apos": false, "gatilhos": ["treinamento", "suporte", "ajuda", "manual", "assistência"]},
    {"id": 15, "pergunta": "Qual a garantia?", "resposta": "{{garantia_meses}} meses.", "humano": false, "humano_apos": false, "gatilhos": ["garantia"]},
    {"id": 16, "pergunta": "Entregam na minha cidade? E o frete?", "resposta": "Entregamos. {{frete_regra}}", "humano": false, "humano_apos": false, "gatilhos": ["frete", "minha cidade", "entregam", "transportadora"]},
    {"id": 17, "pergunta": "E se eu desistir?", "resposta": "As condições estão nos termos da pré-reserva, que você lê e aceita antes de pagar.", "humano": true, "humano_apos": false, "gatilhos": ["desistir", "cancelar", "devolu", "reembolso", "estorno", "arrepend"]},
    {"id": 18, "pergunta": "E se a entrega atrasar?", "resposta": "", "humano": true, "humano_apos": false, "gatilhos": ["atrasar", "atraso"]},
    {"id": 19, "pergunta": "Posso comprar mais de uma?", "resposta": "Sim.", "humano": false, "humano_apos": false, "gatilhos": ["mais de uma", "duas máquinas", "várias"]},
    {"id": 20, "pergunta": "A live fica gravada?", "resposta": "Sim, a gravação vai para quem se cadastrou.", "humano": false, "humano_apos": false, "gatilhos": ["gravada", "gravação", "não vou conseguir", "perder a live"]},
    {"id": 21, "pergunta": "A empresa é confiável?", "resposta": "{{empresa_razao}}, CNPJ {{empresa_cnpj}}, fundada pela {{fundadora_nome}}, com operações ativas.", "humano": false, "humano_apos": false, "gatilhos": ["confiável", "golpe", "cnpj", "empresa", "existe mesmo"]},
    {"id": 22, "pergunta": "Posso falar com uma pessoa?", "resposta": "Sim, a qualquer momento.", "humano": true, "humano_apos": false, "gatilhos": ["falar com", "pessoa", "humano", "atendente", "alguem", "robo", "ia", "inteligencia artificial", "automatico"]}
  ]', false, 'FAQ oficial v3. Placeholders {{chave}} vêm da config; humano=true passa para o time; humano_apos=true responde o fato e passa se pedirem detalhe')
  -- faq:fim
on conflict (chave) do update set valor = excluded.valor, publico = excluded.publico, descricao = excluded.descricao;

-- Sem lote extra: a linha 2 sai se nunca recebeu reserva; o lote 1 passa a ser o lote da pré-venda.
delete from public.lotes where id = 2 and not exists (select 1 from public.reservas where lote_id = 2);
update public.lotes set nome = 'Pré-venda' where id = 1;
update public.config set descricao = 'Máquinas da pré-venda (250). Não existe lote extra' where chave = 'lote1_tamanho';
update public.config set descricao = 'Gravação da live, enviada no dia seguinte a todos os convidados (FAQ v3)' where chave = 'live_gravacao_link';
update public.config set descricao = 'Hora (São Paulo) do envio da gravação no dia seguinte, para todos os convidados' where chave = 'gravacao_hora';
