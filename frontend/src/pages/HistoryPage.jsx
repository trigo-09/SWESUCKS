import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [rerunResult, setRerunResult] = useState(null);

  useEffect(() => {
    if (user?.is_guest) return;
    api.get("/auth/history/").then((data) => setHistory(data)).catch(() => setHistory([]));
  }, [user]);

  if (user?.is_guest) {
    return <EmptyState text="Guests cannot access recommendation history." />;
  }

  return (
    <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
      <p className="text-sm uppercase tracking-[0.3em] text-brand-500">History</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">Past recommendations</h2>
      {history.length === 0 ? (
        <EmptyState text="No recommendation history yet." />
      ) : (
        <div className="mt-6 space-y-4">
          {history.map((item) => (
            <article key={item.id} className="rounded-3xl border border-brand-100 bg-brand-50/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{item.origin_label}</p>
                  <p className="mt-1 text-sm text-slate-600">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-white px-4 py-2 text-sm capitalize text-brand-700">
                  {item.recommendation_payload.recommended_mode?.replace("_", " ")}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.destinations.map((destination) => (
                  <span key={`${item.id}-${destination.label}`} className="rounded-full bg-white px-3 py-2 text-xs text-slate-600">
                    {destination.label}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 rounded-full border border-brand-500 px-4 py-2 text-sm text-brand-700"
                onClick={async () => setRerunResult(await api.get(`/auth/history/${item.id}/rerun_payload/`))}
              >
                Re-run with current data
              </button>
            </article>
          ))}
        </div>
      )}
      {rerunResult && (
        <div className="mt-6 rounded-3xl bg-ink p-5 text-white">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Latest rerun result</p>
          <h3 className="mt-2 text-2xl font-semibold capitalize">{rerunResult.recommended_mode.replace("_", " ")}</h3>
          <div className="mt-3 space-y-2">
            {rerunResult.justifications.map((item) => (
              <p key={item} className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                {item}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyState({ text }) {
  return (
    <section className="rounded-[2rem] bg-white/90 p-8 shadow-panel">
      <p className="text-slate-600">{text}</p>
    </section>
  );
}
