import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <h1 className="page-title">Page not found</h1>
      <p>
        We couldn&apos;t find that page. <Link href="/">Back to all coins</Link>
      </p>
    </div>
  );
}
