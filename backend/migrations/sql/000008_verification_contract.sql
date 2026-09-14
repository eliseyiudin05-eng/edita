alter table public.businesses
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz;

alter table public.business_verification_requests
  add column if not exists requested_level text not null default 'basic',
  add column if not exists review_note text;

alter table public.editor_verification_requests
  add column if not exists portfolio_url text,
  add column if not exists sample_url text,
  add column if not exists note text,
  add column if not exists review_note text;

alter table public.guardian_verification_requests
  add column if not exists review_note text;

alter table public.businesses
  add constraint businesses_verification_note_length check (verification_note is null or char_length(verification_note)<=1000) not valid;
alter table public.business_verification_requests
  add constraint business_verification_review_note_length check (review_note is null or char_length(review_note)<=1000) not valid;
alter table public.editor_verification_requests
  add constraint editor_verification_urls_length check (
    (portfolio_url is null or char_length(portfolio_url)<=500) and
    (sample_url is null or char_length(sample_url)<=500) and
    (note is null or char_length(note)<=1200) and
    (review_note is null or char_length(review_note)<=1200)
  ) not valid;
alter table public.guardian_verification_requests
  add constraint guardian_verification_review_note_length check (review_note is null or char_length(review_note)<=1200) not valid;

alter table public.businesses validate constraint businesses_verification_note_length;
alter table public.business_verification_requests validate constraint business_verification_review_note_length;
alter table public.editor_verification_requests validate constraint editor_verification_urls_length;
alter table public.guardian_verification_requests validate constraint guardian_verification_review_note_length;
