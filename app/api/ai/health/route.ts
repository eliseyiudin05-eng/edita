import { NextResponse } from "next/server";

export async function GET(){
  const key=process.env.OPENAI_API_KEY;
  const model=process.env.OPENAI_MODEL||"gpt-5.6-luna";
  if(!key)return NextResponse.json({configured:false,connected:false,model});

  try{
    const r=await fetch("https://api.openai.com/v1/models/"+encodeURIComponent(model),{
      headers:{Authorization:"Bearer "+key},
      cache:"no-store",
    });
    return NextResponse.json({
      configured:true,
      connected:r.ok,
      model,
      status:r.status,
    });
  }catch{
    return NextResponse.json({configured:true,connected:false,model,status:0});
  }
}
