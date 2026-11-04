-- =====================================================================
-- G7 Pulse · Esquema inicial (fase 1)
-- Postgres 15+ / Supabase. Multiempresa com isolamento por Row Level Security.
-- Toda tabela de negócio tem empresa_id; o acesso é decidido pela tabela vinculos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tipos ----------
create type papel_usuario as enum ('administrador','financeiro','operador_bpo','gestor','contador');
create type tipo_usuario  as enum ('empresa','bpo');
create type tipo_titulo   as enum ('pagar','receber');
create type tipo_conta    as enum ('corrente','poupanca','aplicacao','caixa','cartao_credito','gateway');
create type origem_baixa  as enum ('manual','asaas','importacao','conciliacao');
create type origem_nota   as enum ('portal_nacional','upload_pdf','intermediario','importacao');
create type status_nota   as enum ('autorizada','cancelada','substituida','pendente','rejeitada');

-- ---------- Empresas e usuários ----------
create table empresas (
  id              uuid primary key default gen_random_uuid(),
  razao_social    text not null,
  nome_fantasia   text,
  cnpj            text unique,
  inscricao_municipal text,
  regime_tributario text check (regime_tributario in ('MEI','Simples Nacional','Lucro Presumido','Lucro Real')),
  municipio       text,
  municipio_ibge  text,
  uf              char(2),
  plano           text default 'teste',
  assinatura_status text default 'trial' check (assinatura_status in ('trial','ativa','em_atraso','suspensa','cancelada')),
  asaas_subscription_id text,
  criado_em       timestamptz not null default now()
);

-- perfil público do usuário (1:1 com auth.users do Supabase)
create table perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text not null,
  tipo       tipo_usuario not null default 'empresa',
  criado_em  timestamptz not null default now()
);

create table vinculos (
  usuario_id uuid not null references perfis(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  papel      papel_usuario not null,
  convidado_por uuid references perfis(id),
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

create table convites (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  email      text not null,
  papel      papel_usuario not null,
  token      text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
  expira_em  timestamptz not null default now() + interval '7 days',
  aceito_em  timestamptz,
  criado_por uuid references perfis(id)
);

-- ---------- Funções de permissão (usadas nas políticas RLS) ----------
create or replace function papel_em(e uuid) returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from vinculos where usuario_id = auth.uid() and empresa_id = e
$$;

create or replace function tem_acesso(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from vinculos where usuario_id = auth.uid() and empresa_id = e)
$$;

create or replace function pode_editar(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(papel_em(e) in ('administrador','financeiro','operador_bpo'), false)
$$;

create or replace function e_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(papel_em(e) = 'administrador', false)
$$;

-- ---------- Cadastros ----------
create table contas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  tipo          tipo_conta not null default 'corrente',
  banco         text,
  agencia       text,
  numero        text,
  dv            text,
  tipo_pessoa   char(2) default 'PJ' check (tipo_pessoa in ('PJ','PF')),
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Plano de contas em 3 níveis: 01 / 01.01 / 01.01.01. Só o 3º nível recebe lançamentos.
create table categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  codigo      text not null check (codigo ~ '^\d{2}(\.\d{2}){0,2}$'),
  nome        text not null,
  nivel       smallint generated always as (array_length(string_to_array(codigo,'.'),1)) stored,
  grupo       text generated always as (split_part(codigo,'.',1)) stored,
  subgrupo    text generated always as (case when codigo like '__.__%' then left(codigo,5) end) stored,
  ativa       boolean not null default true,
  unique (empresa_id, codigo)
);

-- Clientes e fornecedores na mesma tabela (a planilha já marca "É fornecedor?")
create table pessoas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  codigo        integer,
  cnpj_cpf      text,
  razao_social  text not null,
  nome_fantasia text,
  e_cliente     boolean not null default false,
  e_fornecedor  boolean not null default false,
  ddd           text,
  telefone      text,
  email         text,
  segmento      text,
  cep           text,
  uf            char(2),
  cidade        text,
  bairro        text,
  logradouro    text,
  numero        text,
  complemento   text,
  inscricao_municipal text,
  chave_pix     text,
  ativo         boolean not null default true,
  asaas_customer_id text,
  criado_em     timestamptz not null default now(),
  check (e_cliente or e_fornecedor)
);
create index on pessoas (empresa_id, razao_social);
create unique index pessoas_doc_unq on pessoas (empresa_id, cnpj_cpf) where cnpj_cpf is not null and cnpj_cpf <> '';

create table contatos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  pessoa_id    uuid not null references pessoas(id) on delete cascade,
  nome         text not null,
  cargo        text,
  data_nascimento date,
  email        text,
  ddi          text default '+55',
  telefone     text,
  observacoes  text,
  principal    boolean not null default false,
  enviar_nfse  boolean not null default false,
  enviar_boleto boolean not null default false
);

-- ---------- Títulos (contas a pagar e a receber) ----------
create table titulos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id) on delete cascade,
  tipo              tipo_titulo not null,
  documento_id_origem bigint,            -- "Documento ID" do sistema anterior
  documento         text,
  descricao         text,
  observacoes       text,
  categoria_id      uuid not null references categorias(id),
  pessoa_id         uuid references pessoas(id),
  conta_id          uuid references contas_bancarias(id),
  centro_custo      text,
  projeto           text,
  tipo_gasto        text check (tipo_gasto in ('Fixo','Variável')),
  forma_cobranca    text,
  data_emissao      date not null,       -- competência
  vencimento        date not null,
  valor_original    numeric(14,2) not null check (valor_original >= 0),
  desconto          numeric(14,2) not null default 0,
  acrescimo         numeric(14,2) not null default 0,
  agendamento_status text default 'Sem Agendamento',
  agendamento_data  date,
  agendamento_liquidacao date,
  codigo_referencia text,
  ordem_compra      text,
  ordem_servico     text,
  chave_pix         text,
  recorrencia_id    uuid,                -- liga parcelas/meses criados juntos
  asaas_payment_id  text,
  link_cobranca     text,
  ultimo_email_enviado timestamptz,
  criado_por        uuid references perfis(id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index on titulos (empresa_id, tipo, vencimento);
create index on titulos (empresa_id, categoria_id);
create unique index titulos_asaas_unq on titulos (asaas_payment_id) where asaas_payment_id is not null;

-- Baixas: permite baixa parcial e várias formas de quitação
create table baixas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  titulo_id   uuid not null references titulos(id) on delete cascade,
  data        date not null,
  valor       numeric(14,2) not null check (valor > 0),
  conta_id    uuid not null references contas_bancarias(id),
  origem      origem_baixa not null default 'manual',
  referencia_externa text,
  criado_por  uuid references perfis(id),
  criado_em   timestamptz not null default now()
);
create index on baixas (empresa_id, data);
create index on baixas (titulo_id);

-- ---------- Notas fiscais de serviço ----------
create table notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  titulo_id     uuid references titulos(id) on delete set null,
  pessoa_id     uuid references pessoas(id),
  numero        text not null,
  serie         text,
  data_emissao  date not null,
  valor         numeric(14,2),
  origem        origem_nota not null,
  status        status_nota not null default 'autorizada',
  chave_acesso  text,
  codigo_tributacao_nacional text,
  aliquota_iss  numeric(5,2),
  iss_retido    boolean default false,
  pdf_path      text,     -- caminho no Storage (bucket notas/<empresa_id>/...)
  xml_path      text,
  pdf_url_externo text,
  xml_url_externo text,
  motivo_cancelamento text,
  criado_por    uuid references perfis(id),
  criado_em     timestamptz not null default now(),
  unique (empresa_id, numero, serie)
);

-- ---------- Integrações (segredos ficam no Supabase Vault; aqui só a referência) ----------
create table integracoes (
  empresa_id        uuid primary key references empresas(id) on delete cascade,
  asaas_ambiente    text default 'sandbox' check (asaas_ambiente in ('sandbox','producao')),
  asaas_api_key_secret uuid,     -- id do segredo em vault.secrets
  asaas_webhook_token_secret uuid,
  asaas_ativo       boolean not null default false,
  asaas_auto_cobranca boolean not null default true,
  nfse_ambiente     text default 'producao_restrita' check (nfse_ambiente in ('producao_restrita','producao')),
  nfse_certificado_secret uuid,  -- .pfx criptografado
  nfse_certificado_senha_secret uuid,
  nfse_certificado_validade date,
  nfse_codigo_tributacao_padrao text,
  nfse_aliquota_iss_padrao numeric(5,2),
  nfse_ativo        boolean not null default false,
  atualizado_em     timestamptz not null default now()
);

-- ---------- Auditoria ----------
create table auditoria (
  id         bigserial primary key,
  empresa_id uuid,
  tabela     text not null,
  registro_id uuid,
  acao       text not null check (acao in ('INSERT','UPDATE','DELETE')),
  usuario_id uuid,
  antes      jsonb,
  depois     jsonb,
  em         timestamptz not null default now()
);
create index on auditoria (empresa_id, em desc);

create or replace function fn_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (empresa_id, tabela, registro_id, acao, usuario_id, antes, depois)
  values (coalesce(new.empresa_id, old.empresa_id), tg_table_name, coalesce(new.id, old.id), tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger aud_titulos  after insert or update or delete on titulos  for each row execute function fn_auditoria();
create trigger aud_baixas   after insert or update or delete on baixas   for each row execute function fn_auditoria();
create trigger aud_notas    after insert or update or delete on notas_fiscais for each row execute function fn_auditoria();
create trigger aud_contas   after insert or update or delete on contas_bancarias for each row execute function fn_auditoria();

create or replace function fn_atualizado_em() returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger upd_titulos before update on titulos for each row execute function fn_atualizado_em();

-- Garante que título, categoria, pessoa e conta são da mesma empresa
create or replace function fn_mesma_empresa() returns trigger language plpgsql set search_path = public as $$
begin
  if (select empresa_id from categorias where id = new.categoria_id) <> new.empresa_id
     or (new.pessoa_id is not null and (select empresa_id from pessoas where id = new.pessoa_id) <> new.empresa_id)
     or (new.conta_id  is not null and (select empresa_id from contas_bancarias where id = new.conta_id) <> new.empresa_id)
  then raise exception 'Categoria, pessoa e conta devem pertencer à mesma empresa do título'; end if;
  if (select nivel from categorias where id = new.categoria_id) <> 3
  then raise exception 'Lançamentos só podem usar categorias de 3º nível'; end if;
  return new;
end $$;
create trigger chk_titulos before insert or update on titulos for each row execute function fn_mesma_empresa();

create or replace function fn_baixa_empresa() returns trigger language plpgsql set search_path = public as $$
begin
  if (select empresa_id from titulos where id = new.titulo_id) <> new.empresa_id
     or (select empresa_id from contas_bancarias where id = new.conta_id) <> new.empresa_id
  then raise exception 'Baixa, título e conta devem ser da mesma empresa'; end if;
  return new;
end $$;
create trigger chk_baixas before insert or update on baixas for each row execute function fn_baixa_empresa();

-- ---------- Views ----------
-- Situação de cada título (status calculado, nunca gravado à mão)
create or replace view v_titulos with (security_invoker = true) as
select t.*,
       c.codigo as categoria_codigo, c.nome as categoria_nome, c.subgrupo, c.grupo,
       p.razao_social, p.nome_fantasia,
       coalesce(b.valor_baixado,0) as valor_baixado,
       b.ultima_baixa as data_quitacao,
       greatest(t.valor_original - t.desconto + t.acrescimo - coalesce(b.valor_baixado,0), 0) as saldo,
       case when t.valor_original - t.desconto + t.acrescimo - coalesce(b.valor_baixado,0) <= 0.005 then 'Quitado'
            when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'Atrasado'
            else 'Pendente' end as status
from titulos t
join categorias c on c.id = t.categoria_id
left join pessoas p on p.id = t.pessoa_id
left join lateral (select sum(valor) valor_baixado, max(data) ultima_baixa from baixas where titulo_id = t.id) b on true;

-- Saldo atual por conta
create or replace view v_saldo_contas with (security_invoker = true) as
select cb.id, cb.empresa_id, cb.nome, cb.tipo, cb.ativa, cb.saldo_inicial,
       coalesce(sum(case when t.tipo='receber' then b.valor end),0) as entradas,
       coalesce(sum(case when t.tipo='pagar'   then b.valor end),0) as saidas,
       cb.saldo_inicial + coalesce(sum(case when t.tipo='receber' then b.valor else -b.valor end),0) as saldo
from contas_bancarias cb
left join baixas b on b.conta_id = cb.id and (cb.data_saldo_inicial is null or b.data >= cb.data_saldo_inicial)
left join titulos t on t.id = b.titulo_id
group by cb.id;

-- Linha da DRE gerencial pelo 2º nível do plano de contas
create or replace function linha_dre(codigo text) returns text language sql immutable set search_path = public as $$
  select case
    when codigo like '01%'    then '01 Receitas operacionais'
    when codigo like '02.01%' then '02 Impostos sobre serviços'
    when codigo like '02.02%' then '03 Custos da prestação de serviço'
    when codigo like '02.03%' or codigo like '02.04%' then '04 Pessoal'
    when codigo like '02.05%' then '05 Marketing e vendas'
    when codigo like '02.06%' then '06 Administrativas'
    when codigo like '02.07%' then '07 Despesas financeiras'
    when codigo like '03%'    then '08 Entradas não operacionais'
    when codigo like '04%'    then '09 Saídas não operacionais'
    when codigo like '05%'    then '10 Distribuição de lucros'
  end
$$;

-- DRE mensal nos dois regimes. Valores com sinal: receitas +, despesas −.
create or replace view v_dre_mensal with (security_invoker = true) as
select t.empresa_id, 'caixa'::text as regime, date_trunc('month', b.data)::date as mes,
       c.codigo, c.nome, linha_dre(c.codigo) as linha,
       sum(case when t.tipo='receber' then b.valor else -b.valor end) as valor
from baixas b join titulos t on t.id = b.titulo_id join categorias c on c.id = t.categoria_id
group by 1,2,3,4,5,6
union all
select t.empresa_id, 'competencia', date_trunc('month', t.data_emissao)::date,
       c.codigo, c.nome, linha_dre(c.codigo),
       sum(case when t.tipo='receber' then 1 else -1 end * (t.valor_original - t.desconto + t.acrescimo))
from titulos t join categorias c on c.id = t.categoria_id
group by 1,2,3,4,5,6;

-- ---------- Row Level Security ----------
alter table empresas         enable row level security;
alter table perfis           enable row level security;
alter table vinculos         enable row level security;
alter table convites         enable row level security;
alter table contas_bancarias enable row level security;
alter table categorias       enable row level security;
alter table pessoas          enable row level security;
alter table contatos         enable row level security;
alter table titulos          enable row level security;
alter table baixas           enable row level security;
alter table notas_fiscais    enable row level security;
alter table integracoes      enable row level security;
alter table auditoria        enable row level security;

create policy empresas_ler    on empresas for select using (tem_acesso(id));
create policy empresas_editar on empresas for update using (e_admin(id));

create policy perfis_ler on perfis for select using (
  id = auth.uid() or exists (select 1 from vinculos v1 join vinculos v2 on v1.empresa_id = v2.empresa_id
                             where v1.usuario_id = auth.uid() and v2.usuario_id = perfis.id));
create policy perfis_editar on perfis for update using (id = auth.uid());

create policy vinculos_ler   on vinculos for select using (usuario_id = auth.uid() or tem_acesso(empresa_id));
create policy vinculos_admin on vinculos for all    using (e_admin(empresa_id)) with check (e_admin(empresa_id));
create policy convites_admin on convites for all    using (e_admin(empresa_id)) with check (e_admin(empresa_id));

-- tabelas operacionais: lê quem tem vínculo, escreve quem pode editar
do $$ declare t text; begin
  foreach t in array array['contas_bancarias','categorias','pessoas','contatos','titulos','baixas','notas_fiscais'] loop
    execute format('create policy %1$s_ler on %1$s for select using (tem_acesso(empresa_id))', t);
    execute format('create policy %1$s_inserir on %1$s for insert with check (pode_editar(empresa_id))', t);
    execute format('create policy %1$s_alterar on %1$s for update using (pode_editar(empresa_id)) with check (pode_editar(empresa_id))', t);
    execute format('create policy %1$s_excluir on %1$s for delete using (pode_editar(empresa_id))', t);
  end loop;
end $$;

create policy integracoes_ler on integracoes for select using (papel_em(empresa_id) in ('administrador','operador_bpo'));
create policy integracoes_gravar on integracoes for all using (papel_em(empresa_id) in ('administrador','operador_bpo'))
  with check (papel_em(empresa_id) in ('administrador','operador_bpo'));
create policy auditoria_ler on auditoria for select using (papel_em(empresa_id) in ('administrador','operador_bpo','contador'));

-- ---------- Criação de empresa: quem cria vira administrador ----------
create or replace function criar_empresa(p_razao text, p_fantasia text, p_cnpj text, p_modelo uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nova uuid;
begin
  if auth.uid() is null then raise exception 'Login obrigatório'; end if;
  insert into empresas (razao_social, nome_fantasia, cnpj) values (p_razao, p_fantasia, p_cnpj) returning id into nova;
  insert into vinculos (usuario_id, empresa_id, papel)
    values (auth.uid(), nova, 'administrador');  -- quem cria administra; o BPO depois convida o dono
  -- copia o plano de contas de uma empresa modelo (ex.: o padrão G7 Pulse para serviços)
  if p_modelo is not null then
    insert into categorias (empresa_id, codigo, nome) select nova, codigo, nome from categorias where empresa_id = p_modelo;
  end if;
  return nova;
end $$;

-- Novo usuário do Supabase Auth ganha perfil automaticamente
create or replace function fn_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, tipo)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.email, coalesce((new.raw_user_meta_data->>'tipo')::tipo_usuario, 'empresa'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function fn_novo_usuario();
