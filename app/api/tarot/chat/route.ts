import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages;
    
    // ✨ [핵심 1] 프론트가 selectedCards로 보내든 cards로 보내든 무조건 다 잡아냅니다!
    const targetCards = body.selectedCards || body.cards || [];
    const lastMessage = messages[messages.length - 1].content;
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. 유저 확인
    let testUser = await prisma.user.findFirst({ where: { name: "TestGuest" } });
    if (!testUser) {
        testUser = await prisma.user.create({ data: { name: "TestGuest", email: "guest@example.com" } });
    }
    const currentUserId = testUser.id;

    let systemPrompt = "";
    let drawnCards: Record<string, any>[] = []; 
    
    // 2. 카드 정보 가져오기 & 프롬프트 생성
    if (targetCards && targetCards.length > 0) {
        const cardsFromDB = await prisma.tarotCard.findMany({
            where: { number: { in: targetCards } }
        });

        const orderedCardsFromDB = targetCards.map((num: number) => 
            cardsFromDB.find((c) => c.number === num)
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
            systemPrompt = `당신은 운명의 여신 '클로토'입니다. 
[절대 규칙]
1. 사용자는 단 '1장'의 카드만 뽑았습니다.
2. 답변의 시작은 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."로 시작하세요.
3. 뽑힌 카드가 '정방향'인지 '역방향'인지 명시하고, 여신의 우아한 말투로 조언하세요.

[뽑힌 카드 정보]
${cardInfoText}

[사용자 질문]
${lastMessage}`;
        } else {
            systemPrompt = `당신은 운명의 여신 '클로토'입니다.
[절대 규칙]
1. 3장의 카드를 각각 [과거 - 현재 - 미래]의 시간선으로 배정하여 해석하세요.
2. 각 카드마다 반드시 [정방향] 또는 [역방향]임을 표시하세요.
3. 여신의 우아하고 진중한 말투로 해석을 진행하세요.

[뽑힌 카드 정보]
${cardInfoText}

[사용자 질문]
${lastMessage}`;
        }
    } else {
        systemPrompt = `당신은 운명의 여신 클로토입니다. 신비롭고 다정한 말투로 대답하세요.`;
    }

    // ✨ [핵심 2] 프롬프트가 완성된 후에 모델을 초기화하면서 'systemInstruction'으로 강제 주입!
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", // 구글에서 가장 안정적으로 지원하는 최신 모델명
        systemInstruction: systemPrompt, // 👈 제미나이의 뇌(규칙)에 프롬프트를 콱 박아버립니다!
        generationConfig: { 
            maxOutputTokens: 1500,
            temperature: 0.7
        }
    });

    // 3. AI 응답 생성 (이제 잡다한 꼼수 없이 깔끔하게 대화만 보냅니다)
    const chatSession = model.startChat({
        history: messages.slice(0, -1).map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }))
    });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    // 4. DB 저장
    if (targetCards && targetCards.length > 0 && drawnCards.length > 0) {
        await prisma.reading.create({
            data: {
                userId: currentUserId,
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

    return NextResponse.json({ text: aiResponse });

  } catch (error) {
    console.error("에러 발생:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}