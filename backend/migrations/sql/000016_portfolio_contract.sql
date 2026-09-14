-- v2.0.0-alpha.16: protect editor portfolios and public profile reads for the Go API.

alter table public.portfolio_items
  add column if not exists object_id uuid references public.objects(id) on delete restrict,
  add constraint portfolio_items_title_contract
    check (char_length(btrim(title)) between 2 and 160) not valid,
  add constraint portfolio_items_video_contract
    check (char_length(video_url) between 1 and 1000) not valid,
  add constraint portfolio_items_tags_contract
    check (cardinality(tags)<=12 and char_length(array_to_string(tags,''))<=480) not valid;

create index if not exists portfolio_items_editor_created_idx
  on public.portfolio_items(editor_id,created_at desc,id);

create index if not exists portfolio_items_object_idx
  on public.portfolio_items(object_id)
  where object_id is not null;

revoke all on public.portfolio_items from public;
