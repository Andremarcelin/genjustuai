-- Modo da maquete física: rastreio (segue o Quest) ou exibicao (tour com ZERO na placa).
-- Idempotente. Não aplicar daqui; rode no SQL Editor do projeto. Não rode contra produção a partir deste PR.

alter table public.app_state
  add column if not exists maquete_modo text not null default 'rastreio';

alter table public.app_state
  drop constraint if exists app_state_maquete_modo_check;

alter table public.app_state
  add constraint app_state_maquete_modo_check
  check (maquete_modo in ('rastreio', 'exibicao'));

comment on column public.app_state.maquete_modo is
  'rastreio: a maquete segue o Quest. exibicao: mande ZERO na placa para iniciar o tour.';
