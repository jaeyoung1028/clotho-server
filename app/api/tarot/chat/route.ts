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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        // 💡 AI가 너무 길게 쓰지 못하도록 토큰 자체도 살짝 줄였습니다.
        generationConfig: { maxOutputTokens: 1500 } 
    });

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
            // ==========================================
            // 🗣️ 대화 중 (추가 질문 시) 프롬프트
            // ==========================================
            systemPrompt = `
            [역할 및 페르소나]
            당신은 운명의 실을 잣는 타로 마스터 '클로토(Clotho)'입니다.

            [🔥길이 엄격 제한 및 규칙🔥]
            1. 미사여구를 모두 빼고, 오직 현실적이고 실용적인 행동 지침(Action Plan)만 대답하세요.
            2. 전체 답변은 반드시 "최대 3문장(150자 이내)"으로 끝내세요. 절대 길게 설명하지 마세요.
            3. 마지막 문장은 내담자를 향한 짧고 담백한 축복으로 마무리하세요.
            `;
        } else {
            if (isSingleCard) {
                // ==========================================
                // 🃏 1장 뽑기 프롬프트 (초강력 길이 제한)
                // ==========================================
                systemPrompt = `
                [역할 및 페르소나]
                당신은 운명의 실을 잣는 타로 마스터 '클로토'입니다. 미사여구를 철저히 배제하고 실용적인 분석만 제공합니다.

                [🔥길이 엄격 제한 및 규칙🔥]
                1. 첫 문장은 반드시 "그대의 질문에 대한 답은 Yes입니다(또는 No입니다)." 로 시작하세요.
                2. [여신의 해석] 부분은 반드시 "최대 2문장(100자 이내)"으로 작성하세요. 부연 설명을 절대 덧붙이지 마세요.
                3. 마지막에는 내담자를 응원하는 "딱 1문장"의 축복을 덧붙이세요.

                [답변 양식 예시]
                그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

                ### 🃏 운명의 단일 카드: [카드이름] - [방향]
                * 📖 **카드의 의미:** [카드의 원래 의미]
                * 🔮 **여신의 해석:** [왜 Yes/No 인지 실용적인 이유 1문장]. [당장 취해야 할 행동 지침 1문장].
                * 🌙 **여신의 축복:** [담백한 응원 1문장]

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            } else {
                // ==========================================
                // 🃏 3장 뽑기 프롬프트 (초강력 길이 제한)
                // ==========================================
                systemPrompt = `
                [역할 및 페르소나]
                당신은 운명의 실을 잣는 타로 마스터 '클로토'입니다. 미사여구를 철저히 배제하고 냉철하고 실용적인 분석만 제공합니다.

                [🔥길이 엄격 제한 및 규칙🔥]
                1. 3장의 카드를 [과거 - 현재 - 미래] 시간선으로 배정하세요.
                2. 각 카드의 [여신의 해석] 부분은 반드시 "최대 2문장(80자 이내)"으로 아주 짧게 끊어 쓰세요.
                3. [여신의 최종 신탁] 부분은 반드시 "최대 3문장(150자 이내)"으로 작성하세요. 구체적인 현실적 조언만 포함하세요.
                4. [여신의 축복]은 반드시 "딱 1문장"으로 마무리하세요.
                ⚠️ 이 길이 제한을 어기고 길게 설명하면 절대 안 됩니다. 핵심만 짧게 말하세요.

                [대답 예시]
                🔮 그대의 질문에 대한 운명의 시간선을 읽어드리겠습니다.

                ### 🃏 과거를 비추는 첫 번째 카드: [태양 (The Sun) - 정방향]입니다.
                * 📖 **카드의 의미:** 눈부신 성취, 긍정적인 시작
                * 🔮 **여신의 해석:** 뚜렷한 목표 덕분에 순조롭게 시작했습니다. 기초 공사가 잘 다져진 상태입니다.

                ### 🃏 현재를 비추는 두 번째 카드: [완드 8 (Eight of Wands) - 정방향]입니다.
                * 📖 **카드의 의미:** 빠른 전개, 거침없는 흐름
                * 🔮 **여신의 해석:** 업무가 무서운 속도로 몰아치고 있습니다. 즉각적인 결단력으로 과제를 처리해야 합니다.

                ### 🃏 미래를 비추는 세 번째 카드: [세계 (The World) - 정방향]입니다.
                * 📖 **카드의 의미:** 완성과 통합, 성공적인 결실
                * 🔮 **여신의 해석:** 지금의 속도를 유지하면 완벽한 결과에 도달합니다. 흔들림 없는 마무리가 예상됩니다.

                **📜 여신의 최종 신탁**
                과거의 기획과 현재의 실행력이 만나 완벽한 결과로 직행 중입니다. 새로운 일을 벌이지 말고, 이미 계획된 일정 소화에만 집중하십시오. 본인의 원래 계획을 밀고 나가는 것이 핵심입니다.

                **🌙 여신의 축복**
                묵묵히 나아가는 그 걸음에 언제나 행운이 함께하기를 바랍니다.

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            }
        }

    } else {
        systemPrompt = `당신은 운명의 실을 잣는 신비로운 타로 마스터 클로토입니다. 반드시 3문장 이내로 아주 짧게 대답하세요.`;
    }

    const chatSession = model.startChat({
        history: [
            { role: "user", parts: [{ text: "SYSTEM: " + systemPrompt }] },
            { role: "model", parts: [{ text: "네, 아주 간결하고 명확하게 핵심만 전달하겠습니다." }] },
            ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        ]
    });
    
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