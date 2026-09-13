-- Keep the final KIVRONIX name in active database objects without rewriting migration history.
do $$
begin
  if to_regprocedure('private.kivronix_message_has_contact_info(text)') is null
     and to_regprocedure('private.edita_message_has_contact_info(text)') is not null then
    alter function private.edita_message_has_contact_info(text)
      rename to kivronix_message_has_contact_info;
  end if;
end;
$$;

revoke all on function private.kivronix_message_has_contact_info(text)
  from public, anon, authenticated;
grant execute on function private.kivronix_message_has_contact_info(text)
  to service_role;
