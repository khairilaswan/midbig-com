import type { Metadata } from "next";
import Link from "next/link";
import { TopicForm } from "@/components/forum";
import { turnstile } from "@/lib/auth";
import { communityForAsset, communityNames, getCommunityById } from "@/lib/communities";
import { forumViewer } from "@/lib/forum";

export const metadata: Metadata = { title: "New post", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ community?: string; asset?: string }> };

export default async function NewTopicPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [{ me }, choices, picked] = await Promise.all([
    forumViewer(),
    communityNames(),
    sp.community ? getCommunityById(sp.community) : sp.asset ? communityForAsset(sp.asset) : null,
  ]);
  const community = picked && picked.status === "active" ? picked : null;

  return (
    <div className="narrow">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forum">Communities</Link> <span aria-hidden>›</span>{" "}
        {community && (
          <>
            <Link href={community.path}>{community.label}</Link> <span aria-hidden>›</span>{" "}
          </>
        )}
        <span>New post</span>
      </nav>
      <h1 className="page-title">New post</h1>
      <TopicForm
        me={me}
        captchaSiteKey={turnstile?.siteKey ?? null}
        community={community && { id: community.id, label: community.label, title: community.title }}
        choices={choices}
      />
    </div>
  );
}
