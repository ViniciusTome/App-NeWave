import styles from './App.module.css'
import { ProtectedRoute } from './components/ProtectedRoute'

import { HomePage } from './Pages/HomePage'
import { Login } from './Pages/Login'
import { Logout } from './Pages/LogoutPage'
import { PerformancePage } from './Pages/PerformacePage'
import { ProfilePage } from './Pages/ProfilePage'
import { Register } from './Pages/RegisterPage'
import { TrainingPage } from './Pages/TrainingPage'
import { BrowserRouter, Route, Routes } from "react-router-dom";


function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path='page'>
          <Route path='home' element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>} />
          <Route path='profile' element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>} />
          <Route path='training' element={
            <ProtectedRoute>
              <TrainingPage />
            </ProtectedRoute>} />
          <Route path='performance' element={
            <ProtectedRoute>
              <PerformancePage />
            </ProtectedRoute>} />
        </Route>
        <Route path='auth'>
          <Route path='register' element={<Register />} />
          <Route path='login' element={<Login />} />
          <Route path='logout' element={<Logout />} />
        </Route>
        <Route path='/' element={<Login />}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
