# G7 Pulse

Gestão financeira para empresas de serviço e BPO financeiro. Produção: **https://www.g7pulse.com.br**

- **App:** Next.js 15 (App Router) na Vercel
- **Banco, login e arquivos:** Supabase (projeto `g7-pulse`, São Paulo)
- **Multiempresa:** cada linha tem `empresa_id`; o acesso é decidido no banco por Row Level Security a partir da tabela `vinculos` (usuário × empresa × papel)

## Rodar localmente

```bash
cp .env.example .env.local   # preencha URL e chave pública do Supabase
npm install
npm run dev
```

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `supabase/migrations/` | Esquema do banco, permissões e views (saldo, status, DRE) |
| `scripts/gerar_seed.py` | Gera a carga inicial a partir das planilhas (dados ficam fora do git) |
| `tests/` | Testes do banco em Postgres local |
| `app/` | Telas: login, empresas, dashboard, DRE, contas a pagar/receber, cadastros |
| `lib/empresa.ts` | Sessão, empresa ativa e papel do usuário |

## Variáveis de ambiente (Vercel)

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon/publishable) |
| `G7_EMPRESA_MODELO` | ID da empresa cujo plano de contas é copiado para empresas novas |

## Migrações aplicadas direto no Supabase (fora deste repositório)

Em 04/11/2026 foram aplicadas no projeto, além de `schema_inicial`: `revogar_execute_security_definer`, `performance_indices_e_rls`, `integridade_multiempresa_e_perfis`, `auditoria_convites_admin_saldo` e `auto_aceitar_convites_no_cadastro` (função `aceitar_convite`, trava de último administrador, convite de administrador da Marvee). Exportar para `supabase/migrations/` antes de criar um ambiente novo.
