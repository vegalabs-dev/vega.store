-- Candidate change; promote to a CLI-generated migration after review.
begin;
alter table public.servicios
  add column catalogo_version bigint not null default 0,
  add column destacado boolean not null default false,
  add column posicion integer not null default 1000000 check (posicion between 0 and 1000000);
create function vega_private.catalogo_version_sync() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.catalogo_version := old.catalogo_version + case when
    (to_jsonb(new)-'stock'-'agotado'-'stock_version'-'catalogo_version')
      is distinct from (to_jsonb(old)-'stock'-'agotado'-'stock_version'-'catalogo_version')
    then 1 else 0 end;
  return new;
end $$;
revoke all on function vega_private.catalogo_version_sync() from public,anon;
grant execute on function vega_private.catalogo_version_sync() to authenticated,service_role;
create trigger catalogo_version_sync before update on public.servicios
  for each row execute function vega_private.catalogo_version_sync();

create table public.vega_catalogo_borradores(
 id uuid primary key,
 producto_id bigint references public.servicios(id) on delete restrict,
 autor uuid not null default auth.uid() references auth.users(id),
 datos jsonb not null check(jsonb_typeof(datos)='object' and octet_length(datos::text)<=65536),
 version bigint not null default 1,
 producto_version bigint,
 stock_version bigint,
 publicado boolean not null default false,
 resultado_id bigint references public.servicios(id) on delete restrict,
 actualizado_en timestamptz not null default now()
);
alter table public.vega_catalogo_borradores enable row level security;
revoke all on public.vega_catalogo_borradores from anon,authenticated;
grant select,insert,update,delete on public.vega_catalogo_borradores to authenticated;
create policy "Owners manage catalogue drafts" on public.vega_catalogo_borradores
 for all to authenticated using ((select public.is_vega_admin()))
 with check ((select public.is_vega_admin()));
create index vega_catalogo_borradores_producto_idx on public.vega_catalogo_borradores(producto_id);
create index vega_catalogo_borradores_autor_idx on public.vega_catalogo_borradores(autor);
create index vega_catalogo_borradores_resultado_idx on public.vega_catalogo_borradores(resultado_id);
create index vega_catalogo_borradores_pending_idx on public.vega_catalogo_borradores(actualizado_en desc,id) where not publicado;

create function public.vega_catalogo_borrador(p_id uuid,p_producto_id bigint,p_datos jsonb,
 p_esperada bigint,p_base bigint,p_stock_base bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.vega_catalogo_borradores;
begin
 if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
 if p_id is null or p_datos is null or jsonb_typeof(p_datos)<>'object'
    or octet_length(p_datos::text)>65536 then raise exception 'Borrador inválido o demasiado grande'; end if;
 if p_esperada=0 then
   insert into public.vega_catalogo_borradores(id,producto_id,datos,producto_version,stock_version)
     values(p_id,p_producto_id,p_datos,p_base,p_stock_base) on conflict(id) do nothing;
 else
   update public.vega_catalogo_borradores set datos=p_datos,version=version+1,actualizado_en=now()
     where id=p_id and version=p_esperada and not publicado
       and producto_id is not distinct from p_producto_id
       and producto_version is not distinct from p_base and stock_version is not distinct from p_stock_base;
 end if;
 select * into strict d from public.vega_catalogo_borradores where id=p_id;
 -- Idempotent save retries must refer to the same base and exact payload.
 if d.publicado or d.version<>p_esperada+1 or d.datos is distinct from p_datos
    or d.producto_id is distinct from p_producto_id or d.producto_version is distinct from p_base
    or d.stock_version is distinct from p_stock_base then
    raise exception 'El borrador cambió. Recárgalo antes de guardar.' using errcode='40001';
 end if;
 return to_jsonb(d);
end $$;
revoke all on function public.vega_catalogo_borrador(uuid,bigint,jsonb,bigint,bigint,bigint) from public,anon;
grant execute on function public.vega_catalogo_borrador(uuid,bigint,jsonb,bigint,bigint,bigint) to authenticated;

create function public.vega_catalogo_publicar(p_id uuid,p_version bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.vega_catalogo_borradores; s public.servicios; j jsonb; plans jsonb; plan jsonb;
 n text; cat text; country text; image text; qty integer; price numeric; promo numeric;
 v_stock integer; stock_changed boolean; position integer; starts timestamptz; ends timestamptz;
 keys text[]:='{}'; k text; result_id bigint; normalized jsonb:='[]'::jsonb;
begin
 if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
 select * into strict d from public.vega_catalogo_borradores where id=p_id for update;
 if d.version<>p_version then raise exception 'El borrador cambió. Recárgalo.' using errcode='40001'; end if;
 if d.publicado then return jsonb_build_object('id',d.resultado_id,'repetida',true); end if;
 j:=d.datos; n:=btrim(j->>'nombre');cat:=nullif(btrim(j->>'categoria'),'');
 if n is null or length(n) not between 1 and 120 or coalesce(length(cat),0)>80
    or coalesce(length(j->>'caracteristicas'),0)>10000 or coalesce(length(j->>'etiqueta'),0)>120 then
   raise exception 'Revisa el nombre, categoría y descripción';
 end if;
 if j->>'tipo_ingreso' not in ('numero','correo') or j->>'tipo_ingreso' is null
    or j->>'geo_tipo' not in ('todos','solo','excepto') or j->>'geo_tipo' is null then
   raise exception 'Revisa contacto y disponibilidad por país';
 end if;
 country:=upper(regexp_replace(coalesce(j->>'geo_paises',''),'\s','','g'));
 if j->>'geo_tipo'<>'todos' and country!~'^[A-Z]{2}(,[A-Z]{2})*$' then raise exception 'Usa países de dos letras, separados por comas'; end if;
 image:=nullif(j->>'imagen_url','');
 if image is not null and (length(image)>2048 or image!~'^https://') then raise exception 'Imagen inválida'; end if;
 plans:=j->'planes';
 if plans is null or jsonb_typeof(plans)<>'array' then raise exception 'Añade al menos un plan'; end if;
 if jsonb_array_length(plans) not between 1 and 30 then raise exception 'Usa entre 1 y 30 planes'; end if;
 for plan in select value from jsonb_array_elements(plans) loop
   qty:=nullif(plan->>'cantidad','')::integer;price:=nullif(plan->>'precio','')::numeric;
   promo:=nullif(plan->>'promo','')::numeric;
   if qty is null or qty not between 0 and 36500 or price is null or price not between 0 and 1000000
      or plan->>'unidad' is null or plan->>'unidad' not in ('dias','meses','años')
      or (promo is not null and not (promo>0 and promo<price)) then raise exception 'Revisa las duraciones y precios de cada plan'; end if;
   k:=case when qty=0 then 'permanente' else qty::text||':'||(plan->>'unidad') end;
   if k=any(keys) then raise exception 'Hay duraciones repetidas'; end if;
   keys:=array_append(keys,k);
   normalized:=normalized||jsonb_build_array(jsonb_build_object('cantidad',qty,'unidad',plan->>'unidad','precio',price,'promo',promo));
 end loop;
 starts:=nullif(j->>'promocion_inicio','')::timestamptz;ends:=nullif(j->>'promocion_fin','')::timestamptz;
 if (starts is null)<>(ends is null) or ends<=starts
    or (starts is not null and not exists(select 1 from jsonb_array_elements(normalized) p where (p->>'promo')::numeric>0)) then
    raise exception 'Revisa las fechas y los precios de promoción';
 end if;
 v_stock:=nullif(j->>'stock','')::integer;
 if coalesce(j->>'stock_modo','ilimitado')='limitado' and (v_stock is null or v_stock<0) then raise exception 'Indica un stock válido'; end if;
 if coalesce(j->>'stock_modo','ilimitado')='ilimitado' then v_stock:=null; end if;
 stock_changed:=coalesce((j->>'stock_modificado')::boolean,false);
 position:=coalesce(nullif(j->>'posicion','')::integer,1000000);
 if position not between 0 and 1000000 then raise exception 'Posición fuera de rango'; end if;
 if d.producto_id is not null then
   select * into strict s from public.servicios where id=d.producto_id for update;
   if s.catalogo_version is distinct from d.producto_version then raise exception 'El producto cambió. Conservamos tu borrador; abre la versión reciente antes de publicar.' using errcode='40001'; end if;
   if stock_changed and s.stock_version is distinct from d.stock_version then raise exception 'El stock cambió. Conservamos tu borrador; revisa la disponibilidad actual.' using errcode='40001'; end if;
   update public.servicios set nombre=n,categoria=cat,tipo_ingreso=j->>'tipo_ingreso',geo_tipo=j->>'geo_tipo',geo_paises=country,
     etiqueta=coalesce(j->>'etiqueta',''),caracteristicas=coalesce(j->>'caracteristicas',''),imagen_url=image,
     activo=coalesce((j->>'activo')::boolean,true),destacado=coalesce((j->>'destacado')::boolean,false),posicion=position,
     promocion_inicio=starts,promocion_fin=ends,planes=normalized,
     precio=(normalized->0->>'precio')::numeric,precio_promocional=(normalized->0->>'promo')::numeric,
     stock=case when stock_changed then v_stock else s.stock end,
     agotado=case when stock_changed then coalesce((j->>'agotado')::boolean,false) else s.agotado end
     where id=s.id returning id into result_id;
 else
   insert into public.servicios(nombre,categoria,tipo_ingreso,geo_tipo,geo_paises,etiqueta,caracteristicas,imagen_url,
     activo,destacado,posicion,promocion_inicio,promocion_fin,planes,precio,precio_promocional,stock,agotado)
   values(n,cat,j->>'tipo_ingreso',j->>'geo_tipo',country,coalesce(j->>'etiqueta',''),coalesce(j->>'caracteristicas',''),image,
     coalesce((j->>'activo')::boolean,true),coalesce((j->>'destacado')::boolean,false),position,starts,ends,normalized,
     (normalized->0->>'precio')::numeric,(normalized->0->>'promo')::numeric,v_stock,coalesce((j->>'agotado')::boolean,false))
     returning id into result_id;
 end if;
 update public.vega_catalogo_borradores set publicado=true,resultado_id=result_id,actualizado_en=now() where id=p_id;
 return jsonb_build_object('id',result_id,'repetida',false);
end $$;
revoke all on function public.vega_catalogo_publicar(uuid,bigint) from public,anon;
grant execute on function public.vega_catalogo_publicar(uuid,bigint) to authenticated;

create function public.vega_catalogo_pagina(p_busqueda text default '',p_filtro text default 'todos',
 p_pagina integer default 0,p_tamano integer default 12) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.is_vega_admin() then raise exception 'Acceso restringido' using errcode='42501'; end if;
 if p_pagina is null or p_pagina not between 0 and 100000 or p_tamano is null or p_tamano not between 1 and 50
   or p_busqueda is null or length(p_busqueda)>120 or p_filtro not in ('todos','disponibles','agotados','ocultos','borradores') then raise exception 'Filtro inválido'; end if;
 with filtered as (
   select s.* from public.servicios s where
    (p_busqueda='' or strpos(lower(s.nombre||' '||coalesce(s.categoria,'')),lower(p_busqueda))>0)
    and (p_filtro='todos' or (p_filtro='ocultos' and not coalesce(s.activo,false))
      or (p_filtro='disponibles' and s.activo and not s.agotado and (s.stock is null or s.stock>0))
      or (p_filtro='agotados' and s.activo and (s.agotado or s.stock=0)))
 ), page as (
   select * from filtered order by
    case when not coalesce(activo,false) then 2 when agotado or stock=0 then 1 else 0 end,
    destacado desc,posicion,id limit p_tamano offset p_pagina*p_tamano
 ), drafts as (
   select * from public.vega_catalogo_borradores where not publicado and
    (p_busqueda='' or strpos(lower(coalesce(datos->>'nombre','')),lower(p_busqueda))>0)
 ), draftpage as (
   select * from drafts order by actualizado_en desc,id limit p_tamano offset p_pagina*p_tamano
 )
 select jsonb_build_object('version',2,'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
   'total',(select count(*) from filtered),'drafts',coalesce((select jsonb_agg(to_jsonb(draftpage)) from draftpage),'[]'::jsonb),
   'draft_total',(select count(*) from drafts)) into result;
 return result;
end $$;
revoke all on function public.vega_catalogo_pagina(text,text,integer,integer) from public,anon;
grant execute on function public.vega_catalogo_pagina(text,text,integer,integer) to authenticated;
-- A single MVCC snapshot, not the paginated rows currently loaded by the UI.
-- This exports management data only, not Auth, Storage binaries or project secrets.

create or replace function public.vega_exportar_datos()
returns text language plpgsql stable security invoker set search_path=''
as $
declare payload text;
begin
    if not public.is_vega_admin() then
        raise exception 'Acceso reservado al propietario.' using errcode='42501';
    end if;
    select jsonb_build_object(
        'format','vega-datos','version',1,'schema_version','catalogue-v2',
        'project','rhuhuvevynovfekwhlhb','created_at',statement_timestamp(),
        'tables',jsonb_build_object(
            'vega_catalogo_borradores',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.vega_catalogo_borradores t),
            'servicios',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.servicios t),
            'vega_clientes',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.vega_clientes t),
            'usuarios_canva',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.usuarios_canva t),
            'promociones',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.promociones t),
            'vega_movimientos',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.vega_movimientos t),
            'vega_avisos_manuales',(select coalesce(jsonb_agg(to_jsonb(t) order by t.pedido_id,t.fecha_fin,t.tipo),'[]'::jsonb) from public.vega_avisos_manuales t),
            'vega_auditoria',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.vega_auditoria t),
            'admin_accesos',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.admin_accesos t)
        )
    )::text into payload;
    if octet_length(payload)>20971520 then
        raise exception 'La copia excede 20 MB. Solicita un respaldo completo de la base.' using errcode='54000';
    end if;
    return payload;
end;
$;
revoke all on function public.vega_exportar_datos() from public,anon;
grant execute on function public.vega_exportar_datos() to authenticated;
comment on function public.vega_exportar_datos() is 'Owner-only consistent export of management tables including catalogue drafts. Contains private customer links. Browser encrypts before downloading. No writes.';

notify pgrst,'reload schema';
commit;
