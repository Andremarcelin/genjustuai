-- Rode se sessions.sql já foi aplicado antes. Impede mudar session_code depois de definido.

create or replace function public.genjutsu_freeze_session_code()
returns trigger
language plpgsql
as $$
begin
  if old.session_code is not null
     and length(trim(old.session_code)) > 0
     and new.session_code is distinct from old.session_code then
    new.session_code := old.session_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_session_code on public.dossiers;
create trigger trg_freeze_session_code
before update on public.dossiers
for each row
execute function public.genjutsu_freeze_session_code();
