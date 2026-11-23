import { useEffect } from "react"
import { useAuth } from "../../hooks/useAuth"
import { Spinner } from "../Spinner"
import { Tutorial } from "../Tutorial"
import { useNavigate } from "react-router-dom"


export const ProtectedRoute = ({children}) => {

  const {isAuthenticated, isLoading} =  useAuth();
  const navigate = useNavigate();

  useEffect(() => {

    if(!isLoading && !isAuthenticated) {
        navigate('/auth/login')
    }

  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return <Spinner/>
  }

  if (!isAuthenticated) {
    return null
  }

    // O tutorial abre sozinho na 1ª vez (e pelo Perfil, quando a pessoa quiser)
    return (
        <>
            {children}
            <Tutorial />
        </>
    )
}