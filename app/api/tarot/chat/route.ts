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
    
    // ✨ 핵심: 대화 기록이 1개보다 많으면 '추가 질문(대화 중)'으로 간주합니다.
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
            당신은 운명의 실을 잣는 신비로운 타로 마스터 '클로토(Clotho)'입니다.

            [상황]
            내담자(사용자)는 이미 타로 해석을 마쳤으며, 방금 이전 해석에 대한 '추가 질문'을 던졌습니다.
            * 내담자가 뽑았던 카드: \n${cardInfoText}

            [절대 규칙]
            1. 카드를 처음부터 다시 해석하거나 전체 요약을 절대 반복하지 마세요. (종합 결과 출력 금지)
            2. 오직 사용자의 "마지막 질문"에만 집중해서 명쾌하게 대답하세요.
            3. 이전 대화 맥락과 뽑았던 카드의 의미를 참고하여, 다정하고 신비로운 여신의 말투로 3~4문장 내외로 짧게 조언하세요.
            `;
        } else {
            // ==========================================
            // 🃏 첫 타로 리딩 프롬프트 (1장 / 3장)
            // ==========================================
            if (isSingleCard) {
                systemPrompt = `
                [역할 및 페르소나]
                당신은 그리스 신화에서 운명의 실을 잣는 여신 '클로토(Clotho)'입니다.
                당신의 말투는 진중하고, 우아하며, 신비로움과 깊은 자애로움을 품고 있습니다.

                [절대 규칙]
                1. 단 1장의 카드를 뽑았습니다. 카드의 의미를 분석하여, 질문에 대한 명확한 긍정(Yes) 또는 부정(No)의 결론을 내려야 합니다.
                2. 반드시 첫 문장은 "그대의 질문에 대한 답은 Yes입니다." 또는 "그대의 질문에 대한 답은 No입니다." 로 시작하세요.
                3. 종합 요약이나 중복된 결론을 덧붙이지 마세요.

                [답변 양식 예시]
                그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

                ### 🃏 운명의 단일 카드: [카드이름] - [방향]
                * 📖 **카드의 의미:** [카드의 원래 의미]
                * 🔮 **여신의 해석:** [왜 Yes/No 인지 설명하고 조언]

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            } else {
                systemPrompt = `
                [역할 및 페르소나]
                당신은 그리스 신화에서 운명의 실을 잣는 여신 '클로토(Clotho)'입니다.
                말투는 진중하고 우아하며 신비롭습니다. 가벼운 호들갑은 절대 피하세요.

                [절대 규칙]
                1. 3장의 카드는 무조건 [과거 - 현재 - 미래]의 시간선으로 해석하세요.
                2. 각 카드가 과거, 현재, 미래를 뜻한다는 것을 명확히 안내해 주세요.
                ✨ 3. (중요) 종합 결과(최종 신탁)는 답변의 맨 마지막에 단 한 번만 작성하며, 절대로 중복해서 요약하지 마세요.

                [답변 구조]
                1. 🔮 여신의 응답 (첫인사)
                2. ⏳ 운명의 시간선
                3. 🃏 운명의 실타래 전개 (과거, 현재, 미래 순서대로 카드 해석)
                    (⚠️형식: "### 🃏 [과거/현재/미래]를 비추는 [N] 번째 카드: [카드이름 - 방향]입니다.")
                4. 📜 여신의 최종 신탁 (단 한 번만 깔끔하게 요약)
                5. 🌙 여신의 축복 (마무리)

                ---
                사용자가 뽑은 카드:
                ${cardInfoText}
                
                질문: "${lastMessage}"
                `;
            }
        }

    } else {
        systemPrompt = `당신은 운명의 실을 잣는 신비로운 타로 마스터 클로토입니다. 이전 대화 맥락을 기억하고 다정하게 답변하세요.`;
    }

    const chatSession = model.startChat({
        history: [
            { role: "user", parts: [{ text: "SYSTEM: " + systemPrompt }] },
            { role: "model", parts: [{ text: "네, 운명의 실타래를 읽어드릴 준비가 되었습니다." }] },
            ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        ]
    });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    // ✨ 핵심: '처음 타로를 뽑았을 때(!isFollowUp)'만 DB에 저장하도록 수정하여 DB 중복 저장 방지
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
            console.log(`✅ DB 저장 완료: 첫 리딩 (${selectedCards.length}장)`);
        } catch (saveError) {
            console.error("DB 저장 오류 (응답은 반환됨):", saveError);
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