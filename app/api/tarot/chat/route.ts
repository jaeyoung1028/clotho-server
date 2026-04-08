import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages;
    
    // 프론트에서 어떤 이름으로 보내든 카드 배열을 찾아냄
    const targetCards = body.selectedCards || body.cards || body.cardIds || [];
    const lastMessage = messages[messages.length - 1].content;
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    let systemPrompt = "";
    let drawnCards: any[] = []; 
    
    if (targetCards && targetCards.length > 0) {
        // DB에서 카드 정보 조회
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

        // 1장 / 3장 프롬프트 설정
        if (targetCards.length === 1) {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
딱 1장의 카드만 해석하세요. 답변 시작은 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."여야 합니다. 
[카드 정보]\n${cardInfoText}\n\n[질문]: ${lastMessage}`;
        } else {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
3장의 카드를 [과거-현재-미래] 순서로 해석하세요. 매우 우아하고 진중한 말투를 사용하세요.
[카드 정보]\n${cardInfoText}\n\n[질문]: ${lastMessage}`;
        }
    } else {
        systemPrompt = `당신은 운명의 여신 클로토입니다. 다정하게 대화하세요.`;
    }

    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt,
        // ✨ [추가] AI가 무서운 카드(죽음 등) 보고 대답 거부하지 못하게 검열 해제
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.8 }
    });

    const chatSession = model.startChat({
        history: messages.slice(0, -1).map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }))
    });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    // ============================================================
    // 🚫 [실험] DB 저장 로직 임시 차단 (여기가 범인인지 확인용)
    // ============================================================
    /*
    if (targetCards.length > 0 && drawnCards.length > 0) {
        await prisma.reading.create({
            data: {
                userId: (await prisma.user.findFirst())?.id || "", 
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
    */
    // ============================================================

    return NextResponse.json({ text: aiResponse });

  } catch (error) {
    console.error("Critical Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}