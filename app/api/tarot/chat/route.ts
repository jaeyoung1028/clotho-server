import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { messages, selectedCards } = await req.json();
    const lastMessage = messages[messages.length - 1].content;
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 👇 이 부분을 아까 제가 드린 1.5에서 다시 2.5로 바꿔주세요!
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", // 원래 쓰시던 이름으로 원상복구!
        generationConfig: { 
            maxOutputTokens: 1500, // 👈 이건 끊김 방지용이니 1500으로 그대로 둡니다!
            temperature: 0.7
        }
    });
    // 1. 유저 확인
    let testUser = await prisma.user.findFirst({ where: { name: "TestGuest" } });
    if (!testUser) {
        testUser = await prisma.user.create({ data: { name: "TestGuest", email: "guest@example.com" } });
    }
    const currentUserId = testUser.id;

    let systemPrompt = "";
    let drawnCards: Record<string, any>[] = []; 
    
    // 2. 카드 정보 가져오기 & 방향 결정
    if (selectedCards && selectedCards.length > 0) {
        const cardsFromDB = await prisma.tarotCard.findMany({
            where: { number: { in: selectedCards } }
        });

        // 유저가 뽑은 순서대로 정렬
        const orderedCardsFromDB = selectedCards.map((num: number) => 
            cardsFromDB.find((c) => c.number === num)
        ).filter(Boolean);

        // 정/역방향 및 의미 결정
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

        const isSingleCard = selectedCards.length === 1;

        if (isSingleCard) {
            // ==========================================
            // 🃏 1장 뽑기 전용 시스템 프롬프트
            // ==========================================
            systemPrompt = `
            당신은 운명의 여신 '클로토'입니다. 
            [절대 규칙]
            1. 사용자는 단 '1장'의 카드만 뽑았습니다. 절대로 추가적인 카드를 언급하지 마세요.
            2. 답변의 시작은 반드시 "그대의 질문에 대한 답은 [Yes/No]입니다."로 시작해야 합니다.
            3. 뽑힌 카드가 '정방향'인지 '역방향'인지 반드시 명시하세요.

            [출력 양식]
            그대의 질문에 대한 답은 [Yes/No]입니다.

            ### 🃏 운명의 단일 카드: [카드이름] - [정방향/역방향]
            * 📖 **카드의 의미:** [카드의 기본 의미]
            * 🔮 **여신의 해석:** [왜 Yes/No인지 설명]

            사용자가 뽑은 카드 정보:
            ${cardInfoText}

            사용자의 질문: "${lastMessage}"
            `;
        } else {
            // ==========================================
            // 🃏 3장 뽑기 전용 시스템 프롬프트
            // ==========================================
            systemPrompt = `
            당신은 운명의 여신 '클로토'입니다.
            [절대 규칙]
            1. 3장의 카드를 각각 [과거 - 현재 - 미래]의 시간선으로 배정하여 해석하세요.
            2. 각 카드마다 반드시 [정방향] 또는 [역방향]임을 표시하세요.
            3. 마지막에는 3장의 흐름을 요약하는 '최종 신탁'을 제공하세요.

            [출력 양식]
            🔮 여신의 응답 (인사말)
            ⏳ 운명의 시간선 (과거/현재/미래 안내)

            ### 🃏 과거를 비추는 첫 번째 카드: [카드명] - [방향]
            [해석]
            ### 🃏 현재를 비추는 두 번째 카드: [카드명] - [방향]
            [해석]
            ### 🃏 미래를 비추는 세 번째 카드: [카드명] - [방향]
            [해석]

            📜 여신의 최종 신탁 (요약)
            🌙 여신의 축복 (마무리)

            사용자가 뽑은 카드 정보:
            ${cardInfoText}

            사용자의 질문: "${lastMessage}"
            `;
        }
    } else {
        systemPrompt = `당신은 운명의 여신 클로토입니다. 이전 대화를 기억하며 다정하고 신비롭게 답변하세요.`;
    }

    // 3. AI 응답 생성
    const chatSession = model.startChat({
        history: [
            { role: "user", parts: [{ text: "SYSTEM: " + systemPrompt }] },
            { role: "model", parts: [{ text: "운명의 실타래를 읽을 준비가 되었습니다." }] },
            ...messages.slice(0, -1).map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        ]
    });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    // 4. DB 저장
    if (selectedCards && selectedCards.length > 0 && drawnCards.length > 0) {
        await prisma.reading.create({
            data: {
                userId: currentUserId,
                question: lastMessage,
                fullAnswer: aiResponse,
                spreadType: selectedCards.length === 1 ? "one-card" : "three-card",
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