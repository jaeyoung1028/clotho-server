import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    
    // 프론트엔드가 보내는 다양한 카드 데이터 형식을 모두 수용합니다.
    const targetCards = body.selectedCards || body.cards || body.cardIds || [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "해석을 시작하라";
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    let systemPrompt = "";
    let drawnCards: any[] = []; 
    
    // 1. DB에서 카드 정보 조회 및 정방향/역방향 설정
    if (targetCards && targetCards.length > 0) {
        const cardsFromDB = await prisma.tarotCard.findMany({
            where: { number: { in: targetCards.map((n: any) => Number(n)) } }
        });

        const orderedCardsFromDB = targetCards.map((num: any) => 
            cardsFromDB.find((c) => c.number === Number(num))
        ).filter(Boolean);

        drawnCards = orderedCardsFromDB.map((card: any) => {
            const isReversed = Math.random() < 0.5; 
            return {
                ...card,
                orientation: isReversed ? "reversed" : "upright",
                directionName: isReversed ? "역방향" : "정방향",   
                currentMeaning: isReversed && card.meaningRev ? card.meaningRev : card.meaningUp 
            };
        });

        const cardInfoText = drawnCards.map((card, index) => 
            `${index + 1}번째 카드: ${card.nameKo} - [${card.directionName}]\n- 의미: ${card.currentMeaning}`
        ).join("\n\n");

        // 2. 1장 / 3장 맞춤형 프롬프트 설정
        if (targetCards.length === 1) {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
질문에 대한 답은 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."로 시작하세요. 
신비롭고 우아한 말투를 사용하세요.
[카드 정보]\n${cardInfoText}\n\n[사용자 질문]: ${lastMessage}`;
        } else {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
3장의 카드를 각각 [과거-현재-미래]의 시간선으로 배정하여 매우 진중하게 해석하세요.
[카드 정보]\n${cardInfoText}\n\n[사용자 질문]: ${lastMessage}`;
        }
    } else {
        systemPrompt = `당신은 운명의 여신 클로토입니다. 신비로운 분위기로 대답하세요.`;
    }

    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.8 }
    });

    // 3. AI 응답 생성
    const result = await model.generateContent(lastMessage);
    const aiResponse = result.response.text();

    // 4. DB 저장 (실패하더라도 응답은 나갈 수 있게 try-catch 처리)
    try {
        const user = await prisma.user.findFirst();
        if (user && targetCards.length > 0) {
            await prisma.reading.create({
                data: {
                    userId: user.id,
                    question: lastMessage,
                    fullAnswer: aiResponse,
                    spreadType: targetCards.length === 1 ? "one-card" : "three-card",
                    cards: {
                        create: drawnCards.map((card, idx) => ({
                            cardId: card.id,        
                            position: idx, 
                            orientation: card.orientation 
                        }))
                    }
                }
            });
        }
    } catch (dbError) {
        console.error("DB 저장 오류 (무시):", dbError);
    }

    return NextResponse.json({ text: aiResponse });

  } catch (error: any) {
    console.error("Critical Error:", error);
    return NextResponse.json({ error: "운명의 실타래가 엉켰습니다.", detail: error.message }, { status: 500 });
  }
}

// GET 요청 시에도 동작하도록 설정
export const GET = POST;