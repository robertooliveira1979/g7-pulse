\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- usuários de teste
insert into auth.users values ('00000000-0000-0000-0000-0000000000b1','roberto.oliveira@marvee.com.br','{"full_name":"Roberto Oliveira","tipo":"bpo"}'),
                              ('00000000-0000-0000-0000-0000000000c2','intruso@exemplo.com','{"full_name":"Outra Pessoa"}');
insert into vinculos values ('00000000-0000-0000-0000-0000000000b1','31b80772-10f3-5ecf-99be-c9f475f09d2e','operador_bpo');
\echo '--- Conferência dos totais (como service role) ---'
select tipo, count(*) titulos, sum(valor_original) valor from titulos group by tipo order by tipo;
select nome, saldo_inicial, entradas, saidas, saldo from v_saldo_contas order by nome;
select linha, sum(valor) from v_dre_mensal where regime='caixa' and mes >= '2026-01-01' group by linha order by linha;
select status, count(*) from v_titulos group by status order by status;
\echo '--- RLS: usuário BPO vinculado ---'
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select count(*) as titulos_visiveis from titulos;
select count(*) as empresas_visiveis from empresas;
\echo '--- RLS: usuário sem vínculo ---'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2',false);
select count(*) as titulos_visiveis from titulos;
select count(*) as saldo_visivel from v_saldo_contas;
\echo '--- RLS: sem vínculo tentando inserir (deve falhar) ---'
\set ON_ERROR_STOP off
insert into titulos (empresa_id,tipo,categoria_id,data_emissao,vencimento,valor_original) select empresa_id,'pagar',id,current_date,current_date,1 from categorias limit 1;
\set ON_ERROR_STOP on
\echo '--- Usuário sem vínculo cria a própria empresa ---'
select criar_empresa('Nova Ltda','Nova','11.111.111/0001-11','31b80772-10f3-5ecf-99be-c9f475f09d2e') is not null as criou;
reset role;
select count(*) categorias_copiadas from categorias c join empresas e on e.id=c.empresa_id where e.cnpj='11.111.111/0001-11';
select papel from vinculos v join empresas e on e.id=v.empresa_id where e.cnpj='11.111.111/0001-11';
\echo '--- Regra: categoria de 2º nível é recusada ---'
\set ON_ERROR_STOP off
insert into titulos (empresa_id,tipo,categoria_id,data_emissao,vencimento,valor_original) select empresa_id,'pagar',id,current_date,current_date,1 from categorias where codigo='02.06' and empresa_id='31b80772-10f3-5ecf-99be-c9f475f09d2e';
select count(*) as linhas_auditoria from auditoria;
