-- Mission Control: auto-utgång av godkännanden. Agenter kan sätta expires_at
-- på tidskänsliga förslag (t.ex. Ads-budgetändringar vars underlag åldras);
-- pg_cron markerar passerade pending-rader som expired var 30:e minut så
-- inaktuella förslag aldrig kan godkännas av misstag.
create or replace function public.mc_expire_approvals()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_row record;
begin
  for expired_row in
    update public.mc_approvals
    set status = 'expired',
        resolved_by = 'system',
        resolved_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at < now()
    returning id
  loop
    insert into public.mc_approval_events (approval_id, event, actor)
    values (expired_row.id, 'expired', 'system');
  end loop;
end;
$$;

select cron.schedule(
  'mc-expire-approvals',
  '*/30 * * * *',
  $$select public.mc_expire_approvals();$$
);
