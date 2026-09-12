import {NextResponse} from "next/server";
import {getYooKassaConfig,yookassaRequest} from "@/lib/yookassa";

export async function GET(){
  const configured=Boolean(getYooKassaConfig());
  const mode=process.env.YOOKASSA_MODE||"test";
  if(!configured)return NextResponse.json({configured:false,connected:false,mode});
  try{
    const data=await yookassaRequest("/payments?limit=1",{method:"GET"});
    return NextResponse.json({configured:true,connected:true,mode,count:Array.isArray(data?.items)?data.items.length:0});
  }catch(error){
    return NextResponse.json({configured:true,connected:false,mode,error:error instanceof Error?error.message:"YooKassa API error"});
  }
}
