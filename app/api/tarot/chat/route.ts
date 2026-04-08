import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🔥 GET과 POST 모두 이 함수를 타게 만듭니다.
async function handleRequest(req: Request) {
  try {
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json();
    } else {
      // GET일 경우 URL 파라미터에서 데이터를 가져오거나 기본값을 씁니다.
      const { searchParams } = new URL(req.url);
      body = {
        messages: [{ role: "user", content: "오늘의 운세를 알려줘" }],
        selectedCards: [Math.floor(Math.random() * 22)] // 테스트용 랜덤 카드
      };
    }

    const messages = body.messages || [];
    const targetCards = body.selectedCards || body.cards || [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "타로 해석해줘";
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. 카드 정보 매칭
    const cardsFromDB = await prisma.tarotCard.findMany({
        where: { number: { in: targetCards.map((n: any) => Number(n)) } }
    });

    const drawnCards = cardsFromDB.map((card: any) => ({
        ...card,
        orientation: Math.random() < 0.5 ? "reversed" : "upright",
        directionName: Math.random() < 0.5 ? "역방향" : "정방향",
        currentMeaning: card.meaningUp
    }));

    // 2. 프롬프트 생성
    const systemPrompt = `당신은 운명의 여신 클로토입니다. 카드 정보: ${JSON.stringify(drawnCards)}`;

    // 3. AI 실행
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt,
        safetySettings: [{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }],
    });

    const result = await model.generateContent(lastMessage);
    return NextResponse.json({ text: result.response.text() });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ✨ GET, POST 둘 다 대응!
export async function GET(req: Request) { return handleRequest(req); }
export async function POST(req: Request) { return handleRequest(req); }