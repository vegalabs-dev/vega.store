begin;
create table vega_private.ia_preferencias (
    actor uuid primary key references auth.users(id) on delete cascade,
    estilo text not null default '' check(char_length(estilo)<=2000),
    version bigint not null default 1 check(version>0),
    actualizado_en timestamptz not null default now()
);
alter table vega_private.ia_preferencias enable row level security;
revoke all on vega_private.ia_preferencias from public,anon,authenticated;
grant select,insert,update on vega_private.ia_preferencias to authenticated;
create policy "Owner reads own message style" on vega_private.ia_preferencias for select to authenticated
using((select public.is_vega_admin()) and actor=(select auth.uid()));
create policy "Owner creates own message style" on vega_private.ia_preferencias for insert to authenticated
with check((select public.is_vega_admin()) and actor=(select auth.uid()));
create policy "Owner edits own message style" on vega_private.ia_preferencias for update to authenticated
using((select public.is_vega_admin()) and actor=(select auth.uid()))
with check((select public.is_vega_admin()) and actor=(select auth.uid()));
create function public.vega_estilo_mensajes(p_estilo text default null,p_version bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actual vega_private.ia_preferencias;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    if p_estilo is not null then
        if char_length(p_estilo)>2000 then raise exception 'El estilo admite hasta 2000 caracteres'; end if;
        perform pg_advisory_xact_lock(hashtextextended('vega_estilo_'||auth.uid()::text,0));
        select * into actual from vega_private.ia_preferencias where actor=auth.uid() for update;
        if p_version is null or p_version<>coalesce(actual.version,0) then
            raise exception 'El estilo cambió en otra ventana. Recarga las preferencias antes de guardarlas.' using errcode='40001';
        end if;
        insert into vega_private.ia_preferencias(actor,estilo,version) values(auth.uid(),btrim(p_estilo),1)
        on conflict(actor) do update set estilo=excluded.estilo,version=ia_preferencias.version+1,actualizado_en=now();
    end if;
    select * into actual from vega_private.ia_preferencias where actor=auth.uid();
    return jsonb_build_object('estilo',coalesce(actual.estilo,''),'version',coalesce(actual.version,0));
end $$;
revoke all on function public.vega_estilo_mensajes(text,bigint) from public,anon;
grant execute on function public.vega_estilo_mensajes(text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
