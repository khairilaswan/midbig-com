import type { Metadata } from "next";
import { GLOBAL_ROOM } from "@midbig/shared";
import { ChatRoom } from "@/components/chat";

export const metadata: Metadata = {
  title: "Live crypto chat",
  description: "Talk markets live with other midbig members. Every coin page has its own room too.",
  // Member messages aren't checked content, so search engines skip the page.
  robots: { index: false },
};

export default function ChatPage() {
  return (
    <div className="chat-page">
      <h1 className="page-title">Live chat</h1>
      <p className="lede">The whole market in one room. Each coin&rsquo;s page has its own room for coin-specific talk.</p>
      <ChatRoom room={GLOBAL_ROOM} title="Everyone" tall />
    </div>
  );
}
