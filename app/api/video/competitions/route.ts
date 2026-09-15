import {NextRequest} from "next/server";
import {proxyToGo} from "@/lib/go-api-proxy";

export function GET(req:NextRequest){return proxyToGo(req,"/v1/video/competitions");}
export function POST(req:NextRequest){return proxyToGo(req,"/v1/video/competitions");}
