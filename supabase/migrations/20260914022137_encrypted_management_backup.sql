-- A single MVCC snapshot, not the paginated rows currently loaded by the UI.
-- This exports management data only, not Auth, Storage binaries or project secrets.
begin;
create or replace function public.vega_exportar_datos()
returns text language plpgsql stable security invoker set search_path=''
as $$
declare payload text;
begin
    if not public.is_vega_admin() then
        raise exception 'Acceso reservado al propietario.' using errcode='42501';
    end if;
    select jsonb_build_object(
        'format','vega-datos','version',1,'schema_version','20260913204706',
        'project','rhuhuvevynovfekwhlhb','created_at',statement_timestamp(),
        'tables',jsonb_build_object(
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
$$;
revoke all on function public.vega_exportar_datos() from public,anon;
grant execute on function public.vega_exportar_datos() to authenticated;
comment on function public.vega_exportar_datos() is 'Owner-only consistent export of eight management tables. Contains private customer links. Browser encrypts before downloading. No writes.';
commit;
