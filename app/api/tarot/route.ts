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

    // ✅ 7️⃣ 프롬프트 생성 (간결하고 구조화된 해석)
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
1. 주어진 카드들만 해석합니다
2. 구조화된 형식으로 명확하게 제시합니다
3. 불필요한 감정 표현과 추가 설명 금지
4. 사용자가 이해하고 실행할 수 있는 조언만 제공

【금지 표현】
- 처음에 "오" 같은 감탄사
- *(무언가)* 같은 무대 지문
- *** 같은 별이나 기호
- 불릿 포인트(*)나 추가 설명
- 추상적이고 신비한 표현
- "당신은 ~할 것입니다" 같은 예언적 표현
- "속삭입니다", "보여줍니다" 같은 의인화

【필수 형식】
각 카드마다:
【카드명】
설명 (1-2문장)

【종합 메시지】
설명 (1-2문장)

【질문에 대한 답변】
설명 (1-2문장)

【조언】
설명 (1-2문장)`;

    const cardList = cards.map((c: MappedCard) => `${c.position}. ${c.nameKo}(${c.name})[${c.orientation}]`).join(', ');

    const userPrompt = `【현재 뽑은 카드: ${cardList}】

${cardDetails}

【사용자 질문】
"${userQuestion}"

【해석 지시사항】
다음 형식으로 정확하게 작성하세요:

${cards.map((c: MappedCard) => `
【${c.nameKo}(${c.name}) - ${c.orientation === 'reversed' ? '역방향' : '정방향'}】
한 문장의 간단한 의미만 제시하세요.
`).join('')}

【종합 메시지】
이 ${cards.length}장의 카드가 함께 말하는 핵심을 한두 문장으로 정리하세요.

【질문 "${userQuestion}"에 대한 답변】
구체적인 답변을 한두 문장으로 제시하세요.

【조언】
실행 가능한 구체적인 조언을 한두 문장으로 제시하세요.

【작성 규칙】
- 불필요한 수식이나 추가 설명 없음
- 직설적이고 명확한 표현만
- 구조화된 형식 유지
- 감정적 표현 최소화
- 실질적이고 현실적인 내용만`;

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
    const responseText = aiResponse;

    const forbiddenPatterns = ['*(', '*)', '속삭', '보여줍', '당신은 ~할 것', '별빛', '우주', '영혼'];
    const foundPatterns = forbiddenPatterns.filter(pattern => responseText.includes(pattern));

    if (foundPatterns.length > 0) {
      console.warn(`  ⚠️ 금지된 표현 발견: ${foundPatterns.join(', ')}`);
    } else {
      console.log(`  ✅ 금지된 표현 없음`);
    }

    console.log(`  ✅ 사용된 카드:`);
    cards.forEach((c: MappedCard) => {
      const included = responseText.includes(c.nameKo);
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