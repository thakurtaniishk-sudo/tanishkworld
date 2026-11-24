
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { apiUrl } from "../services/apiConfig";
import "./VerifyOtp.css";

const API_URL = apiUrl("/api/auth");
const TIMEOUT_MS = 20000;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

// Common API function
async function postAPI(endpoint, body) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

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
        `Invalid server response (${response.status}).`
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
          `Request failed (${response.status}).`
      );
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Request timed out. Please try again."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Unable to connect to backend server."
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const email = (
    location.state?.email || ""
  ).trim().toLowerCase();

  const [digits, setDigits] = useState(
    Array(OTP_LENGTH).fill("")
  );

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(
    RESEND_COOLDOWN
  );

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inputs = useRef([]);

  const otp = digits.join("");

  // Redirect if email is missing
  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", {
        replace: true,
      });
    }
  }, [email, navigate]);

  // Countdown for resend OTP
  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setTimeout(() => {
      setSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [seconds]);

  // Auto focus first input
  useEffect(() => {
    if (email) {
      inputs.current[0]?.focus();
    }
  }, [email]);

  // Handle OTP digit input
  function updateDigit(index, value) {
    setError("");

    const clean = value.replace(/\D/g, "");

    if (clean.length > 1) {
      const next = [...digits];

      clean
        .slice(0, OTP_LENGTH - index)
        .split("")
        .forEach((digit, i) => {
          next[index + i] = digit;
        });

      setDigits(next);

      const nextIndex = Math.min(
        index + clean.length,
        OTP_LENGTH - 1
      );

      inputs.current[nextIndex]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = clean;
    setDigits(next);

    if (clean && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  // Handle backspace and arrow keys
  function handleKeyDown(event, index) {
    if (
      event.key === "Backspace" &&
      !digits[index] &&
      index > 0
    ) {
      inputs.current[index - 1]?.focus();
    }

    if (
      event.key === "ArrowLeft" &&
      index > 0
    ) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }

    if (
      event.key === "ArrowRight" &&
      index < OTP_LENGTH - 1
    ) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  // Handle pasting 6-digit OTP
  function handlePaste(event) {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (!pasted) return;

    event.preventDefault();
    setError("");

    const next = Array(OTP_LENGTH).fill("");

    pasted.split("").forEach((digit, index) => {
      next[index] = digit;
    });

    setDigits(next);

    inputs.current[
      Math.min(pasted.length, OTP_LENGTH - 1)
    ]?.focus();
  }

  // Verify OTP with backend
  async function handleVerify(event) {
    event.preventDefault();

    if (
      loading ||
      resending ||
      otp.length !== OTP_LENGTH
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await postAPI(
        "/verify-otp",
        {
          email,
          otp,
        }
      );

      // Backend must issue resetToken only
      // after successful OTP verification
      if (
        !data.resetToken ||
        typeof data.resetToken !== "string"
      ) {
        throw new Error(
          "Reset token not received from server."
        );
      }

      setDigits(Array(OTP_LENGTH).fill(""));

      // Redirect to New Password page
      navigate("/reset-password", {
        replace: true,
        state: {
          resetToken: data.resetToken,
        },
      });
    } catch (err) {
      setError(
        err.message || "OTP verification failed."
      );
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP
  async function handleResend() {
    if (
      seconds > 0 ||
      resending ||
      loading
    ) {
      return;
    }

    setResending(true);
    setError("");
    setSuccess("");

    try {
      const data = await postAPI(
        "/resend-otp",
        { email }
      );

      setDigits(Array(OTP_LENGTH).fill(""));
      setSeconds(RESEND_COOLDOWN);

      setSuccess(
        data.message ||
          "A new verification code has been sent."
      );

      inputs.current[0]?.focus();
    } catch (err) {
      setError(
        err.message || "Unable to resend OTP."
      );
    } finally {
      setResending(false);
    }
  }

  if (!email) return null;

  return (
    <div className="otp-page">
      <div className="otp-card">
        {/* Branding */}
        <div className="otp-brand">
          <span>✦</span> TanishkWorld
        </div>

        <div className="otp-icon">✉</div>

        <h1>Verify your email</h1>

        <p className="otp-description">
          Enter the 6-digit verification
          code sent to
          <strong> {email}</strong>
        </p>

        {/* Progress indicator */}
        <div className="otp-progress">
          <span />
          <span />
          <span />
        </div>

        {/* Error message */}
        {error && (
          <div
            className="otp-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div
            className="otp-success"
            role="status"
          >
            {success}
          </div>
        )}

        {/* OTP form */}
        <form onSubmit={handleVerify}>
          <label htmlFor="otp-digit-0">
            Verification code
          </label>

          <div
            className="otp-inputs"
            onPaste={handlePaste}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`otp-digit-${index}`}
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={
                  index === 0
                    ? "one-time-code"
                    : "off"
                }
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) =>
                  updateDigit(
                    index,
                    e.target.value
                  )
                }
                onKeyDown={(e) =>
                  handleKeyDown(e, index)
                }
                disabled={loading || resending}
                aria-label={`OTP digit ${index + 1}`}
              />
            ))}
          </div>

          <p className="otp-expiry">
            OTP expires after 10 minutes.
          </p>

          <button
            className="otp-primary"
            type="submit"
            disabled={
              loading ||
              resending ||
              otp.length !== OTP_LENGTH
            }
          >
            {loading
              ? "Verifying OTP..."
              : "Verify OTP"}
          </button>
        </form>

        {/* Resend OTP */}
        <div className="otp-resend">
          Didn't receive the code?

          <button
            type="button"
            onClick={handleResend}
            disabled={
              seconds > 0 ||
              resending ||
              loading
            }
          >
            {resending
              ? "Sending..."
              : seconds > 0
              ? `Resend in ${seconds}s`
              : "Resend OTP"}
          </button>
        </div>

        {/* Change email */}
        <Link
          to="/forgot-password"
          className="otp-back"
        >
          ← Change email
        </Link>
      </div>
    </div>
  );
}
