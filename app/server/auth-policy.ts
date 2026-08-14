import type { ChatGPTUser } from "../chatgpt-auth";
import { AppError } from "./errors";

export function authorizeOwner(user: ChatGPTUser | null, configuredEmail: string | undefined): ChatGPTUser {
  const ownerEmail = configuredEmail?.trim().toLowerCase();
  if (!ownerEmail) throw new AppError(503, "OWNER_NOT_CONFIGURED", "部署环境尚未设置 OWNER_EMAIL。");
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "请先使用 ChatGPT 登录。");
  if (user.email.trim().toLowerCase() !== ownerEmail) {
    throw new AppError(403, "OWNER_ONLY", "此研究空间仅向所有者开放。");
  }
  return user;
}
