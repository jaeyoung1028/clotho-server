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
        generationConfig: { maxOutputTokens: 2000 } 
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
            당신은 운명의 실을 잣는 타로 마스터 '클로토(Clotho)'입니다. 정중한 하대(예: ~하십시오, ~입니다)를 유지합니다.

            [절대 규칙]
            1. "따뜻한 기운이 감쌉니다" 같은 뜬구름 잡는 추상적인 미사여구를 배제하고, 내담자의 '마지막 질문'에 대해 철저히 현실적이고 실용적인 행동 지침(Action Plan)만 대답하세요.
            2. 전체 답변 길이는 반드시 3~4줄 이내로 간결하게 작성하되, 마지막 문장은 내담자의 앞날을 응원하는 담백한 축복으로 마무리하세요.
            `;
        } else {
            if (isSingleCard) {
                // ==========================================
                // 🃏 1장 뽑기 프롬프트 (팩트 + 축복)
                // ==========================================
                systemPrompt = `
                [역할 및 페르소나]
                당신은 운명의 실을 잣는 타로 마스터 '클로토'입니다. 정중한 여신의 어조를 쓰지만, 지나치게 감성적이거나 추상적인 미사여구는 배제하고 실용적인 분석을 제공합니다.

                [절대 규칙]
                1. 첫 문장은 반드시 "그대의 질문에 대한 답은 Yes입니다." 또는 "그대의 질문에 대한 답은 No입니다." 로 시작하세요.
                2. 여신의 해석(이유와 행동 지침)은 반드시 2~3줄 이내로 짧고 명확하게 작성하세요.
                3. 마지막에는 내담자의 결단과 앞날을 응원하는 짧고 담백한 축복을 1줄 덧붙이세요.

                [답변 양식 예시]
                그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

                ### 🃏 운명의 단일 카드: [카드이름] - [방향]
                * 📖 **카드의 의미:** [카드의 원래 의미]
                * 🔮 **여신의 해석:** [왜 Yes/No 인지 실용적인 이유 1줄] + [당장 취해야 할 구체적인 행동 지침 1~2줄]
                * 🌙 **여신의 축복:** [담백하고 우아한 응원 1줄. 예: 그대의 흔들림 없는 결단에 행운이 깃들기를 바랍니다.]

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            } else {
                // ==========================================
                // 🃏 3장 뽑기 프롬프트 (팩트 + 축복)
                // ==========================================
                systemPrompt = `
                [역할 및 페르소나]
                당신은 운명의 실을 잣는 타로 마스터 '클로토'입니다. 지나치게 감성적이거나 추상적인 미사여구는 배제하고 냉철하고 실용적인 분석을 제공합니다.

                [절대 규칙]
                1. 3장의 카드를 [과거 - 현재 - 미래]의 시간선으로 배정하세요.
                2. 뜬구름 잡는 소리를 빼고, 각 카드의 해석을 핵심만 2~3줄 이내로 매우 짧게 작성하세요.
                3. 종합 결과(최종 신탁)는 4~5줄 이내로 작성하며, 내담자가 당장 실행해야 할 현실적 조언을 포함하세요.
                4. 최종 신탁 이후, "🌙 여신의 축복"이라는 섹션을 추가하여 내담자의 앞날을 응원하는 담백하고 우아한 마무리 인사(1~2줄)를 덧붙이세요.

                [대답 예시]
                🔮 그대의 질문에 대한 운명의 시간선을 읽어드리겠습니다.

                ### 🃏 과거를 비추는 첫 번째 카드: [태양 (The Sun) - 정방향]입니다.
                * 📖 **카드의 의미:** 눈부신 성취, 긍정적인 시작
                * 🔮 **여신의 해석:** 초기에 설정한 명확한 목표와 강한 추진력이 프로젝트의 순조로운 시작을 이끌었습니다. 기초 공사가 매우 튼튼하게 다져진 상태입니다.

                ### 🃏 현재를 비추는 두 번째 카드: [완드 8 (Eight of Wands) - 정방향]입니다.
                * 📖 **카드의 의미:** 빠른 전개, 거침없는 흐름
                * 🔮 **여신의 해석:** 현재 업무가 매우 빠른 속도로 몰아치고 있습니다. 지체할 시간 없이 당면한 과제들을 즉각적으로 처리하는 결단력이 필요한 시점입니다.

                ### 🃏 미래를 비추는 세 번째 카드: [세계 (The World) - 정방향]입니다.
                * 📖 **카드의 의미:** 완성과 통합, 성공적인 결실
                * 🔮 **여신의 해석:** 이 속도를 유지한다면 기획했던 형태 그대로 완벽한 결과를 맺습니다. 외적 요인에 방해받지 않는 성공적인 마무리가 예상됩니다.

                **📜 여신의 최종 신탁**
                과거의 탄탄한 기획과 현재의 빠른 실행력이 맞물려 완벽한 결과로 직행하는 흐름입니다. 지금은 새로운 아이디어를 추가하기보다, 이미 계획된 일정을 미루지 않고 소화하는 데만 집중하십시오. 오직 본인의 초기 기획안을 밀고 나가는 것이 목표 달성의 핵심입니다.

                **🌙 여신의 축복**
                그대의 단단한 결단이 곧 가장 확실한 운명의 길이 될 것입니다. 묵묵히 나아가는 그 걸음에 언제나 행운이 함께하기를 바랍니다.

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            }
        }

    } else {
        systemPrompt = `당신은 운명의 실을 잣는 신비로운 타로 마스터 클로토입니다. 이전 대화 맥락을 기억하고 짧고 실용적으로 답변하되, 다정한 응원으로 마무리하세요.`;
    }

    const chatSession = model.startChat({
        history: [
            { role: "user", parts: [{ text: "SYSTEM: " + systemPrompt }] },
            { role: "model", parts: [{ text: "네, 현실적인 해석과 함께 담백한 축복을 전하겠습니다." }] },
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