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
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    if (!apiKey) throw new Error("서버 환경 변수에 GOOGLE_API_KEY가 없습니다.");

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
            `${index + 1}번째 카드: ${card.nameKo} (${card.name}) - [${card.directionName}]\n- 원래 의미: ${card.currentMeaning}`
        ).join("\n\n");

        const isSingleCard = selectedCards.length === 1;

        if (isFollowUp) {
            systemPrompt = `
            [역할] 타로 마스터 '클로토(Clotho)'.
            [규칙] 현실적인 단어로 최대 3문장 이내로 답변하고, 마지막은 1줄 축복으로 끝내세요.
            `;
        } else {
            if (isSingleCard) {
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 추상적인 표현을 배제하고 직관적인 단어만 사용합니다.

                [🔥절대 규칙🔥]
                1. 첫 문장은 "그대의 질문에 대한 답은 Yes(또는 No)입니다."
                2. [여신의 해석]: 팩트와 행동 지침 딱 2~3문장.
                3. [여신의 축복]: 응원 딱 1문장.

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                `;
            } else {
                // ==========================================
                // ✨ 가독성 최적화: 종합 조언도 3문장으로 제한! ✨
                // ==========================================
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 추상적인 단어를 배제하고 현실적이고 직관적인 단어만 사용하여 분석합니다.

                [🔥절대 규칙🔥]
                1. 3장의 카드를 [과거 - 현재 - 미래] 시간선으로 배정하세요.
                2. [여신의 해석]: 각 카드의 해석은 반드시 "2~3문장"으로 명확한 팩트와 서사만 전달하세요.
                3. [여신의 최종 신탁]: 내담자가 읽을 때 피로감을 느끼지 않도록, 전체 흐름을 관통하는 핵심 조언만 "최대 3문장" 이내로 임팩트 있고 간결하게 작성하세요.
                4. [여신의 축복]: 무조건 "딱 1문장"으로 마무리하세요.

                [대답 예시: '취업' 관련 질문 시]
                🔮 그대의 질문에 대한 운명의 시간선을 읽어드리겠습니다.

                ### 🃏 과거를 비추는 첫 번째 카드: [연인 (The Lovers) - 정방향]입니다.
                * 📖 **카드의 의미:** 선택, 가치관의 일치, 중요한 인연
                * 🔮 **여신의 해석:** 본인이 나아가고자 하는 직무나 목표가 명확히 설정되었음을 뜻합니다. 과거에 맺었던 좋은 인연이나 협력 경험이 현재의 든든한 기반이 되었습니다.

                ### 🃏 현재를 비추는 두 번째 카드: [완드 8 (Eight of Wands) - 정방향]입니다.
                * 📖 **카드의 의미:** 빠른 전개, 거침없는 흐름
                * 🔮 **여신의 해석:** 뚜렷한 목표를 바탕으로 실무적인 제안이나 기회가 빠른 속도로 들어오고 있습니다. 지체할 시간 없이 즉각적으로 결정하고 실행에 옮겨야 할 시점입니다.

                ### 🃏 미래를 비추는 세 번째 카드: [세계 (The World) - 정방향]입니다.
                * 📖 **카드의 의미:** 완성과 통합, 성공적인 결실
                * 🔮 **여신의 해석:** 현재의 빠른 실행력이 더해져, 원하던 직장이나 프로젝트에서 최종적인 합격과 보상을 얻게 됩니다. 외부의 방해 없이 본인의 목표가 현실로 완성될 것입니다.

                **📜 여신의 최종 신탁**
                과거의 확고한 목표가 현재의 빠른 기회로 연결되어 성공으로 직행하고 있습니다. 새로운 고민으로 시간을 낭비하지 말고 지금 들어오는 제안을 적극적으로 실행하십시오. 원래의 기획을 밀고 나간다면 흔들림 없이 가장 완벽한 결과를 맺게 될 것입니다.

                **🌙 여신의 축복**
                스스로의 가치를 증명해 낼 그대의 앞날에 행운이 함께하기를 바랍니다.

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
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt, 
        generationConfig: { 
            maxOutputTokens: 600, // 너무 길어지지 않도록 안전망(600)으로 다시 설정
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
        cardsInfo: drawnCards.map(c => ({ id: c.number, orientation: c.orientation })) 
    });

  } catch (error: any) {
    console.error("에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
    return NextResponse.json({ 
        message: "타로 백엔드 정상 작동 중! 프론트엔드에서 POST 방식으로 호출해주세요." 
    });
}