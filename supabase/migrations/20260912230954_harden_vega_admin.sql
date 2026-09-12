-- Preserve existing orders/catalogue. Restrict administration to the verified owner.
create schema if not exists vega_private;
revoke all on schema vega_private from public, anon, authenticated;
grant usage on schema vega_private to anon, authenticated, service_role;

create table vega_private.admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);
alter table vega_private.admins enable row level security;
revoke all on vega_private.admins from public, anon, authenticated;
grant select on vega_private.admins to authenticated, service_role;
create policy "Members can check their own membership" on vega_private.admins
    for select to authenticated using (user_id = (select auth.uid()));

-- This project was audited with exactly one confirmed Auth account. Abort on drift;
-- never promote accounts from registration, email text supplied by the client, or metadata.
do $$
begin
    if (select count(*) from auth.users where deleted_at is null) <> 1
       or (select count(*) from auth.users where deleted_at is null and email_confirmed_at is not null) <> 1 then
        raise exception 'Owner bootstrap requires review: expected one confirmed existing Auth account';
    end if;
    insert into vega_private.admins(user_id)
        select id from auth.users where deleted_at is null and email_confirmed_at is not null;
end $$;

create function public.is_vega_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
    select exists (select 1 from vega_private.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_vega_admin() from public, anon;
grant execute on function public.is_vega_admin() to authenticated, service_role;

alter table public.usuarios_canva add column consulta_hash text;
-- timestamptz stores the instant; avoid converting it to a timezone-less timestamp.
alter table public.usuarios_canva alter column creado_en set default now();
alter table public.admin_accesos alter column fecha set default now();
alter table public.usuarios_canva add constraint usuarios_consulta_hash_format
    check (consulta_hash is null or consulta_hash ~ '^[a-f0-9]{64}$');
create index usuarios_canva_consulta_hash_idx on public.usuarios_canva(consulta_hash)
    where consulta_hash is not null;

-- A 192-bit random bearer code goes in a dedicated request header. Only its digest
-- is stored; the short WhatsApp order token is NOT an access credential.
create function vega_private.access_hash() returns text
language sql stable security invoker set search_path = '' as $$
    select case when code ~ '^[a-f0-9]{48}$'
        then pg_catalog.encode(extensions.digest(code, 'sha256'), 'hex') else null end
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
        ->> 'x-vega-access' as code) as headers;
$$;
revoke all on function vega_private.access_hash() from public;
grant execute on function vega_private.access_hash() to anon, authenticated, service_role;

-- Replace all old policies on these four application tables. Permissive policies OR
-- together, so leaving the old "true" rules in place would undo the protection.
do $$
declare p record;
begin
    for p in select tablename, policyname from pg_policies
        where schemaname = 'public' and tablename in ('usuarios_canva','servicios','admin_accesos','promociones')
    loop
        execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    end loop;
end $$;

alter table public.usuarios_canva enable row level security;
alter table public.servicios enable row level security;
alter table public.admin_accesos enable row level security;
alter table public.promociones enable row level security;
revoke all on public.usuarios_canva, public.servicios, public.admin_accesos, public.promociones
    from public, anon, authenticated;
-- Identity columns need no direct sequence privilege. Prevent clients changing counters.
revoke all on sequence public.usuarios_canva_id_seq, public.servicios_id_seq,
    public.admin_accesos_id_seq, public.promociones_id_seq from public, anon, authenticated;

grant select, insert, update, delete on public.usuarios_canva, public.servicios, public.promociones to authenticated;
grant select on public.admin_accesos to authenticated;
grant insert(dispositivo, navegador) on public.admin_accesos to authenticated;
grant select on public.servicios, public.promociones to anon;
grant select(id, servicio, estado, fecha_inicio, fecha_fin, creado_en, meses, unidad)
    on public.usuarios_canva to anon;
grant insert(telefono, correo, servicio, meses, unidad, metodo_pago, token, consulta_hash)
    on public.usuarios_canva to anon;

-- Separate invoker query avoids a recursive policy expansion. RLS still limits this
-- count to the caller's private link. This is a checkout guard, not an IP rate limiter.
create function vega_private.pending_order_count() returns bigint
language sql stable security invoker set search_path = '' as $$
    select count(id) from public.usuarios_canva where estado = 'Pendiente';
$$;
revoke all on function vega_private.pending_order_count() from public;
grant execute on function vega_private.pending_order_count() to anon;

create policy "Owner administers orders" on public.usuarios_canva for all to authenticated
    using ((select public.is_vega_admin())) with check ((select public.is_vega_admin()));
create policy "Private link reads matching orders" on public.usuarios_canva for select to anon
    using (consulta_hash = (select vega_private.access_hash()));
create policy "Guests submit pending catalogue orders" on public.usuarios_canva for insert to anon
    with check (
        consulta_hash = (select vega_private.access_hash())
        and estado = 'Pendiente'
        and fecha_inicio is null and fecha_fin is null and fecha_cancelacion is null
        and creado_en >= now() - interval '1 minute' and creado_en <= now() + interval '1 minute'
        and metodo_pago = 'WhatsApp'
        and telefono ~ '^\+[1-9][0-9]{7,14}$'
        and (correo is null or (length(correo) <= 254 and correo ~ '^[^[:space:]<>"'']+@[^[:space:]<>"'']+\.[^[:space:]<>"'']+$'))
        and token ~ '^TK-[A-F0-9]{12}$'
        and meses >= 0 and unidad in ('dias','meses','años')
        and exists (
            select 1 from public.servicios s
            cross join lateral jsonb_array_elements(
                case when jsonb_typeof(s.planes) = 'array' then s.planes else '[]'::jsonb end
            ) as plan
            where s.activo is true and s.nombre = usuarios_canva.servicio
                and plan ->> 'cantidad' = usuarios_canva.meses::text
                and coalesce(plan ->> 'unidad', 'meses') = usuarios_canva.unidad
                and (s.tipo_ingreso is distinct from 'correo' or usuarios_canva.correo is not null)
        )
        and (select vega_private.pending_order_count()) < 3
    );

create policy "Public active catalogue" on public.servicios for select to anon, authenticated
    using (activo is true);
create policy "Owner administers catalogue" on public.servicios for all to authenticated
    using ((select public.is_vega_admin())) with check ((select public.is_vega_admin()));
create policy "Public active promotions" on public.promociones for select to anon, authenticated
    using (activo is true);
create policy "Owner administers promotions" on public.promociones for all to authenticated
    using ((select public.is_vega_admin())) with check ((select public.is_vega_admin()));
create policy "Owner reads access history" on public.admin_accesos for select to authenticated
    using ((select public.is_vega_admin()));
create policy "Owner records access" on public.admin_accesos for insert to authenticated
    with check ((select public.is_vega_admin()) and length(dispositivo) <= 100 and length(navegador) <= 200);

-- Keep product images public; uploading, replacing and removing them require the owner.
drop policy "Permitir subida de imagenes 1f22wan_0" on storage.objects;
drop policy "Permitir subida de imagenes 1f22wan_1" on storage.objects;
drop policy "Permitir subida de imagenes 1f22wan_2" on storage.objects;
drop policy "Permitir subida de imagenes 1f22wan_3" on storage.objects;
create policy "Public product images" on storage.objects for select to anon, authenticated
    using (bucket_id = 'imagenes_servicios');
create policy "Owner uploads product images" on storage.objects for insert to authenticated
    with check (bucket_id = 'imagenes_servicios' and (select public.is_vega_admin()));
create policy "Owner edits product images" on storage.objects for update to authenticated
    using (bucket_id = 'imagenes_servicios' and (select public.is_vega_admin()))
    with check (bucket_id = 'imagenes_servicios' and (select public.is_vega_admin()));
create policy "Owner removes product images" on storage.objects for delete to authenticated
    using (bucket_id = 'imagenes_servicios' and (select public.is_vega_admin()));
update storage.buckets set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
    where id = 'imagenes_servicios';

-- Existing event trigger remains enabled; it is not a public application RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
notify pgrst, 'reload schema';
