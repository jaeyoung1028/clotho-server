// lib/prisma.ts
import { PrismaClient } from '@prisma/client'


const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
datasources: {
    db: {
      url: process.env.DATABASE_URL, // Next.js가 완벽하게 읽은 그 주소를 강제로 넘겨줍니다.
    },
  },
})


if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma