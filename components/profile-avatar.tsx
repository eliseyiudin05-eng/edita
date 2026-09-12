export default function ProfileAvatar({src,name,size="md"}:{src?:string|null;name?:string|null;size?:"sm"|"md"|"lg"}){
  const initial=(name||"E").trim().charAt(0).toUpperCase()||"E";
  return <span className={"profile-avatar "+size} aria-label={name||"Профиль"}>
    {src?<img src={src} alt="" loading="lazy"/>:<b aria-hidden="true">{initial}</b>}
  </span>;
}
