import type {MetadataRoute} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:"KIVRONIX — обучение, монтажёры и видеопроекты",
    short_name:"KIVRONIX",
    description:"Обучение видеомонтажу, портфолио, поиск специалистов и безопасная работа монтажёров, блогеров и компаний на одной платформе.",
    id:"/",
    start_url:"/",
    scope:"/",
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
