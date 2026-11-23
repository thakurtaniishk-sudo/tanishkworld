
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./resetPassword.css";

const API_URL = "http://localhost:5000/api/auth";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const resetToken = location.state?.resetToken;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!resetToken) {
      navigate("/forgot-password", { replace: true });
    }
  }, [resetToken, navigate]);

  async function handleResetPassword(e) {
    e.preventDefault();

    if (loading) return;

    setError("");

    if (password.length < 8 || password.length > 128) {
      setError("Password must be 8 to 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 20000);

    try {
      const response = await fetch(
        `${API_URL}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resetToken,
            newPassword: password,
          }),
          signal: controller.signal,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Password reset failed."
        );
      }

      // Clear old login session after password reset
      sessionStorage.removeItem("tanishkworld_token");
      sessionStorage.removeItem("tanishkworld_user");

      setPassword("");
      setConfirmPassword("");

      navigate("/login", {
        replace: true,
        state: {
          message:
            "Password updated successfully! Login with your new password.",
        },
      });
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  if (!resetToken) return null;

  return (
    <div className="reset-page">
      <div className="reset-card">
        <div className="reset-brand">
          <span>✦</span> TanishkWorld
        </div>

        <div className="reset-icon">🔐</div>

        <h1>Create new password</h1>

        <p className="reset-description">
          Your OTP has been verified. Create a strong
          new password to secure your account.
        </p>

        <div className="reset-progress">
          <span />
          <span />
          <span />
        </div>

        {error && (
          <div className="reset-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleResetPassword}>
          <label htmlFor="reset-new-password">
            New password
          </label>

          <div className="reset-input-wrap">
            <input
              id="reset-new-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <button
              type="button"
              className="reset-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <label htmlFor="reset-confirm-password">
            Confirm password
          </label>

          <div className="reset-input-wrap">
            <input
              id="reset-confirm-password"
              type={
                showConfirmPassword ? "text" : "password"
              }
              placeholder="Confirm new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              disabled={loading}
              required
            />

            <button
              type="button"
              className="reset-eye"
              onClick={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
              aria-label={
                showConfirmPassword
                  ? "Hide confirmation"
                  : "Show confirmation"
              }
            >
              {showConfirmPassword ? "🙈" : "👁"}
            </button>
          </div>

          <p className="reset-hint">
            Use at least 8 characters for your new password.
          </p>

          <button
            type="submit"
            className="reset-primary"
            disabled={loading}
          >
            {loading
              ? "Updating password..."
              : "Reset Password"}
          </button>
        </form>

        <Link to="/login" className="reset-back">
          ← Back to Login
        </Link>
      </div>
    </div>
  );
}
