import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const { email: rawEmail, name, password } = body;

  if (!rawEmail || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const email = rawEmail.toLowerCase().trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const rows = await query<{ id: string }>(
      "INSERT INTO users (id, email, name, password_hash) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id",
      [email, name ?? null, passwordHash]
    );

    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }
    throw err;
  }
}
