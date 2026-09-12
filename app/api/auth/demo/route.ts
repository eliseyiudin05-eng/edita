import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";

const DEMO_EMAIL="demo@getedita.app";

export async function POST(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Демо-доступ временно не настроен."},{status:503});

  const {data:list,error:listError}=await service.auth.admin.listUsers({page:1,perPage:1000});
  if(listError)return NextResponse.json({error:"Не удалось проверить демо-аккаунт."},{status:503});

  let user=list.users.find(item=>item.email?.toLowerCase()===DEMO_EMAIL);
  if(!user){
    const password=crypto.randomUUID()+"Aa1!";
    const {data,error}=await service.auth.admin.createUser({
      email:DEMO_EMAIL,
      password,
      email_confirm:true,
      user_metadata:{
        role:"editor",
        display_name:"Демо-ученик",
        onboarding:{role:"editor",level:"new",software:"CapCut",goal:"first-reel",ageGroup:"14-17"},
        accepted_terms:true,
        accepted_personal_data:true,
        demo_account:true
      }
    });
    if(error||!data.user)return NextResponse.json({error:"Не удалось создать демо-аккаунт."},{status:503});
    user=data.user;
  }

  await service.from("profiles").update({
    display_name:"Демо-ученик",
    onboarding:{role:"editor",level:"new",software:"CapCut",goal:"first-reel",ageGroup:"14-17"}
  }).eq("id",user.id);

  const redirectTo=new URL("/platform?demo=1",req.nextUrl.origin).toString();
  const {data,error}=await service.auth.admin.generateLink({
    type:"magiclink",
    email:DEMO_EMAIL,
    options:{redirectTo}
  });
  const actionLink=(data as any)?.properties?.action_link||(data as any)?.properties?.actionLink;
  if(error||!actionLink)return NextResponse.json({error:"Не удалось создать безопасную ссылку входа."},{status:503});

  try{
    const target=new URL(actionLink);
    if(target.protocol!=="https:"||!target.hostname.endsWith(".supabase.co"))throw new Error("invalid auth host");
  }catch{
    return NextResponse.json({error:"Сервис авторизации вернул некорректную ссылку."},{status:503});
  }

  return NextResponse.json({url:actionLink},{headers:{"Cache-Control":"no-store"}});
}
