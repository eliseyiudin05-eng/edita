-- Finish the public KIVRONIX rename for the creator brief seeded before rebranding.
update public.creator_briefs
set slug=replace(replace(slug,'edita-','kivronix-'),'kivrox-','kivronix-'),
    title=replace(replace(title,'EDITA','KIVRONIX'),'KIVROX','KIVRONIX'),
    short_description=replace(replace(short_description,'EDITA','KIVRONIX'),'KIVROX','KIVRONIX'),
    brief=replace(replace(brief,'EDITA','KIVRONIX'),'KIVROX','KIVRONIX'),
    reward_text=replace(replace(reward_text,'EDITA','KIVRONIX'),'KIVROX','KIVRONIX')
where concat_ws(' ',slug,title,short_description,brief,reward_text) ~* '(edita|kivrox)';
