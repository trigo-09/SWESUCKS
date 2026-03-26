import { useEffect, useState } from "react";
import LocationInput from "../components/LocationInput";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({
    name: user?.profile?.name || "",
    preference_mode: user?.profile?.preference_mode || "cost",
    max_walking_distance: user?.profile?.max_walking_distance || "500"
  });
  const [favourites, setFavourites] = useState([]);
  const [newFavourite, setNewFavourite] = useState(null);
  const [favouriteName, setFavouriteName] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_new_password: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user?.is_guest) return;
    api.get("/auth/favourites/").then(setFavourites).catch(() => setFavourites([]));
  }, [user]);

  const saveProfile = async () => {
    const data = await api.patch("/auth/profile/", profile);
    setUser((current) => ({ ...current, profile: data }));
    setMessage("Profile updated.");
  };

  const addFavourite = async () => {
    if (!newFavourite?.label || !favouriteName) return;
    const data = await api.post("/auth/favourites/", {
      name: favouriteName,
      address: newFavourite.label,
      latitude: newFavourite.latitude,
      longitude: newFavourite.longitude
    });
    setFavourites((current) => [data, ...current]);
    setUser((current) => ({ ...current, favourite_locations: [data, ...(current?.favourite_locations || [])] }));
    setFavouriteName("");
    setNewFavourite(null);
    setMessage("Favourite location saved.");
  };

  const removeFavourite = async (id) => {
    await api.delete(`/auth/favourites/${id}/`);
    setFavourites((current) => current.filter((item) => item.id !== id));
    setUser((current) => ({
      ...current,
      favourite_locations: (current?.favourite_locations || []).filter((item) => item.id !== id)
    }));
  };

  const changePassword = async () => {
    const data = await api.post("/auth/change-password/", passwordForm);
    localStorage.setItem("golah_token", data.token);
    setMessage(data.message);
    setPasswordForm({ current_password: "", new_password: "", confirm_new_password: "" });
  };

  if (user?.is_guest) {
    return (
      <section className="rounded-[2rem] bg-white/90 p-8 shadow-panel">
        <p className="text-slate-600">Guest users can view settings, but profile editing and favourite locations are restricted.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Profile and preferences</h2>
        {message && <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink">Name</span>
            <input className="w-full rounded-2xl border border-brand-100 px-4 py-3" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink">Preference</span>
            <select className="w-full rounded-2xl border border-brand-100 px-4 py-3" value={profile.preference_mode} onChange={(e) => setProfile({ ...profile, preference_mode: e.target.value })}>
              <option value="cost">Cost priority</option>
              <option value="time">Time priority</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-ink">Maximum walking distance</span>
            <select className="w-full rounded-2xl border border-brand-100 px-4 py-3" value={profile.max_walking_distance} onChange={(e) => setProfile({ ...profile, max_walking_distance: e.target.value })}>
              <option value="200">Less than 200m</option>
              <option value="500">Less than 500m</option>
              <option value="1000">Less than 1km</option>
              <option value="2000">Less than 2km</option>
            </select>
          </label>
        </div>
        <button type="button" className="mt-6 rounded-full bg-brand-500 px-5 py-3 font-medium text-white" onClick={saveProfile}>
          Save changes
        </button>
      </section>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Favourite locations</h3>
        <div className="mt-5 space-y-4">
          <LocationInput label="Favourite address" value={newFavourite} onChange={setNewFavourite} onClear={() => setNewFavourite(null)} />
          <input
            className="w-full rounded-2xl border border-brand-100 px-4 py-3"
            placeholder="Favourite name"
            value={favouriteName}
            onChange={(event) => setFavouriteName(event.target.value)}
          />
          <button type="button" className="rounded-full border border-brand-500 px-5 py-3 text-brand-700" onClick={addFavourite}>
            Save favourite
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {favourites.map((item) => (
            <div key={item.id} className="rounded-3xl border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.address}</p>
                </div>
                <button type="button" className="text-sm text-red-600" onClick={() => removeFavourite(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Change password</h3>
        <p className="mt-2 text-sm text-slate-600">Email-password users can change their password here. Google sign-ins should keep using Google authentication.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <input
            type="password"
            placeholder="Current password"
            className="rounded-2xl border border-brand-100 px-4 py-3"
            value={passwordForm.current_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
          />
          <input
            type="password"
            placeholder="New password"
            className="rounded-2xl border border-brand-100 px-4 py-3"
            value={passwordForm.new_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="rounded-2xl border border-brand-100 px-4 py-3"
            value={passwordForm.confirm_new_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_new_password: event.target.value }))}
          />
        </div>
        <button type="button" className="mt-5 rounded-full border border-brand-500 px-5 py-3 text-brand-700" onClick={changePassword}>
          Update password
        </button>
      </section>
    </div>
  );
}
