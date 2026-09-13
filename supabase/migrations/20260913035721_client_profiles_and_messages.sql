-- Stable customer identity and reusable links, independent of telephone/username.
create table public.vega_clientes (
    id uuid primary key default gen_random_uuid(),
    nombre text check (nombre is null or length(nombre) <= 100),
    telefono text check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$'),
    whatsapp_usuario text check (whatsapp_usuario is null or
        (whatsapp_usuario ~ '^[a-z0-9_.]{3,35}$' and whatsapp_usuario !~ '^[0-9]+$')),
    codigo_privado text not null default encode(extensions.gen_random_bytes(24),'hex')
        check (codigo_privado ~ '^[a-f0-9]{48}$'),
    consulta_hash text generated always as (encode(extensions.digest(codigo_privado,'sha256'),'hex')) stored unique,
    creado_en timestamptz not null default now()
);
alter table public.vega_clientes enable row level security;
revoke all on public.vega_clientes from public, anon, authenticated;
grant select, insert, update on public.vega_clientes to authenticated;
grant all on public.vega_clientes to service_role;
create policy "Owner manages customer profiles" on public.vega_clientes for all to authenticated
    using ((select public.is_vega_admin())) with check ((select public.is_vega_admin()));

alter table public.usuarios_canva
    add column cliente_id uuid references public.vega_clientes(id) on delete restrict,
    add column cliente_consulta_hash text,
    add column nombre_cliente text check (nombre_cliente is null or length(nombre_cliente) <= 100),
    add column whatsapp_usuario text check (whatsapp_usuario is null or
        (whatsapp_usuario ~ '^[a-z0-9_.]{3,35}$' and whatsapp_usuario !~ '^[0-9]+$'));
create index usuarios_canva_cliente_id_idx on public.usuarios_canva(cliente_id);
create index usuarios_canva_cliente_consulta_hash_idx on public.usuarios_canva(cliente_consulta_hash)
    where cliente_consulta_hash is not null;

-- Invoker triggers retain RLS. Guest orders have no cliente_id and do not look up profiles.
create function vega_private.order_profile_sync() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare c public.vega_clientes;
begin
    if new.cliente_id is null then
        new.cliente_consulta_hash := null;
        return new;
    end if;
    select * into strict c from public.vega_clientes where id = new.cliente_id;
    new.cliente_consulta_hash := c.consulta_hash;
    new.telefono := c.telefono;
    new.whatsapp_usuario := c.whatsapp_usuario;
    new.nombre_cliente := c.nombre;
    if tg_op = 'UPDATE' and old.cliente_id is not null and old.cliente_id is distinct from new.cliente_id then
        new.consulta_hash := null;
    end if;
    return new;
end $$;
revoke all on function vega_private.order_profile_sync() from public;
grant execute on function vega_private.order_profile_sync() to anon, authenticated, service_role;
create trigger order_profile_sync before insert or update of cliente_id on public.usuarios_canva
    for each row execute function vega_private.order_profile_sync();

create function vega_private.customer_profile_sync() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    update public.usuarios_canva set
        nombre_cliente = new.nombre, telefono = new.telefono, whatsapp_usuario = new.whatsapp_usuario,
        cliente_consulta_hash = new.consulta_hash,
        consulta_hash = case when old.codigo_privado is distinct from new.codigo_privado then null else consulta_hash end
    where cliente_id = new.id;
    return new;
end $$;
revoke all on function vega_private.customer_profile_sync() from public;
grant execute on function vega_private.customer_profile_sync() to authenticated, service_role;
create trigger customer_profile_sync after update of nombre,telefono,whatsapp_usuario,codigo_privado
    on public.vega_clientes for each row execute function vega_private.customer_profile_sync();

-- Only migrate the owner's existing records. Future guest submissions are never
-- attached to someone else's profile just because they claim the same contact.
do $$
declare r record; c_id uuid; digits text;
begin
    for r in select id, telefono from public.usuarios_canva order by id loop
        digits := regexp_replace(coalesce(r.telefono,''),'[^0-9]','','g');
        c_id := null;
        if digits ~ '^[1-9][0-9]{7,14}$' then
            select id into c_id from public.vega_clientes where telefono = '+' || digits limit 1;
        end if;
        if c_id is null then
            insert into public.vega_clientes(telefono)
                values (case when digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits else null end)
                returning id into c_id;
        end if;
        update public.usuarios_canva set cliente_id = c_id where id = r.id;
    end loop;
end $$;

-- The original per-order digest remains valid until explicit revocation.
alter policy "Private link reads matching orders" on public.usuarios_canva
    using (consulta_hash = (select vega_private.access_hash())
        or cliente_consulta_hash = (select vega_private.access_hash()));

-- Only the owner may create/resolve a profile. Possession of the same private code
-- can group pending purchases; phone numbers and usernames are not identity proof.
create function public.vega_ficha_pedido(p_pedido_id bigint) returns public.vega_clientes
language plpgsql security invoker set search_path = '' as $$
declare p public.usuarios_canva; c public.vega_clientes; matches uuid[];
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('vega_ficha_pedido',0));
    select * into strict p from public.usuarios_canva where id = p_pedido_id for update;
    if p.cliente_id is not null then
        select * into strict c from public.vega_clientes where id = p.cliente_id;
        return c;
    end if;
    if p.consulta_hash is not null then
        select array_agg(distinct v.id) into matches from public.vega_clientes v
        where v.consulta_hash = p.consulta_hash or exists (
            select 1 from public.usuarios_canva u where u.cliente_id=v.id and u.consulta_hash=p.consulta_hash
        );
        if cardinality(matches) = 1 then select * into c from public.vega_clientes where id = matches[1]; end if;
    end if;
    if c.id is null then
        insert into public.vega_clientes(nombre,telefono,whatsapp_usuario)
            values(p.nombre_cliente,p.telefono,p.whatsapp_usuario) returning * into c;
    end if;
    update public.usuarios_canva set cliente_id=c.id
    where id=p.id or (cliente_id is null and p.consulta_hash is not null and consulta_hash=p.consulta_hash);
    return c;
end $$;
revoke all on function public.vega_ficha_pedido(bigint) from public,anon;
grant execute on function public.vega_ficha_pedido(bigint) to authenticated;

-- One transaction prevents orphan profiles or half-saved manual registrations.
create function public.vega_registro_manual(p_cliente_id uuid,p_nombre text,p_telefono text,
    p_usuario text,p_correo text,p_servicio text,p_cantidad integer,p_unidad text) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare c_id uuid; order_id bigint; ending date;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    if coalesce(btrim(p_servicio),'')='' or p_cantidad is null or p_cantidad not between 0 and 36500
        or p_unidad is null or p_unidad not in ('dias','meses','años') then
        raise exception 'Revisa el servicio y la duración';
    end if;
    if p_cliente_id is null then
        if coalesce(nullif(btrim(p_nombre),''),nullif(btrim(p_telefono),''),nullif(btrim(p_usuario),'')) is null then
            raise exception 'Indica el nombre, teléfono o usuario del cliente';
        end if;
        insert into public.vega_clientes(nombre,telefono,whatsapp_usuario)
            values(nullif(btrim(p_nombre),''),nullif(btrim(p_telefono),''),nullif(btrim(p_usuario),'')) returning id into c_id;
    else
        select id into strict c_id from public.vega_clientes where id=p_cliente_id for share;
    end if;
    if p_cantidad > 0 then
        ending := current_date + case p_unidad when 'dias' then make_interval(days=>p_cantidad)
            when 'años' then make_interval(years=>p_cantidad) else make_interval(months=>p_cantidad) end;
    end if;
    insert into public.usuarios_canva(cliente_id,correo,servicio,meses,unidad,metodo_pago,estado,fecha_inicio,fecha_fin)
        values(c_id,nullif(btrim(p_correo),''),btrim(p_servicio),p_cantidad,p_unidad,'Manual','Activo',current_date,ending)
        returning id into order_id;
    return order_id;
end $$;
revoke all on function public.vega_registro_manual(uuid,text,text,text,text,text,integer,text) from public,anon;
grant execute on function public.vega_registro_manual(uuid,text,text,text,text,text,integer,text) to authenticated;

grant insert(nombre_cliente,whatsapp_usuario) on public.usuarios_canva to anon;
-- Preserve the original purchase validation, allowing a username instead of a phone.
do $$
declare old_check text;
begin
    select with_check into strict old_check from pg_policies
        where schemaname='public' and tablename='usuarios_canva' and policyname='Guests submit pending catalogue orders';
    -- The new contact condition replaces only the audited phone requirement.
    old_check := replace(old_check, '(telefono ~ ''^\+[1-9][0-9]{7,14}$''::text)',
        '((telefono IS NULL OR telefono ~ ''^\+[1-9][0-9]{7,14}$'') AND (telefono IS NOT NULL OR whatsapp_usuario IS NOT NULL))');
    if old_check not like '%whatsapp_usuario IS NOT NULL%' then raise exception 'Unexpected purchase policy: manual review required'; end if;
    execute 'alter policy "Guests submit pending catalogue orders" on public.usuarios_canva with check (' || old_check || ')';
end $$;
notify pgrst, 'reload schema';
