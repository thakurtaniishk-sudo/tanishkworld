
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../services/apiConfig";
import "./signup.css";

const API_URL = apiUrl("/api/users/register");

function Signup() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setMessage("");
    setMessageType("");
  };

  // Register user
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setMessage("");
    setMessageType("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    // Validation
    if (!name || !email || !password) {
      setMessage("Please fill in all required fields.");
      setMessageType("error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setMessage("Please enter a valid email address.");
      setMessageType("error");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setMessageType("error");
      return;
    }

    setLoading(true);

    try {
      console.log("Calling registration API:", API_URL);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `Server returned HTTP ${response.status} instead of JSON. Check the API endpoint.`
        );
      }

      const data = await response.json();

      console.log("Registration response:", {
        status: response.status,
        success: data.success,
        message: data.message,
      });

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "Registration failed. Please try again."
        );
      }

      // Success
      setMessage("Account created successfully!");
      setMessageType("success");

      // Clear form
      setForm({
        name: "",
        email: "",
        password: "",
      });

      // Redirect to login page
      navigate("/login", {
        state: {
          message: "Registration successful! Please sign in.",
        },
      });

    } catch (error) {
      console.error("Signup error:", error);

      const errorMessage =
        error instanceof TypeError
          ? "Unable to reach backend. Check server port and CORS settings."
          : error.message || "Something went wrong.";

      setMessage(errorMessage);
      setMessageType("error");

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow glow-one"></div>
      <div className="auth-glow glow-two"></div>

      <div className="auth-layout">

        {/* LEFT SECTION */}
        <div className="auth-left">

          <div className="brand">
            <div className="brand-icon">✦</div>
            <span>TanishkWorld</span>
          </div>

          <div className="hero-content">

            <div className="hero-tag">
              <span className="tag-dot"></span>
              YOUR NEXT CHAPTER STARTS HERE
            </div>

            <h1>
              Build something
              <br />
              <span>extraordinary.</span>
            </h1>

            <p className="hero-description">
              Join a community of creators, innovators, and dreamers.
              Your journey to something amazing starts with one
              simple step.
            </p>

            <div className="hero-features">

              <div className="feature-item">
                <span className="feature-check">✓</span>
                Simple and secure account setup
              </div>

              <div className="feature-item">
                <span className="feature-check">✓</span>
                Everything you need in one place
              </div>

              <div className="feature-item">
                <span className="feature-check">✓</span>
                Built for your next big idea
              </div>

            </div>
          </div>

          <div className="auth-bottom-text">
            © 2026 TanishkWorld. Made for what's next.
          </div>

        </div>

        {/* RIGHT SECTION */}
        <div className="auth-right">

          <div className="signup-card">

            <div className="mobile-brand">
              <div className="brand-icon">✦</div>
              <span>TanishkWorld</span>
            </div>

            <div className="form-heading">
              <div className="welcome-badge">
                WELCOME 👋
              </div>

              <h2>Create your account</h2>
              <p>Start your journey with us today.</p>
            </div>

            <form onSubmit={handleSubmit}>

              {/* NAME */}
              <div className="input-group">
                <label htmlFor="name">Full name</label>

                <input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={handleChange}
                  autoComplete="name"
                  required
                />
              </div>

              {/* EMAIL */}
              <div className="input-group">
                <label htmlFor="email">Email address</label>

                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>

              {/* PASSWORD */}
              <div className="input-group">
                <label htmlFor="password">Password</label>

                <div className="password-field">

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Create a strong password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />

                  <button
                    type="button"
                    className="show-password"
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>

                </div>

                <span className="password-hint">
                  Minimum 8 characters
                </span>
              </div>

              {/* TERMS */}
              <label className="terms-row">
                <input type="checkbox" required />

                <span>
                  I agree to the{" "}
                  <a href="/terms">Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy">Privacy Policy</a>
                </span>
              </label>

              {/* SUCCESS / ERROR MESSAGE */}
              {message && (
                <div
                  className={`signup-message ${messageType}`}
                  role="alert"
                  aria-live="polite"
                >
                  {message}
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                className="create-account-btn"
                disabled={loading}
              >
                {loading
                  ? "Creating account..."
                  : "Create account"}

                {!loading && <span>→</span>}
              </button>

            </form>

            <div className="login-text">
              Already have an account?{" "}
              <Link to="/login">Sign in</Link>
            </div>

            <div className="form-footer">
              Protected by secure encryption
              <span>•</span>
              Privacy first
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default Signup;
