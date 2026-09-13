import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const value=req.headers.get("authorization");return value?.startsWith("Bearer ")?value.slice(7):null}

export async function GET(req:NextRequest){
  const [user,service]=await Promise.all([getUserFromAccessToken(token(req)),Promise.resolve(getSupabaseServiceClient())]);
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const {data,error}=await service.from("payout_requests").select("id,amount_cents,status,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20);
  if(error)return NextResponse.json({error:"История выплат пока недоступна."},{status:503});
  return NextResponse.json({requests:data||[]});
}

export async function POST(req:NextRequest){
  const [user,service]=await Promise.all([getUserFromAccessToken(token(req)),Promise.resolve(getSupabaseServiceClient())]);
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  const amountCents=Math.floor(Number(body?.amountRub||0)*100);
  if(!Number.isSafeInteger(amountCents)||amountCents<10000)return NextResponse.json({error:"Минимальная сумма вывода — 100 ₽."},{status:400});
  const {error}=await service.rpc("create_payout_request",{p_user_id:user.id,p_amount_cents:amountCents});
  if(error){
    const reason=String(error.message||"");
    return NextResponse.json({error:reason.includes("NOT_ENOUGH")?"На балансе недостаточно средств.":reason.includes("PENDING_EXISTS")?"У тебя уже есть заявка на проверке.":"Не удалось создать заявку."},{status:409});
  }
  return GET(req);
}
