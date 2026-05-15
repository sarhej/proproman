import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerPublicWebMcpTools } from "./webmcp";

/**
 * Registers WebMCP tools on initial load (including signed-out homepage) so agent readiness
 * scanners that drive a real browser see tools without waiting for hub data.
 */
export function WebMcpBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    const ac = new AbortController();
    registerPublicWebMcpTools((to) => navigate(to), ac.signal);
    return () => ac.abort();
  }, [navigate]);

  return null;
}
