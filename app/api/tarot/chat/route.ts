import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 1. 프론트엔드 데이터 수신 (에러 방어)
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    const messages = body.messages || [{ role: "user", content: "내 운명을 알려다오." }];
    const selectedCards = body.selectedCards || body.cards || body.cardIds || [];
    const lastMessage = messages[messages.length - 1].content;
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    if (!apiKey) throw new Error("서버 환경 변수에 GOOGLE_API_KEY가 없습니다.");

    // ✨ 모델 버전을 1.5로 복구! (가장 안정적이고 빠름)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite", 
        generationConfig: { maxOutputTokens: 2000 } 
    });

    // 2. 유저 확인 (DB 에러 방어)
    let currentUserId: string | null = null;
    try {
        let testUser = await prisma.user.findFirst({ where: { name: "TestGuest" } });
        if (!testUser) {
            testUser = await prisma.user.create({ data: { name: "TestGuest", email: "guest@example.com" } });
        }
        currentUserId = testUser.id;
    } catch (dbError) {
        console.error("유저 조회/생성 실패 (하지만 진행은 계속함):", dbError);
    }

    let systemPrompt = "";
    let drawnCards: Record<string, any>[] = []; 
    
    // 3. 카드 정보 가져오기 & 방향 결정
    if (selectedCards && selectedCards.length > 0) {
        
        let cardsFromDB: any[] = [];
        try {
            cardsFromDB = await prisma.tarotCard.findMany({
                where: { number: { in: selectedCards.map(Number) } } 
            });
        } catch (cardDbError) {
            throw new Error("카드 목록 에러: DB에서 카드를 불러오지 못했습니다.");
        }

        // 유저가 뽑은 순서대로 강제 줄 세우기
        const orderedCardsFromDB = selectedCards.map((num: number) => 
            cardsFromDB.find((c) => c.number === Number(num))
        ).filter(Boolean);

        if (orderedCardsFromDB.length === 0) {
            throw new Error("뽑힌 카드가 데이터베이스에 존재하지 않습니다. 번호를 확인하세요.");
        }

        // 50% 확률로 정방향/역방향 결정
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

        if (isSingleCard) {
            // ==========================================
            // 🃏 1장 뽑기
            // ==========================================
            systemPrompt = `
            [역할 및 페르소나]
            당신은 그리스 신화에서 운명의 실을 잣는 여신 '클로토(Clotho)'입니다.
            당신의 말투는 인간을 굽어살피는 여신처럼 진중하고, 우아하며, 범접할 수 없는 신비로움과 동시에 깊은 자애로움을 품고 있습니다.

            [절대 규칙]
            1. 사용자가 단 1장의 카드를 뽑았습니다. 이 카드의 의미(정/역방향 포함)와 직관을 분석하여, 사용자의 질문에 대한 명확한 긍정(Yes) 또는 부정(No)의 결론을 최우선으로 내려야 합니다.
            2. 반드시 답변의 첫 문장은 다음 두 가지 중 하나로만 시작하세요:
            "그대의 질문에 대한 답은 Yes입니다." 
            "그대의 질문에 대한 답은 No입니다."
            3. 사용자의 질문이 연애, 금전, 학업, 인간관계 등 어느 상황에 해당하는지 깊이 파악하고, 카드의 기본 의미를 그 상황에 맞게 유연하고 창의적으로 변형하여 해석하세요.

            첫 문장으로 명쾌한 답을 준 뒤, 아래의 [답변 양식]에 맞추어 뽑힌 카드의 이름, '방향(정방향/역방향)', 그리고 '카드의 기본 의미'를 설명하고, 왜 그런 결론이 나왔는지 여신의 어조로 2~3문장의 조언을 건네주세요.

            ---
            [실제 상담 진행]
            사용자가 뽑은 카드:
            ${cardInfoText}
            
            질문: "${lastMessage}"
            `;
        } else {
            // ==========================================
            // 🃏 3장 뽑기
            // ==========================================
            systemPrompt = `
            [역할 및 페르소나]
            당신은 그리스 신화에서 운명의 실을 잣는 여신 '클로토(Clotho)'입니다.
            당신의 말투는 인간을 굽어살피는 여신처럼 진중하고, 우아하며, 범접할 수 없는 신비로움과 동시에 깊은 자애로움을 품고 있습니다.
            가벼운 환호나 호들갑은 절대 피하세요. 기쁜 소식은 빛나는 축복으로, 슬픈 소식은 숭고한 위로로 전달합니다.

            [절대 규칙]
            1. 사용자의 질문 상황(연애, 금전, 학업 등)에 맞추어 카드의 의미를 기계적으로 읊지 말고 창의적으로 해석하세요.
            ✨ 2. (핵심) 3장의 카드는 무조건 [과거 - 현재 - 미래]의 시간선으로 해석해야 합니다. 1번째 카드는 과거, 2번째 카드는 현재, 3번째 카드는 미래입니다.
            ✨ 3. 해석을 시작하기 전, 각 카드가 과거, 현재, 미래를 뜻한다는 것을 명확히 안내해 주세요.
            ✨ 4. 모든 카드 해석이 끝난 후, 전체적인 흐름을 요약하는 [최종 정리본 설명]을 반드시 포함하세요.

            [답변 구조]
            1. 🔮 여신의 응답 (내담자의 운명에 귀 기울이는 진중한 첫인사)
            2. ⏳ 운명의 시간선
            3. 🃏 운명의 실타래 전개 (과거, 현재, 미래 순서대로 카드 해석)
                (⚠️중요: 카드를 소개할 때는 반드시 "### 🃏 [과거/현재/미래]를 비추는 [N] 번째 카드: [카드이름 - 방향]입니다." 형식으로 작성하세요.)
            4. 📜 여신의 최종 신탁 (3장의 흐름을 종합한 최종 요약 정리 및 조언)
            5. 🌙 여신의 축복 (마무리)

            ---
            [실제 상담 진행]
            사용자가 뽑은 카드:
            ${cardInfoText}
            
            질문: "${lastMessage}"
            위의 규칙과 예시를 철저히 지키고, 과거-현재-미래의 시간선에 맞추어 유기적인 스토리텔링과 최종 정리를 제공하세요.
            `;
        }

    } else {
        systemPrompt = `당신은 운명의 실을 잣는 신비로운 타로 마스터 클로토입니다. 이전 대화 맥락을 기억하고 다정하게 답변하세요.`;
    }

    // 4. AI 응답 생성
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

    // 5. DB 저장 (안전장치 장착)
    if (currentUserId && selectedCards && selectedCards.length > 0 && drawnCards.length > 0) {
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
            console.log(`✅ DB 저장 완료: Reading (${selectedCards.length}장)`);
        } catch (saveError) {
            console.error("DB 저장 오류 (응답은 반환됨):", saveError);
        }
    }

    // ✨ 핵심: 프론트엔드가 카드를 뒤집을 수 있도록 'cardsInfo' 배열을 추가로 던져줍니다!
    return NextResponse.json({ 
        text: aiResponse,
        cardsInfo: drawnCards.map(c => ({ id: c.number, orientation: c.orientation })) 
    });

  } catch (error: any) {
    console.error("에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ✨ GET 방식으로 접속 시 무조건 500 에러를 뱉는 것을 방지
export async function GET() {
    return NextResponse.json({ 
        message: "타로 백엔드 정상 작동 중! 프론트엔드에서 POST 방식으로 호출해주세요." 
    });
}