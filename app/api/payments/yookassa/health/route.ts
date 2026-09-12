import {NextResponse} from "next/server";
import {getYooKassaConfig,yookassaRequest} from "@/lib/yookassa";

export async function GET(){
  const configured=Boolean(getYooKassaConfig());
  const enabled=process.env.BETA_FREE_MODE==="false";
  const mode=enabled?(process.env.YOOKASSA_MODE||"test"):"disabled_for_beta";
  if(!enabled)return NextResponse.json({configured,connected:false,enabled:false,mode});
  if(!configured)return NextResponse.json({configured:false,connected:false,mode});
  try{
    const data=await yookassaRequest("/payments?limit=1",{method:"GET"});
    return NextResponse.json({configured:true,connected:true,mode,count:Array.isArray(data?.items)?data.items.length:0});
  }catch(error){
    return NextResponse.json({configured:true,connected:false,mode,error:error instanceof Error?error.message:"YooKassa API error"});
  }
}
