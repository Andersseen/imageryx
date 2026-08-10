import { handleLogout } from "../../../lib/auth/handlers";
import { defineAuthRoute } from "../../../lib/auth/runtime";

/**
 * `POST /proxy/auth/logout` — clears Imageryx's session cookie.
 *
 * POST, not GET, on purpose: a GET logout can be triggered by any third-party
 * page embedding `<img src=".../logout">`, which is a small but real nuisance
 * (and, with `SameSite=Lax`, a GET *is* reachable cross-site).
 */
export default defineAuthRoute(handleLogout);
