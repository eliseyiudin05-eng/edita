import type {Metadata} from "next";
import Home from "../page";

const shareTitle="KIVRONIX — обучение видеомонтажу, профессиональный рост и поиск монтажёров для блогеров и компаний";
const shareDescription="Осваивайте видеомонтаж, развивайте профессиональные навыки или находите подходящего монтажёра для блога и компании.";

export const metadata:Metadata={
  title:{absolute:shareTitle},
  description:shareDescription,
  alternates:{canonical:"/"},
  openGraph:{
    title:shareTitle,
    description:shareDescription,
    url:"/share",
    siteName:"KIVRONIX",
    locale:"ru_RU",
    type:"website",
  },
  twitter:{
    card:"summary_large_image",
    title:shareTitle,
    description:shareDescription,
  },
  robots:{index:false,follow:true},
};

export default Home;
