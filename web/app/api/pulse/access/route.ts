import { NextRequest, NextResponse } from "next/server";
import { verifyAccessCode, COOKIE_NAME } from "@/lib/pulse/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const code = body.code?.trim();

  if (!code || !verifyAccessCode(code)) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "granted", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
