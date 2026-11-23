
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./signup.css";

const LOGIN_API = "http://localhost:5000/api/users/login";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch(LOGIN_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "Invalid email or password"
        );
      }

      if (!data.token || !data.user) {
        throw new Error("Invalid login response");
      }

      // Development-only session storage
      sessionStorage.setItem(
        "tanishkworld_token",
        data.token
      );

      sessionStorage.setItem(
        "tanishkworld_user",
        JSON.stringify(data.user)
      );

      // Redirect after successful login
      navigate("/chat", { replace: true });

    } catch (err) {
      console.error("Login error:", err);

      setError(
        err instanceof TypeError
          ? "Cannot connect to backend. Check server and CORS."
          : err.message || "Login failed"
      );

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
              GOOD TO HAVE YOU BACK
            </div>

            <h1>
              Welcome
              <br />
              <span>back again.</span>
            </h1>

            <p className="hero-description">
              Your journey continues here. Sign in to explore,
              create, and make your next big idea happen.
            </p>

            <div className="hero-features">
              <div className="feature-item">
                <span className="feature-check">✓</span>
                Your world, all in one place
              </div>

              <div className="feature-item">
                <span className="feature-check">✓</span>
                Secure and seamless access
              </div>

              <div className="feature-item">
                <span className="feature-check">✓</span>
                Pick up right where you left off
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
                WELCOME BACK 👋
              </div>

              <h2>Sign in to your account</h2>
              <p>Enter your details to continue.</p>
            </div>

            {location.state?.message && (
              <div className="signup-message success">
                {location.state.message}
              </div>
            )}

            <form onSubmit={handleSubmit}>

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
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
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
              </div>
              <div className="forgot-password-link">
  <Link to="/forgot-password">
    Forgot Password?
  </Link>
</div>

              {/* ERROR MESSAGE */}
              {error && (
                <div
                  className="signup-message error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* LOGIN BUTTON */}
              <button
                type="submit"
                className="create-account-btn"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && <span>→</span>}
              </button>

            </form>

            <div className="login-text">
              Don't have an account?{" "}
              <Link to="/signup">Create account</Link>
            </div>

            <div className="form-footer">
              Secure access
              <span>•</span>
              TanishkWorld
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default Login;
