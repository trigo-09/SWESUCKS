import { useState } from "react";
import LocationInput from "../components/LocationInput";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

export default function ProfileSetupPage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.profile?.name || "",
    preference_mode: user?.profile?.preference_mode || "cost",
    max_walking_distance: user?.profile?.max_walking_distance || "500"
  });
  const [favourite, setFavourite] = useState(null);
  const [favouriteName, setFavouriteName] = useState("");

  const submit = async (skip = false) => {
    const data = await api.patch("/auth/profile/", skip ? { ...form, name: "" } : form);
    if (!skip && favourite?.label && favouriteName) {
      const favouriteLocation = await api.post("/auth/favourites/", {
        name: favouriteName,
        address: favourite.label,
        latitude: favourite.latitude,
        longitude: favourite.longitude
      });
      setUser((current) => ({
        ...current,
        first_login_completed: true,
        profile: data,
        favourite_locations: [favouriteLocation, ...(current?.favourite_locations || [])]
      }));
      return;
    }
    setUser((current) => ({ ...current, first_login_completed: true, profile: data }));
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10 " style={{background: "radial-gradient(circle at top left, rgba(18, 113, 93, 0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(234, 176, 76, 0.18), transparent 22%), #f7f2e8"}}>
      <div className="w-full max-w-2xl rounded-[2rem] bg-white/90 p-8 shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">First-time setup</p>
        <h1 className="mt-4 text-3xl font-semibold text-ink">Tell GO-LAH how you like to travel</h1>
        <p className="mt-3 text-slate-600">You can complete this now or skip and update it later in settings.</p>
        <div className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Your name</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Recommendation priority</span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              value={form.preference_mode}
              onChange={(event) => setForm((current) => ({ ...current, preference_mode: event.target.value }))}
            >
              <option value="cost">Cost priority</option>
              <option value="time">Time priority</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Maximum walking distance</span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              value={form.max_walking_distance}
              onChange={(event) => setForm((current) => ({ ...current, max_walking_distance: event.target.value }))}
            >
              <option value="200">Less than 200m</option>
              <option value="500">Less than 500m</option>
              <option value="1000">Less than 1km</option>
              <option value="2000">Less than 2km</option>
            </select>
          </label>
          <div className="space-y-3">
            <LocationInput label="Favourite location (optional)" value={favourite} onChange={setFavourite} onClear={() => setFavourite(null)} />
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              placeholder="Favourite location name"
              value={favouriteName}
              onChange={(event) => setFavouriteName(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-8 flex gap-3">
          <button type="button" className="rounded-full bg-brand-500 px-5 py-3 font-medium text-white" onClick={() => submit(false)}>
            Save profile
          </button>
          <button type="button" className="rounded-full border border-slate-300 px-5 py-3 text-sm" onClick={() => submit(true)}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
