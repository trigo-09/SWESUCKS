import { useEffect, useState } from "react";
import LocationInput from "../components/LocationInput";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

const MAX_FAVOURITES = 4;

function normalizeListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({
    name: user?.profile?.name || "",
    preference_mode: user?.profile?.preference_mode || "cost",
    max_walking_distance: user?.profile?.max_walking_distance || "500"
  });
  const [favourites, setFavourites] = useState([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingFavourite, setIsSavingFavourite] = useState(false);
  const [savingFavouriteId, setSavingFavouriteId] = useState(null);
  const [deletingFavouriteId, setDeletingFavouriteId] = useState(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newFavourite, setNewFavourite] = useState(null);
  const [favouriteName, setFavouriteName] = useState("");
  const [editingFavouriteId, setEditingFavouriteId] = useState(null);
  const [editFavourite, setEditFavourite] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_new_password: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [favouriteMessage, setFavouriteMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordVisibility, setPasswordVisibility] = useState({
    current_password: false,
    new_password: false,
    confirm_new_password: false
  });

  const passwordChecks = {
    hasCurrentPassword: passwordForm.current_password.trim().length > 0,
    hasMinLength: passwordForm.new_password.length >= 8,
    matchesConfirmation:
      passwordForm.new_password.length > 0 &&
      passwordForm.new_password === passwordForm.confirm_new_password,
    isDifferentFromCurrent:
      passwordForm.new_password.length > 0 &&
      passwordForm.current_password.length > 0 &&
      passwordForm.new_password !== passwordForm.current_password
  };

  const canSubmitPasswordChange =
    passwordChecks.hasCurrentPassword &&
    passwordChecks.hasMinLength &&
    passwordChecks.matchesConfirmation &&
    passwordChecks.isDifferentFromCurrent;
  const hasReachedFavouriteLimit = favourites.length >= MAX_FAVOURITES;

  useEffect(() => {
    if (user?.is_guest) {
      setIsLoadingSettings(false);
      return;
    }

    setIsLoadingSettings(true);
    api
      .get("/locations/favourites/")
      .then((data) => setFavourites(normalizeListResponse(data)))
      .catch(() => setFavourites([]))
      .finally(() => setIsLoadingSettings(false));
  }, [user]);

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const data = await api.patch("/auth/profile/", profile);
      setUser((current) => ({ ...current, profile: data }));
      setProfileMessage("Profile updated.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const addFavourite = async () => {
    if (!newFavourite?.label || !favouriteName) return;
    if (hasReachedFavouriteLimit) {
      setFavouriteMessage(`You can save up to ${MAX_FAVOURITES} favourite locations.`);
      return;
    }
    setIsSavingFavourite(true);
    try {
      const data = await api.post("/locations/favourites/", {
        name: favouriteName,
        address: newFavourite.label,
        latitude: newFavourite.latitude,
        longitude: newFavourite.longitude
      });
      setFavourites((current) => [data, ...current]);
      setUser((current) => ({ ...current, favourite_locations: [data, ...(current?.favourite_locations || [])] }));
      setFavouriteName("");
      setNewFavourite(null);
      setFavouriteMessage("Favourite location saved.");
    } finally {
      setIsSavingFavourite(false);
    }
  };

  const startEditingFavourite = (item) => {
    setEditingFavouriteId(item.id);
    setEditFavourite({
      name: item.name,
      location: {
        label: item.address,
        latitude: item.latitude,
        longitude: item.longitude
      }
    });
    setFavouriteMessage("");
  };

  const cancelEditingFavourite = () => {
    setEditingFavouriteId(null);
    setEditFavourite(null);
  };

  const saveEditedFavourite = async (id) => {
    if (!editFavourite?.location?.label || !editFavourite?.name?.trim()) return;
    setSavingFavouriteId(id);
    try {
      const data = await api.patch(`/locations/favourites/${id}/`, {
        name: editFavourite.name.trim(),
        address: editFavourite.location.label,
        latitude: editFavourite.location.latitude,
        longitude: editFavourite.location.longitude
      });

      setFavourites((current) => current.map((item) => (item.id === id ? data : item)));
      setUser((current) => ({
        ...current,
        favourite_locations: (current?.favourite_locations || []).map((item) =>
          item.id === id ? data : item
        )
      }));
      cancelEditingFavourite();
      setFavouriteMessage("Favourite location updated.");
    } finally {
      setSavingFavouriteId(null);
    }
  };

  const removeFavourite = async (id) => {
    setDeletingFavouriteId(id);
    try {
      await api.delete(`/locations/favourites/${id}/`);
      setFavourites((current) => current.filter((item) => item.id !== id));
      setUser((current) => ({
        ...current,
        favourite_locations: (current?.favourite_locations || []).filter((item) => item.id !== id)
      }));
    } finally {
      setDeletingFavouriteId(null);
    }
  };

  const changePassword = async () => {
    if (!canSubmitPasswordChange) {
      setPasswordError("Please complete the password requirements before submitting.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const data = await api.post("/auth/change-password/", passwordForm);
      localStorage.setItem("golah_token", data.token);
      setPasswordMessage(data.message || "Password updated successfully.");
      setPasswordError("");
      setPasswordForm({ current_password: "", new_password: "", confirm_new_password: "" });
    } catch (error) {
      setPasswordError(error.message || "Unable to update password.");
      setPasswordMessage("");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (user?.is_guest) {
    return (
      <div className="pt-24 pb-24 px-3 xl:pl-[126px] xl:pr-5">
        <section className="border border-slate-200 rounded-[2rem] bg-white/90 p-8 shadow-panel">
          <p className="text-slate-600">Guest users can view settings, but profile editing and favourite locations are restricted.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-24 pb-24 px-3 xl:pl-[126px] xl:pr-5">
      <section className="border border-slate-200 rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Profile and preferences</h2>
        {profileMessage && <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{profileMessage}</p>}
        <div className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Name</span>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Preference</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={profile.preference_mode} onChange={(e) => setProfile({ ...profile, preference_mode: e.target.value })}>
                <option value="cost">Cost priority</option>
                <option value="time">Time priority</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Maximum walking distance</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={profile.max_walking_distance} onChange={(e) => setProfile({ ...profile, max_walking_distance: e.target.value })}>
                <option value="200">Less than 200m</option>
                <option value="500">Less than 500m</option>
                <option value="1000">Less than 1km</option>
                <option value="2000">Less than 2km</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className={`mt-6 rounded-full px-5 py-3 font-medium text-white transition ${
              isSavingProfile ? "cursor-not-allowed bg-brand-300" : "bg-brand-500 hover:bg-brand-600"
            }`}
            disabled={isSavingProfile || isLoadingSettings}
            onClick={saveProfile}
          >
            {isSavingProfile ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Favourite locations</h3>
        {favouriteMessage && (
          <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            {favouriteMessage}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-600">
          {favourites.length}/{MAX_FAVOURITES} saved
        </p>
        {!hasReachedFavouriteLimit ? (
          <div className="mt-5 space-y-4">
            <LocationInput label="Favourite address" value={newFavourite} onChange={setNewFavourite} onClear={() => setNewFavourite(null)} />
            <input
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              placeholder="Favourite name"
              value={favouriteName}
              onChange={(event) => setFavouriteName(event.target.value)}
            />
            <button
              type="button"
              className={`mt-6 rounded-full px-5 py-3 font-medium text-white transition ${
                isSavingFavourite ? "cursor-not-allowed bg-brand-300" : "bg-brand-500 hover:bg-brand-600"
              }`}
              disabled={isSavingFavourite || isLoadingSettings}
              onClick={addFavourite}
            >
              {isSavingFavourite ? "Saving..." : "Save favourite"}
            </button>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-600">
            Delete an existing favourite before saving a new one.
          </p>
        )}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {favourites.map((item) => (
            <div key={item.id} className="rounded-3xl border border-brand-100 bg-brand-50 p-4">
              {editingFavouriteId === item.id ? (
                <div className="space-y-4">
                  <LocationInput
                    label="Favourite address"
                    value={editFavourite?.location}
                    onChange={(value) =>
                      setEditFavourite((current) => ({ ...current, location: value }))
                    }
                    onClear={() =>
                      setEditFavourite((current) => ({ ...current, location: null }))
                    }
                    favourites={[]}
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    placeholder="Favourite name"
                    value={editFavourite?.name || ""}
                    onChange={(event) =>
                      setEditFavourite((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${
                        savingFavouriteId === item.id ? "cursor-not-allowed bg-brand-300" : "bg-brand-500 hover:bg-brand-600"
                      }`}
                      disabled={savingFavouriteId === item.id}
                      onClick={() => saveEditedFavourite(item.id)}
                    >
                      {savingFavouriteId === item.id ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                      onClick={cancelEditingFavourite}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.address}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-sm text-brand-700"
                      onClick={() => startEditingFavourite(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`text-sm ${deletingFavouriteId === item.id ? "text-red-300" : "text-red-600"}`}
                      disabled={deletingFavouriteId === item.id}
                      onClick={() => removeFavourite(item.id)}
                    >
                      {deletingFavouriteId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {user?.auth_provider !== "google" && (
        <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
          <h3 className="text-2xl font-semibold text-ink">Change password</h3>
          {/* <p className="mt-2 text-sm text-slate-600">
            Email-password users can change their password here. Google sign-ins should keep using Google authentication.
          </p> */}
          <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-ink">Password rules</p>
            <ul className="mt-2 space-y-1">
              <li>At least 8 characters</li>
              <li>Must match the confirmation field</li>
              <li>Must be different from your current password</li>
            </ul>
          </div>
          {passwordMessage && (
            <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              {passwordMessage}
            </p>
          )}
          {passwordError && (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {passwordError}
            </p>
          )}
          <div className="mt-5">
            <div className="grid gap-4 md:grid-cols-3">
              <PasswordField
                field="current_password"
                label="Current password"
                value={passwordForm.current_password}
                visible={passwordVisibility.current_password}
                onToggleVisibility={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    current_password: !current.current_password
                  }))
                }
                onChange={(event) => {
                  setPasswordForm((current) => ({ ...current, current_password: event.target.value }));
                  setPasswordError("");
                  setPasswordMessage("");
                }}
              />
              <PasswordField
                field="new_password"
                label="New password"
                value={passwordForm.new_password}
                visible={passwordVisibility.new_password}
                onToggleVisibility={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    new_password: !current.new_password
                  }))
                }
                onChange={(event) => {
                  setPasswordForm((current) => ({ ...current, new_password: event.target.value }));
                  setPasswordError("");
                  setPasswordMessage("");
                }}
              />
              <PasswordField
                field="confirm_new_password"
                label="Confirm new password"
                value={passwordForm.confirm_new_password}
                visible={passwordVisibility.confirm_new_password}
                onToggleVisibility={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    confirm_new_password: !current.confirm_new_password
                  }))
                }
                onChange={(event) => {
                  setPasswordForm((current) => ({
                    ...current,
                    confirm_new_password: event.target.value
                  }));
                  setPasswordError("");
                  setPasswordMessage("");
                }}
              />
            </div>
            <div className="mt-5 grid gap-2 md:grid-cols-2">
              <ValidationRow
                ok={passwordChecks.hasCurrentPassword}
                text="Current password entered"
              />
              <ValidationRow
                ok={passwordChecks.hasMinLength}
                text="New password has at least 8 characters"
              />
              <ValidationRow
                ok={passwordChecks.matchesConfirmation}
                text="Confirmation matches new password"
              />
              <ValidationRow
                ok={passwordChecks.isDifferentFromCurrent}
                text="New password is different from current password"
              />
            </div>
            <button
              type="button"
              className={`mt-5 rounded-full px-5 py-3 font-medium transition ${
                canSubmitPasswordChange && !isUpdatingPassword
                  ? "bg-brand-500 text-white hover:bg-brand-600"
                  : "cursor-not-allowed bg-brand-100 text-white"
              }`}
              disabled={!canSubmitPasswordChange || isUpdatingPassword}
              onClick={changePassword}
            >
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function PasswordField({
  label,
  value,
  visible,
  onChange,
  onToggleVisibility
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-20 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          onClick={onToggleVisibility}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

function ValidationRow({ ok, text }) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-sm ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ok ? "Pass" : "Pending"}: {text}
    </div>
  );
}
