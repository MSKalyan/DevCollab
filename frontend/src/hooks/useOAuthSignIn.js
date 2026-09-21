import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import useAuth from "./useAuth";
import { useToast } from "../components/ui/Toast";

// Where a signed-in user lands: connecting GitHub is the next step for a new
// account, and also where an existing user resumes.
export const POST_AUTH_PATH = "/github";

// Set by the backend on a successful GitHub callback. Its presence is what tells
// /login a session was just established by a full-page OAuth redirect.
export const GITHUB_CALLBACK_PARAM = "github";

// Messages for the `?error=` values the backend redirects back with.
export const OAUTH_ERROR_LABELS = {
  invalid_state: "That sign-in attempt expired. Please try again.",
  missing_code: "GitHub did not return an authorization code. Please try again.",
  access_denied: "You cancelled the GitHub sign-in.",
  github_email_unavailable:
    "GitHub did not share a verified email address. Add one to your GitHub account, or sign up with email instead.",
  github_login_failed: "GitHub sign-in failed. Please try again.",
  github_account_linked_to_another_user:
    "That GitHub account is already linked to another DevCollab profile.",
};

// Google hands the page an ID token; GitHub leaves the app entirely and returns
// by redirect, so only Google is driven from here.
export default function useOAuthSignIn() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);

  const signInWithGoogle = useCallback(
    async (credentialResponse) => {
      if (!credentialResponse?.credential) {
        toast.error("Google sign-in was cancelled.");
        return;
      }
      setPending("google");
      try {
        await login(() => api.post("/auth/google", { credential: credentialResponse.credential }));
        toast.success("Signed in with Google.");
        navigate(POST_AUTH_PATH, { replace: true });
      } catch (err) {
        toast.error(err?.response?.data?.message || "Google sign-in failed.");
      } finally {
        setPending(null);
      }
    },
    [login, navigate, toast]
  );

  const signInWithGithub = useCallback(async () => {
    setPending("github");
    try {
      const res = await api.get("/auth/github/login");
      window.location.href = res.data.data.url;
    } catch (err) {
      setPending(null);
      toast.error(err?.response?.data?.message || "Could not start GitHub sign-in.");
    }
  }, [toast]);

  // Called from /login when it sees GITHUB_CALLBACK_PARAM. The cookies are
  // already set by the backend; this only re-reads the session.
  const completeGithubSignIn = useCallback(async () => {
    setPending("github");
    try {
      await login(async () => {});
      toast.success("Signed in with GitHub.");
      navigate(POST_AUTH_PATH, { replace: true });
    } catch {
      toast.error("Could not complete GitHub sign-in.");
    } finally {
      setPending(null);
    }
  }, [login, navigate, toast]);

  return { signInWithGoogle, signInWithGithub, completeGithubSignIn, pending };
}
