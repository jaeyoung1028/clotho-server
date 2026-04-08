import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "백엔드 정상 작동 중! 이제 POST로 테스트하세요." });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API 키 설정 누락" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 1. 아주 심플하게 응답 생성 (DB 안 거침)
    const result = await model.generateContent("당신은 타로 여신 클로토입니다. '운명의 실타래가 풀리기 시작했다'라고 아주 짧고 신비롭게 한 문장만 말하세요.");
    
    return NextResponse.json({ 
      text: result.response.text(),
      status: "성공"
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}