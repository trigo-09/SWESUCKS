import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

const modes = ["login", "register", "forgot", "verify"];
const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLOCK_SKEW_ERROR_PATTERNS = [
  "token used too early",
  "clock is set correctly",
];

function shouldRetryGoogleAuth(message) {
  const normalizedMessage = String(message || "").toLowerCase();
  return GOOGLE_CLOCK_SKEW_ERROR_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern),
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function AuthPage() {
  const { completeLogin } = useAuth();
  const [mode, setMode] = useState("login");
  const [forgotOtpRequested, setForgotOtpRequested] = useState(false);
  const [resetFlowStage, setResetFlowStage] = useState("");
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
  const [passwordVisibility, setPasswordVisibility] = useState({
    password: false,
    confirm_password: false,
    new_password: false,
    confirm_new_password: false,
  });
  const googleButtonRef = useRef(null);

  const updateForm = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const registerChecks = {
    hasMinLength: form.password.length >= 8,
    matchesConfirmation:
      form.password.length > 0 && form.password === form.confirm_password,
  };

  const resetChecks = {
    hasMinLength: form.new_password.length >= 8,
    matchesConfirmation:
      form.new_password.length > 0 &&
      form.new_password === form.confirm_new_password,
  };

  const submitDisabled =
    (mode === "register" &&
      (!form.email || !registerChecks.hasMinLength || !registerChecks.matchesConfirmation)) ||
    (mode === "forgot" &&
      forgotOtpRequested &&
      (!form.otp || !resetChecks.hasMinLength || !resetChecks.matchesConfirmation)) ||
    (mode === "login" && (!form.email || !form.password)) ||
    (mode === "verify" && (!form.email || !form.otp)) ||
    (mode === "forgot" && !forgotOtpRequested && !form.email) ||
    resetFlowStage !== "";

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
            let data;

            try {
              data = await api.post("/auth/google/", { credential: response.credential });
            } catch (err) {
              if (!shouldRetryGoogleAuth(err.message)) {
                throw err;
              }

              setMessage("Retrying Google sign-in...");
              await delay(1500);
              data = await api.post("/auth/google/", { credential: response.credential });
            }

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
        width: "100%",
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
      if (mode === "forgot" && !forgotOtpRequested) {
        const data = await api.post("/auth/forgot-password/", { email: form.email });
        setMessage(data.message || data.detail);
        setForgotOtpRequested(true);
        return;
      }
      setResetFlowStage("resetting");
      const data = await api.post("/auth/reset-password/", {
        email: form.email,
        otp: form.otp,
        new_password: form.new_password,
        confirm_new_password: form.confirm_new_password
      });
      setMessage(data.message);
      setResetFlowStage("logging-in");

      setTimeout(async () => {
        try {
          const loginData = await api.post("/auth/login/", {
            email: form.email,
            password: form.new_password,
          });

          completeLogin(loginData);
        } catch (err) {
          setError(err.message);
          setResetFlowStage("");
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
      setResetFlowStage("");
    }
  };

  const continueAsGuest = async () => {
    setError("");
    setMessage("");
    try {
      const data = await api.post("/auth/guest-login/", {});
      completeLogin(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-10 flex items-center justify-center gap-5">
      <img src="/app-icon.png" alt="GO-LAH logo" className="h-[600px] w-[600px] hidden lg:block h-[420px] w-[420px] object-contain" />
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" >
        <div className="mb-5">
          <div className="flex justify-center items-center">          
            <img src="/app-icon.png" alt="GO-LAH logo" className="h-16 w-16 object-contain lg:hidden" />
          </div>

          <h2 className="pt-2 text-2xl font-semibold text-slate-900">
            Sign in and continue planning
          </h2>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {modes.slice(0,2).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-full px-4 py-2 text-sm capitalize transition ${
                mode === item ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
              }`}
              onClick={() => {
                setMode(item);
                setError("");
                setMessage("");
                setForgotOtpRequested(false);
                setResetFlowStage("");
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <form className="space-y-2" onSubmit={submit}>
          <Field label="Email address" name="email" type="email" value={form.email} onChange={updateForm} />
          {(mode === "login" || mode === "register") && (
            <PasswordField
              label="Password"
              name="password"
              value={form.password}
              visible={passwordVisibility.password}
              onToggleVisibility={() =>
                setPasswordVisibility((current) => ({
                  ...current,
                  password: !current.password,
                }))
              }
              onChange={updateForm}
            />
          )}
          {mode === "login" && (
            <div className="text-left">
              <button
                type="button"
                className="text-sm text-brand-700 hover:underline"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                  setForgotOtpRequested(false);
                  setResetFlowStage("");
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
          {mode === "register" && (
            <PasswordField
              label="Confirm password"
              name="confirm_password"
              value={form.confirm_password}
              visible={passwordVisibility.confirm_password}
              onToggleVisibility={() =>
                setPasswordVisibility((current) => ({
                  ...current,
                  confirm_password: !current.confirm_password,
                }))
              }
              onChange={updateForm}
            />
          )}
          {mode === "verify" && <Field label="OTP" name="otp" value={form.otp} onChange={updateForm} />}
          {mode === "forgot" && forgotOtpRequested && (
            <>
              <Field label="OTP" name="otp" value={form.otp} onChange={updateForm} />
              <PasswordField
                label="New password"
                name="new_password"
                value={form.new_password}
                visible={passwordVisibility.new_password}
                onToggleVisibility={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    new_password: !current.new_password,
                  }))
                }
                onChange={updateForm}
              />
              <PasswordField
                label="Confirm new password"
                name="confirm_new_password"
                value={form.confirm_new_password}
                visible={passwordVisibility.confirm_new_password}
                onToggleVisibility={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    confirm_new_password: !current.confirm_new_password,
                  }))
                }
                onChange={updateForm}
              />
            </>
          )}
          {mode === "register" && (
            <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-ink">Password rules</p>
              <ul className="mt-2 space-y-1">
                <li>At least 8 characters</li>
                <li>Must match the confirmation field</li>
              </ul>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ValidationRow
                  ok={registerChecks.hasMinLength}
                  text="Password has at least 8 characters"
                />
                <ValidationRow
                  ok={registerChecks.matchesConfirmation}
                  text="Confirmation matches password"
                />
              </div>
            </div>
          )}
          {mode === "forgot" && forgotOtpRequested && (
            <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-ink">New password rules</p>
              <ul className="mt-2 space-y-1">
                <li>At least 8 characters</li>
                <li>Must match the confirmation field</li>
              </ul>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ValidationRow
                  ok={resetChecks.hasMinLength}
                  text="New password has at least 8 characters"
                />
                <ValidationRow
                  ok={resetChecks.matchesConfirmation}
                  text="Confirmation matches new password"
                />
              </div>
            </div>
          )}
          {message && <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{message}</p>}
          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <button
            className={`w-full rounded-2xl px-4 py-3 font-medium text-white transition ${
              submitDisabled ? "cursor-not-allowed bg-brand-100" : "bg-brand-500 hover:bg-brand-700"
            }`}
            disabled={submitDisabled}
          >
            {mode === "login" && "Login"}
            {mode === "register" && "Register"}
            {mode === "verify" && "Verify email"}
            {mode === "forgot" && !forgotOtpRequested && "Send OTP"}
            {mode === "forgot" && forgotOtpRequested && resetFlowStage === "" && "Reset password"}
            {mode === "forgot" && forgotOtpRequested && resetFlowStage === "resetting" && "Resetting password..."}
            {mode === "forgot" && forgotOtpRequested && resetFlowStage === "logging-in" && "Signing you in..."}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
            onClick={continueAsGuest}
          >
            Continue as guest
          </button>
          <div className="flex min-h-11 items-center justify-center">
            {GOOGLE_CLIENT_ID ? (
              <div ref={googleButtonRef} className="flex w-full justify-center overflow-hidden rounded-2xl" />
            ) : (
              <button type="button" disabled className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-400">
                Continue with Google
              </button>
            )}
          </div>
          {GOOGLE_CLIENT_ID && !googleReady && (
            <p className="text-center text-sm text-slate-500">Loading Google sign-in...</p>
          )}

        </div>
      </section>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-brand-100 px-4 py-3 outline-none transition focus:border-brand-500"
      />
    </label>
  );
}

function PasswordField({ label, visible, onToggleVisibility, ...props }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className="w-full rounded-2xl border border-brand-100 px-4 py-3 pr-20 outline-none transition focus:border-brand-500"
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
        ok ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-500"
      }`}
    >
      {ok ? "Pass" : "Pending"}: {text}
    </div>
  );
}