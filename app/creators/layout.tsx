import type {Metadata} from "next";

export const metadata:Metadata={
  title:"Креаторы KIVRONIX",
  description:"Снимайте ролики о KIVRONIX, участвуйте в заданиях платформы и сотрудничайте с командой.",
  alternates:{canonical:"/creators"},
};

export default function CreatorsLayout({children}:{children:React.ReactNode}){
  return children;
}
