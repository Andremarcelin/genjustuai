import { loadSessionForRequest } from "../session.js";
import { defaultHouseState, toPublicState } from "../../lib/gen/defaults.js";
import { listPublicDevices } from "../../lib/gen/devices.js";
import { infraFromStore, initApi } from "../../lib/gen/http.js";
import { readHouseState } from "../../lib/gen/house-store.js";

export function createHouseStateHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const readState = deps.readState || readHouseState;

  return async function handler(req, res) {
    if (initApi(req, res, ["GET"])) return;
    try {
      const found = await loadSession(req);
      if (found?.error) {
        res.status(found.status || 503).json({ error: found.error });
        return;
      }
      if (!found?.session) {
        res.status(200).json({ state: null });
        return;
      }
      const row = await readState(found.session.id);
      if (row?.error) {
        const infra = infraFromStore(row);
        res.status(infra.status).json(infra.body);
        return;
      }
      const state = row?.state ? toPublicState(row.state) : defaultHouseState(found.session.id);
      res.status(200).json({
        state,
        devices: listPublicDevices(state),
        session: {
          id: found.session.id,
          display_name: found.session.display_name || null,
          profile_id: found.session.profile_id || null,
        },
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createHouseStateHandler();
