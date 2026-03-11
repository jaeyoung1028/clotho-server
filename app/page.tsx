"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "model";
  content: string;
};

export default function Home() {
  // --- 상태 관리 ---
  const [step, setStep] = useState<"intro" | "chat">("intro"); // 현재 화면 단계 (intro 또는 chat)
  const [messages, setMessages] = useState<Message[]>([]); // 대화 기록
  const [input, setInput] = useState(""); // 입력창 내용
  const [loading, setLoading] = useState(false); // 로딩 상태

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 스크롤 자동 이동 (채팅 모드일 때만)
  useEffect(() => {
    if (step === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, step]);

  // --- 기능 함수 ---

  // 1. 초기 질문 전송 (Intro -> Chat)
  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    
    // 사용자 질문 저장
    const initialUserMsg: Message = { role: "user", content: input };
    const newMessages = [initialUserMsg];
    setMessages(newMessages);

    // ✨ [추가된 부분] 타로 카드 3장 랜덤으로 뽑기 (1~78번 중 중복 없이)
    const randomCards: number[] = [];
    while (randomCards.length < 3) {
      const randomNum = Math.floor(Math.random() * 78) + 1;
      if (!randomCards.includes(randomNum)) {
        randomCards.push(randomNum);
      }
    }

    try {
      // API 호출
      const response = await fetch("/api/tarot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✨ [수정된 부분] 방금 뽑은 3장(randomCards)을 selectedCards에 담아 서버로 보냅니다!
        body: JSON.stringify({ messages: newMessages, selectedCards: randomCards }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...newMessages, { role: "model", content: data.text }]);
        setStep("chat");
        setInput(""); 
      } else {
        alert("오류: " + data.error);
      }
    } catch (error) {
      alert("서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  // 2. 추가 질문 전송 (채팅)
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // 사용자 질문 추가
    const userMsg: Message = { role: "user", content: input };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/tarot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages }), // 전체 문맥 전송
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [...prev, { role: "model", content: data.text }]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 처음으로 돌아가기 (초기화)
  const resetChat = () => {
    setMessages([]);
    setStep("intro");
    setInput("");
  };

  // --- 화면 렌더링 ---

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#eee] font-sans flex flex-col items-center">
      
      {/* 🔮 1단계: 인트로 화면 (질문 입력) */}
      {step === "intro" && (
        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-2xl p-6 animate-fade-in">
          <h1 className="text-5xl font-bold text-[#d4af37] mb-4 text-center drop-shadow-lg">
            CLOTHO
          </h1>
          <p className="text-gray-400 mb-10 text-lg text-center">
            운명의 실타래를 잣는 클로토에게 당신의 고민을 털어놓으세요.
          </p>

          <form onSubmit={handleInitialSubmit} className="w-full flex flex-col gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="예: 이번 달 연애운이 궁금해, 이직할 수 있을까?"
              className="w-full p-5 rounded-xl bg-[#333] text-white border border-[#444] focus:border-[#d4af37] text-lg focus:outline-none shadow-lg transition-all"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#d4af37] text-[#1a1a1a] font-bold text-xl rounded-xl hover:bg-[#f1c40f] transition-colors disabled:opacity-50"
            >
              {loading ? "운명을 읽는 중..." : "타로 점 보기 ✨"}
            </button>
          </form>
        </div>
      )}

      {/* 🔮 2단계: 결과 및 채팅 화면 */}
      {step === "chat" && (
        <div className="w-full max-w-3xl flex-1 flex flex-col h-screen">
          {/* 헤더 */}
          <header className="p-4 bg-[#222] border-b border-[#333] flex justify-between items-center shadow-md">
            <h2 className="text-[#d4af37] font-bold text-lg">🔮 Clotho Tarot</h2>
            <button onClick={resetChat} className="text-sm text-gray-400 hover:text-white underline">
              처음으로
            </button>
          </header>

          {/* 메인 콘텐츠 영역 (스크롤) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* ✨ 모든 대화를 묶어서 예쁜 금색 테두리 박스로 렌더링 ✨ */}
            {messages.map((msg, idx) => {
              // 'user' 메시지(질문)일 때만 박스를 만들고, 바로 다음 'model' 메시지(답변)를 그 안에 넣습니다.
              if (msg.role === "user") {
                const answerMsg = messages[idx + 1];

                return (
                  <div key={idx} className="bg-[#2a2a2a] p-6 rounded-2xl border-2 border-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                    
                    {/* 질문 (Q.) 영역 */}
                    <div className="text-[#d4af37] font-bold mb-3 text-lg border-b border-[#444] pb-2">
                      Q. {msg.content}
                    </div>
                    
                    {/* 답변 영역 */}
                    {answerMsg ? (
                      <div className="whitespace-pre-wrap leading-relaxed text-gray-200">
                        {answerMsg.content}
                      </div>
                    ) : (
                      // 답변 로딩 중일 때 표시되는 반짝이는 텍스트
                      loading && (
                        <div className="animate-pulse text-[#d4af37] opacity-80 mt-4 text-sm font-medium">
                          클로토가 운명의 실타래를 읽고 있습니다... 🌙
                        </div>
                      )
                    )}
                  </div>
                );
              }
              // model 메시지는 위에서 이미 answerMsg로 박스 안에 그렸으므로 무시합니다.
              return null;
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* 하단 추가 질문 입력창 */}
          <div className="p-4 bg-[#222] border-t border-[#333]">
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="결과에 대해 궁금한 점을 물어보세요..."
                className="flex-1 p-3 rounded-full bg-[#333] text-white border border-[#444] focus:outline-none focus:border-[#d4af37]"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-3 bg-[#444] text-[#d4af37] font-bold rounded-full hover:bg-[#555] disabled:opacity-50"
              >
                📤
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}