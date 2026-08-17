import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    if (
      err.response?.status === 401 &&
      !orig._retry &&
      !orig.url.includes("/auth/")
    ) {
      orig._retry = true;
      try {
        refreshing =
          refreshing ||
          api.post("/auth/refresh").finally(() => {
            refreshing = null;
          });
        await refreshing;
        return api(orig);
      } catch (e) {
        /* not authenticated */
      }
    }
    return Promise.reject(err);
  }
);

export const fmtErr = (e) => {
  const d = e.response?.data?.detail;
  if (!d) return e.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d
      .map((x) => (typeof x?.msg === "string" ? x.msg : JSON.stringify(x)))
      .join(" ");
  return String(d);
};

export const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const fileUrl = (path) =>
  path?.startsWith("http") ? path : `${process.env.REACT_APP_BACKEND_URL}${path}`;

export default api;
