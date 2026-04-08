import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { messages = [], selectedCards = [] } = body;

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API KEY가 설정되지 않았습니다." }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 1. AI에게 보낼 질문 구성
    const lastMessage = messages[messages.length - 1]?.content || "내 타로 운세를 알려줘";
    const prompt = `당신은 타로 여신 클로토입니다. 뽑힌 카드 번호들(${selectedCards.join(", ")})을 바탕으로 질문("${lastMessage}")에 대해 아주 신비롭고 상세하게 타로 해석을 해주세요.`;

    // 2. AI 해석 생성 (여기가 핵심!)
    const result = await model.generateContent(prompt);
    const aiText = result.response.text();

    // 3. DB 저장은 "시도"만 합니다. (실패해도 AI 대답은 나갑니다)
    try {
      const user = await prisma.user.findFirst();
      if (user && selectedCards.length > 0) {
        await prisma.reading.create({
          data: {
            userId: user.id,
            question: lastMessage,
            fullAnswer: aiText,
            spreadType: selectedCards.length === 1 ? "one-card" : "three-card",
          }
        });
      }
    } catch (e) {
      console.log("DB 저장 실패 (하지만 해석은 전송됨):", e);
    }

    // 4. 최종 해석 전송 (이게 화면에 떠야 합니다)
    return NextResponse.json({ text: aiText });

  } catch (error: any) {
    return NextResponse.json({ error: "백엔드 치명적 오류", message: error.message }, { status: 500 });
  }
}

export const GET = POST;