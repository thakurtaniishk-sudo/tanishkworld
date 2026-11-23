
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Signup from "./pages/signup";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyOTP from "./pages/VerifyOtp.jsx";
import ResetPassword from "./pages/ResetPassword";
import Chat from "./pages/Chat";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-otp" element={<VerifyOTP />} />
<Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
        <Route path="/chat" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
        <Route
  path="/forgot-password"
  element={<ForgotPassword />}
/>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
