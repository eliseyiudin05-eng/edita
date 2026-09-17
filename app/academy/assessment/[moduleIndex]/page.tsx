import Link from "next/link";
import {notFound} from "next/navigation";
import AcademyAssessment from "@/components/academy-assessment";
import AuthGate from "@/components/auth-gate";
import {curriculumModules} from "@/lib/curriculum";

export default async function AssessmentPage({params}:{params:Promise<{moduleIndex:string}>}){
  const value=(await params).moduleIndex;
  const moduleIndex=Number(value);
  if(!Number.isInteger(moduleIndex)||moduleIndex<0||moduleIndex>=curriculumModules.length)notFound();
  const group=curriculumModules[moduleIndex];

  return <AuthGate><main className="assessment-page-shell">
    <nav className="assessment-topbar">
      <Link className="brand app-brand" href="/platform#academy"><span>KIVRONIX<b>.</b></span><small>аттестация академии</small></Link>
      <div><span>Ступень {moduleIndex+1} из {curriculumModules.length}</span><Link className="btn btn-ghost" href="/platform#academy">← В Академию</Link></div>
    </nav>
    <AcademyAssessment moduleIndex={moduleIndex} moduleName={group.module} final={moduleIndex===curriculumModules.length-1}/>
  </main></AuthGate>;
}
