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

  try {
    const { messages, selectedCards } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '메시지가 필요합니다' }, { status: 400, headers: corsHeaders });
    }

    const lastUserMessage = messages[messages.length - 1] as Message;
    const userQuestion = lastUserMessage.content;
    const cardIndexes = (selectedCards as SelectedCard[])?.map((card: SelectedCard) => card.index) || [];

    const dbCards = await prisma.tarotCard.findMany({
      where: {
        number: { in: cardIndexes }
      }
    });

    const positionNames = ['과거', '현재', '미래'];
    const cards = (selectedCards as SelectedCard[])?.map((selection: SelectedCard, index: number) => {
      const dbCard = dbCards.find(c => c.number === selection.index);
      const orientation = selection.isReversed ? '역방향' : '정방향';
      const posName = positionNames[index] || `위치 ${index + 1}`;

      return {
        id: dbCard?.id,
        number: selection.index,
        name: dbCard?.name || 'Unknown',
        nameKo: dbCard?.nameKo || '',
        imageUrl: dbCard?.imageUrl || '',
        orientation: orientation,
        isReversed: selection.isReversed || false,
        position: index + 1,
        positionName: posName,
        meaningUp: dbCard?.meaningUp || '긍정적인 변화',
        meaningRev: dbCard?.meaningRev || '준비가 필요한 시기'
      };
    }) || [];

    const isFollowUp = messages.length > 1;
    let userPrompt = "";

    if (isFollowUp) {
      // 💬 추가 질문용 프롬프트: 여신의 무게감 유지
      userPrompt = `
당신은 운명의 실타래를 잣는 여신, 클로토(Clotho)입니다. 사용자가 당신이 보여준 운명에 대해 더 깊은 질문을 던졌습니다.

【참조 카드】
${cards.map(c => `- ${c.positionName}: ${c.nameKo} [${c.orientation}]`).join('\n')}

【지시 사항】
1. 절대 JSON이나 코드 형식을 출력하지 마십시오.
2. 당신은 필멸자에게 운명의 길을 일러주는 여신입니다. 가벼운 말투를 버리고, 단호하면서도 품위 있는 어조를 유지하십시오.
3. "영혼", "우주", "신비" 같은 모호한 단어 대신, 사용자가 처한 현실(취업, 관계, 금전 등)에서 즉각 이해할 수 있는 구체적인 어휘를 사용하십시오.
4. 답변은 명확하고 간결해야 합니다.

사용자의 물음: "${userQuestion}"

여신의 답변:`;
    } else {
      // 🔮 첫 해석용 프롬프트: 여신의 선언
      const cardList = cards.map(c => `- ${c.positionName}: ${c.nameKo}(${c.name}) [${c.orientation}]`).join('\n');
      const cardInfoDetail = cards.map(c => {
        const meaning = c.isReversed ? c.meaningRev : c.meaningUp;
        return `${c.positionName}: ${c.nameKo}\n- 방향: ${c.orientation}\n- 의미: ${meaning}`;
      }).join('\n');

      const cardInterpretations = cards.map(c => {
        const meaning = c.isReversed ? c.meaningRev : c.meaningUp;
        return `${c.positionName} - ${c.nameKo} [${c.orientation}]:
의미: ${meaning}
현실적인 연결:`;
      }).join('\n\n');

      userPrompt = `운명의 여신 클로토(Clotho)여, 필멸자가 당신의 실타래 앞에 섰습니다. 오직 이 카드들만으로 운명의 조각을 일러주십시오.

현재의 실타래:
${cardList}

【상세 정보】
${cardInfoDetail}

【절대 규칙】
1. 각 카드를 ${positionNames.join(', ')}의 흐름에 따라 엄중히 해석하십시오.
2. 미사여구를 걷어내고, 사용자가 바로 알아들을 수 있는 실질적인 단어들로 길을 제시하십시오.
3. 불필요한 인사나 감정 표현을 배제하십시오.
4. 카드 이름(한글명)을 반드시 명시하십시오.

질문: "${userQuestion}"

【해석】
${cardInterpretations}

【여신의 총평 - 4~5줄】
이 실타래가 가리키는 궁극적인 방향:

【계시】
지금 당장 실행해야 할 구체적 행동:`;
    }

    const systemInstruction = `당신은 '클로토의 실타래(Clotho's Thread)' 서비스를 운영하는 운명의 여신 클로토입니다.
- 말투는 무게감 있고 단호해야 합니다.
- 필멸자(사용자)가 이해할 수 있는 지극히 현실적이고 구체적인 단어만을 선택하십시오.
- 절대 코드나 JSON 형식을 대화 중에 노출하지 마십시오.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      systemInstruction: systemInstruction
    });

    const result = await model.generateContent(userPrompt);
    const aiResponse = result.response.text();

    return NextResponse.json({
      text: aiResponse,
      cards: cards,
      timestamp: new Date().toISOString()
    }, { headers: corsHeaders });

  } catch (error) {
    console.error(`❌ 에러 발생:`, error);
    return NextResponse.json({ error: '운명을 읽는 도중 실이 엉켰습니다.' }, { status: 500, headers: corsHeaders });
  }
}