import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./hooks/useAuth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProjectList from "./pages/ProjectList";
import ProjectDetails from "./pages/ProjectDetails";
import MyProjects from "./pages/MyProjects";
import CreateProject from "./pages/CreateProject";
import EditProject from "./pages/EditProject";
import EditProfile from "./pages/EditProfile";
import Developers from "./pages/Developers";
import DeveloperProfile from "./pages/DeveloperProfile";
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
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/projects/:id" element={<ProjectDetails />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/myprojects" element={<MyProjects/>}/>
              <Route path="/create" element={<CreateProject/>}/>
              <Route path="/projects/:id/edit" element={<EditProject/>}/>
              <Route path="/editprofile" element={<EditProfile/>}/>
              <Route path="/developers" element={<Developers/>}/>
              <Route path="/developers/:id" element={<DeveloperProfile/>}/>
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
