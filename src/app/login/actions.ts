"use server";

import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SessionData, sessionOptions } from "@/lib/session";

export async function login(
  _prevState: { error: string },
  formData: FormData
) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required." };
  }

  if (password !== process.env.SITE_PASSWORD) {
    return { error: "Incorrect password." };
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.isLoggedIn = true;
  await session.save();

  redirect("/");
}

export async function logout() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.destroy();
  redirect("/login");
}
