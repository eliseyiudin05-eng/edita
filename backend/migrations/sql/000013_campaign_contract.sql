alter table public.business_campaigns
  add column if not exists goal text not null default '',
  add column if not exists requirements text not null default '',
  add column if not exists budget_text text not null default '',
  add column if not exists creator_slots integer not null default 1,
  add column if not exists content_types text[] not null default '{}',
  add column if not exists ends_at timestamptz;

update public.business_campaigns
set goal=case when char_length(trim(goal))>=3 then goal when char_length(trim(description))>=3 then description else title end,
    budget_text=case when char_length(trim(budget_text))>=1 then budget_text
      when budget_cents>0 then (budget_cents/100)::text||' RUB' else 'По договорённости' end;

alter table public.business_campaigns
  drop constraint if exists business_campaigns_content_check,
  drop constraint if exists business_campaigns_status_check,
  drop constraint if exists business_campaigns_dates_check;
alter table public.business_campaigns
  add constraint business_campaigns_content_check check(
    char_length(title) between 3 and 120 and char_length(goal) between 3 and 500 and
    char_length(requirements)<=2000 and char_length(budget_text) between 1 and 120 and
    creator_slots between 1 and 100 and cardinality(content_types)<=8
  ),
  add constraint business_campaigns_status_check check(status in ('draft','open','closed','cancelled')),
  add constraint business_campaigns_dates_check check(ends_at is null or ends_at>created_at);

alter table public.business_campaign_applications
  add column if not exists portfolio_url text,
  add column if not exists note text;

alter table public.business_campaign_applications
  drop constraint if exists business_campaign_applications_content_check,
  drop constraint if exists business_campaign_applications_status_check;
alter table public.business_campaign_applications
  add constraint business_campaign_applications_content_check check(
    (portfolio_url is null or (char_length(portfolio_url)<=500 and portfolio_url like 'https://%')) and
    (note is null or char_length(note)<=1000)
  ),
  add constraint business_campaign_applications_status_check check(status in ('applied','shortlisted','accepted','declined'));

create index if not exists business_campaigns_open_created_idx
  on public.business_campaigns(created_at desc,id) where status='open';
create index if not exists campaign_applications_campaign_created_idx
  on public.business_campaign_applications(campaign_id,created_at desc,id);

revoke all on public.business_campaigns,public.business_campaign_applications from public;
