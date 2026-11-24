-- Contadores de tokens da Gen por sessão (Gemini/Groq reais; estimativa só se o provedor não mandar usage).
-- Idempotente. NÃO aplique daqui: rode no SQL Editor do projeto depois de sql/session_lifecycle.sql.

alter table public.session_summaries
  add column if not exists tokens_in bigint not null default 0;

alter table public.session_summaries
  add column if not exists tokens_out bigint not null default 0;

alter table public.session_summaries
  add column if not exists tokens_total bigint not null default 0;

alter table public.session_summaries
  add column if not exists token_calls integer not null default 0;

alter table public.session_summaries
  add column if not exists tokens_estimated boolean not null default false;

comment on column public.session_summaries.tokens_in is
  'Soma de tokens de entrada (prompt) das chamadas LLM da Gen nesta sessão.';
comment on column public.session_summaries.tokens_out is
  'Soma de tokens de saída (completion) das chamadas LLM da Gen nesta sessão.';
comment on column public.session_summaries.tokens_total is
  'Soma de tokens totais. Preferir o total do provedor; senão entrada + saída.';
comment on column public.session_summaries.token_calls is
  'Quantidade de chamadas LLM contabilizadas nesta sessão.';
comment on column public.session_summaries.tokens_estimated is
  'true se alguma chamada não trouxe usage real e usou estimativa (chars/4).';

create or replace function public.genjutsu_add_session_tokens(
  p_code text,
  p_in bigint default 0,
  p_out bigint default 0,
  p_total bigint default 0,
  p_calls integer default 0,
  p_estimated boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(coalesce(p_code, '')));
  result public.session_summaries;
begin
  if code is null or length(code) <> 6 then
    raise exception 'invalid_code';
  end if;

  update public.session_summaries
  set
    tokens_in = tokens_in + greatest(coalesce(p_in, 0), 0),
    tokens_out = tokens_out + greatest(coalesce(p_out, 0), 0),
    tokens_total = tokens_total + greatest(coalesce(p_total, 0), 0),
    token_calls = token_calls + greatest(coalesce(p_calls, 0), 0),
    tokens_estimated = tokens_estimated or coalesce(p_estimated, false)
  where session_code = code
  returning * into result;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'session_code', result.session_code,
    'tokens_in', result.tokens_in,
    'tokens_out', result.tokens_out,
    'tokens_total', result.tokens_total,
    'calls', result.token_calls,
    'tokens_estimated', result.tokens_estimated
  );
end;
$$;

revoke all on function public.genjutsu_add_session_tokens(text, bigint, bigint, bigint, integer, boolean) from public;
grant execute on function public.genjutsu_add_session_tokens(text, bigint, bigint, bigint, integer, boolean) to service_role;
