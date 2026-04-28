// app/api/tarot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ 수정됨: NEXT_PUBLIC_GEMINI_API_KEY 사용
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// ============ GET: 타로 카드 조회 ============
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

// ============ POST: 타로 해석 (디버깅 로그 포함) ============
export async function POST(req: NextRequest) {
  const requestId = Date.now(); // 요청 추적용 ID

  console.log(`\n🚀 [${requestId}] API 요청 시작`);
  console.log("━".repeat(60));

  try {
    // ✅ 1️⃣ 요청 본문 파싱
    console.log(`📋 [${requestId}] 요청 정보:`);
    console.log(`  Method: ${req.method}`);
    console.log(`  URL: ${req.url}`);

    const { messages, selectedCards } = await req.json();

    console.log(`\n📦 [${requestId}] 받은 데이터:`);
    console.log(`  messages 길이: ${messages?.length}`);
    console.log(`  selectedCards 길이: ${selectedCards?.length}`);
    console.log(`  messages:`, JSON.stringify(messages).substring(0, 100));
    console.log(`  selectedCards:`, JSON.stringify(selectedCards).substring(0, 100));

    // ✅ 2️⃣ 데이터 검증
    if (!messages || messages.length === 0) {
      console.error(`❌ [${requestId}] messages가 비어있음`);
      return NextResponse.json(
        { error: '메시지가 필요합니다' },
        { status: 400 }
      );
    }

    // ✅ 3️⃣ 마지막 사용자 메시지 추출
    const lastUserMessage = messages[messages.length - 1];
    console.log(`💬 [${requestId}] 마지막 메시지:`, lastUserMessage);

    if (lastUserMessage.role !== 'user') {
      console.error(`❌ [${requestId}] 마지막 메시지가 user 역할이 아님`);
      return NextResponse.json(
        { error: '마지막 메시지는 사용자 메시지여야 합니다' },
        { status: 400 }
      );
    }

    const userQuestion = lastUserMessage.content;
    console.log(`✅ [${requestId}] 사용자 질문: "${userQuestion}"`);

    // ✅ 4️⃣ DB에서 카드 정보 조회 (순서 변경! 프롬프트 작성 전에)
    console.log(`🎴 [${requestId}] DB에서 카드 정보 조회 중...`);

    // selectedCards의 index 배열 추출
    const cardIndexes = selectedCards?.map((card: any) => card.index) || [];
    console.log(`  조회할 카드 번호: ${cardIndexes}`);

    // DB에서 해당 번호의 카드들 조회
    const dbCards = await prisma.tarotCard.findMany({
      where: {
        number: { in: cardIndexes }
      }
    });

    console.log(`✅ [${requestId}] DB에서 ${dbCards.length}개 카드 조회 완료`);
    dbCards.forEach(c => {
      console.log(`  - ${c.number}: ${c.nameKo} (${c.name})`);
    });

    // ✅ 5️⃣ 선택된 순서대로 카드 정보 매핑
    const cards = selectedCards?.map((selection: any, index: number) => {
      const dbCard = dbCards.find(c => c.number === selection.index);
      
      if (!dbCard) {
        console.warn(`⚠️ [${requestId}] 카드 번호 ${selection.index} DB에서 없음`);
      }

      return {
        id: dbCard?.id,
        number: selection.index,
        name: dbCard?.name || '알 수 없는 카드',
        nameKo: dbCard?.nameKo || '',
        image: dbCard?.imageUrl || '',
        imageUrl: dbCard?.imageUrl || '',
        orientation: selection.isReversed ? 'reversed' : 'upright',
        isReversed: selection.isReversed || false,
        position: index + 1,
        meaningUp: dbCard?.meaningUp || '',
        meaningRev: dbCard?.meaningRev || ''
      };
    }) || [];

    console.log(`✅ [${requestId}] 최종 카드 구성 완료:`);
    cards.forEach((c: any) => {
      console.log(`  - Position ${c.position}: ${c.nameKo} (${c.orientation})`);
    });

    // ✅ 6️⃣ 프롬프트 작성 (카드 정보 + 의미 포함) - 수정됨!
    console.log(`📝 [${requestId}] 프롬프트 작성 중...`);

    const systemPrompt = `당신은 신비로운 타로 카드 해석가입니다. 
    사용자의 질문에 대해 깊이 있고 영감을 주는 타로 해석을 제공하세요.
    타로 카드의 상징성과 의미를 활용하여 사용자의 인생 경로를 조명해주세요.
    응답은 한국어로 하며, 신비로운 분위기를 유지하세요.`;

    // ⭐ 카드 정보 + 의미를 프롬프트에 포함
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

    console.log(`✅ [${requestId}] 프롬프트 길이: ${userPrompt.length} 자`);
    console.log(`✅ [${requestId}] 카드 정보 포함됨:`);
    console.log(cardDescriptions);

    // ✅ 7️⃣ Gemini API 키 확인
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      console.error(`❌ [${requestId}] API 키가 설정되지 않았습니다!`);
      return NextResponse.json(
        { error: 'API 키 설정 오류' },
        { status: 500 }
      );
    }

    console.log(`✅ [${requestId}] API 키 확인됨`);

    // ✅ 8️⃣ Gemini API 호출
    console.log(`🌐 [${requestId}] Gemini API 호출 시작...`);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    console.log(`✅ [${requestId}] Gemini API 응답 받음`);
    console.log(`  응답 길이: ${aiResponse.length} 자`);
    console.log(`  응답 첫 100자: ${aiResponse.substring(0, 100)}`);

    // ✅ 9️⃣ 응답 페이로드 생성
    console.log(`📤 [${requestId}] 응답 페이로드 생성 중...`);

    const responsePayload = {
      text: aiResponse,
      cards: cards,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [${requestId}] 응답 페이로드 준비 완료`);
    console.log(`  text 길이: ${responsePayload.text.length}`);
    console.log(`  cards 개수: ${responsePayload.cards.length}`);

    // ✅ 1️⃣0️⃣ JSON 응답
    console.log(`✅ [${requestId}] JSON 응답 전송`);
    console.log("━".repeat(60) + "\n");

    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error(`\n❌ [${requestId}] API 에러 발생`);
    console.error("━".repeat(60));
    
    if (error instanceof Error) {
      console.error(`  에러 타입: ${error.constructor.name}`);
      console.error(`  메시지: ${error.message}`);
      console.error(`  스택:`, error.stack?.substring(0, 200));

      // 특정 에러 분류
      if (error.message.includes('API key')) {
        console.error(`  원인: .env.local의 NEXT_PUBLIC_GEMINI_API_KEY 확인 필요`);
      }
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.error(`  원인: API 키가 유효하지 않음`);
      }
      if (error.message.includes('429') || error.message.includes('Too Many')) {
        console.error(`  원인: API 요청 제한 초과`);
      }
    } else {
      console.error(`  에러:`, error);
    }

    console.error("━".repeat(60) + "\n");
    
    const errorMessage = error instanceof Error ? error.message : '타로 해석에 실패했습니다';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}