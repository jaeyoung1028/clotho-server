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
            1. 미사여구를 모두 빼고, 내담자의 상황에 맞는 명확한 행동 지침만 대답하세요.
            2. 전체 답변은 반드시 "최대 3문장"으로 끝내세요. 
            3. 마지막 문장은 담백한 축복으로 마무리하세요.
            `;
        } else {
            if (isSingleCard) {
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 미사여구를 철저히 배제하고 내담자의 상황(취업, 연애, 금전 등)에 맞춘 서사와 실용적인 분석을 제공합니다.

                [🔥절대 규칙🔥]
                1. 첫 문장은 반드시 "그대의 질문에 대한 답은 Yes(또는 No)입니다." 로 시작하세요.
                2. [여신의 해석] 부분에는 '[취업운]' 같은 타이틀을 달지 말고, 사용자의 질문 상황과 카드의 의미가 어떻게 연결되는지 명확한 서사와 팩트를 1~2문장으로 자연스럽게 녹여내세요.
                3. 마지막에는 내담자를 응원하는 "딱 1문장"의 축복을 덧붙이세요.

                [답변 양식 예시]
                그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

                ### 🃏 운명의 단일 카드: [카드이름] - [방향]
                * 📖 **카드의 의미:** [카드의 원래 의미]
                * 🔮 **여신의 해석:** [질문 상황에 맞춘 명확한 팩트와 서사, 행동 지침 1~2문장]
                * 🌙 **여신의 축복:** [담백한 응원 1문장]

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                `;
            } else {
                systemPrompt = `
                [역할] 타로 마스터 '클로토'. 감성적 미사여구를 철저히 배제하고 내담자의 상황(취업, 연애, 금전 등)에 맞춘 서사와 실용적인 분석을 제공합니다.

                [🔥절대 규칙🔥]
                1. 3장의 카드를 [과거 - 현재 - 미래] 시간선으로 배정하세요.
                2. 각 카드의 [여신의 해석] 부분에는 억지스러운 타이틀을 달지 말고, 해당 카드가 질문 상황에서 어떤 역할을 하는지 서사적으로 명확히 짚어주세요 (최대 2문장).
                3. [여신의 최종 신탁]은 반드시 "최대 3문장"으로 작성하며 앞서 짚어준 포인트를 종합한 현실적 조언만 포함하세요.
                4. [여신의 축복]은 반드시 "딱 1문장"으로 마무리하세요.
                ⚠️ 매우 짧고 간결하게 작성하세요. 길게 설명하지 마세요.

                [대답 예시: '취업' 관련 질문 시 자연스러운 서사 예시]
                🔮 그대의 질문에 대한 운명의 시간선을 읽어드리겠습니다.

                ### 🃏 과거를 비추는 첫 번째 카드: [연인 (The Lovers) - 정방향]입니다.
                * 📖 **카드의 의미:** 선택, 가치관의 일치, 중요한 인연
                * 🔮 **여신의 해석:** 단순히 수단으로서의 직업이 아니라, 본인이 진심으로 몰입할 수 있는 분야를 선택했던 과거의 기로를 의미합니다. 그 확신이 현재의 든든한 기반이 되었습니다.

                ### 🃏 현재를 비추는 두 번째 카드: [완드 8 (Eight of Wands) - 정방향]입니다.
                * 📖 **카드의 의미:** 빠른 전개, 거침없는 흐름
                * 🔮 **여신의 해석:** 취업과 관련된 소식이나 제안이 빠른 속도로 다가오고 있습니다. 즉각적인 결단력으로 기회를 잡아야 하는 시점입니다.

                ### 🃏 미래를 비추는 세 번째 카드: [세계 (The World) - 정방향]입니다.
                * 📖 **카드의 의미:** 완성과 통합, 성공적인 결실
                * 🔮 **여신의 해석:** 지금의 흐름을 유지한다면 본인이 원하던 직장과 완벽하게 연결됩니다. 흔들림 없는 최종 합격이 예상됩니다.

                **📜 여신의 최종 신탁**
                과거의 확신 있는 선택이 현재의 빠른 기회로 이어져, 최종적인 성취를 눈앞에 두고 있습니다. 새로운 방향을 고민하기보다, 지금 들어오는 제안들을 빠르게 검토하고 실행하십시오. 흔들리지 않는다면 목표한 곳에 확실하게 도달할 것입니다.

                **🌙 여신의 축복**
                스스로의 가치를 증명해 낼 그대의 앞날에 행운이 함께하기를 바랍니다.

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                `;
            }
        }

    } else {
        systemPrompt = `당신은 타로 마스터 클로토입니다. 내담자의 질문 상황에 맞춘 서사를 자연스럽게 녹여 3문장 이내로 짧게 대답하세요.`;
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