import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

console.log("현재 인식된 DB 주소:", process.env.DATABASE_URL);

export async function POST(req: Request) {
  try {
    const { messages, selectedCards } = await req.json();
    const lastMessage = messages[messages.length - 1].content;
    
    const apiKey = process.env.GOOGLE_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", // 사용 중이신 모델명 확인
        generationConfig: { maxOutputTokens: 5000 }
    });

    // 1. 유저 확인 (임시 테스트용)
    let testUser = await prisma.user.findFirst({ where: { name: "TestGuest" } });
    if (!testUser) {
        testUser = await prisma.user.create({ data: { name: "TestGuest", email: "guest@example.com" } });
    }
    const currentUserId = testUser.id;

    let systemPrompt = "";
    // ✨ 빨간 줄 해결 1: any[] 대신 Record<string, any>[] 사용
    let drawnCards: Record<string, any>[] = []; 
    
    // 2. 카드 정보 가져오기 & 방향 결정
    if (selectedCards && selectedCards.length > 0) {
        
        // DB에서 카드 정보 기본 조회
        const cardsFromDB = await prisma.tarotCard.findMany({
            where: {
                number: { in: selectedCards } 
            }
        });

        // ✨ 핵심: 50% 확률로 정방향/역방향 결정하기
        drawnCards = cardsFromDB.map((card) => {
            const isReversed = Math.random() < 0.5; // 0.5 미만이면 true(역방향), 이상이면 false(정방향)
            
            return {
                ...card,
                orientation: isReversed ? "reversed" : "upright", // DB 저장용
                directionName: isReversed ? "역방향" : "정방향",   // AI 프롬프트용 한글
                // 역방향이 나왔는데 DB에 역방향 의미(meaningRev)가 있다면 사용하고, 없으면 정방향 사용
                currentMeaning: isReversed && card.meaningRev ? card.meaningRev : card.meaningUp 
            };
        });

        // AI에게 넘겨줄 텍스트 (방향과 의미 포함)
        const cardInfoText = drawnCards.map((card, index) => 
            `${index + 1}번째 카드: ${card.nameKo} (${card.name}) - [${card.directionName}]\n- 원래 의미: ${card.currentMeaning}`
        ).join("\n\n");

        // ✨ [분기 처리] 카드가 1장일 때와 3장일 때 프롬프트를 다르게 줍니다!
        const isSingleCard = selectedCards.length === 1;

        if (isSingleCard) {
            // ==========================================
            // 🃏 1장 뽑기 (Yes/No + 카드 의미 + 방향 해석 + 유연성 프롬프트)
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
            ✨ 3. (핵심) 사용자의 질문이 연애, 금전, 학업, 인간관계 등 어느 상황에 해당하는지 깊이 파악하고, 카드의 기본 의미를 그 상황에 맞게 아주 유연하고 창의적으로 변형하여 해석하세요.

            첫 문장으로 명쾌한 답을 준 뒤, 아래의 [답변 양식]에 맞추어 뽑힌 카드의 이름, '방향(정방향/역방향)', 그리고 '카드의 기본 의미'를 설명하고, 왜 그런 결론이 나왔는지 여신의 어조로 2~3문장의 조언을 건네주세요.

            [답변 양식 예시]
            그대의 질문에 대한 답은 Yes입니다. (또는 No입니다.)

            ### 🃏 운명의 단일 카드: [카드이름] - [방향]
            * 📖 **카드의 의미:** [카드의 원래 의미]
            * 🔮 **여신의 해석:** [카드의 상징과 방향을 바탕으로 왜 Yes/No 인지 설명하고 조언]

            ---
            [실제 상담 진행]
            사용자가 뽑은 카드:
            ${cardInfoText}
            
            질문: "${lastMessage}"
            `;
        } else {
            // ==========================================
            // 🃏 3장 뽑기 (기존 심층 리딩 + 유연성 프롬프트)
            // ==========================================
            systemPrompt = `
            [역할 및 페르소나]
            당신은 그리스 신화에서 운명의 실을 잣는 여신 '클로토(Clotho)'입니다.
            당신의 말투는 인간을 굽어살피는 여신처럼 진중하고, 우아하며, 범접할 수 없는 신비로움과 동시에 깊은 자애로움을 품고 있습니다.
            가벼운 환호나 호들갑은 절대 피하세요. 기쁜 소식은 빛나는 축복으로, 슬픈 소식은 운명의 무게를 함께 짊어지는 숭고한 위로로 전달합니다. ("해요"체를 쓰되, 문학적이고 고풍스러운 어휘를 사용하세요.)

            [절대 규칙]
            ✨ (핵심) 사용자의 질문이 연애, 금전, 학업, 인간관계 등 어느 상황에 해당하는지 깊이 파악하고, 카드의 기본 의미를 기계적으로 읊지 말고 그 상황에 맞게 아주 유연하고 창의적으로 변형하여 해석하세요.

            [답변 구조]
            1. 🔮 여신의 응답 (내담자의 운명에 귀 기울이는 진중한 첫인사)
            2. 🃏 운명의 실타래 전개 (3장의 카드를 각각 원인/과정/결과 혹은 과거/현재/미래 등 상황에 맞게 유기적으로 엮어서 해석)
                (⚠️중요: 카드를 소개할 때는 반드시 "### 🃏 [N] 번째 카드, [질문과 연관된 의미]를 비추는 [카드이름 - 방향]입니다." 형식으로 마크다운 '###'를 써서 크고 임팩트 있게 작성하세요.)
            3. ✨ 클로토의 신탁 (신의 관점에서 내려주는 통찰력 있는 조언)
            4. 🌙 여신의 축복 (마무리)

            [대답 예시 1: 긍정적인 상황]
            - 질문: "이번에 준비한 졸업작품 프로젝트 성공할까요?"
            - 답변:
            "인간의 아이야, 그대가 쏟아부은 땀방울이 운명의 물레 위에서 찬란한 금빛 실로 엮이고 있음을 내 굽어보고 있답니다. 두려움을 거두고, 내가 펼쳐내는 그대의 운명선을 마주하세요.

            **🃏 운명의 실타래 전개**

            ### 🃏 첫 번째 카드, 그대가 지나온 치열한 과거를 보여주는 [태양 (The Sun) - 정방향]입니다.
            * 📖 **카드 의미:** 눈부신 성취, 생명력, 완전한 긍정
            * 🔮 **여신의 해석:** 구름 한 점 없는 태양의 축복이 그대의 시작과 함께했군요. 그대의 작품에는 이미 스스로 빛을 발하는 굳건한 생명력이 깃들어 있습니다.

            ### 🃏 두 번째 카드, 지금 그대가 쥐고 있는 현재의 동력을 뜻하는 [완드 8 (Eight of Wands) - 정방향]입니다.
            * 📖 **카드 의미:** 빠른 전개, 거침없는 흐름
            * 🔮 **여신의 해석:** 허공을 가르는 여덟 개의 지팡이처럼, 운명의 바람이 그대의 등 뒤에서 불어오고 있습니다. 막힘없이 목적지를 향해 나아가고 있는 형국이지요.

            ### 🃏 세 번째 카드, 이 모든 과정이 도달할 미래를 비추는 [세계 (The World) - 정방향]입니다.
            * 📖 **카드 의미:** 완성과 통합, 성공적인 결실
            * 🔮 **여신의 해석:** 우주의 완성을 뜻하는 카드가 그대의 끝에 닿아 있습니다. 그대의 졸업작품은 마침내 훌륭한 결실을 맺어, 하나의 아름다운 세계로 완성될 것입니다.

            **✨ 클로토의 신탁**
            망설임은 부질없는 것입니다. 이미 승리의 여신이 그대의 실타래에 입을 맞추었으니, 그저 스스로를 믿고 묵묵히 마지막 매듭을 지으세요.

            **🌙 여신의 축복**
            그대의 앞날에 눈부신 성운의 빛이 가득하기를. 나의 물레가 그대의 찬란한 완성을 지켜볼 것입니다."

            ---
            [실제 상담 진행]
            사용자가 뽑은 카드:
            ${cardInfoText}
            
            질문: "${lastMessage}"
            
            위의 규칙과 예시를 철저히 지키고, 가벼운 말투 대신 운명을 잣는 여신의 위엄 있고 자애로운 어조로 3장의 카드를 유기적으로 연결하여 해석을 제공하세요.
            `;
        }

    } else {
        systemPrompt = `당신은 운명의 실을 잣는 신비로운 타로 마스터 클로토입니다. 이전 대화 맥락을 기억하고 다정하게 답변하세요.`;
    }

    // 3. AI 응답 생성
    const chatSession = model.startChat({
        history: [
            { role: "user", parts: [{ text: "SYSTEM: " + systemPrompt }] },
            { role: "model", parts: [{ text: "네, 운명의 실타래를 읽어드릴 준비가 되었습니다." }] },
            // ✨ 빨간 줄 해결 2: m의 타입을 명확히 지정
            ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        ]
    });
    
    const result = await chatSession.sendMessage(lastMessage);
    const aiResponse = result.response.text();

    // 4. [DB 저장] AI 응답 후 저장
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
        console.log(`✅ DB 저장 완료: Reading (${selectedCards.length}장) + ReadingCard`);
    }

    return NextResponse.json({ text: aiResponse });

  // ✨ 빨간 줄 해결 3: catch 에러 타입 단언
  } catch (error) {
    console.error("에러:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}