-- =========================================================================
-- Contador de acessos — script de configuração do Supabase
-- =========================================================================
-- Execute este script uma única vez no seu projeto Supabase, em
-- SQL Editor → New query, e clique em "Run".
--
-- O que ele faz:
--   1) Cria a tabela "contador_acessos", com uma única linha (chave='site')
--      guardando o total de acessos.
--   2) Cria a função "incrementar_contador_acessos", que soma 1 ao total de
--      forma atômica (segura mesmo com vários acessos simultâneos) e roda
--      com privilégio próprio (SECURITY DEFINER) — ou seja, mesmo que a
--      tabela tenha RLS restritivo, esta função específica consegue
--      alterar o valor.
--   3) Habilita Row Level Security (RLS) na tabela e libera apenas:
--        - leitura (SELECT) pública, para visitantes que já foram
--          contados nesta sessão do navegador só lerem o total atual;
--        - execução da função de incremento, também pública.
--      Nenhuma política de INSERT/UPDATE/DELETE é concedida diretamente
--      na tabela — ou seja, mesmo alguém inspecionando a chave "anon"
--      pública do seu projeto (normal e esperado no Supabase: essa chave é
--      pública por design) NÃO consegue "zerar" ou definir um valor
--      arbitrário no contador, porque só pode chamar a função, que sempre
--      soma exatamente 1.
-- =========================================================================

create table if not exists contador_acessos (
  chave text primary key,
  total bigint not null default 0
);

insert into contador_acessos (chave, total)
values ('site', 0)
on conflict (chave) do nothing;

create or replace function incrementar_contador_acessos()
returns bigint
language sql
security definer
set search_path = public
as $$
  update contador_acessos
  set total = total + 1
  where chave = 'site'
  returning total;
$$;

alter table contador_acessos enable row level security;

drop policy if exists "Qualquer um pode ler o contador" on contador_acessos;
create policy "Qualquer um pode ler o contador"
on contador_acessos
for select
to anon
using (true);

grant execute on function incrementar_contador_acessos() to anon;

-- Conferir o resultado (opcional): deve mostrar a linha 'site' com total = 0
select * from contador_acessos;
