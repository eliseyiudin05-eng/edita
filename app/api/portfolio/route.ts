import {NextRequest} from "next/server";
import {proxyToGo} from "@/lib/go-api-proxy";

export function GET(req:NextRequest){return proxyToGo(req,"/v1/marketplace/portfolio");}
export function POST(req:NextRequest){return proxyToGo(req,"/v1/marketplace/portfolio");}
