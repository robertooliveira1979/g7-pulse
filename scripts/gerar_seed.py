"""Gera supabase/seed_marvee.sql a partir do data.json extraído das planilhas.
Uso: python3 scripts/gerar_seed.py data.json supabase/seed_marvee.sql"""
import json, sys, uuid
src, out = sys.argv[1], sys.argv[2]
D = json.load(open(src))
NS = uuid.UUID('6f1c7a2e-0000-4000-8000-000000000000')
U = lambda *k: str(uuid.uuid5(NS, '|'.join(map(str, k))))
EMP = U('empresa', 'marvee')
q = lambda v: 'null' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"
n = lambda v: '0' if v in (None, '') else str(round(float(v), 2))
L = ['-- Carga inicial Marvee (gerado das planilhas de 30/10/2026). Rodar como service_role.', 'begin;',
     f"insert into empresas (id, razao_social, nome_fantasia, cnpj, municipio, uf, regime_tributario) values ('{EMP}','MARVEE TECNOLOGIA E FRANCHISING LTDA','Marvee','36.448.480/0001-03','Blumenau','SC','Simples Nacional');"]
SALDO = {'Cora': ('14502.42', '2026-01-01')}
conta_id = {}
for c in D['contas']:
    cid = U('conta', c['nome']); conta_id[c['nome']] = cid
    si, ds = SALDO.get(c['nome'], ('0', '2026-01-01'))
    tipo = 'caixa' if c['nome'] == 'Caixinha' else 'corrente'
    banco = 'Cora' if c['nome'] == 'Cora' else None
    ag = None if c['agencia'] in ('000-0', '0') else c['agencia']
    num = None if c['numero'] in ('0', '') else c['numero']
    L.append(f"insert into contas_bancarias (id, empresa_id, nome, tipo, banco, agencia, numero, dv, tipo_pessoa, saldo_inicial, data_saldo_inicial, ativa) values ('{cid}','{EMP}',{q(c['nome'])},'{tipo}',{q(banco)},{q(ag)},{q(num)},{q(c['dv'])},'{c['tipoPessoa']}',{si},'{ds}',{str(c['ativo']).lower()});")
cat_id = {}
for c in D['categorias']:
    cod, nome = c.split(' - ', 1); cod = cod.strip(); cat_id[c] = U('cat', cod)
    L.append(f"insert into categorias (id, empresa_id, codigo, nome) values ('{cat_id[c]}','{EMP}','{cod}',{q(nome.strip())});")
# pessoas: une clientes e fornecedores pelo documento ou razão social
pes = {}
def key(p): return (p.get('doc') or '').strip() or p['razao'].strip().upper()
for lst, flag in ((D['clientes'], 'c'), (D['fornecedores'], 'f')):
    for p in lst:
        k = key(p); e = pes.setdefault(k, dict(p, e_c=False, e_f=False))
        e['e_c'] |= flag == 'c' or (flag == 'f' and p.get('tambem') and False)
        e['e_f'] |= flag == 'f' or (flag == 'c' and p.get('tambem'))
        if flag == 'c': e['e_c'] = True
by_razao = {}
for k, p in pes.items(): by_razao[p['razao'].strip().upper()] = k
def pessoa_de(t, kind):
    r = (t['pessoa'] or '').strip().upper()
    k = by_razao.get(r)
    if not k:
        k = (t['doc_pessoa'] or '').strip() or r
        pes[k] = dict(doc=t['doc_pessoa'], codigo=None, razao=t['pessoa'], fantasia=t['fantasia'], e_c=False, e_f=False)
        by_razao[r] = k
    pes[k]['e_c' if kind == 'r' else 'e_f'] = True
    return U('pessoa', k)
tit = []
for kind, arr in (('p', D['cp']), ('r', D['cr'])):
    for t in arr: tit.append((kind, t, pessoa_de(t, kind)))
for k, p in pes.items():
    L.append("insert into pessoas (id, empresa_id, codigo, cnpj_cpf, razao_social, nome_fantasia, e_cliente, e_fornecedor, ddd, telefone, email, segmento, cep, uf, cidade, bairro, logradouro, numero, complemento, ativo) values ("
             + ','.join([q(U('pessoa', k)), q(EMP), q(p.get('codigo')), q(p.get('doc')), q(p['razao']), q(p.get('fantasia')), str(p['e_c']).lower(), str(p['e_f']).lower(),
                         q(p.get('ddd')), q(p.get('tel')), q(p.get('email')), q(p.get('segmento')), q(p.get('cep')), q(p.get('uf')), q(p.get('cidade')), q(p.get('bairro')), q(p.get('logradouro')),
                         q(p.get('numero') if p.get('numero') not in ('0',) else None), q(p.get('compl')), 'true' if p.get('status', 'Ativo') == 'Ativo' else 'false']) + ");")
for c in D['contatos']:
    k = (c['doc'] or '').strip()
    if k not in pes: continue
    L.append(f"insert into contatos (empresa_id, pessoa_id, nome, cargo, email, telefone, principal, enviar_nfse, enviar_boleto) values ('{EMP}','{U('pessoa', k)}',{q(c['nome'])},{q(c['cargo'])},{q(c['email'])},{q(c['tel'])},{str(c['principal']).lower()},{str(c['nfse']).lower()},{str(c['boleto']).lower()});")
nb = 0
for kind, t, pid in tit:
    tid = U('titulo', t['id']); conta = conta_id.get(t['conta'])
    L.append("insert into titulos (id, empresa_id, tipo, documento_id_origem, documento, descricao, observacoes, categoria_id, pessoa_id, conta_id, centro_custo, projeto, tipo_gasto, forma_cobranca, data_emissao, vencimento, valor_original, desconto, acrescimo, agendamento_status, agendamento_data, chave_pix) values ("
             + ','.join([q(tid), q(EMP), q('pagar' if kind == 'p' else 'receber'), t['id'][1:], q(t['doc']), q(t['desc']), q(t['obs']), q(cat_id[t['cat']]), q(pid), q(conta), q(t['cc']), q(t.get('projeto')),
                         q(t.get('tipoGasto') or None), q(t['cobranca']), q(t['emissao'] or t['venc']), q(t['venc']), n(t['valor']), n(t['desconto']), n(t['acrescimo']), q(t.get('agend') or 'Sem Agendamento'), q(t.get('dataAgend')), q(t.get('pix'))]) + ");")
    if t['quit'] and float(t['baixado'] or 0) > 0:
        nb += 1
        L.append(f"insert into baixas (empresa_id, titulo_id, data, valor, conta_id, origem) values ('{EMP}','{tid}','{t['quit']}',{n(t['baixado'])},'{conta}','importacao');")
    if kind == 'r' and t.get('nfse'):
        L.append("insert into notas_fiscais (empresa_id, titulo_id, pessoa_id, numero, serie, data_emissao, valor, origem, pdf_url_externo, xml_url_externo) values ("
                 + ','.join([q(EMP), q(tid), q(pid), q(t['nfse']), q(t.get('serie') or ''), q(t.get('dataNfse') or t['emissao']), n(t['valor']), q('intermediario' if t.get('pdf') else 'importacao'), q(t.get('pdf')), q(t.get('xml'))]) + ") on conflict do nothing;")
L.append('commit;')
open(out, 'w').write('\n'.join(L) + '\n')
print(f'empresa {EMP} | pessoas {len(pes)} | titulos {len(tit)} | baixas {nb}')
