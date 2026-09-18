import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./hooks/useAuth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MyProjects from "./pages/MyProjects";
import ExploreProjects from "./pages/ExploreProjects";
import EditProfile from "./pages/EditProfile";
import Developers from "./pages/Developers";
import DeveloperProfile from "./pages/DeveloperProfile";
import GitHub from "./pages/GitHub";
import Contributions from "./pages/Contributions";
import Chats from "./pages/Chats";
import AdminRoute from "./components/adminRoute";
import Admin from "./pages/Admin"
import NotFound from "./pages/NotFound"

function App() {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/myprojects" element={<MyProjects/>}/>
              <Route path="/projects" element={<ExploreProjects/>}/>
              <Route path="/editprofile" element={<EditProfile/>}/>
              <Route path="/developers" element={<Developers/>}/>
              <Route path="/developers/:id" element={<DeveloperProfile/>}/>
              <Route path="/github" element={<GitHub/>}/>
              <Route path="/contributions" element={<Contributions/>}/>
              <Route path="/chats" element={<Chats/>}/>
            <Route path="/admin" element={<AdminRoute><Admin/></AdminRoute>}/>
            <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </ToastProvider>
    </Router>
  )
}

export default App;
