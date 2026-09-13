-- KIVRONIX is the final public brand and domain family.
update public.learning_competitions
set slug=replace(slug,'kivrox-','kivronix-'),
    title=replace(title,'KIVROX','KIVRONIX'),
    description=replace(description,'KIVROX','KIVRONIX'),
    task=replace(task,'KIVROX','KIVRONIX'),
    social_tag=case when social_tag ilike '%kivrox%' then '@KIVRONIX' else social_tag end
where slug like 'kivrox-%'
   or title like '%KIVROX%'
   or description like '%KIVROX%'
   or task like '%KIVROX%'
   or social_tag ilike '%kivrox%';

update public.beta_programs
set title=replace(title,'KIVROX','KIVRONIX')
where title like '%KIVROX%';

update public.private_conversations
set source_kind='kivronix_contest',
    company_name=replace(company_name,'KIVROX','KIVRONIX'),
    title=replace(title,'KIVROX','KIVRONIX')
where source_kind='kivrox_contest'
   or company_name like '%KIVROX%'
   or title like '%KIVROX%';

alter table public.private_conversations
  drop constraint if exists private_conversations_source_kind_check;
alter table public.private_conversations
  add constraint private_conversations_source_kind_check
  check (source_kind in ('campaign','challenge','job','kivronix_contest'));

do $$
begin
  if to_regprocedure('public.redeem_kivronix_points(uuid,text)') is null
     and to_regprocedure('public.redeem_kivrox_points(uuid,text)') is not null then
    alter function public.redeem_kivrox_points(uuid,text) rename to redeem_kivronix_points;
  end if;
  if to_regprocedure('private.award_kivronix_referral_points()') is null
     and to_regprocedure('private.award_kivrox_referral_points()') is not null then
    alter function private.award_kivrox_referral_points() rename to award_kivronix_referral_points;
  end if;
  if to_regprocedure('private.award_challenge_kivronix_points()') is null
     and to_regprocedure('private.award_challenge_kivrox_points()') is not null then
    alter function private.award_challenge_kivrox_points() rename to award_challenge_kivronix_points;
  end if;
end;
$$;

do $$
begin
  if exists(select 1 from pg_trigger where tgname='award_kivrox_referral_points_after_qualification' and not tgisinternal) then
    alter trigger award_kivrox_referral_points_after_qualification on public.referrals rename to award_kivronix_referral_points_after_qualification;
  end if;
  if exists(select 1 from pg_trigger where tgname='award_challenge_kivrox_points_after_win' and not tgisinternal) then
    alter trigger award_challenge_kivrox_points_after_win on public.challenge_submissions rename to award_challenge_kivronix_points_after_win;
  end if;
end;
$$;

revoke all on function public.redeem_kivronix_points(uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_kivronix_points(uuid,text) to service_role;
