export function authErrorRu(message?:string|null){
  const value=(message||"").toLowerCase();

  if(value.includes("email rate limit exceeded")||value.includes("rate limit")){
    return "Слишком много писем было запрошено за короткое время. Подожди немного и попробуй ещё раз.";
  }
  if(value.includes("user already registered")){
    return "Аккаунт с этой электронной почтой уже существует. Попробуй войти или восстановить пароль.";
  }
  if(value.includes("invalid login credentials")){
    return "Электронная почта или пароль не подходят. Проверь данные или восстанови пароль.";
  }
  if(value.includes("email not confirmed")){
    return "Электронная почта ещё не подтверждена. Открой письмо от KIVRONIX или запроси его ещё раз.";
  }
  if(value.includes("password should be at least")){
    return "Пароль слишком короткий. Используй минимум 8 символов.";
  }
  if(value.includes("unable to validate email")||value.includes("invalid email")){
    return "Проверь электронную почту: в адресе должен быть знак @ и название почтового сервиса.";
  }
  return message||"Возникла ошибка. Попробуй ещё раз.";
}
