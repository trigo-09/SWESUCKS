import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, MapPinned, Route, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

function normalizeListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

function formatMode(mode) {
  return mode?.replaceAll("_", " ") || "Unknown";
}

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (user?.is_guest) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    api
      .get("/recommendations/history/")
      .then((data) => setHistory(normalizeListResponse(data)))
      .catch(() => setHistory([]))
      .finally(() => setIsLoadingHistory(false));
  }, [user]);

  if (user?.is_guest) {
    return (
      <div className="px-3 pb-24 pt-24 xl:pl-[126px] xl:pr-5">
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-panel">
          <p className="text-slate-600">Guests cannot access recommendation history.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-3 pb-24 pt-24 xl:pl-[126px] xl:pr-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 pb-20 xl:pb-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">History</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Past recommendations</h2>
        {/*<p className="mt-2 text-sm text-slate-500">
          Revisit your previous journeys and re-run them with current live data.
        </p> */}

        {isLoadingHistory ? (
          <section className="mt-5 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <Clock3 className="h-6 w-6 text-slate-400" />
            </div>
            <p className="mt-4 text-base font-medium text-slate-700">Loading recommendation history...</p>
            <p className="mt-1 text-sm text-slate-500">
              Fetching your previous journeys now.
            </p>
          </section>
        ) : history.length === 0 ? (
          <section className="mt-5 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <Route className="h-6 w-6 text-slate-400" />
            </div>
            <p className="mt-4 text-base font-medium text-slate-700">No recommendation history yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Your saved journeys will appear here after you generate recommendations.
            </p>
          </section>
        ) : (
          <div className="mt-6 space-y-5">
            {history.map((item) => {
              const recommendedMode = formatMode(item.recommendation_payload?.recommended_mode);

              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/70 via-white to-white px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-500">
                          Journey record
                        </p>
                        <h3 className="mt-2 truncate text-lg font-semibold text-slate-900">
                          {item.origin_label}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-4 w-4" />
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPinned className="h-4 w-4" />
                            {item.destinations?.length || 0} stop
                            {(item.destinations?.length || 0) !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/*<div className="shrink-0">
                        <span className="inline-flex rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-medium capitalize text-brand-700 shadow-sm">
                          {recommendedMode}
                        </span>
                      </div> */}
                    </div>
                  </div>

                  <div className="px-5 py-5 sm:px-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Destinations
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.destinations?.map((destination, index) => (
                          <span
                            key={`${item.id}-${destination.label}-${index}`}
                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                          >
                            {index + 1}. {destination.label}
                          </span>
                        ))}
                      </div>

                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* <p className="text-sm text-slate-500">
                        Use this trip again and refresh the recommendation with current conditions.
                      </p> */}

                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
                        onClick={() =>
                          navigate("/", {
                            state: {
                              rerunOrigin: {
                                label: item.origin_label,
                                latitude: item.origin_latitude,
                                longitude: item.origin_longitude,
                              },
                              rerunDestinations: item.destinations,
                              rerunHistoryId: item.id,
                            },
                          })
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        Re-run with current data
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <section className="rounded-[2rem] bg-white/90 p-8 shadow-panel">
      <p className="text-slate-600">{text}</p>
    </section>
  );
}
