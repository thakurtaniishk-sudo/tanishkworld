
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../services/apiConfig";
import "./dashboard.css";

const PROFILE_API = apiUrl("/api/users/me");

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleLogout = () => {
    sessionStorage.removeItem("tanishkworld_token");
    sessionStorage.removeItem("tanishkworld_user");

    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const controller = new AbortController();

    const fetchProfile = async () => {
      const token = sessionStorage.getItem(
        "tanishkworld_token"
      );

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const response = await fetch(PROFILE_API, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (response.status === 401) {
          sessionStorage.removeItem("tanishkworld_token");
          sessionStorage.removeItem("tanishkworld_user");

          navigate("/login", { replace: true });
          return;
        }

        const data = await response.json();

        if (!response.ok || !data.success || !data.user) {
          throw new Error(
            data.message || "Failed to fetch profile"
          );
        }

        if (!controller.signal.aborted) {
          setUser(data.user);

          sessionStorage.setItem(
            "tanishkworld_user",
            JSON.stringify(data.user)
          );
        }

      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Profile API error:", err);

        if (!controller.signal.aborted) {
          setError(
            "Unable to load your profile. Please try again."
          );
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => controller.abort();
  }, [navigate]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <h2>Loading your dashboard...</h2>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">✦</span>
          <span>TanishkWorld</span>
        </div>

        <button
          className="dashboard-logout"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <main className="dashboard-main">
        {error ? (
          <section className="dashboard-bottom">
            <h2>Unable to load dashboard</h2>
            <p>{error}</p>
            <button
              className="dashboard-logout"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </section>
        ) : (
          <>
            <div className="dashboard-welcome">
              <span className="dashboard-eyebrow">
                YOUR WORKSPACE
              </span>

              <h1>
                Welcome back,{" "}
                <span>{user?.name || "User"}!</span>
              </h1>

              <p>
                Your personal workspace is ready.
                Let's make something extraordinary today.
              </p>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card">
                <div className="dashboard-card-icon">👤</div>
                <h3>My Profile</h3>
                <p>Your account information from MongoDB.</p>
                <div className="dashboard-card-value">
                  {user?.name}
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-icon">✉️</div>
                <h3>Email Address</h3>
                <p>Your registered email address.</p>
                <div className="dashboard-card-value">
                  {user?.email}
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-icon">🔐</div>
                <h3>Account Access</h3>
                <p>Verified by the backend.</p>
                <div className="dashboard-card-value">
                  Authenticated
                </div>
              </div>
            </div>

            <section className="dashboard-bottom">
              <h2>You're all set!</h2>
              <p>
                Your profile is loaded securely from the
                TanishkWorld backend.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
