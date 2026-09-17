import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {ImageResponse} from "next/og";

export const alt="KIVRONIX — обучение видеомонтажу, профессиональный рост и поиск монтажёров";
export const size={width:1200,height:630};
export const contentType="image/png";

const frogData=await readFile(join(process.cwd(),"public/images/kivronix-frog-mark.png"),"base64");
const frogSrc=`data:image/png;base64,${frogData}`;

export default function Image(){
  return new ImageResponse(
    <div style={{
      width:"100%",
      height:"100%",
      display:"flex",
      alignItems:"center",
      justifyContent:"space-between",
      padding:"58px 64px",
      background:"linear-gradient(135deg, #f7f7f3 0%, #ffffff 58%, #e9fbd0 100%)",
      color:"#031640",
      fontFamily:"Arial, sans-serif",
      position:"relative",
      overflow:"hidden",
    }}>
      <div style={{
        position:"absolute",
        width:260,
        height:260,
        borderRadius:260,
        background:"#d8ff3e",
        opacity:0.72,
        right:-70,
        top:-90,
        display:"flex",
      }}/>
      <div style={{
        width:400,
        height:470,
        borderRadius:52,
        background:"#031640",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        boxShadow:"0 28px 70px rgba(3, 22, 64, 0.18)",
      }}>
        <img src={frogSrc} width={350} height={350} alt="" style={{objectFit:"contain"}}/>
      </div>
      <div style={{width:620,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
        <div style={{fontSize:70,fontWeight:900,letterSpacing:-3,display:"flex"}}>KIVRONIX<span style={{color:"#96cf00"}}>.</span></div>
        <div style={{width:118,height:10,borderRadius:10,background:"#d8ff3e",marginTop:10,marginBottom:27,display:"flex"}}/>
        <div style={{fontSize:42,fontWeight:800,lineHeight:1.08,letterSpacing:-1.2,display:"flex",flexDirection:"column"}}>
          <span>Обучение видеомонтажу</span>
          <span>Профессиональный рост</span>
          <span>Поиск монтажёров</span>
        </div>
        <div style={{fontSize:25,lineHeight:1.25,color:"#43506d",marginTop:25,display:"flex"}}>Для блогеров, авторов и компаний</div>
        <div style={{fontSize:22,fontWeight:700,color:"#031640",marginTop:29,display:"flex"}}>kivronix.ru</div>
      </div>
    </div>,
    size,
  );
}
