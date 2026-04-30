// app/api/tarot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

export async function GET() {
  try {
    const cards = await prisma.tarotCard.findMany({
      orderBy: { number: 'asc' }
    });
    return NextResponse.json(cards);
  } catch (error) {
    console.error('카드 조회 에러:', error);
    return NextResponse.json(
      { error: '카드를 불러올 수 없습니다' },
      { status: 500 }
    );
  }
}

interface SelectedCard {
  index: number;
  isReversed: boolean;
}

interface Message {
  role: string;
  content: string;
}

interface MappedCard {
  id: number | undefined;
  number: number;
  name: string;
  nameKo: string;
  imageUrl: string;
  orientation: string;
  isReversed: boolean;
  position: number;
  meaningUp: string;
  meaningRev: string;
}

export async function POST(req: NextRequest) {
  const requestId = Date.now();

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🚀 [${requestId}] API 요청 시작`);
  console.log(`${'═'.repeat(80)}\n`);

  try {
    console.log(`📋 [${requestId}] 1️⃣ 요청 데이터 파싱`);
    const { messages, selectedCards } = await req.json();

    console.log(`  ✓ messages: ${JSON.stringify(messages)}`);
    console.log(`  ✓ selectedCards (원본): ${JSON.stringify(selectedCards)}\n`);

    console.log(`✅ [${requestId}] 2️⃣ 데이터 검증`);
    if (!messages || messages.length === 0) {
      console.error(`❌ messages 비어있음`);
      return NextResponse.json({ error: '메시지가 필요합니다' }, { status: 400 });
    }
    console.log(`  ✓ messages 존재: ${messages.length}개\n`);

    console.log(`✅ [${requestId}] 3️⃣ 사용자 질문 추출`);
    const lastUserMessage = messages[messages.length - 1] as Message;
    const userQuestion = lastUserMessage.content;
    console.log(`  ✓ 질문: "${userQuestion}"\n`);

    console.log(`✅ [${requestId}] 4️⃣ 선택된 카드 인덱스 추출`);
    const cardIndexes = (selectedCards as SelectedCard[])?.map((card: SelectedCard) => card.index) || [];
    console.log(`  ✓ 카드 번호 배열: [${cardIndexes.join(', ')}]\n`);

    console.log(`✅ [${requestId}] 5️⃣ DB에서 카드 정보 조회`);
    console.log(`  📍 쿼리: where { number: { in: [${cardIndexes.join(', ')}] } }`);
    
    const dbCards = await prisma.tarotCard.findMany({
      where: {
        number: { in: cardIndexes }
      }
    });

    console.log(`  ✓ DB 조회 결과: ${dbCards.length}개 카드 발견`);
    dbCards.forEach(card => {
      console.log(`    - number=${card.number}, id=${card.id}, nameKo="${card.nameKo}"`);
    });
    console.log();

    console.log(`✅ [${requestId}] 6️⃣ 카드 정보 매핑 (선택 순서 유지)`);
    const cards = (selectedCards as SelectedCard[])?.map((selection: SelectedCard, index: number) => {
      const dbCard = dbCards.find(c => c.number === selection.index);
      const orientation = selection.isReversed ? 'reversed' : 'upright';

      if (!dbCard) {
        console.warn(`  ⚠️ Position ${index + 1}: 카드 번호 ${selection.index} DB에서 못 찾음`);
      }

      const mappedCard: MappedCard = {
        id: dbCard?.id,
        number: selection.index,
        name: dbCard?.name || '알 수 없는 카드',
        nameKo: dbCard?.nameKo || '',
        imageUrl: dbCard?.imageUrl || '',
        orientation: orientation,
        isReversed: selection.isReversed || false,
        position: index + 1,
        meaningUp: dbCard?.meaningUp || '',
        meaningRev: dbCard?.meaningRev || ''
      };

      console.log(`  ✓ Position ${index + 1}: ${mappedCard.nameKo} (${orientation})`);
      return mappedCard;
    }) || [];
    console.log();

    // ✅ 7️⃣ 프롬프트 생성 (현실적 해석)
    console.log(`✅ [${requestId}] 7️⃣ 프롬프트 생성 중`);

    const cardDetails = cards.map((c: MappedCard) => {
      const meaning = c.orientation === 'reversed' ? c.meaningRev : c.meaningUp;
      return `
【카드 ${c.position}】
카드명: ${c.nameKo}(${c.name})
방향: ${c.orientation === 'reversed' ? '역방향' : '정방향'}
의미: ${meaning}`;
    }).join('\n');

    const systemPrompt = `당신은 현실적이고 실용적인 타로 카드 리더입니다.

【절대 규칙】
1. 주어진 카드들만 해석합니다 (다른 카드 언급 금지)
2. 각 카드의 의미를 현실적으로 설명합니다
3. 카드들 간의 관계를 분석합니다
4. 사용자가 이해하고 실행할 수 있는 조언을 제공합니다
5. 신비한 분위기는 유지하되, 현실과 동떨어진 표현 금지

【금지 표현】
- *(잠시 침묵과 함께 신비로운 분위기 연출)* 같은 무대 지문
- 별빛, 우주, 영혼, 신비, 마법 같은 추상적 표현
- "당신은 깨달을 것입니다" 같은 모호한 표현
- 근거 없는 미래 예언
- 초월적이거나 신비주의적인 언어
- 과도한 감정적 표현

【필수 표현】
- "이 카드는 ~를 의미합니다"
- "이것이 당신의 상황에서 의미하는 바는..."
- "구체적으로 당신이 할 수 있는 것은..."
- "이 시기에 중요한 것은..."
- 현실적이고 실행 가능한 조언`;

    const cardList = cards.map((c: MappedCard) => `${c.position}. ${c.nameKo}(${c.name})[${c.orientation}]`).join(', ');

    const userPrompt = `【현재 뽑은 카드: ${cardList}】

${cardDetails}

【사용자 질문】
"${userQuestion}"

【해석 방식】
다음 순서대로 현실적이고 구체적으로 분석하세요:

1️⃣ 【각 카드가 말하는 의미】
${cards.map((c: MappedCard) => `- ${c.position}번 카드 (${c.nameKo}): 질문 "${userQuestion}"에서 이 카드가 의미하는 바는?`).join('\n')}

각 카드마다 1-2문장으로 명확하게 설명하세요.

2️⃣ 【카드들이 함께 말하는 메시지】
이 ${cards.length}장의 카드가 함께 전달하는 핵심 메시지는 무엇인가?
- 전체적인 상황 분석
- 카드들 간의 연결고리
- 흐름과 변화

3️⃣ 【질문에 대한 구체적인 답변】
"${userQuestion}"에 대해 이 카드들은 무엇을 말하고 있는가?
- Yes/No 또는 명확한 방향성
- 그 이유
- 현재 상황의 구체적인 분석

4️⃣ 【실행 가능한 조언】
사용자가 지금 할 수 있는 구체적인 행동은 무엇인가?
- 할 수 있는 일
- 피해야 할 일
- 주의할 점

【작성 규칙】
- 신비로운 분위기는 유지하되, 현실적인 언어 사용
- 추상적이지 않고 구체적인 설명
- 사용자가 이해하고 실천할 수 있는 내용
- 무대 지문이나 액션 표현 금지
- 모호한 표현 금지`;

    console.log(`  ✓ 프롬프트 길이: ${userPrompt.length} 자`);
    console.log(`  ✓ 카드 정보:`);
    cards.forEach((c: MappedCard) => {
      console.log(`    ${c.position}. ${c.nameKo} - ${c.orientation}`);
    });
    console.log();

    // ✅ 8️⃣ Gemini API 호출
    console.log(`✅ [${requestId}] 8️⃣ Gemini API 호출`);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    console.log(`  ✓ API 응답 받음`);
    console.log(`  ✓ 응답 길이: ${aiResponse.length} 자`);
    console.log(`  ✓ 응답 내용:\n${aiResponse}\n`);

    // 🔍 응답 검증
    console.log(`🔍 [${requestId}] 응답 검증:`);
    const responseText = aiResponse.toLowerCase();

    const forbiddenPatterns = ['*(', '*)', '별빛', '우주', '영혼', '신비', '마법', '깨달을 것', '초월'];
    const foundPatterns = forbiddenPatterns.filter(pattern => responseText.includes(pattern));

    if (foundPatterns.length > 0) {
      console.warn(`  ⚠️ 금지된 표현 발견: ${foundPatterns.join(', ')}`);
    } else {
      console.log(`  ✅ 금지된 표현 없음`);
    }

    console.log(`  ✅ 사용된 카드:`);
    cards.forEach((c: MappedCard) => {
      const included = responseText.includes(c.nameKo.toLowerCase());
      console.log(`    ${included ? '✓' : '✗'} ${c.nameKo}`);
    });
    console.log();

    // ✅ 9️⃣ 응답 페이로드 구성
    console.log(`✅ [${requestId}] 9️⃣ 응답 페이로드 구성`);

    const responsePayload = {
      text: aiResponse,
      cards: cards,
      timestamp: new Date().toISOString()
    };

    console.log(`  ✓ text: ${responsePayload.text.length} 자`);
    console.log(`  ✓ cards: ${responsePayload.cards.length}개\n`);

    // ✅ 1️⃣0️⃣ JSON 응답 전송
    console.log(`✅ [${requestId}] 🔟 JSON 응답 전송`);
    console.log(`${'═'.repeat(80)}\n`);

    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error(`\n❌ [${requestId}] API 에러 발생`);
    console.error(`${'═'.repeat(80)}`);
    
    if (error instanceof Error) {
      console.error(`  에러 타입: ${error.constructor.name}`);
      console.error(`  메시지: ${error.message}`);
    } else {
      console.error(`  에러:`, error);
    }

    console.error(`${'═'.repeat(80)}\n`);
    
    const errorMessage = error instanceof Error ? error.message : '타로 해석에 실패했습니다';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}