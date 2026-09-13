import type {MetadataRoute} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:"KIVRONIX — монтаж с нуля",
    short_name:"KIVRONIX",
    description:"Уроки видеомонтажа, задания, помощник, разбор роликов и путь к первой работе. Ранний доступ открыт бесплатно.",
    start_url:"/",
    display:"standalone",
    background_color:"#f5f5f2",
    theme_color:"#171816",
    lang:"ru",
    icons:[
      {src:"/icon.png",sizes:"512x512",type:"image/png",purpose:"any"},
      {src:"/icon.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
    ],
  };
}
