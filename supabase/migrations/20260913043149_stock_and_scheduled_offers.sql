-- Stock is shared across all plans of a product. NULL means unlimited.
alter table public.servicios
    add column stock integer check (stock >= 0),
    add column agotado boolean not null default false,
    add column stock_version bigint not null default 0,
    add column promocion_inicio timestamptz,
    add column promocion_fin timestamptz,
    add constraint servicios_promocion_fechas check (
        (promocion_inicio is null and promocion_fin is null) or
        (promocion_inicio is not null and promocion_fin is not null and promocion_fin > promocion_inicio)
    );
alter table public.usuarios_canva
    add column servicio_id bigint references public.servicios(id) on delete restrict,
    add column precio_acordado numeric check (precio_acordado >= 0),
    add column stock_descontado boolean not null default false;
create index usuarios_canva_servicio_id_idx on public.usuarios_canva(servicio_id);

-- Do not guess between products with the same name, or consume past sales again.
update public.usuarios_canva u set servicio_id=s.id
from (select nombre,min(id) id from public.servicios group by nombre having count(*)=1) s
where u.servicio=s.nombre;
update public.usuarios_canva set stock_descontado=true where estado <> 'Pendiente';

create function vega_private.stock_version_sync() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    new.stock_version := old.stock_version + case when
        new.stock is distinct from old.stock or new.agotado is distinct from old.agotado then 1 else 0 end;
    return new;
end $$;
revoke all on function vega_private.stock_version_sync() from public;
grant execute on function vega_private.stock_version_sync() to authenticated,service_role;
create trigger stock_version_sync before update on public.servicios
    for each row execute function vega_private.stock_version_sync();

-- Invoker: guests can read the catalogue but cannot update stock. Only the
-- existing owner role can activate an order and perform the atomic decrement.
create function vega_private.order_catalogue_sync() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s public.servicios; matches bigint[]; p jsonb; amount numeric; discount numeric; consume boolean;
begin
    if tg_op='INSERT' then
        new.stock_descontado := false;
        -- Compatibility with older pages/manual entries; ambiguous names fail closed.
        if new.servicio_id is null then
            select array_agg(id) into matches from public.servicios where nombre=new.servicio;
            if cardinality(matches)>1 then raise exception 'Hay varios productos con ese nombre. Selecciona el producto del catálogo.'; end if;
            if cardinality(matches)=1 then new.servicio_id:=matches[1]; end if;
        end if;
    else
        new.stock_descontado := old.stock_descontado;
        if new.servicio_id is distinct from old.servicio_id then new.stock_descontado:=false; end if;
        -- Snapshots of accepted requests cannot be changed by later catalogue edits.
        new.precio_acordado := old.precio_acordado;
    end if;

    if new.servicio_id is null then
        if new.metodo_pago='WhatsApp' and (tg_op='INSERT' or
            (new.estado='Activo' and not new.stock_descontado)) then
            raise exception 'Selecciona el producto del catálogo antes de aprobar esta solicitud.';
        end if;
        return new; -- Explicit manual services outside the catalogue have no inventory.
    end if;

    consume := new.estado='Activo' and not new.stock_descontado;
    if consume then
        -- A row lock serializes approvals of distinct orders sharing the last unit.
        select * into strict s from public.servicios where id=new.servicio_id for update;
    elsif tg_op='INSERT' or new.servicio_id is distinct from old.servicio_id then
        select * into strict s from public.servicios where id=new.servicio_id;
    else
        return new;
    end if;
    if s.activo is not true or s.agotado or s.stock=0 then
        raise exception 'Producto agotado o no disponible. Revisa su stock en el catálogo.';
    end if;
    new.servicio := s.nombre;
    if tg_op='INSERT' and new.metodo_pago='WhatsApp' then
        select value into p from jsonb_array_elements(s.planes)
        where value->>'cantidad'=new.meses::text and coalesce(value->>'unidad','meses')=new.unidad limit 1;
        if p is null or (s.tipo_ingreso='correo' and new.correo is null) then
            raise exception 'El plan ya no está disponible. Actualiza el catálogo.';
        end if;
        amount := (p->>'precio')::numeric;
        discount := (p->>'promo')::numeric;
        if discount > 0 and discount < amount and (s.promocion_inicio is null or
            (statement_timestamp() >= s.promocion_inicio and statement_timestamp() < s.promocion_fin)) then
            amount := discount;
        end if;
        if amount is null or amount < 0 then raise exception 'Precio no disponible'; end if;
        if new.precio_acordado is not null and new.precio_acordado <> amount then
            raise exception 'El precio cambió o la promoción terminó. Actualiza el catálogo y revisa el importe.';
        end if;
        new.precio_acordado := amount;
    end if;
    if consume then
        if s.stock is not null then
            update public.servicios set stock=stock-1 where id=s.id and stock>0;
            if not found then raise exception 'No quedan cupos disponibles.'; end if;
        end if;
        new.stock_descontado := true;
    end if;
    -- Cancellation/deletion never replenishes a delivered digital access. Restoring
    -- or renewing this same access never charges a second unit; restock is explicit.
    return new;
end $$;
revoke all on function vega_private.order_catalogue_sync() from public;
grant execute on function vega_private.order_catalogue_sync() to anon,authenticated,service_role;
create trigger order_catalogue_sync before insert or update on public.usuarios_canva
    for each row execute function vega_private.order_catalogue_sync();

grant insert(servicio_id,precio_acordado) on public.usuarios_canva to anon;
grant select(precio_acordado) on public.usuarios_canva to anon;
do $$
declare rule text;
begin
    select with_check into strict rule from pg_policies where schemaname='public'
        and tablename='usuarios_canva' and policyname='Guests submit pending catalogue orders';
    if rule not like '%(s.nombre = usuarios_canva.servicio)%' then raise exception 'Unexpected purchase policy'; end if;
    rule:=replace(rule,'(s.nombre = usuarios_canva.servicio)','(s.id = usuarios_canva.servicio_id)');
    execute 'alter policy "Guests submit pending catalogue orders" on public.usuarios_canva with check ('||rule||')';
end $$;

-- Optional ID keeps older manual clients compatible.
drop function public.vega_registro_manual(uuid,text,text,text,text,text,integer,text);
create function public.vega_registro_manual(p_cliente_id uuid,p_nombre text,p_telefono text,
    p_usuario text,p_correo text,p_servicio text,p_cantidad integer,p_unidad text,p_servicio_id bigint default null) returns bigint
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
    insert into public.usuarios_canva(cliente_id,correo,servicio,meses,unidad,metodo_pago,estado,fecha_inicio,fecha_fin,servicio_id)
        values(c_id,nullif(btrim(p_correo),''),btrim(p_servicio),p_cantidad,p_unidad,'Manual','Activo',current_date,ending,p_servicio_id)
        returning id into order_id;
    return order_id;
end $$;
revoke all on function public.vega_registro_manual(uuid,text,text,text,text,text,integer,text,bigint) from public,anon;
grant execute on function public.vega_registro_manual(uuid,text,text,text,text,text,integer,text,bigint) to authenticated;

notify pgrst, 'reload schema';
