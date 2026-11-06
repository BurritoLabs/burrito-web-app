import { Navigate, useLocation } from "react-router-dom"

export default function DashboardRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: "/", search, hash }} replace />
}
