create policy "challenge cash rewards are server only"
on public.challenge_cash_reward_events for all to anon,authenticated
using(false) with check(false);

create policy "learning cash rewards are server only"
on public.learning_cash_reward_events for all to anon,authenticated
using(false) with check(false);

create policy "payout requests are server only"
on public.payout_requests for all to anon,authenticated
using(false) with check(false);
