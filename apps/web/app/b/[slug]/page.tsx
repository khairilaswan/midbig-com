import type { Metadata } from "next";
import { communityMetadata, CommunityPage, type CommunityProps } from "@/components/community-page";

export const dynamic = "force-dynamic";

export function generateMetadata(props: CommunityProps): Promise<Metadata> {
  return communityMetadata("b", props);
}

export default function Page(props: CommunityProps) {
  return <CommunityPage ns="b" props={props} />;
}
