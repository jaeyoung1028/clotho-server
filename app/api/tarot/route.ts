import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    const messages = body.messages || [{ role: "user", content: "내 운명을 알려다오." }];
    const selectedCards = body.selectedCards || body.cards || body.cardIds || [];
    const lastMessage = messages[messages.length - 1].content;
    
    const isFollowUp = messages.length > 1;
    
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
    if (!apiKey) throw new Error("API KEY가 없습니다.");

    let currentUserId: string | null = null;
    try {
        let testUser = await prisma.user.findFirst({ where: { name: "TestGuest" } });
        if (!testUser) {
            testUser = await prisma.user.create({ data: { name: "TestGuest", email: "guest@example.com" } });
        }
        currentUserId = testUser.id;
    } catch (dbError) {
        console.error("유저 조회/생성 실패:", dbError);
    }

    let systemPrompt = "";
    let drawnCards: Record<string, any>[] = [];

    if (selectedCards && selectedCards.length > 0) {
        let cardsFromDB: any[] = [];
        try {
            cardsFromDB = await prisma.tarotCard.findMany({
                where: { number: { in: selectedCards.map(Number) } }
            });
        } catch (cardDbError) {
            throw new Error("카드 목록 에러: DB에서 카드를 불러오지 못했습니다.");
        }

        const orderedCardsFromDB = selectedCards.map((num: number) =>
            cardsFromDB.find((c) => c.number === Number(num))
        ).filter(Boolean);

        if (orderedCardsFromDB.length === 0) {
            throw new Error("뽑힌 카드가 데이터베이스에 존재하지 않습니다.");
        }

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
            `${index + 1}번째 카드: ${card.nameKo} (${card.name}) - [${card.directionName}]\n의미: ${card.currentMeaning}`
        ).join("\n\n");

        const isSingleCard = selectedCards.length === 1;

        if (isFollowUp) {
            systemPrompt = `
[역할] 타로 마스터 '클로토(Clotho)'.
[규칙] 현실적인 단어로 최대 3문장 이내로 답변하고, 마지막은 1줄 축복으로 끝내세요.

[절대 금지 사항]
- 카드의 의미를 사전처럼 나열하지 마시오.
- 추상적이고 모호한 표현을 사용하지 마시오.
- 반드시 내담자의 질문에 대한 직접적인 대답으로 문장을 마무리하시오.
            `;
        } else {
            if (isSingleCard) {
                systemPrompt = `
[역할] 타로 마스터 '클로토'. 추상적인 표현을 배제하고 직관적인 단어만 사용합니다.

[절대 규칙]
1. 첫 문장은 "그대의 질문에 대한 답은 Yes(또는 No)입니다."
2. [여신의 해석]: 팩트와 행동 지침 딱 2~3문장.
3. [여신의 축복]: 응원 딱 1문장.

[절대 금지 사항]
- 카드의 의미를 사전처럼 나열하지 마시오.
- 추상적이고 모호한 표현을 사용하지 마시오.
- 반드시 내담자의 질문에 대한 직접적인 대답으로 문장을 마무리하시오.

---
사용자가 뽑은 카드:
${cardInfoText}
            `;
            } else {
                systemPrompt = `
[역할] 타로 마스터 '클로토'. 추상적인 단어를 배제하고 현실적이고 직관적인 단어만 사용하여 분석합니다.

[절대 규칙]
1. 3장의 카드를 [과거 - 현재 - 미래] 시간선으로 배정하세요.
2. [여신의 해석]: 각 카드의 해석은 반드시 "2~3문장"으로 명확한 팩트와 서사만 전달하세요.
3. [여신의 최종 신탁]: 내담자가 읽을 때 피로감을 느끼지 않도록, 전체 흐름을 관통하는 핵심 조언만 "최대 3문장" 이내로 작성하세요.
4. [여신의 축복]: 무조건 "딱 1문장"으로 마무리하세요.

[절대 금지 사항]
- 카드의 의미를 사전처럼 나열하지 마시오.
- 추상적이고 모호한 표현을 사용하지 마시오.
- 반드시 내담자의 질문에 대한 직접적인 대답으로 문장을 마무리하시오.

---
사용자가 뽑은 카드:
${cardInfoText}
            `;
            }
        }

    } else {
        systemPrompt = `당신은 타로 마스터 클로토입니다. 모호한 단어를 빼고 현실적으로 대답하세요.`;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        systemInstruction: systemPrompt,
        generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.7
        }
    });

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }));

    const chatSession = model.startChat({ history });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    if (!isFollowUp && currentUserId && selectedCards && selectedCards.length > 0 && drawnCards.length > 0) {
        try {
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
        } catch (saveError) {
            console.error("DB 저장 오류:", saveError);
        }
    }

    return NextResponse.json({
        text: aiResponse,
        cards: drawnCards.map(c => ({ id: c.number, orientation: c.orientation }))
    });

  } catch (error: any) {
    console.error("에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
    return NextResponse.json(
        { error: "잘못된 요청 방식입니다. 해석을 보려면 POST 요청이 필요합니다." },
        { status: 405 }
    );
}