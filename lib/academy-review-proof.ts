import "server-only";
import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";

export type ReviewProofPurpose="academy_assessment"|"lesson";

type ReviewProofPayload={
  userId:string;
  purpose:ReviewProofPurpose;
  moduleIndex:number|null;
  lessonSlug:string|null;
  score:number;
  reviewId:string;
  expiresAt:number;
};

function signingSecret(){
  const secret=process.env.ACADEMY_REVIEW_SIGNING_SECRET||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.OPENAI_API_KEY;
  if(secret)return secret;
  return process.env.NODE_ENV!=="production"?"kivronix-local-review-proof":null;
}

function signature(payload:string,secret:string){
  return createHmac("sha256",secret).update(payload).digest("base64url");
}

export function createAcademyReviewProof(input:Omit<ReviewProofPayload,"expiresAt"|"reviewId">){
  const secret=signingSecret();
  if(!secret)return null;
  const payload:ReviewProofPayload={...input,reviewId:randomUUID(),expiresAt:Date.now()+2*60*60*1000};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded,secret)}`;
}

export function verifyAcademyReviewProof(proof:unknown,expected:{userId:string;purpose:ReviewProofPurpose;moduleIndex?:number;lessonSlug?:string}){
  const secret=signingSecret();
  if(!secret||typeof proof!=="string")return null;
  const [encoded,provided,...extra]=proof.split(".");
  if(!encoded||!provided||extra.length)return null;
  const wanted=signature(encoded,secret);
  const providedBuffer=Buffer.from(provided);
  const wantedBuffer=Buffer.from(wanted);
  if(providedBuffer.length!==wantedBuffer.length||!timingSafeEqual(providedBuffer,wantedBuffer))return null;
  try{
    const payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as ReviewProofPayload;
    if(payload.userId!==expected.userId||payload.purpose!==expected.purpose||payload.expiresAt<Date.now())return null;
    if(expected.moduleIndex!=null&&payload.moduleIndex!==expected.moduleIndex)return null;
    if(expected.lessonSlug&&payload.lessonSlug!==expected.lessonSlug)return null;
    if(typeof payload.reviewId!=="string"||!payload.reviewId||!Number.isFinite(payload.score)||payload.score<0||payload.score>100)return null;
    return payload;
  }catch{return null}
}
