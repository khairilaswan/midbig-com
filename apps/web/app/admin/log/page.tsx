import { adminLog } from "@/lib/admin";

export default async function AdminLogPage() {
  const log = await adminLog();
  return (
    <section>
      <p className="small muted">What admins and community moderators changed, newest first (last 200).</p>
      <div className="table-wrap">
        <table className="market admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id}>
                <td className="small">{new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{e.actor ?? "—"}</td>
                <td>{e.action}</td>
                <td>{e.target ?? ""}</td>
                <td className="small mono">{Object.keys(e.detail).length ? JSON.stringify(e.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {log.length === 0 && <p className="muted">Nothing yet.</p>}
    </section>
  );
}
