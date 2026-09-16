import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export async function uploadPortfolioVideo(file:File,userId:string){
  if(file.size>200*1024*1024)throw new Error("Видео должно быть меньше 200 МБ.");
  if(!file.type.startsWith("video/"))throw new Error("Выбери видеофайл.");
  const extension=(file.name.split(".").pop()||"mp4").replace(/[^a-z0-9]/gi,"").toLowerCase();
  const path=`${userId}/${crypto.randomUUID()}.${extension}`;
  const client=getSupabaseBrowserClient();
  const {error}=await client.storage.from("portfolio-videos").upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw new Error("Не удалось загрузить видео: "+error.message);
  return client.storage.from("portfolio-videos").getPublicUrl(path).data.publicUrl;
}
