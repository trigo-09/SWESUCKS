import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const modes = ["login", "register", "forgot", "verify"];
const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function AuthPage() {
  const { completeLogin } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm_password: "",
    otp: "",
    new_password: "",
    confirm_new_password: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);

  const updateForm = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setError("");
          setMessage("");
          try {
            const data = await api.post("/auth/google/", { credential: response.credential });
            setMessage(data.message);
            completeLogin(data);
          } catch (err) {
            setError(err.message);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: "360",
        text: "continue_with",
      });
      setGoogleReady(true);
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      initializeGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.id = GOOGLE_SCRIPT_ID;
    script.onload = initializeGoogle;
    script.onerror = () => setError("Failed to load Google sign-in.");
    document.body.appendChild(script);
  }, [completeLogin]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      if (mode === "login") {
        const data = await api.post("/auth/login/", { email: form.email, password: form.password });
        completeLogin(data);
        return;
      }
      if (mode === "register") {
        const data = await api.post("/auth/register/", form);
        setMessage(data.message);
        setMode("verify");
        return;
      }
      if (mode === "verify") {
        const data = await api.post("/auth/verify-email/", { email: form.email, otp: form.otp });
        setMessage(data.message);
        setMode("login");
        return;
      }
      const data = form.otp
        ? await api.post("/auth/reset-password/", {
            email: form.email,
            otp: form.otp,
            new_password: form.new_password,
            confirm_new_password: form.confirm_new_password
          })
        : await api.post("/auth/forgot-password/", { email: form.email });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  const continueAsGuest = async () => {
    try {
      const data = await api.post("/auth/guest-login/", {});
      completeLogin(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-[2rem] bg-ink p-10 text-white shadow-panel">
          <p className="text-sm uppercase tracking-[0.4em] text-brand-100">Journey intelligence</p>
          <h1 className="mt-4 max-w-lg text-5xl font-semibold leading-tight">Choose the smartest way to move across Singapore in real time.</h1>
          <p className="mt-6 max-w-xl text-base text-slate-300">
            GO-LAH combines parking availability, taxi supply, traffic snapshots, weather and your own priorities into one recommendation.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <StatCard title="Drive" text="Carpark filtering with walking distance and occupancy scoring." />
            <StatCard title="Taxi" text="Live taxi supply weighting and rain-friendly boosts." />
            <StatCard title="Transit" text="Cost-aware default for the most reliable everyday commute." />
          </div>
        </section>
        <section className="rounded-[2rem] bg-white/90 p-8 shadow-panel backdrop-blur">
          <div className="mb-6 flex flex-wrap gap-2">
            {modes.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-full px-4 py-2 text-sm capitalize ${mode === item ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700"}`}
                onClick={() => {
                  setMode(item);
                  setError("");
                  setMessage("");
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Email address" name="email" type="email" value={form.email} onChange={updateForm} />
            {(mode === "login" || mode === "register") && (
              <Field label="Password" name="password" type="password" value={form.password} onChange={updateForm} />
            )}
            {mode === "register" && (
              <Field label="Confirm password" name="confirm_password" type="password" value={form.confirm_password} onChange={updateForm} />
            )}
            {mode === "verify" && <Field label="OTP" name="otp" value={form.otp} onChange={updateForm} />}
            {mode === "forgot" && form.otp && (
              <>
                <Field label="New password" name="new_password" type="password" value={form.new_password} onChange={updateForm} />
                <Field label="Confirm new password" name="confirm_new_password" type="password" value={form.confirm_new_password} onChange={updateForm} />
              </>
            )}
            {mode === "forgot" && !form.otp && (
              <button
                type="button"
                className="text-sm text-brand-700 underline"
                onClick={() => setForm((current) => ({ ...current, otp: window.prompt("Enter the OTP from your email to continue") || "" }))}
              >
                Already have an OTP?
              </button>
            )}
            {message && <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</p>}
            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
            <button className="w-full rounded-2xl bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-700">
              {mode === "login" && "Login"}
              {mode === "register" && "Register"}
              {mode === "verify" && "Verify email"}
              {mode === "forgot" && (form.otp ? "Reset password" : "Send OTP")}
            </button>
          </form>
          <div className="mt-6 space-y-3">
            <div className="flex min-h-11 items-center justify-center">
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleButtonRef} className="w-full" />
              ) : (
                <button type="button" disabled className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-400">
                  Continue with Google
                </button>
              )}
            </div>
            {GOOGLE_CLIENT_ID && !googleReady && (
              <p className="text-center text-sm text-slate-500">Loading Google sign-in...</p>
            )}
            <button type="button" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50" onClick={continueAsGuest}>
              Continue as guest
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input {...props} className="w-full rounded-2xl border border-brand-100 px-4 py-3 outline-none transition focus:border-brand-500" />
    </label>
  );
}

function StatCard({ title, text }) {
  return (
    <div className="rounded-3xl bg-white/10 p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{text}</p>
    </div>
  );
}
