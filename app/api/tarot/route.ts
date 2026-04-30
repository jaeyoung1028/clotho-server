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
  id: number | undefined;  // ← Int이므로 number
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

    // ✅ 7️⃣ 프롬프트 생성
    console.log(`✅ [${requestId}] 7️⃣ 프롬프트 생성 중`);

    const cardDetails = cards.map((c: MappedCard) => {
      const meaning = c.orientation === 'reversed' ? c.meaningRev : c.meaningUp;
      return `
【카드 ${c.position}】
이름: ${c.nameKo}(${c.name})
방향: ${c.orientation === 'reversed' ? '역방향' : '정방향'}
의미: ${meaning}`;
    }).join('\n');

    const systemPrompt = `당신은 타로 카드 해석가입니다.

【규칙】
1. 아래에 주어진 카드들만 사용합니다
2. 절대 다른 카드를 언급하지 않습니다
3. "만약", "예를 들어", "예시" 같은 단어 금지
4. 각 카드를 직접 해석합니다
5. 사용자의 질문에 구체적으로 답합니다

【금지 패턴】
- "만약 ○○ 카드라면"
- "예를 들어 ××를 뽑았다면"
- "다음과 같은 경우"
- "예시: ~~"
- 주어진 카드 외 다른 카드명 언급`;

    const userPrompt = `${systemPrompt}

【현재 뽑은 카드들】
${cardDetails}

【사용자 질문】
${userQuestion}

【해석 방식】
위의 ${cards.length}장 카드만 사용하여:
1. 각 카드가 의미하는 것
2. 카드들이 함께 나타내는 메시지
3. 사용자 질문 "${userQuestion}"에 대한 구체적인 해석

을 제공하세요.

【지금 이 해석에서 사용할 카드】
${cards.map((c: MappedCard) => `- ${c.nameKo}(${c.name})`).join('\n')}

이 카드들만 기반으로 해석하세요.`;

    console.log(`  ✓ 프롬프트 길이: ${userPrompt.length} 자`);
    console.log(`  ✓ 카드 정보 포함됨\n`);

    // ✅ 8️⃣ Gemini API 호출
    console.log(`✅ [${requestId}] 8️⃣ Gemini API 호출`);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    console.log(`  ✓ API 응답 받음`);
    console.log(`  ✓ 응답 길이: ${aiResponse.length} 자`);
    console.log(`  ✓ 응답 첫 200자: ${aiResponse.substring(0, 200)}...\n`);

    // 🔍 응답 검증
    console.log(`🔍 [${requestId}] 응답 검증:`);
    const responseText = aiResponse.toLowerCase();

    const forbiddenPatterns = ['만약', '예를 들어', '예시', '다음과 같은', '카드를 뽑았다면'];
    const foundPatterns = forbiddenPatterns.filter(pattern => responseText.includes(pattern));

    if (foundPatterns.length > 0) {
      console.warn(`  ⚠️ 금지된 패턴 발견: ${foundPatterns.join(', ')}`);
    } else {
      console.log(`  ✅ 금지된 패턴 없음`);
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