-- Additive release. Existing expiry dates, purchases and private links are preserved.
alter table public.usuarios_canva add column version bigint not null default 0;
alter table public.usuarios_canva add column vigencia_inicio date;
alter table public.usuarios_canva add column ultima_ampliacion text;
alter table public.usuarios_canva add column estado_previo text;
update public.usuarios_canva set vigencia_inicio=fecha_inicio;
grant select(vigencia_inicio,ultima_ampliacion) on public.usuarios_canva to anon;
revoke delete on public.usuarios_canva,public.vega_clientes,public.servicios,public.promociones from authenticated;

create table public.vega_movimientos (
    id bigint generated always as identity primary key,
    pedido_id bigint not null references public.usuarios_canva(id) on delete restrict,
    tipo text not null,
    cantidad integer, unidad text, modo text,
    fecha_anterior date, fecha_nueva date,
    creado_en timestamptz not null default now(),
    actor uuid, operacion uuid unique, solicitud_hash text,
    detalle jsonb not null default '{}'::jsonb
);
create index vega_movimientos_pedido_fecha on public.vega_movimientos(pedido_id,creado_en desc);
alter table public.vega_movimientos enable row level security;
revoke all on public.vega_movimientos from public,anon,authenticated;
grant select,insert on public.vega_movimientos to authenticated;
grant usage on sequence public.vega_movimientos_id_seq to authenticated;
grant select(id,pedido_id,tipo,cantidad,unidad,modo,fecha_anterior,fecha_nueva,creado_en) on public.vega_movimientos to anon;
create policy "Owner reads movements" on public.vega_movimientos for select to authenticated using((select public.is_vega_admin()));
create policy "Only order triggers record movements" on public.vega_movimientos for insert to authenticated
    with check((select public.is_vega_admin()) and pg_trigger_depth()>0 and actor=(select auth.uid()));
create policy "Private link reads its service history" on public.vega_movimientos for select to anon
    using(exists(select 1 from public.usuarios_canva u where u.id=pedido_id));

-- Baseline records explicitly do not claim to reconstruct past gifts.
insert into public.vega_movimientos(pedido_id,tipo,fecha_nueva)
    select id,'registro_anterior',fecha_fin from public.usuarios_canva;

create function vega_private.version_pedido() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if tg_op='UPDATE' then
        new.version:=old.version+1;
        if new.estado='Cancelado' and old.estado is distinct from 'Cancelado' then
            new.estado_previo:=old.estado; new.fecha_cancelacion:=now();
        end if;
    end if;
    if new.estado='Activo' and new.vigencia_inicio is null then new.vigencia_inicio:=new.fecha_inicio; end if;
    if new.estado='Activo' and new.fecha_fin is not null and new.vigencia_inicio is not null and new.fecha_fin<new.vigencia_inicio then
        raise exception 'El vencimiento no puede ser anterior al inicio';
    end if;
    return new;
end $$;
create trigger vega_version_pedido before insert or update on public.usuarios_canva for each row execute function vega_private.version_pedido();

create function vega_private.historial_pedido() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; kind text; prior date;
begin
    -- Public pending submissions need no privileged history insert.
    if tg_op='INSERT' and new.estado='Pendiente' then return new; end if;
    ctx:=coalesce(nullif(current_setting('vega.movimiento',true),'')::jsonb,'{}'::jsonb);
    if tg_op='INSERT' then kind:='alta';
    else
        if (to_jsonb(new)-array['version','cliente_consulta_hash','consulta_hash'])=(to_jsonb(old)-array['version','cliente_consulta_hash','consulta_hash']) then return new; end if;
        prior:=old.fecha_fin;
        kind:=case when new.estado='Cancelado' and old.estado<>'Cancelado' then 'archivo'
            when old.estado='Cancelado' and new.estado<>'Cancelado' then 'restauracion'
            when old.estado='Pendiente' and new.estado='Activo' then 'activacion'
            when new.servicio_id is distinct from old.servicio_id then 'cambio_servicio'
            when new.fecha_fin is distinct from old.fecha_fin then 'ajuste'
            else 'actualizacion' end;
    end if;
    insert into public.vega_movimientos(pedido_id,tipo,cantidad,unidad,modo,fecha_anterior,fecha_nueva,actor,operacion,solicitud_hash,detalle)
        values(new.id,coalesce(ctx->>'tipo',kind),(ctx->>'cantidad')::integer,ctx->>'unidad',ctx->>'modo',prior,new.fecha_fin,
            auth.uid(),(ctx->>'operacion')::uuid,ctx->>'solicitud_hash',jsonb_build_object('estado',new.estado,'servicio_id',new.servicio_id));
    return new;
end $$;
create trigger vega_historial_pedido after insert or update on public.usuarios_canva for each row execute function vega_private.historial_pedido();

create function public.vega_actualizar_vigencia(p_id bigint,p_cantidad integer,p_unidad text,p_modo text,p_motivo text,p_version bigint,p_operacion uuid)
returns date language plpgsql security invoker set search_path='' as $$
declare p public.usuarios_canva; m public.vega_movimientos; base date; ending date;
    today date:=(now() at time zone 'America/Lima')::date; fingerprint text;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    if p_operacion is null or p_cantidad is null or p_cantidad<1 or p_unidad is null or p_unidad not in ('dias','meses','años')
        or p_cantidad>(case p_unidad when 'años' then 100 when 'meses' then 1200 else 36500 end)
        or p_modo is null or p_modo not in ('sumar','desde_hoy','reemplazar') or p_motivo is null or p_motivo not in ('regalo','renovacion','correccion') then
        raise exception 'Revisa la duración y el tipo de ampliación';
    end if;
    fingerprint:=md5(jsonb_build_array(p_id,p_cantidad,p_unidad,p_modo,p_motivo)::text);
    select * into strict p from public.usuarios_canva where id=p_id for update;
    select * into m from public.vega_movimientos where operacion=p_operacion;
    if found then
        if m.pedido_id<>p_id or m.solicitud_hash<>fingerprint then raise exception 'La operación ya se usó con otros datos'; end if;
        return m.fecha_nueva;
    end if;
    if p.version is distinct from p_version then raise exception 'El servicio cambió. Recarga la ficha antes de continuar'; end if;
    if p.estado<>'Activo' then raise exception 'Primero activa o restaura el servicio'; end if;
    if p_modo='reemplazar' then
        base:=coalesce(p.vigencia_inicio,p.fecha_inicio);
        if base is null then raise exception 'Sin inicio registrado: selecciona comenzar hoy'; end if;
    elsif p_modo='desde_hoy' then base:=today;
    else
        if p.fecha_fin is null then raise exception 'Sin vencimiento: selecciona comenzar hoy o reemplazar el plazo'; end if;
        base:=greatest(today,p.fecha_fin);
    end if;
    ending:=(base+case p_unidad when 'dias' then make_interval(days=>p_cantidad) when 'años' then make_interval(years=>p_cantidad) else make_interval(months=>p_cantidad) end)::date;
    perform set_config('vega.movimiento',jsonb_build_object('tipo',p_motivo,'cantidad',p_cantidad,'unidad',p_unidad,'modo',p_modo,'operacion',p_operacion,'solicitud_hash',fingerprint)::text,true);
    update public.usuarios_canva set fecha_fin=ending,
        vigencia_inicio=case when p_modo='desde_hoy' or (p_modo='sumar' and p.fecha_fin<today) then today else coalesce(p.vigencia_inicio,p.fecha_inicio,base) end,
        ultima_ampliacion=case when p_modo='sumar' then '+' else 'Plazo: ' end || p_cantidad::text || ' ' ||
            case when p_cantidad=1 then case p_unidad when 'dias' then 'día' when 'meses' then 'mes' else 'año' end else case p_unidad when 'dias' then 'días' else p_unidad end end
        where id=p_id;
    perform set_config('vega.movimiento','',true);
    return ending;
end $$;
revoke all on function public.vega_actualizar_vigencia(bigint,integer,text,text,text,bigint,uuid) from public,anon;
grant execute on function public.vega_actualizar_vigencia(bigint,integer,text,text,text,bigint,uuid) to authenticated;

create function public.vega_archivar_servicio(p_id bigint,p_version bigint,p_restaurar boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare p public.usuarios_canva; target text;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    select * into strict p from public.usuarios_canva where id=p_id for update;
    if p_restaurar and p.estado<>'Cancelado' or not p_restaurar and p.estado='Cancelado' then return p.estado; end if;
    if p.version is distinct from p_version then raise exception 'El servicio cambió. Recarga antes de continuar'; end if;
    target:=case when p_restaurar then coalesce(p.estado_previo,case when p.stock_descontado then 'Activo' else 'Pendiente' end) else 'Cancelado' end;
    update public.usuarios_canva set estado=target,fecha_cancelacion=case when p_restaurar then null else now() end where id=p_id;
    return target;
end $$;
revoke all on function public.vega_archivar_servicio(bigint,bigint,boolean) from public,anon;
grant execute on function public.vega_archivar_servicio(bigint,bigint,boolean) to authenticated;

-- Manual follow-up acknowledgement, never an automatic delivery claim.
create table public.vega_avisos_manuales (
    pedido_id bigint not null references public.usuarios_canva(id) on delete restrict,
    fecha_fin date not null, tipo text not null check(tipo='vencimiento'),
    atendido_en timestamptz not null default now(), actor uuid not null default auth.uid(),
    primary key(pedido_id,fecha_fin,tipo)
);
alter table public.vega_avisos_manuales enable row level security;
revoke all on public.vega_avisos_manuales from public,anon,authenticated;
grant select,insert,delete on public.vega_avisos_manuales to authenticated;
create policy "Owner manages manual follow-up" on public.vega_avisos_manuales to authenticated
    using((select public.is_vega_admin())) with check((select public.is_vega_admin()) and actor=(select auth.uid()));

-- Minimal audit for catalogue and profile edits; private codes/contact values are never copied here.
create table public.vega_auditoria (
    id bigint generated always as identity primary key, creado_en timestamptz not null default now(),actor uuid,
    entidad text not null, registro text not null, accion text not null, cambios jsonb not null
);
alter table public.vega_auditoria enable row level security;
revoke all on public.vega_auditoria from public,anon,authenticated;
grant select,insert on public.vega_auditoria to authenticated;
grant usage on sequence public.vega_auditoria_id_seq to authenticated;
create policy "Owner reads audit" on public.vega_auditoria for select to authenticated using((select public.is_vega_admin()));
create policy "Triggers append audit" on public.vega_auditoria for insert to authenticated with check((select public.is_vega_admin()) and pg_trigger_depth()>0 and actor=(select auth.uid()));
create function vega_private.auditar_catalogo_cliente() returns trigger language plpgsql security invoker set search_path='' as $$
declare before_data jsonb:='{}'; after_data jsonb; keys jsonb;
begin
    if tg_op='UPDATE' then before_data:=to_jsonb(old); end if;
    after_data:=to_jsonb(new);
    select jsonb_agg(k) into keys from jsonb_object_keys(after_data) k where after_data->k is distinct from before_data->k;
    if keys is not null then
        insert into public.vega_auditoria(actor,entidad,registro,accion,cambios) values(auth.uid(),tg_table_name,new.id::text,tg_op,
            jsonb_build_object('campos',keys,'stock_antes',before_data->'stock','stock_despues',after_data->'stock','activo',after_data->'activo'));
    end if;
    return new;
end $$;
create trigger vega_audit_catalogo after insert or update on public.servicios for each row execute function vega_private.auditar_catalogo_cliente();
create trigger vega_audit_clientes after insert or update on public.vega_clientes for each row execute function vega_private.auditar_catalogo_cliente();

-- Trigger functions are not exposed as API operations.
revoke all on function vega_private.version_pedido(),vega_private.historial_pedido(),vega_private.auditar_catalogo_cliente() from public,anon,authenticated;

create function public.vega_activar_pedido(p_id bigint,p_servicio_id bigint,p_version bigint)
returns date language plpgsql security invoker set search_path='' as $$
declare p public.usuarios_canva; today date:=(now() at time zone 'America/Lima')::date; ending date;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    select * into strict p from public.usuarios_canva where id=p_id for update;
    if p.estado='Activo' then return p.fecha_fin; end if;
    if p.estado<>'Pendiente' or p.version is distinct from p_version then raise exception 'La solicitud cambió. Recarga antes de continuar'; end if;
    if p.meses is null or p.meses<0 or p.unidad is null or p.unidad not in ('dias','meses','años') or p.meses>(case p.unidad when 'años' then 100 when 'meses' then 1200 else 36500 end) then raise exception 'Revisa la duración de la solicitud'; end if;
    if p.meses>0 then ending:=(today+case p.unidad when 'dias' then make_interval(days=>p.meses) when 'años' then make_interval(years=>p.meses) else make_interval(months=>p.meses) end)::date; end if;
    perform public.vega_ficha_pedido(p_id);
    update public.usuarios_canva set estado='Activo',servicio_id=p_servicio_id,fecha_inicio=today,vigencia_inicio=today,fecha_fin=ending where id=p_id;
    return ending;
end $$;
revoke all on function public.vega_activar_pedido(bigint,bigint,bigint) from public,anon;
grant execute on function public.vega_activar_pedido(bigint,bigint,bigint) to authenticated;

create or replace function public.vega_registro_manual(p_cliente_id uuid,p_nombre text,p_telefono text,
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
        ending := (now() at time zone 'America/Lima')::date + case p_unidad when 'dias' then make_interval(days=>p_cantidad)
            when 'años' then make_interval(years=>p_cantidad) else make_interval(months=>p_cantidad) end;
    end if;
    insert into public.usuarios_canva(cliente_id,correo,servicio,meses,unidad,metodo_pago,estado,fecha_inicio,fecha_fin,servicio_id)
        values(c_id,nullif(btrim(p_correo),''),btrim(p_servicio),p_cantidad,p_unidad,'Manual','Activo',(now() at time zone 'America/Lima')::date,ending,p_servicio_id)
        returning id into order_id;
    return order_id;
end $$;

-- Idempotent registration keeps retrying a timed-out response from duplicating a sale.
create function public.vega_registro_seguro(p_cliente_id uuid,p_nombre text,p_telefono text,p_usuario text,p_correo text,p_servicio text,
    p_cantidad integer,p_unidad text,p_servicio_id bigint,p_operacion uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare fingerprint text; m public.vega_movimientos; result bigint;
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    if p_operacion is null or p_cantidad is null or p_cantidad<0 or p_unidad is null or p_unidad not in ('dias','meses','años')
        or p_cantidad>(case p_unidad when 'años' then 100 when 'meses' then 1200 else 36500 end) then raise exception 'Revisa la duración'; end if;
    fingerprint:=md5(jsonb_build_array(p_cliente_id,p_nombre,p_telefono,p_usuario,p_correo,p_servicio,p_cantidad,p_unidad,p_servicio_id)::text);
    perform pg_advisory_xact_lock(hashtextextended(p_operacion::text,0));
    select * into m from public.vega_movimientos where operacion=p_operacion;
    if found then
        if m.solicitud_hash<>fingerprint then raise exception 'La operación ya se usó con otros datos'; end if;
        return m.pedido_id;
    end if;
    perform set_config('vega.movimiento',jsonb_build_object('operacion',p_operacion,'solicitud_hash',fingerprint)::text,true);
    result:=public.vega_registro_manual(p_cliente_id,p_nombre,p_telefono,p_usuario,p_correo,p_servicio,p_cantidad,p_unidad,p_servicio_id);
    perform set_config('vega.movimiento','',true);
    return result;
end $$;
revoke all on function public.vega_registro_seguro(uuid,text,text,text,text,text,integer,text,bigint,uuid) from public,anon;
grant execute on function public.vega_registro_seguro(uuid,text,text,text,text,text,integer,text,bigint,uuid) to authenticated;
notify pgrst,'reload schema';

create table vega_private.ia_uso(id bigint generated always as identity primary key,actor uuid not null,creado_en timestamptz not null default now());
alter table vega_private.ia_uso enable row level security;
revoke all on vega_private.ia_uso from public,anon,authenticated;
grant select,insert on vega_private.ia_uso to authenticated;
grant usage on sequence vega_private.ia_uso_id_seq to authenticated;
create index vega_ia_actor_fecha on vega_private.ia_uso(actor,creado_en);
create policy "Owner reads AI usage" on vega_private.ia_uso for select to authenticated using((select public.is_vega_admin()) and actor=(select auth.uid()));
create policy "Owner records AI usage" on vega_private.ia_uso for insert to authenticated with check((select public.is_vega_admin()) and actor=(select auth.uid()) and creado_en=now());
create function public.vega_reservar_ia() returns void language plpgsql security invoker set search_path='' as $$
begin
    if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('vega_ia_'||auth.uid()::text,0));
    if (select count(*) from vega_private.ia_uso where actor=auth.uid() and creado_en>now()-interval '1 hour')>=20
       or (select count(*) from vega_private.ia_uso where actor=auth.uid() and creado_en>now()-interval '1 day')>=100 then raise exception 'Límite de borradores alcanzado'; end if;
    insert into vega_private.ia_uso(actor) values(auth.uid());
end $$;
revoke all on function public.vega_reservar_ia() from public,anon;
grant execute on function public.vega_reservar_ia() to authenticated;
notify pgrst,'reload schema';
