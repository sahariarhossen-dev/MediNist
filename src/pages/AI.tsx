import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const AI = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate("/", { replace: true }); }, [navigate]);
  return null;
};

export default AI;
