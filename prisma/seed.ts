import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const tarotData = [
  // --- Major Arcana (22장) ---
  { number: 0, name: "The Fool", nameKo: "바보", meaningUp: "새로운 시작, 모험, 순수함, 자유", meaningRev: "무모함, 어리석은 선택, 우유부단, 억압된 자유", imageUrl: "/images/tarot/0_fool.png" },
  { number: 1, name: "The Magician", nameKo: "마법사", meaningUp: "창조력, 숙련된 기술, 의지력, 자신감", meaningRev: "속임수, 조작, 의지 박약, 재능 낭비", imageUrl: "/images/tarot/1_magician.png" },
  { number: 2, name: "The High Priestess", nameKo: "고위 여사제", meaningUp: "직관, 신비, 지혜, 무의식", meaningRev: "숨겨진 비밀, 피상적인 지식, 무시된 직관, 감정적 불안", imageUrl: "/images/tarot/2_priestess.png" },
  { number: 3, name: "The Empress", nameKo: "여황제", meaningUp: "풍요, 모성애, 자연, 예술적 재능", meaningRev: "의존성, 창조적 블록, 재정적 문제, 과보호", imageUrl: "/images/tarot/3_empress.png" },
  { number: 4, name: "The Emperor", nameKo: "황제", meaningUp: "권위, 구조, 통제, 아버지상", meaningRev: "폭군, 지배욕, 융통성 없음, 규율 부족", imageUrl: "/images/tarot/4_emperor.png" },
  { number: 5, name: "The Hierophant", nameKo: "교황", meaningUp: "전통, 가르침, 영적 지도자, 사회적 규범", meaningRev: "관습에 대한 반항, 맹목적인 믿음, 제한적인 규범, 독단적임", imageUrl: "/images/tarot/5_hierophant.png" },
  { number: 6, name: "The Lovers", nameKo: "연인", meaningUp: "사랑, 조화, 가치관의 선택, 결합", meaningRev: "불화, 불균형, 잘못된 선택, 관계의 단절", imageUrl: "/images/tarot/6_lovers.png" },
  { number: 7, name: "The Chariot", nameKo: "전차", meaningUp: "승리, 의지력, 통제, 목표 달성", meaningRev: "통제력 상실, 방향 상실, 무자비한 공격성, 패배", imageUrl: "/images/tarot/7_chariot.png" },
  { number: 8, name: "Strength", nameKo: "힘", meaningUp: "인내, 내면의 힘, 용기, 포용력", meaningRev: "자신감 부족, 자기 의심, 나약함, 억눌린 분노", imageUrl: "/images/tarot/8_strength.png" },
  { number: 9, name: "The Hermit", nameKo: "은둔자", meaningUp: "성찰, 고독, 내면의 탐구, 지혜", meaningRev: "과도한 고립, 외로움, 소외감, 현실 도피", imageUrl: "/images/tarot/9_hermit.png" },
  { number: 10, name: "Wheel of Fortune", nameKo: "운명의 수레바퀴", meaningUp: "운명, 변화, 행운, 기회", meaningRev: "불운, 저항할 수 없는 부정적 변화, 타이밍 놓침", imageUrl: "/images/tarot/10_wheel.png" },
  { number: 11, name: "Justice", nameKo: "정의", meaningUp: "공정함, 진실, 균형, 책임", meaningRev: "불공정, 편견, 부정직, 책임 회피", imageUrl: "/images/tarot/11_justice.png" },
  { number: 12, name: "The Hanged Man", nameKo: "매달린 사람", meaningUp: "희생, 새로운 관점, 정체, 깨달음", meaningRev: "무의미한 희생, 이기심, 발전을 거부하는 정체, 아집", imageUrl: "/images/tarot/12_hanged.png" },
  { number: 13, name: "Death", nameKo: "죽음", meaningUp: "종결, 새로운 시작, 변화, 이별", meaningRev: "변화에 대한 저항, 정체, 두려움, 놓지 못함", imageUrl: "/images/tarot/13_death.png" },
  { number: 14, name: "Temperance", nameKo: "절제", meaningUp: "균형, 중용, 인내, 조화", meaningRev: "불균형, 극단적임, 무절제, 내면의 갈등", imageUrl: "/images/tarot/14_temperance.png" },
  { number: 15, name: "The Devil", nameKo: "악마", meaningUp: "속박, 유혹, 물질주의, 집착", meaningRev: "해방, 속박에서 벗어남, 유혹을 뿌리침, 통제력 회복", imageUrl: "/images/tarot/15_devil.png" },
  { number: 16, name: "The Tower", nameKo: "탑", meaningUp: "갑작스러운 변화, 붕괴, 재난, 각성", meaningRev: "재난을 간신히 피함, 두려움에 갇힘, 변화의 지연, 억압", imageUrl: "/images/tarot/16_tower.png" },
  { number: 17, name: "The Star", nameKo: "별", meaningUp: "희망, 영감, 치유, 평온", meaningRev: "절망, 비관주의, 희망 상실, 낙담", imageUrl: "/images/tarot/17_star.png" },
  { number: 18, name: "The Moon", nameKo: "달", meaningUp: "불안, 환상, 직관, 잠재의식", meaningRev: "혼란 해소, 진실의 발견, 두려움 극복, 드러난 오해", imageUrl: "/images/tarot/18_moon.png" },
  { number: 19, name: "The Sun", nameKo: "태양", meaningUp: "성공, 활력, 기쁨, 긍정", meaningRev: "지연된 성공, 우울함, 지나친 자만심, 활력 저하", imageUrl: "/images/tarot/19_sun.png" },
  { number: 20, name: "Judgement", nameKo: "심판", meaningUp: "부활, 소명, 결단, 용서", meaningRev: "자기 회의, 잘못된 판단, 무시된 소명, 후회와 미련", imageUrl: "/images/tarot/20_judgement.png" },
  { number: 21, name: "The World", nameKo: "세계", meaningUp: "완성, 통합, 성취, 여행", meaningRev: "미완성, 침체, 지연, 닫힌 마음, 결실을 맺지 못함", imageUrl: "/images/tarot/21_world.png" },

  // --- Minor Arcana: Wands (불) ---
  { number: 101, name: "Ace of Wands", nameKo: "지팡이 에이스", meaningUp: "새로운 열정, 창조력, 잠재력, 시작", meaningRev: "지연, 동기 부족, 놓친 기회, 창조적 블록", imageUrl: "/images/tarot/wands_1.png" },
  { number: 102, name: "Two of Wands", nameKo: "지팡이 2", meaningUp: "계획, 방향 설정, 미래 전망, 결단", meaningRev: "두려움, 나쁜 계획, 제한된 시야, 방향 상실", imageUrl: "/images/tarot/wands_2.png" },
  { number: 103, name: "Three of Wands", nameKo: "지팡이 3", meaningUp: "확장, 리더십, 긍정적 결과, 협력", meaningRev: "지연, 좌절, 좁은 시야, 예상치 못한 장애물", imageUrl: "/images/tarot/wands_3.png" },
  { number: 104, name: "Four of Wands", nameKo: "지팡이 4", meaningUp: "축하, 평화, 안정, 성공적인 결실", meaningRev: "불안정, 집안의 불화, 일시적 평화, 취소된 축하", imageUrl: "/images/tarot/wands_4.png" },
  { number: 105, name: "Five of Wands", nameKo: "지팡이 5", meaningUp: "경쟁, 갈등, 스포츠, 의견 충돌", meaningRev: "내부 갈등 피함, 지나친 경쟁, 타협, 갈등의 해소", imageUrl: "/images/tarot/wands_5.png" },
  { number: 106, name: "Six of Wands", nameKo: "지팡이 6", meaningUp: "승리, 인정, 대중적 성공, 자부심", meaningRev: "자만심, 추락, 인정받지 못함, 패배감, 배신", imageUrl: "/images/tarot/wands_6.png" },
  { number: 107, name: "Seven of Wands", nameKo: "지팡이 7", meaningUp: "방어, 고군분투, 인내, 유리한 위치", meaningRev: "압도됨, 포기, 방어 실패, 소진과 항복", imageUrl: "/images/tarot/wands_7.png" },
  { number: 108, name: "Eight of Wands", nameKo: "지팡이 8", meaningUp: "신속한 이동, 빠른 전개, 갑작스런 소식, 활력", meaningRev: "지연, 좌절, 성급함, 소통 부재, 타이밍 엇갈림", imageUrl: "/images/tarot/wands_8.png" },
  { number: 109, name: "Nine of Wands", nameKo: "지팡이 9", meaningUp: "인내, 경계, 방어적 태도, 지치지 않는 힘", meaningRev: "방어벽 붕괴, 피해망상, 피로 누적, 타협", imageUrl: "/images/tarot/wands_9.png" },
  { number: 1010, name: "Ten of Wands", nameKo: "지팡이 10", meaningUp: "압박감, 무거운 책임, 과로, 끝이 보이는 고생", meaningRev: "붕괴, 과로로 인한 쓰러짐, 책임 회피, 짐을 내려놓음", imageUrl: "/images/tarot/wands_10.png" },
  { number: 1011, name: "Page of Wands", nameKo: "지팡이 시종", meaningUp: "열정적인 소식, 호기심, 창의적인 시작", meaningRev: "나쁜 소식, 충동적, 주의력 결핍, 성급한 행동", imageUrl: "/images/tarot/wands_11.png" },
  { number: 1012, name: "Knight of Wands", nameKo: "지팡이 기사", meaningUp: "에너지, 모험, 충동적 행동, 추진력", meaningRev: "분노, 무모함, 산만함, 오만함, 폭력성", imageUrl: "/images/tarot/wands_12.png" },
  { number: 1013, name: "Queen of Wands", nameKo: "지팡이 여왕", meaningUp: "따뜻함, 카리스마, 당당함, 열정적인 리더", meaningRev: "질투, 이기심, 변덕, 요구가 많음, 오지랖", imageUrl: "/images/tarot/wands_13.png" },
  { number: 1014, name: "King of Wands", nameKo: "지팡이 왕", meaningUp: "비전, 카리스마, 리더십, 결단력", meaningRev: "독재, 오만, 잔인함, 충동적이고 극단적인 결단", imageUrl: "/images/tarot/wands_14.png" },

  // --- Minor Arcana: Cups (물) ---
  { number: 111, name: "Ace of Cups", nameKo: "컵 에이스", meaningUp: "새로운 감정, 사랑의 시작, 풍부한 직관", meaningRev: "억눌린 감정, 짝사랑, 공허함, 감정적 고갈", imageUrl: "/images/tarot/cups_1.png" },
  { number: 112, name: "Two of Cups", nameKo: "컵 2", meaningUp: "결합, 상호 공감, 조화로운 관계, 파트너십", meaningRev: "이별, 불화, 불균형, 신뢰 깨짐, 엇갈린 마음", imageUrl: "/images/tarot/cups_2.png" },
  { number: 113, name: "Three of Cups", nameKo: "컵 3", meaningUp: "축하, 우정, 기쁨의 공유, 타인과의 교류", meaningRev: "과음, 소외감, 험담, 끝난 우정, 무리한 사교", imageUrl: "/images/tarot/cups_3.png" },
  { number: 114, name: "Four of Cups", nameKo: "컵 4", meaningUp: "권태, 무관심, 명상, 내면 집중", meaningRev: "무기력 탈출, 새로운 기회 자각, 칩거를 끝냄", imageUrl: "/images/tarot/cups_4.png" },
  { number: 115, name: "Five of Cups", nameKo: "컵 5", meaningUp: "상실, 슬픔, 과거에 대한 후회, 실망", meaningRev: "과거 극복, 슬픔의 치유, 남은 것에 감사함, 재기", imageUrl: "/images/tarot/cups_5.png" },
  { number: 116, name: "Six of Cups", nameKo: "컵 6", meaningUp: "추억, 순수함, 재회, 과거로부터의 선물", meaningRev: "과거에 갇힘, 독립성 부족, 비현실적 향수, 순수함 상실", imageUrl: "/images/tarot/cups_6.png" },
  { number: 117, name: "Seven of Cups", nameKo: "컵 7", meaningUp: "환상, 백일몽, 다양한 선택지, 비현실적 기대", meaningRev: "현실 도피 끝, 명확한 목표 설정, 나쁜 선택을 피함", imageUrl: "/images/tarot/cups_7.png" },
  { number: 118, name: "Eight of Cups", nameKo: "컵 8", meaningUp: "떠남, 새로운 길 모색, 미련을 버림, 내면적 탐구", meaningRev: "현실 안주, 두려움으로 인한 정체, 떠나지 못함, 방황", imageUrl: "/images/tarot/cups_8.png" },
  { number: 119, name: "Nine of Cups", nameKo: "컵 9", meaningUp: "정서적 만족, 소원 성취, 행복, 안락함", meaningRev: "탐욕, 불만족, 허영심, 겉만 번지르르함", imageUrl: "/images/tarot/cups_9.png" },
  { number: 1110, name: "Ten of Cups", nameKo: "컵 10", meaningUp: "행복한 가정, 완벽한 조화, 평화, 영적 충만", meaningRev: "가정 불화, 깨진 관계, 허울뿐인 평화, 소외감", imageUrl: "/images/tarot/cups_10.png" },
  { number: 1111, name: "Page of Cups", nameKo: "컵 시종", meaningUp: "감성적인 소식, 상상력, 호기심 많은 제안", meaningRev: "감정적 미성숙, 실망스러운 소식, 도피주의, 변덕", imageUrl: "/images/tarot/cups_11.png" },
  { number: 1112, name: "Knight of Cups", nameKo: "컵 기사", meaningUp: "로맨스, 감정의 표현, 친절함, 예술적 기질", meaningRev: "비현실적, 기만, 감정 조절 실패, 이기적인 변덕", imageUrl: "/images/tarot/cups_12.png" },
  { number: 1113, name: "Queen of Cups", nameKo: "컵 여왕", meaningUp: "깊은 공감, 수용력, 직관력, 따뜻한 마음", meaningRev: "감정적 의존, 지나친 희생, 우울증, 질투와 집착", imageUrl: "/images/tarot/cups_13.png" },
  { number: 1114, name: "King of Cups", nameKo: "컵 왕", meaningUp: "감정의 통제, 포용력, 너그러운 조언자, 외교력", meaningRev: "감정 폭발, 타인 조종, 차가움, 변덕스러운 기분파", imageUrl: "/images/tarot/cups_14.png" },

  // --- Minor Arcana: Swords (공기) ---
  { number: 121, name: "Ace of Swords", nameKo: "검 에이스", meaningUp: "진실, 명확한 사고, 새로운 생각의 시작, 결단력", meaningRev: "혼란, 가혹한 진실, 잘못된 판단, 오해와 소통 부재", imageUrl: "/images/tarot/swords_1.png" },
  { number: 122, name: "Two of Swords", nameKo: "검 2", meaningUp: "선택의 기로, 균형, 현실 외면, 내면의 갈등", meaningRev: "정보 부족, 우유부단함, 억눌린 감정 폭발, 진실을 봄", imageUrl: "/images/tarot/swords_2.png" },
  { number: 123, name: "Three of Swords", nameKo: "검 3", meaningUp: "슬픔, 상처, 이별, 가슴 아픈 진실", meaningRev: "고통 완화, 슬픔 극복, 억눌린 상처의 치유, 용서", imageUrl: "/images/tarot/swords_3.png" },
  { number: 124, name: "Four of Swords", nameKo: "검 4", meaningUp: "휴식, 회복, 재충전, 일시적 정지", meaningRev: "소진, 강제 휴식 거부, 불안정, 휴식 후 활동 재개", imageUrl: "/images/tarot/swords_4.png" },
  { number: 125, name: "Five of Swords", nameKo: "검 5", meaningUp: "패배감, 자존심 상실, 무의미한 갈등, 씁쓸함", meaningRev: "앙심, 끝없는 갈등, 후회, 결국 패배를 인정함", imageUrl: "/images/tarot/swords_5.png" },
  { number: 126, name: "Six of Swords", nameKo: "검 6", meaningUp: "이동, 회복의 시작, 어려운 상황에서 벗어남, 치유", meaningRev: "문제에서 벗어나지 못함, 갇힘, 치유 지연, 변화에 저항", imageUrl: "/images/tarot/swords_6.png" },
  { number: 127, name: "Seven of Swords", nameKo: "검 7", meaningUp: "미련, 은밀한 행동, 눈속임, 지적 기만", meaningRev: "사기 발각, 스스로를 속임, 비밀 누설, 책임 회피", imageUrl: "/images/tarot/swords_7.png" },
  { number: 128, name: "Eight of Swords", nameKo: "검 8", meaningUp: "구속, 답답함, 스스로 만든 두려움, 억압", meaningRev: "해방, 터널 끝의 빛, 두려움 극복, 새로운 시각 확보", imageUrl: "/images/tarot/swords_8.png" },
  { number: 129, name: "Nine of Swords", nameKo: "검 9", meaningUp: "불안, 불면증, 과도한 걱정, 절망", meaningRev: "절망 극복, 객관적 현실 자각, 불안 완화, 도움 요청", imageUrl: "/images/tarot/swords_9.png" },
  { number: 1210, name: "Ten of Swords", nameKo: "검 10", meaningUp: "고통의 끝, 완전한 종결, 새로운 시작의 전조, 바닥", meaningRev: "최악은 지남, 생존, 회복의 시작, 피할 수 없는 결말", imageUrl: "/images/tarot/swords_10.png" },
  { number: 1211, name: "Page of Swords", nameKo: "검 시종", meaningUp: "날카로운 지성, 경계, 새로운 정보, 호기심", meaningRev: "뒷담화, 냉소적, 숨겨진 진실 폭로, 치명적인 말실수", imageUrl: "/images/tarot/swords_11.png" },
  { number: 1212, name: "Knight of Swords", nameKo: "검 기사", meaningUp: "논리적 돌진, 단호함, 급격한 변화, 솔직함", meaningRev: "무자비함, 폭력성, 성급한 결론, 통제 불능", imageUrl: "/images/tarot/swords_12.png" },
  { number: 1213, name: "Queen of Swords", nameKo: "검 여왕", meaningUp: "독립성, 슬픔을 극복한 지혜, 객관적 판단, 예리함", meaningRev: "차가움, 잔인함, 비관적, 감정을 완전히 배제함", imageUrl: "/images/tarot/swords_13.png" },
  { number: 1214, name: "King of Swords", nameKo: "검 왕", meaningUp: "합리성, 권위, 냉철한 판단력, 전문성", meaningRev: "폭군, 오남용된 지식/권력, 비합리적, 잔인한 통제", imageUrl: "/images/tarot/swords_14.png" },

  // --- Minor Arcana: Pentacles (흙) ---
  { number: 131, name: "Ace of Pentacles", nameKo: "펜타클 에이스", meaningUp: "새로운 금전적 기회, 번영, 현실적 성취의 시작", meaningRev: "재정적 손실, 기회 놓침, 나쁜 투자, 탐욕", imageUrl: "/images/tarot/pentacles_1.png" },
  { number: 132, name: "Two of Pentacles", nameKo: "펜타클 2", meaningUp: "유연성, 균형 유지, 시간/물질의 관리, 융통성", meaningRev: "불균형, 무리한 계획, 재정 문제, 우선순위 혼란", imageUrl: "/images/tarot/pentacles_2.png" },
  { number: 133, name: "Three of Pentacles", nameKo: "펜타클 3", meaningUp: "팀워크, 전문성 인정, 협업, 기술 연마", meaningRev: "팀워크 결여, 미숙함, 인정받지 못함, 의견 충돌", imageUrl: "/images/tarot/pentacles_3.png" },
  { number: 134, name: "Four of Pentacles", nameKo: "펜타클 4", meaningUp: "소유욕, 보수적 태도, 물질적 집착, 안정 추구", meaningRev: "지나친 물질주의, 탐욕, 고립, 인색함", imageUrl: "/images/tarot/pentacles_4.png" },
  { number: 135, name: "Five of Pentacles", nameKo: "펜타클 5", meaningUp: "경제적 어려움, 결핍, 소외감, 도움의 필요성", meaningRev: "경제적 회복, 도움 거절, 긍정적 변화의 시작, 고립 탈피", imageUrl: "/images/tarot/pentacles_5.png" },
  { number: 136, name: "Six of Pentacles", nameKo: "펜타클 6", meaningUp: "관대함, 나눔, 보상, 자선과 지원", meaningRev: "이기심, 빚의 굴레, 불공정한 거래, 착취", imageUrl: "/images/tarot/pentacles_6.png" },
  { number: 137, name: "Seven of Pentacles", nameKo: "펜타클 7", meaningUp: "투자, 인내, 성과에 대한 평가, 기다림", meaningRev: "게으름, 나쁜 투자, 노력 대비 성과 없음, 조급함", imageUrl: "/images/tarot/pentacles_7.png" },
  { number: 138, name: "Eight of Pentacles", nameKo: "펜타클 8", meaningUp: "장인정신, 꾸준한 노력, 기술 숙련, 성실함", meaningRev: "완벽주의, 기술 부족, 야망 없음, 의미 없는 과로", imageUrl: "/images/tarot/pentacles_8.png" },
  { number: 139, name: "Nine of Pentacles", nameKo: "펜타클 9", meaningUp: "물질적 풍요, 독립, 여유로움, 자족", meaningRev: "재정적 의존, 물질적 손실, 겉치레, 무의미한 과소비", imageUrl: "/images/tarot/pentacles_9.png" },
  { number: 1310, name: "Ten of Pentacles", nameKo: "펜타클 10", meaningUp: "부의 축적, 가족 유산, 확고한 안정, 전통", meaningRev: "가족 불화, 재정적 재난, 유산 분쟁, 전통 붕괴", imageUrl: "/images/tarot/pentacles_10.png" },
  { number: 1311, name: "Page of Pentacles", nameKo: "펜타클 시종", meaningUp: "현실적 기회, 성실한 학생, 새로운 실용적 소식", meaningRev: "지연, 미루는 습관, 비현실적 계획, 나태함", imageUrl: "/images/tarot/pentacles_11.png" },
  { number: 1312, name: "Knight of Pentacles", nameKo: "펜타클 기사", meaningUp: "책임감, 끈기, 신뢰, 점진적이고 꾸준한 발전", meaningRev: "고집, 무사안일, 정체, 융통성 없음, 지루함", imageUrl: "/images/tarot/pentacles_12.png" },
  { number: 1313, name: "Queen of Pentacles", nameKo: "펜타클 여왕", meaningUp: "실용성, 풍요, 관대함, 편안한 후원자", meaningRev: "통제 불능, 이기심, 물질적 집착, 낭비, 가정 불화", imageUrl: "/images/tarot/pentacles_13.png" },
  { number: 1314, name: "King of Pentacles", nameKo: "펜타클 왕", meaningUp: "세속적 성공, 비즈니스 능력, 부와 안정, 신뢰할 수 있는 리더", meaningRev: "부패, 지나친 물질주의, 완고함, 착취", imageUrl: "/images/tarot/pentacles_14.png" }
];

async function main() {
  console.log('🌱 타로 카드 데이터(78장) 넣는 중...')
  
  // 기존 데이터가 있다면 중복 방지를 위해 삭제 (선택사항)
  // await prisma.tarotCard.deleteMany() 

  for (const card of tarotData) {
    // number가 겹치면 업데이트, 없으면 생성 (upsert)
    await prisma.tarotCard.upsert({
      where: { number: card.number },
      // 👇 여기가 핵심입니다! 기존에 있던 데이터도 새 내용으로 강제 덮어쓰기!
      update: {
        name: card.name,
        nameKo: card.nameKo,
        meaningUp: card.meaningUp,
        imageUrl: card.imageUrl,
      },
      create: {
        number: card.number,
        name: card.name,
        nameKo: card.nameKo,
        meaningUp: card.meaningUp,
        imageUrl: card.imageUrl,
        meaningRev: "역방향 의미는 추후 업데이트",
      },
    })
  }
  console.log('✅ 타로 카드 78장 DB 입력/업데이트 완벽 성공!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })