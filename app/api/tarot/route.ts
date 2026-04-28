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

export async function POST(req: NextRequest) {
  const requestId = Date.now();

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🚀 [${requestId}] API 요청 시작`);
  console.log(`${'═'.repeat(80)}\n`);

  try {
    // ✅ 1️⃣ 요청 데이터 수신
    console.log(`📋 [${requestId}] 1️⃣ 요청 데이터 파싱`);
    const { messages, selectedCards } = await req.json();

    console.log(`  ✓ messages: ${JSON.stringify(messages)}`);
    console.log(`  ✓ selectedCards (원본): ${JSON.stringify(selectedCards)}\n`);

    // ✅ 2️⃣ 데이터 검증
    console.log(`✅ [${requestId}] 2️⃣ 데이터 검증`);
    if (!messages || messages.length === 0) {
      console.error(`❌ messages 비어있음`);
      return NextResponse.json({ error: '메시지가 필요합니다' }, { status: 400 });
    }
    console.log(`  ✓ messages 존재: ${messages.length}개\n`);

    // ✅ 3️⃣ 사용자 질문 추출
    console.log(`✅ [${requestId}] 3️⃣ 사용자 질문 추출`);
    const lastUserMessage = messages[messages.length - 1];
    const userQuestion = lastUserMessage.content;
    console.log(`  ✓ 질문: "${userQuestion}"\n`);

    // ✅ 4️⃣ 카드 인덱스 추출
    console.log(`✅ [${requestId}] 4️⃣ 선택된 카드 인덱스 추출`);
    const cardIndexes = selectedCards?.map((card: any) => card.index) || [];
    console.log(`  ✓ 카드 번호 배열: [${cardIndexes.join(', ')}]`);
    console.log(`  ✓ selectedCards 상세:`);
    selectedCards.forEach((card: any, idx: number) => {
      console.log(`    - Index ${idx}: number=${card.index}, isReversed=${card.isReversed}`);
    });
    console.log();

    // ✅ 5️⃣ DB에서 카드 조회
    console.log(`✅ [${requestId}] 5️⃣ DB에서 카드 정보 조회`);
    console.log(`  📍 쿼리: where { number: { in: [${cardIndexes.join(', ')}] } }`);
    
    const dbCards = await prisma.tarotCard.findMany({
      where: {
        number: { in: cardIndexes }
      }
    });

    console.log(`  ✓ DB 조회 결과: ${dbCards.length}개 카드 발견`);
    console.log(`  ✓ DB 카드 상세:`);
    dbCards.forEach(card => {
      console.log(`    - number=${card.number}, name="${card.name}", nameKo="${card.nameKo}"`);
      console.log(`      imageUrl="${card.imageUrl}"`);
      console.log(`      meaningUp="${card.meaningUp}"`);
      console.log(`      meaningRev="${card.meaningRev}"`);
    });
    console.log();

    // ✅ 6️⃣ 카드 매핑 (선택 순서대로)
    console.log(`✅ [${requestId}] 6️⃣ 카드 정보 매핑 (선택 순서 유지)`);
    const cards = selectedCards?.map((selection: any, index: number) => {
      console.log(`  📍 Position ${index + 1} 처리 중:`);
      console.log(`    - selectedCards[${index}].index = ${selection.index}`);
      
      const dbCard = dbCards.find(c => c.number === selection.index);
      console.log(`    - DB에서 찾은 카드: ${dbCard ? '✓ 찾음' : '✗ 못 찾음'}`);
      
      if (dbCard) {
        console.log(`      name: "${dbCard.name}"`);
        console.log(`      nameKo: "${dbCard.nameKo}"`);
      }

      const orientation = selection.isReversed ? 'reversed' : 'upright';
      console.log(`    - 방향: ${orientation} (isReversed=${selection.isReversed})`);

      const meaning = selection.isReversed ? dbCard?.meaningRev : dbCard?.meaningUp;
      console.log(`    - 의미: "${meaning}"`);

      const mappedCard = {
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

      console.log(`    ✓ 매핑 결과:`);
      console.log(`      ${JSON.stringify(mappedCard, null, 6)}`);
      console.log();

      return mappedCard;
    }) || [];

    console.log(`✅ [${requestId}] 최종 cards 배열:`);
    console.log(JSON.stringify(cards, null, 2));
    console.log();

    // ✅ 7️⃣ 프롬프트 생성
    console.log(`✅ [${requestId}] 7️⃣ 프롬프트 생성 중`);

    const systemPrompt = `당신은 신비로운 타로 카드 해석가입니다. 
    사용자의 질문에 대해 깊이 있고 영감을 주는 타로 해석을 제공하세요.
    타로 카드의 상징성과 의미를 활용하여 사용자의 인생 경로를 조명해주세요.
    응답은 한국어로 하며, 신비로운 분위기를 유지하세요.`;

    const cardDescriptions = cards.map((c: any) => {
      const meaning = c.orientation === 'reversed' ? c.meaningRev : c.meaningUp;
      return `Position ${c.position}: ${c.nameKo}(${c.name}) - ${c.orientation === 'reversed' ? '역방향' : '정방향'}
의미: ${meaning}`;
    }).join('\n\n');

    const userPrompt = `${systemPrompt}

**사용자가 뽑은 카드:**
${cardDescriptions}

**사용자 질문:** ${userQuestion}

위의 카드들과 그 의미를 고려하여 사용자의 질문에 대한 깊이 있는 타로 해석을 제공해주세요.`;

    console.log(`  ✓ systemPrompt 길이: ${systemPrompt.length} 자`);
    console.log(`  ✓ cardDescriptions:\n${cardDescriptions}`);
    console.log(`  ✓ userPrompt 길이: ${userPrompt.length} 자\n`);

    // ✅ 8️⃣ Gemini API 호출
    console.log(`✅ [${requestId}] 8️⃣ Gemini API 호출`);
    console.log(`  📍 모델: gemini-2.5-flash-lite`);
    console.log(`  📍 프롬프트 길이: ${userPrompt.length} 자`);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    console.log(`  ✓ API 응답 받음`);
    console.log(`  ✓ 응답 길이: ${aiResponse.length} 자`);
    console.log(`  ✓ 응답 첫 200자: ${aiResponse.substring(0, 200)}...\n`);

    // ✅ 9️⃣ 응답 페이로드 구성
    console.log(`✅ [${requestId}] 9️⃣ 응답 페이로드 구성`);

    const responsePayload = {
      text: aiResponse,
      cards: cards,
      timestamp: new Date().toISOString()
    };

    console.log(`  ✓ text: ${responsePayload.text.length} 자`);
    console.log(`  ✓ cards: ${responsePayload.cards.length}개`);
    console.log(`  ✓ 최종 cards 데이터:`);
    responsePayload.cards.forEach((c: any) => {
      console.log(`    - Position ${c.position}: ${c.nameKo} (${c.orientation})`);
      console.log(`      imageUrl: "${c.imageUrl}"`);
      console.log(`      의미: "${c.orientation === 'reversed' ? c.meaningRev : c.meaningUp}"`);
    });
    console.log();

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
      console.error(`  스택:\n${error.stack}`);
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