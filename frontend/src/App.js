import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import Home from "./pages/Home";
import BlogList from "./pages/BlogList";
import BlogDetails from "./pages/BlogDetails";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyBlogs from "./pages/MyBlogs";
import CreateBlog from "./pages/CreateBlog";
import EditBlog from "./pages/EditBlog";
import EditProfile from "./pages/EditProfile";
import AdminRoute from "./components/adminRoute";
import Admin from "./pages/Admin"
import NotFound from "./pages/NotFound"

function App() {
  return (
    <Router>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/blogs" element={<BlogList />} />
            <Route path="/blogs/:id" element={<BlogDetails />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/myblogs" element={<MyBlogs/>}/>
            <Route path="/create" element={<CreateBlog/>}/>
          <Route path="/blogs/:id/edit" element={<EditBlog/>}/>
            <Route path="/editprofile" element={<EditProfile/>}/>
          <Route path="/admin" element={<AdminRoute><Admin/></AdminRoute>}/>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Layout>
      </ToastProvider>
    </Router>
  )
}

export default App;
