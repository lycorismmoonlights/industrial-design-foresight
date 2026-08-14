import { redirect } from "next/navigation";
import { getAppEnv } from "../../db";
import { chatGPTSignInPath, getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import { AppError } from "./errors";
import { authorizeOwner } from "./auth-policy";

export async function requireOwnerApi(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  return authorizeOwner(user, getAppEnv().OWNER_EMAIL);
}

export async function requireOwnerPage(returnTo = "/"): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath(returnTo));
  try {
    return authorizeOwner(user, getAppEnv().OWNER_EMAIL);
  } catch (error) {
    if (error instanceof AppError && error.status === 403) redirect("/forbidden");
    throw error;
  }
}
