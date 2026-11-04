-- Emissor NFS-e Nacional: numeração da DPS, notas de teste e leitura do certificado pelo servidor.
alter table integracoes
  add column if not exists nfse_serie text not null default '900',
  add column if not exists nfse_ultimo_dps_restrita bigint not null default 0,
  add column if not exists nfse_ultimo_dps_producao bigint not null default 0,
  add column if not exists nfse_cnbs_padrao text,
  add column if not exists nfse_descricao_padrao text;

alter table notas_fiscais
  add column if not exists ambiente text not null default 'producao' check (ambiente in ('producao','producao_restrita')),
  add column if not exists dps_id text,
  add column if not exists erros jsonb;

-- Notas de teste (produção restrita) são gravadas com série prefixada por 'R' para não colidir com as reais.

-- Reserva o próximo número de DPS (atômico)
create or replace function reservar_dps_nfse(p_empresa uuid, p_ambiente text)
returns table (serie text, numero bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar(p_empresa) then raise exception 'Sem permissão para emitir nota nesta empresa'; end if;
  if p_ambiente = 'producao' then
    return query update integracoes i set nfse_ultimo_dps_producao = i.nfse_ultimo_dps_producao + 1
      where i.empresa_id = p_empresa returning i.nfse_serie, i.nfse_ultimo_dps_producao;
  else
    return query update integracoes i set nfse_ultimo_dps_restrita = i.nfse_ultimo_dps_restrita + 1
      where i.empresa_id = p_empresa returning i.nfse_serie, i.nfse_ultimo_dps_restrita;
  end if;
end $$;

-- Entrega o certificado somente ao servidor do app (que conhece a chave de serviço) e a quem pode editar a empresa
create or replace function obter_certificado_nfse(p_empresa uuid, p_chave text)
returns table (pfx_base64 text, senha text)
language plpgsql security definer set search_path = public as $$
declare chave text;
begin
  select decrypted_secret into chave from vault.decrypted_secrets where name = 'nfse_chave_servico';
  if chave is null or p_chave is distinct from chave then raise exception 'Chave de serviço inválida'; end if;
  if not pode_editar(p_empresa) then raise exception 'Sem permissão para emitir nota nesta empresa'; end if;
  return query
    select (select decrypted_secret from vault.decrypted_secrets where id = i.nfse_certificado_secret),
           (select decrypted_secret from vault.decrypted_secrets where id = i.nfse_certificado_senha_secret)
    from integracoes i where i.empresa_id = p_empresa;
end $$;

revoke execute on function reservar_dps_nfse(uuid, text) from public, anon;
revoke execute on function obter_certificado_nfse(uuid, text) from public, anon;
grant execute on function reservar_dps_nfse(uuid, text) to authenticated;
grant execute on function obter_certificado_nfse(uuid, text) to authenticated;
