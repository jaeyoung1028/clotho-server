import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleRequest(req: Request) {
  try {
    // 1. 데이터 가져오기 (POST/GET 통합)
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    } else {
      const { searchParams } = new URL(req.url);
      body = {
        messages: [{ role: "user", content: "내 운명을 알려다오." }],
        selectedCards: [Math.floor(Math.random() * 22), Math.floor(Math.random() * 22), Math.floor(Math.random() * 22)]
      };
    }

    const messages = body.messages || [];
    const targetCards = body.selectedCards || body.cards || [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "해석을 시작하라.";
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    // 2. DB에서 카드 정보 조회 및 정렬
    const cardsFromDB = await prisma.tarotCard.findMany({
        where: { number: { in: targetCards.map((n: any) => Number(n)) } }
    });

    // 프론트에서 보낸 순서대로 카드 재정렬 및 정/역방향 결정
    const drawnCards = targetCards.map((num: any) => {
        const card = cardsFromDB.find((c) => c.number === Number(num));
        if (!card) return null;
        const isReversed = Math.random() < 0.5;
        return {
            ...card,
            orientation: isReversed ? "reversed" : "upright",
            directionName: isReversed ? "역방향" : "정방향",
            currentMeaning: isReversed && card.meaningRev ? card.meaningRev : card.meaningUp
        };
    }).filter(Boolean);

    if (drawnCards.length === 0) {
        throw new Error("뽑힌 카드가 데이터베이스에 존재하지 않습니다.");
    }

    // 3. 1장/3장 전용 시스템 프롬프트 구성
    let systemPrompt = "";
    const cardInfoText = drawnCards.map((card: any, idx: number) => 
        `${idx + 1}번 카드: ${card.nameKo} (${card.directionName}) - 의미: ${card.currentMeaning}`
    ).join("\n");

    if (drawnCards.length === 1) {
        systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
[필수 규칙]
1. 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."로 답변을 시작하세요.
2. 우아하고 신비로운 말투를 사용하세요.
3. 뽑힌 카드 한 장에 집중하여 조언하세요.

[카드 정보]
${cardInfoText}`;
    } else {
        systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
[필수 규칙]
1. 3장의 카드를 각각 [과거], [현재], [미래]의 순서로 배정하여 해석하세요.
2. 각 시간선마다 카드가 상징하는 바를 진중하게 설명하세요.
3. 여신의 기품 있는 말투를 유지하세요.

[카드 정보]
${cardInfoText}`;
    }

    // 4. AI 실행 (Gemini 1.5 Flash 사용 - 가장 안정적)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
    });

    const result = await model.generateContent(lastMessage);
    const aiResponse = result.response.text();

    // 5. DB 저장 로직 (실패해도 응답은 나가도록 try-catch)
    try {
        const user = await prisma.user.findFirst(); // 테스트용 유저
        if (user) {
            await prisma.reading.create({
                data: {
                    userId: user.id,
                    question: lastMessage,
                    fullAnswer: aiResponse,
                    spreadType: drawnCards.length === 1 ? "one-card" : "three-card",
                    cards: {
                        create: drawnCards.map((card: any, idx: number) => ({
                            cardId: card.id,
                            position: idx,
                            orientation: card.orientation
                        }))
                    }
                }
            });
        }
    } catch (dbError) {
        console.error("DB 저장 중 오류 발생(무시하고 진행):", dbError);
    }

    return NextResponse.json({ text: aiResponse });

  } catch (error: any) {
    console.error("최종 에러:", error.message);
    return NextResponse.json({ 
        error: "운명의 실타래가 엉켰습니다.", 
        detail: error.message 
    }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;