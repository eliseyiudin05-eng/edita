export function authErrorRu(message?:string|null){
  const value=(message||"").toLowerCase();

  if(value.includes("email rate limit exceeded")||value.includes("rate limit")){
    return "Слишком много писем было запрошено за короткое время. Подожди немного и попробуй ещё раз.";
  }
  if(value.includes("user already registered")){
    return "Аккаунт с этим email уже существует. Попробуй войти или восстановить пароль.";
  }
  if(value.includes("invalid login credentials")){
    return "Неверный email или пароль.";
  }
  if(value.includes("email not confirmed")){
    return "Email ждёт подтверждения. Открой письмо от KIVRONIX или отправь подтверждение ещё раз.";
  }
  if(value.includes("password should be at least")){
    return "Пароль слишком короткий. Используй минимум 8 символов.";
  }
  if(value.includes("unable to validate email")||value.includes("invalid email")){
    return "Проверь email: похоже, в адресе есть ошибка.";
  }
  return message||"Возникла ошибка. Попробуй ещё раз.";
}
