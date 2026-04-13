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
            [역할] 타로 마스터 '클로토(Clotho)'. 정중한 하대 사용.
            [규칙]
            1. 추상적인 단어를 배제하고, 내담자가 바로 이해할 수 있는 현실적인 단어로만 행동 지침을 대답하세요.
            2. 전체 답변은 반드시 "최대 3문장"으로 끝내세요. 
            3. 마지막 문장은 담백한 축복으로 마무리하세요.
            `;
        } else {
            if (isSingleCard) {
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 모호하고 추상적인 타로식 표현을 배제하고, 누구나 이해할 수 있는 현실적이고 직관적인 단어만 사용합니다.

                [🔥절대 규칙🔥]
                1. 첫 문장은 반드시 "그대의 질문에 대한 답은 Yes(또는 No)입니다." 로 시작하세요.
                2. [여신의 해석] 부분은 추상적인 묘사를 빼고, 사용자의 질문 상황에 맞춰 구체적인 팩트와 현실적인 지침을 딱 2문장으로 작성하세요.
                3. 마지막에는 내담자를 응원하는 "딱 1문장"의 축복을 덧붙이세요.

                [답변 양식 예시]
                그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

                ### 🃏 운명의 단일 카드: [카드이름] - [방향]
                * 📖 **카드의 의미:** [카드의 원래 의미]
                * 🔮 **여신의 해석:** [현실적인 단어로 작성된 팩트와 행동 지침 2문장]
                * 🌙 **여신의 축복:** [담백한 응원 1문장]

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                `;
            } else {
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 뜬구름 잡는 추상적인 단어(기운, 빛, 운명 등)를 철저히 배제하고, 실생활에서 쓰는 현실적이고 명확한 단어(직무, 자금, 목표, 관계 등)만 사용하여 분석합니다.

                [🔥절대 규칙🔥]
                1. 3장의 카드를 [과거 - 현재 - 미래] 시간선으로 배정하세요.
                2. [연결성 강조]: 과거의 사건이 어떻게 현재의 원인이 되었고, 현재의 행동이 어떻게 미래의 결과로 이어지는지 그 인과관계를 반드시 명확하게 연결해서 설명하세요.
                3. [여신의 해석] 부분은 추상적인 묘사를 빼고, 딱 2문장 정도로 현실적인 팩트만 전달하세요.
                4. [여신의 최종 신탁]은 최대 3문장으로, 앞선 과거-현재-미래의 연결성을 종합하여 당장 실행해야 할 현실적 조언을 포함하세요.
                5. [여신의 축복]은 반드시 "딱 1문장"으로 마무리하세요.

                [대답 예시: '취업/목표' 관련 질문 시 명확한 연결성 예시]
                🔮 그대의 질문에 대한 운명의 시간선을 읽어드리겠습니다.

                ### 🃏 과거를 비추는 첫 번째 카드: [연인 (The Lovers) - 정방향]입니다.
                * 📖 **카드의 의미:** 선택, 가치관의 일치, 중요한 인연
                * 🔮 **여신의 해석:** 이미 본인이 나아가고자 하는 직무나 목표가 명확히 설정되었음을 뜻합니다. 혹은 과거에 맺었던 좋은 인연이나 협력 경험이 현재의 든든한 기반이 되었습니다.

                ### 🃏 현재를 비추는 두 번째 카드: [완드 8 (Eight of Wands) - 정방향]입니다.
                * 📖 **카드의 의미:** 빠른 전개, 거침없는 흐름
                * 🔮 **여신의 해석:** 과거에 쌓아둔 뚜렷한 목표와 인맥을 바탕으로, 지금 실무적인 기회나 제안이 빠른 속도로 들어오고 있습니다. 지체할 시간 없이 즉각적으로 결정하고 실행에 옮겨야 할 시점입니다.

                ### 🃏 미래를 비추는 세 번째 카드: [세계 (The World) - 정방향]입니다.
                * 📖 **카드의 의미:** 완성과 통합, 성공적인 결실
                * 🔮 **여신의 해석:** 현재의 빠른 실행력이 더해져, 원하던 직장이나 프로젝트에서 최종적인 합격과 보상을 얻게 됩니다. 외부의 방해 없이 본인의 목표가 현실로 완성될 것입니다.

                **📜 여신의 최종 신탁**
                과거의 뚜렷한 목표 설정이 현재의 구체적인 제안으로 연결되었고, 이를 빠르게 수용하면 성공적인 결과로 직행합니다. 새로운 방향을 고민하기보다, 지금 당장 주어진 기회를 놓치지 말고 실행하십시오.

                **🌙 여신의 축복**
                스스로의 가치를 증명해 낼 그대의 앞날에 행운이 함께하기를 바랍니다.

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                `;
            }
        }

    } else {
        systemPrompt = `당신은 타로 마스터 클로토입니다. 모호한 단어를 빼고 현실적인 단어를 사용하여 3문장 이내로 명확하게 대답하세요.`;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: systemPrompt, 
        generationConfig: { 
            maxOutputTokens: 600, 
            temperature: 0.8      
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