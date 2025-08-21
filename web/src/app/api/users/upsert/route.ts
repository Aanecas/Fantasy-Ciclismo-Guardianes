import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import { upsertUser } from "@/server/sheets";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.uid) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  const { uid, email, name, image } = session.user;

  const res = await upsertUser({ uid, email, name, image });
  return NextResponse.json({ ok: true, ...res });
}
