import type {MetadataRoute} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:"EDITA — монтаж с нуля",
    short_name:"EDITA",
    description:"Бесплатные уроки видеомонтажа, задания, помощник, разбор роликов и путь к первой работе.",
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
