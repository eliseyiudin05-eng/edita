import {Resend} from "resend";

const apiKey=process.env.RESEND_API_KEY;
const to=process.argv[2];

if(!apiKey||apiKey==="re_xxxxxxxxx"){
  throw new Error("Replace re_xxxxxxxxx with your real Resend API key in RESEND_API_KEY.");
}

if(!to){
  throw new Error("Pass the recipient: npm run email:test -- you@example.com");
}

const resend=new Resend(apiKey);
const {data,error}=await resend.emails.send({
  from:"onboarding@resend.dev",
  to,
  subject:"Hello World",
  html:"<p>Congrats on sending your <strong>first email</strong>!</p>",
});

if(error)throw new Error(error.message);

console.log("Email sent:",data?.id);
