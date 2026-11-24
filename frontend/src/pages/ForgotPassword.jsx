
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../services/apiConfig";
import "./forgotpassword.css";

const API_URL = apiUrl("/api/auth");
const REQUEST_TIMEOUT = 20000;

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // Common API handler with timeout and error handling
  async function apiRequest(endpoint, body) {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT);

    try {
      const response = await fetch(
        `${API_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Server returned an invalid response (${response.status}).`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            `Request failed (${response.status})`
        );
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(
          "Request timed out. Please check your connection and try again."
        );
      }

      if (err instanceof TypeError) {
        throw new Error(
          "Unable to connect to the backend server. Please try again."
        );
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // STEP 1: Send OTP
  async function handleSendOTP(e) {
    e.preventDefault();

    if (loading) return;

    clearMessages();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const data = await apiRequest(
        "/forgot-password",
        { email: normalizedEmail }
      );

      setEmail(normalizedEmail);
      setOtp("");
      setResetToken("");

     navigate("/verify-otp", {
  state: {
    email: email.trim().toLowerCase(),
  },
});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // STEP 2: Verify OTP
  async function handleVerifyOTP(e) {
    e.preventDefault();

    if (loading || otp.length !== 6) return;

    clearMessages();
    setLoading(true);

    try {
      const data = await apiRequest(
        "/verify-otp",
        {
          email: email.trim().toLowerCase(),
          otp,
        }
      );

      if (!data.resetToken) {
        throw new Error(
          "Reset token was not received from the server."
        );
      }

      setResetToken(data.resetToken);
      setOtp("");
      setStep(3);

      setSuccess(
        "OTP verified successfully. Create your new password."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP
  async function handleResendOTP() {
    if (resending || loading) return;

    clearMessages();
    setResending(true);

    try {
      const data = await apiRequest(
        "/resend-otp",
        {
          email: email.trim().toLowerCase(),
        }
      );

      setOtp("");
      setSuccess(
        `${data.message} If you recently requested a code, please wait at least 60 seconds.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  // STEP 3: Reset Password
  async function handleResetPassword(e) {
    e.preventDefault();

    if (loading) return;

    clearMessages();

    if (!resetToken) {
      setError(
        "Reset session is missing. Please request a new OTP."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Both passwords must match.");
      return;
    }

    if (
      password.length < 8 ||
      password.length > 128
    ) {
      setError(
        "Password must contain 8 to 128 characters."
      );
      return;
    }

    setLoading(true);

    try {
      await apiRequest(
        "/reset-password",
        {
          resetToken,
          newPassword: password,
        }
      );

      setResetToken("");
      setPassword("");
      setConfirmPassword("");

      navigate("/login", {
        replace: true,
        state: {
          message:
            "Password reset successfully. Please login with your new password.",
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tw-forgot-page">
      <div className="tw-forgot-glow" />

      <div className="tw-forgot-card">
        <div className="tw-forgot-brand">
          <span className="tw-brand-symbol">
            ✦
          </span>
          TanishkWorld
        </div>

        <div className="tw-forgot-icon">
          {step === 1
            ? "✉"
            : step === 2
            ? "✦"
            : "🔐"}
        </div>

        <h1>
          {step === 1 && "Forgot password?"}
          {step === 2 && "Verify your email"}
          {step === 3 && "Create new password"}
        </h1>

        <p className="tw-forgot-subtitle">
          {step === 1 &&
            "Enter your registered email address to receive a verification code."}

          {step === 2 &&
            `Enter the 6-digit verification code for ${email}. Check your inbox and spam folder.`}

          {step === 3 &&
            "Choose a strong new password to secure your account."}
        </p>

        <div className="tw-forgot-progress">
          {[1, 2, 3].map((number) => (
            <span
              key={number}
              className={
                number <= step
                  ? "tw-progress-active"
                  : ""
              }
            />
          ))}
        </div>

        {error && (
          <div
            className="tw-forgot-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="tw-forgot-success"
            role="status"
          >
            {success}
          </div>
        )}

        {/* STEP 1: EMAIL */}
        {step === 1 && (
          <form onSubmit={handleSendOTP}>
            <label htmlFor="forgot-email">
              Email address
            </label>

            <input
              id="forgot-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              disabled={loading}
              required
            />

            <button
              className="tw-forgot-primary"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Sending OTP..."
                : "Send Verification Code"}
            </button>
          </form>
        )}

        {/* STEP 2: VERIFY OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOTP}>
            <label htmlFor="forgot-otp">
              Verification code
            </label>

            <input
              id="forgot-otp"
              className="tw-otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) =>
                setOtp(
                  e.target.value.replace(/\D/g, "")
                )
              }
              disabled={loading}
              required
            />

            <p className="tw-forgot-hint">
              OTP expires after 10 minutes.
            </p>

            <button
              className="tw-forgot-primary"
              type="submit"
              disabled={
                loading ||
                resending ||
                otp.length !== 6
              }
            >
              {loading
                ? "Verifying..."
                : "Verify OTP"}
            </button>

            <button
              type="button"
              className="tw-forgot-secondary"
              disabled={loading || resending}
              onClick={handleResendOTP}
            >
              {resending
                ? "Sending..."
                : "Resend OTP"}
            </button>

            <button
              type="button"
              className="tw-forgot-text-button"
              disabled={loading || resending}
              onClick={() => {
                clearMessages();
                setOtp("");
                setResetToken("");
                setStep(1);
              }}
            >
              Change email
            </button>
          </form>
        )}

        {/* STEP 3: NEW PASSWORD */}
        {step === 3 && (
          <form onSubmit={handleResetPassword}>
            <label htmlFor="new-password">
              New password
            </label>

            <input
              id="new-password"
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              placeholder="Minimum 8 characters"
              value={password}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              onChange={(e) =>
                setPassword(e.target.value)
              }
              disabled={loading}
              required
            />

            <label htmlFor="confirm-password">
              Confirm password
            </label>

            <input
              id="confirm-password"
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              placeholder="Confirm new password"
              value={confirmPassword}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              disabled={loading}
              required
            />

            <label className="tw-show-password">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) =>
                  setShowPassword(e.target.checked)
                }
                disabled={loading}
              />
              Show passwords
            </label>

            <button
              className="tw-forgot-primary"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Updating password..."
                : "Reset Password"}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="tw-forgot-back"
        >
          ← Back to Login
        </Link>
      </div>
    </div>
  );
}
