import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    
    // 프론트엔드가 어떤 이름(Key)으로 보내든 카드 배열을 악착같이 찾아냅니다.
    const targetCards = body.selectedCards || body.cards || body.cardIds || [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "";
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    let systemPrompt = "";
    let drawnCards: any[] = []; 
    
    // 1. 카드 정보 및 프롬프트 준비
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

        if (targetCards.length === 1) {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 질문에 대한 답은 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."로 시작하세요.\n[카드 정보]\n${cardInfoText}\n\n[질문]: ${lastMessage}`;
        } else {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 3장의 카드를 [과거-현재-미래] 순서로 해석하세요.\n[카드 정보]\n${cardInfoText}\n\n[질문]: ${lastMessage}`;
        }
    } else {
        systemPrompt = `당신은 운명의 여신 클로토입니다. 신비롭고 다정하게 대답하세요.`;
    }

    // 2. AI 모델 설정 (검열 해제 포함)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.8 }
    });

    // 3. AI 응답 생성
    const result = await model.generateContent(lastMessage);
    const aiResponse = result.response.text();

    // 4. DB 저장 (다시 활성화!)
    if (targetCards.length > 0 && drawnCards.length > 0) {
        try {
            // 유저가 한 명도 없을 경우를 대비한 최소한의 안전장치
            const user = await prisma.user.findFirst();
            if (user) {
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
        } catch (dbError: any) {
            // DB 저장에서 터지면 여기서 잡아서 로그를 남깁니다.
            console.error("DB 저장 실패:", dbError.message);
            // 흐름을 끊지 않기 위해 일단 대답은 반환합니다.
        }
    }

    return NextResponse.json({ text: aiResponse });

  } catch (error: any) {
    console.error("최종 에러:", error.message);
    return NextResponse.json({ 
      error: "백엔드 에러 발생: " + error.message 
    }, { status: 500 });
  }
}