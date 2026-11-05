-- Assinaturas do G7 Pulse cobradas pelo Asaas (módulo visível só para administradores do sistema).
-- A conta Asaas pertence à empresa operadora (CNPJ 51.602.895/0001-75); a config fica em integracoes dessa empresa.

create table if not exists planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  valor_mensal numeric(12,2) not null check (valor_mensal >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references empresas(id) on delete cascade,
  plano_id uuid references planos(id),
  valor numeric(12,2) not null,
  forma text not null default 'UNDEFINED' check (forma in ('UNDEFINED','BOLETO','PIX','CREDIT_CARD')),
  ciclo text not null default 'MONTHLY' check (ciclo in ('MONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY')),
  status text not null default 'pendente' check (status in ('pendente','ativa','em_atraso','cancelada')),
  email_cobranca text,
  asaas_customer_id text,
  asaas_subscription_id text unique,
  proximo_vencimento date,
  link_pagamento text,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists assinatura_cobrancas (
  asaas_payment_id text primary key,
  assinatura_id uuid references assinaturas(id) on delete cascade,
  valor numeric(12,2),
  vencimento date,
  status text,
  forma text,
  link text,
  pago_em date,
  atualizado_em timestamptz not null default now()
);

create table if not exists asaas_eventos (
  id bigserial primary key,
  evento_id text unique,
  evento text,
  payment_id text,
  subscription_id text,
  payload jsonb,
  recebido_em timestamptz not null default now()
);

alter table planos enable row level security;
alter table assinaturas enable row level security;
alter table assinatura_cobrancas enable row level security;
alter table asaas_eventos enable row level security;

create policy planos_ler on planos for select to authenticated using (true);
create policy planos_admin on planos for all to authenticated using ((select e_superadmin())) with check ((select e_superadmin()));
create policy assin_ler on assinaturas for select to authenticated using ((select e_superadmin()) or e_admin(empresa_id));
create policy assin_admin on assinaturas for all to authenticated using ((select e_superadmin())) with check ((select e_superadmin()));
create policy cob_ler on assinatura_cobrancas for select to authenticated
  using ((select e_superadmin()) or exists (select 1 from assinaturas a where a.id = assinatura_id and e_admin(a.empresa_id)));
create policy cob_admin on assinatura_cobrancas for all to authenticated using ((select e_superadmin())) with check ((select e_superadmin()));
create policy evt_admin on asaas_eventos for select to authenticated using ((select e_superadmin()));

-- administrador do sistema enxerga todas as empresas e ajusta plano/situação
create policy empresas_superadmin_ler on empresas for select to authenticated using ((select e_superadmin()));
create policy empresas_superadmin_editar on empresas for update to authenticated using ((select e_superadmin())) with check ((select e_superadmin()));

-- Config Asaas (chave da API e token do webhook no Vault)
create or replace function salvar_asaas_config(p_empresa uuid, p_ambiente text, p_api_key text)
returns text language plpgsql security definer set search_path = public as $$
declare r integracoes%rowtype; tok text;
begin
  if not e_superadmin() then raise exception 'Apenas o administrador do sistema configura o Asaas'; end if;
  insert into integracoes (empresa_id) values (p_empresa) on conflict (empresa_id) do nothing;
  select * into r from integracoes where empresa_id = p_empresa for update;
  if coalesce(p_api_key, '') <> '' then
    if r.asaas_api_key_secret is not null then perform vault.update_secret(r.asaas_api_key_secret, p_api_key);
    else r.asaas_api_key_secret := vault.create_secret(p_api_key, 'asaas_api_' || p_empresa, 'Chave API Asaas'); end if;
  end if;
  if r.asaas_webhook_token_secret is null then
    tok := encode(extensions.gen_random_bytes(24), 'hex');
    r.asaas_webhook_token_secret := vault.create_secret(tok, 'asaas_webhook_' || p_empresa, 'Token do webhook Asaas');
  end if;
  update integracoes set asaas_ambiente = case when p_ambiente = 'producao' then 'producao' else 'sandbox' end,
    asaas_api_key_secret = r.asaas_api_key_secret, asaas_webhook_token_secret = r.asaas_webhook_token_secret,
    asaas_ativo = r.asaas_api_key_secret is not null, atualizado_em = now()
  where empresa_id = p_empresa;
  return (select decrypted_secret from vault.decrypted_secrets where id = r.asaas_webhook_token_secret);
end $$;

-- Token do webhook (para exibir ao administrador)
create or replace function asaas_webhook_token(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.decrypted_secret from integracoes i join vault.decrypted_secrets s on s.id = i.asaas_webhook_token_secret
  where i.empresa_id = p_empresa and e_superadmin()
$$;

-- Chave da API para o servidor (exige a chave de serviço)
create or replace function obter_asaas_config(p_empresa uuid, p_chave text)
returns table (ambiente text, api_key text)
language plpgsql security definer set search_path = public as $$
declare chave text;
begin
  select decrypted_secret into chave from vault.decrypted_secrets where name = 'nfse_chave_servico';
  if chave is null or p_chave is distinct from chave then raise exception 'Chave de serviço inválida'; end if;
  if auth.uid() is not null and not e_superadmin() then raise exception 'Sem permissão'; end if;
  return query select i.asaas_ambiente, (select decrypted_secret from vault.decrypted_secrets where id = i.asaas_api_key_secret)
    from integracoes i where i.empresa_id = p_empresa;
end $$;

-- Atualiza cobrança/assinatura a partir de um objeto payment do Asaas
create or replace function asaas_aplicar_pagamento(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a assinaturas%rowtype; st text; novo text;
begin
  if auth.uid() is not null and not e_superadmin() then raise exception 'Sem permissão'; end if;
  select * into a from assinaturas where asaas_subscription_id = p->>'subscription';
  if a.id is null then return; end if;
  st := p->>'status';
  insert into assinatura_cobrancas (asaas_payment_id, assinatura_id, valor, vencimento, status, forma, link, pago_em, atualizado_em)
  values (p->>'id', a.id, (p->>'value')::numeric, (p->>'dueDate')::date, st, p->>'billingType', p->>'invoiceUrl',
          coalesce(p->>'clientPaymentDate', p->>'paymentDate')::date, now())
  on conflict (asaas_payment_id) do update set valor = excluded.valor, vencimento = excluded.vencimento, status = excluded.status,
    forma = excluded.forma, link = excluded.link, pago_em = excluded.pago_em, atualizado_em = now();

  if a.status = 'cancelada' then return; end if;
  novo := case
    when exists (select 1 from assinatura_cobrancas where assinatura_id = a.id and status = 'OVERDUE') then 'em_atraso'
    when exists (select 1 from assinatura_cobrancas where assinatura_id = a.id and status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')) then 'ativa'
    else 'pendente' end;
  update assinaturas set status = novo, atualizado_em = now(),
    proximo_vencimento = (select min(vencimento) from assinatura_cobrancas where assinatura_id = a.id and status in ('PENDING','OVERDUE')),
    link_pagamento = coalesce((select link from assinatura_cobrancas where assinatura_id = a.id and status in ('PENDING','OVERDUE') order by vencimento limit 1), link_pagamento)
  where id = a.id;
  update empresas set assinatura_status = case novo when 'ativa' then 'ativa' when 'em_atraso' then 'em_atraso' else assinatura_status end
  where id = a.empresa_id;
end $$;

-- Webhook público: valida o token enviado pelo Asaas e processa o evento (idempotente por id do evento)
create or replace function asaas_webhook(p_token text, p_evento jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare ok boolean; ev text := p_evento->>'event'; sub text;
begin
  select exists (select 1 from integracoes i join vault.decrypted_secrets s on s.id = i.asaas_webhook_token_secret
                 where s.decrypted_secret = p_token) into ok;
  if not coalesce(ok, false) then raise exception 'token inválido'; end if;
  sub := coalesce(p_evento->'payment'->>'subscription', p_evento->'subscription'->>'id');
  insert into asaas_eventos (evento_id, evento, payment_id, subscription_id, payload)
  values (p_evento->>'id', ev, p_evento->'payment'->>'id', sub, p_evento)
  on conflict (evento_id) do nothing;
  if not found then return 'duplicado'; end if;
  if p_evento ? 'payment' then perform asaas_aplicar_pagamento(p_evento->'payment'); end if;
  if ev in ('SUBSCRIPTION_DELETED','SUBSCRIPTION_INACTIVATED') then
    update assinaturas set status = 'cancelada', atualizado_em = now() where asaas_subscription_id = sub;
    update empresas set assinatura_status = 'cancelada' where id = (select empresa_id from assinaturas where asaas_subscription_id = sub);
  end if;
  return 'ok';
end $$;

revoke execute on function salvar_asaas_config(uuid, text, text), asaas_webhook_token(uuid), asaas_aplicar_pagamento(jsonb) from public, anon;
grant execute on function salvar_asaas_config(uuid, text, text), asaas_webhook_token(uuid), asaas_aplicar_pagamento(jsonb) to authenticated;
revoke execute on function obter_asaas_config(uuid, text), asaas_webhook(text, jsonb) from public;
grant execute on function obter_asaas_config(uuid, text), asaas_webhook(text, jsonb) to anon, authenticated;
