import "server-only";

export function privateChatAtomicOrderingEnabled(){
  return process.env.PRIVATE_CHAT_ATOMIC_ORDERING_ENABLED==="true";
}
