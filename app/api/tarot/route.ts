// clotho-server/app/api/tarot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clothos-thread.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const cards = await prisma.tarotCard.findMany({
      orderBy: { number: 'asc' }
    });
    return NextResponse.json(cards, { headers: corsHeaders });
  } catch (error) {
    console.error('카드 조회 에러:', error);
    return NextResponse.json(
      { error: '카드를 불러올 수 없습니다' },
      { status: 500, headers: corsHeaders }
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
      return NextResponse.json({ error: '메시지가 필요합니다' }, { status: 400, headers: corsHeaders });
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
      console.log(`      meaningUp: ${card.meaningUp?.substring(0, 100) || '(없음)'}`);
      console.log(`      meaningRev: ${card.meaningRev?.substring(0, 100) || '(없음)'}`);
    });
    console.log();

    console.log(`✅ [${requestId}] 6️⃣ 카드 정보 매핑 (선택 순서 유지)`);
    const cards = (selectedCards as SelectedCard[])?.map((selection: SelectedCard, index: number) => {
      const dbCard = dbCards.find(c => c.number === selection.index);
      const orientation = selection.isReversed ? 'reversed' : 'upright';

      if (!dbCard) {
        console.warn(`  ⚠️ Position ${index + 1}: 카드 번호 ${selection.index} DB에서 못 찾음`);
      } else {
        console.log(`  ✓ Position ${index + 1}: ${dbCard.nameKo}`);
        console.log(`    - meaningUp 있음? ${!!dbCard.meaningUp ? '✓' : '✗'}`);
        console.log(`    - meaningRev 있음? ${!!dbCard.meaningRev ? '✓' : '✗'}`);
      }

      const meaningUp = dbCard?.meaningUp || '새로운 가능성과 기회';
      const meaningRev = dbCard?.meaningRev || '지체와 혼란';

      const mappedCard: MappedCard = {
        id: dbCard?.id,
        number: selection.index,
        name: dbCard?.name || '알 수 없는 카드',
        nameKo: dbCard?.nameKo || '',
        imageUrl: dbCard?.imageUrl || '',
        orientation: orientation,
        isReversed: selection.isReversed || false,
        position: index + 1,
        meaningUp: meaningUp,
        meaningRev: meaningRev
      };

      return mappedCard;
    }) || [];
    console.log();

    console.log(`✅ [${requestId}] 7️⃣ 프롬프트 생성 중`);

    const positionLabels: Record<number, string> = { 1: '과거', 2: '현재', 3: '미래' };
    const orientationLabels: Record<string, string> = { 'upright': '정방향', 'reversed': '역방향' };

    let userPrompt: string;

    if (cards.length === 1) {
      // 한 장 뽑기: YES/NO 판단
      const card = cards[0];
      const meaning = card.orientation === 'reversed' ? card.meaningRev : card.meaningUp;

      userPrompt = `【중요】당신은 타로 카드 한 장으로 질문에 명확하게 답변합니다. 다른 카드는 절대 말하지 마세요.

뽑은 카드: ${card.nameKo}(${card.name}) [${orientationLabels[card.orientation] || card.orientation}]
카드 의미: ${meaning}

질문: "${userQuestion}"

【답변 형식 - 반드시 이 순서대로】
1. 첫 줄: 질문의 맥락에 맞게 긍정 또는 부정을 한국어로 명확하게 한 줄로 답변
   - 긍정 예시: "좋습니다", "충분히 가능합니다", "기회가 있습니다", "잘 될 것입니다"
   - 부정 예시: "쉽지 않을 것 같습니다", "지금은 힘들 것 같습니다", "조심이 필요합니다"
   - 반드시 질문 내용에 맞는 표현을 사용할 것. 영어(YES/NO) 사용 금지.
2. 둘째 단락: ${card.nameKo} 카드와 방향(${orientationLabels[card.orientation] || card.orientation})을 언급하며 판단 이유를 2~3문장으로 설명
3. 셋째 단락: 지금 당장 할 수 있는 구체적인 행동 한 줄

【금지】
- 과거/현재/미래 언급 금지
- 긴 서론이나 인사말 금지
- "~일 수도 있습니다", "~가능성이 있습니다" 같은 애매한 표현 금지
- 신비로운 표현 (별빛, 우주, 영혼, 신비, 마법) 금지
- YES / NO 영어 표현 금지`;

    } else {
      // 세 장 뽑기: 과거/현재/미래 해석
      const cardList = cards.map((c: MappedCard) =>
        `- ${positionLabels[c.position] || `Position ${c.position}`}: ${c.nameKo}(${c.name}) [${orientationLabels[c.orientation] || c.orientation}]`
      ).join('\n');

      const cardInfoDetail = cards.map((c: MappedCard) => {
        const meaning = c.orientation === 'reversed' ? c.meaningRev : c.meaningUp;
        return `
${positionLabels[c.position] || `Position ${c.position}`}: ${c.nameKo}(${c.name})
- 한글이름: ${c.nameKo}
- 영문이름: ${c.name}
- 방향: ${orientationLabels[c.orientation] || c.orientation}
- 의미: ${meaning}`;
      }).join('\n');

      const requiredCardNames = cards.map((c: MappedCard) => `   - ${c.nameKo}(${c.name})`).join('\n');

      const cardInterpretations = cards.map((c: MappedCard) => {
        const meaning = c.orientation === 'reversed' ? c.meaningRev : c.meaningUp;
        return `${positionLabels[c.position] || `Position ${c.position}`} - ${c.nameKo}(${c.name}):
의미: ${meaning}
질문 "${userQuestion}"과의 연결:`;
      }).join('\n\n');

      userPrompt = `【중요】당신은 ONLY 이 카드들을 해석하세요. 다른 카드는 절대 말하지 마세요.

현재 뽑은 카드:
${cardList}

【카드 정보 - 이것만 사용】
${cardInfoDetail}

【명령】
1. 위의 ${cards.length}장 카드만 해석하세요
2. 각 카드를 순서대로 해석하세요
3. 다음 카드명들이 응답에 반드시 포함되어야 합니다:
${requiredCardNames}
4. 초반 인사말 없음
5. 신비로운 표현 없음

질문: "${userQuestion}"

【해석】
${cardInterpretations}

【종합 해석 - 정확히 4~5줄】
이 ${cards.length}장의 카드가 함께 말하는 것:

【조언】
지금 할 수 있는 구체적인 행동:`;
    }

    console.log(`  ✓ 프롬프트 길이: ${userPrompt.length} 자`);
    console.log(`  ✓ 필수 카드명:`);
    cards.forEach(c => {
      console.log(`    - ${c.nameKo}(${c.name})`);
    });
    console.log(`  ✓ 프롬프트 샘플 (첫 500자):\n${userPrompt.substring(0, 500)}\n`);

    console.log(`✅ [${requestId}] 8️⃣ Gemini API 호출`);

    const systemInstruction = `당신은 타로 카드 해석 전문가입니다.

【CRITICAL - 반드시 지켜야 합니다】
- 반드시 주어진 카드들만 해석합니다
- 다른 카드는 절대 언급하지 않습니다
- 각 카드의 이름을 응답에 포함해야 합니다
- 프롬프트의 카드 정보를 사용해서 해석합니다

【금지】
- 다른 카드 언급
- 초반 긴 인사말
- 신비로운 표현 (별빛, 우주, 영혼, 신비, 마법)
- *(action)* 무대지문
- "아, ", "보세요", "저의" 같은 추임새

【필수】
- 각 카드명 명시
- 주어진 의미 사용
- 구체적 조언
- 직설적인 표현`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction
    });

    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    console.log(`  ✓ API 응답 받음 (${aiResponse.length} 자)`);
    console.log(`  ✓ 응답 첫 300자:\n${aiResponse.substring(0, 300)}...\n`);

    console.log(`🔍 [${requestId}] 응답에 카드명 포함 여부:`);
    cards.forEach((c: MappedCard) => {
      const hasKoName = aiResponse.includes(c.nameKo);
      const hasEngName = aiResponse.includes(c.name);
      const included = hasKoName || hasEngName;
      console.log(`  ${c.position}. ${c.nameKo}(${c.name}): ${included ? '✓' : '✗'}`);
      if (!included) {
        console.error(`    ❌ ERROR: 이 카드가 응답에 없습니다!`);
      }
    });

    console.log(`\n  ✅ 불필요한 표현 체크:`);
    const badPatterns = [
      '*(', '*)',
      '별빛', '우주', '영혼', '신비', '마법',
      '아, ', '보세요', '저의', '감돕니다',
      '(잠시', '(신비', '깨달',
      '당신의 앞에 앉으셨',
      '보이지 않는 별들',
      '간절한 마음'
    ];

    let foundBadPatterns: string[] = [];
    badPatterns.forEach(pattern => {
      if (aiResponse.includes(pattern)) {
        foundBadPatterns.push(pattern);
      }
    });

    if (foundBadPatterns.length > 0) {
      console.warn(`  ⚠️ 불필요한 표현 발견: ${foundBadPatterns.join(', ')}`);
    } else {
      console.log(`  ✅ 불필요한 표현 없음`);
    }
    console.log();

    console.log(`✅ [${requestId}] 9️⃣ 응답 페이로드 구성`);

    const responsePayload = {
      text: aiResponse,
      cards: cards,
      timestamp: new Date().toISOString()
    };

    console.log(`  ✓ text: ${responsePayload.text.length} 자`);
    console.log(`  ✓ cards: ${responsePayload.cards.length}개\n`);

    console.log(`✅ [${requestId}] 🔟 JSON 응답 전송`);
    console.log(`${'═'.repeat(80)}\n`);

    return NextResponse.json(responsePayload, { headers: corsHeaders });

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
      { status: 500, headers: corsHeaders }
    );
  }
}