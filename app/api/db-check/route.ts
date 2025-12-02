import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 1. DB에 간단한 질문 던지기 (현재 시간 알려줘!)
    // 이 쿼리가 성공하면 연결은 100% 된 겁니다.
    const result = await prisma.$queryRaw`SELECT NOW()`;
    
    return NextResponse.json({ 
      status: '✅ 연결 성공 (Connected)', 
      databaseTime: result 
    });
    //
  } catch (error) {
    return NextResponse.json({ 
      status: '❌ 연결 실패 (Error)', 
      error: String(error) 
    }, { status: 500 });
  }
}